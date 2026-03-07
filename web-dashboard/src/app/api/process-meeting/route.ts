import { NextResponse } from 'next/server';
import {
    TranscribeClient,
    StartTranscriptionJobCommand,
    GetTranscriptionJobCommand
} from "@aws-sdk/client-transcribe";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { meetings } from '@/lib/store';

// Helper to read S3 stream
async function streamToString(stream: any): Promise<string> {
    const chunks: any[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { audioFileName } = body;

        if (!audioFileName) {
            return NextResponse.json({ error: "No audioFileName provided" }, { status: 400 });
        }

        const region = process.env.AWS_REGION || "us-east-1";
        const bucketName = "syncmind-meeting-audio";
        const jobName = `meeting-transcription-${Date.now()}`;
        const s3AudioUri = `s3://${bucketName}/${audioFileName}`;

        console.log(`[API] Processing meeting: ${audioFileName}`);

        // 1. Start Transcription Job
        const transcribeClient = new TranscribeClient({ region });
        console.log(`[TRANSCRIBE] transcription job started: ${jobName}`);
        await transcribeClient.send(new StartTranscriptionJobCommand({
            TranscriptionJobName: jobName,
            Media: { MediaFileUri: s3AudioUri },
            MediaFormat: "wav",
            LanguageCode: "en-US",
            OutputBucketName: bucketName,
            OutputKey: `transcripts/${jobName}.json`
        }));

        // 2. Poll for Completion (Max 5 mins for prototype)
        let isDone = false;
        let transcriptUri = "";
        let attempt = 0;

        while (!isDone && attempt < 60) {
            await new Promise(res => setTimeout(res, 5000)); // wait 5s

            const statusCmd = await transcribeClient.send(new GetTranscriptionJobCommand({
                TranscriptionJobName: jobName
            }));

            const status = statusCmd.TranscriptionJob?.TranscriptionJobStatus;
            console.log(`[TRANSCRIBE] Polling status: ${status}`);

            if (status === "COMPLETED") {
                console.log("[TRANSCRIBE] transcription job completed");
                isDone = true;
                // transcriptUri = statusCmd.TranscriptionJob?.Transcript?.TranscriptFileUri; 
                // We know output is at transcripts/${jobName}.json
            } else if (status === "FAILED") {
                throw new Error("AWS Transcribe Job Failed");
            }
            attempt++;
        }

        if (!isDone) throw new Error("Transcription timed out.");

        // 3. Retrieve Transcript JSON from S3
        const s3Client = new S3Client({ region });
        const s3Response = await s3Client.send(new GetObjectCommand({
            Bucket: bucketName,
            Key: `transcripts/${jobName}.json`
        }));

        const transcriptRaw = await streamToString(s3Response.Body);
        const transcriptData = JSON.parse(transcriptRaw);

        // Extract plain text
        let fullTranscriptText = "";
        if (transcriptData.results && transcriptData.results.transcripts) {
            fullTranscriptText = transcriptData.results.transcripts.map((t: any) => t.transcript).join(" ");
        }

        console.log("[TRANSCRIBE] transcript retrieved");

        if (!fullTranscriptText.trim()) {
            throw new Error("Transcription generated empty text.");
        }

        // 4. Send Transcript to Bedrock
        const bedrockClient = new BedrockRuntimeClient({ region });
        const prompt = `Analyze the following meeting transcript and return JSON only. Extract a summary, a list of actionable tasks, and a list of project risks. 
Format: { "summary": "...", "tasks": [{"description": "...", "owner": "...", "status": "..."}], "risks": [{"description": "...", "severity": "..."}] }
Transcript:
${fullTranscriptText}`;

        console.log("[BEDROCK] Bedrock request sent");

        const bedrockResponse = await bedrockClient.send(new InvokeModelCommand({
            modelId: "anthropic.claude-3-haiku-20240307-v1:0",
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 1000,
                messages: [
                    { role: "user", content: prompt }
                ]
            })
        }));

        const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
        const aiResponseText = responseBody.content?.[0]?.text || "{}";
        console.log("[BEDROCK] Bedrock response received");

        // Parse the JSON
        let aiData = { summary: "", tasks: [], risks: [] };
        try {
            // Claude sometimes wraps JSON in markdown blocks
            const cleanJson = aiResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
            aiData = JSON.parse(cleanJson);
        } catch (e) {
            console.error("[BEDROCK] Failed to parse JSON response:", aiResponseText);
        }

        // 5. Store Meeting Results
        const meetingObject = {
            meetingId: `mtg-${Date.now()}`,
            title: `Meeting - ${new Date().toLocaleDateString()}`,
            transcript: fullTranscriptText,
            summary: aiData.summary,
            tasks: aiData.tasks,
            risks: aiData.risks,
            timestamp: new Date().toISOString()
        };

        // Prepend to store
        meetings.unshift(meetingObject);
        console.log("[API] meeting stored");
        console.log("[API] dashboard updated implicitly"); // Because it reads from store

        return NextResponse.json({ success: true, meeting: meetingObject });

    } catch (error: any) {
        console.error("[API ERROR] Error in process-meeting:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
