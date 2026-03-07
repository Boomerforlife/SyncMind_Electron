import { NextResponse } from "next/server";
import { meetings } from "@/lib/store";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

export const dynamic = "force-dynamic";

const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
});

export async function GET() {
    // Sort by createdAt desc
    const sorted = [...meetings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json(sorted);
}

export async function POST(req: Request) {
    try {
        const { transcript, duration, meetingTitle } = await req.json();

        if (!transcript) {
            return NextResponse.json({ error: "Transcript is required" }, { status: 400 });
        }

        const meetingId = `meeting-${Date.now()}`;

        let aiInsights = {
            summary: "AI summary pending (Bedrock not configured).",
            action_items: [] as string[],
            risks: [] as { description: string, severity: string }[],
            decisions: [] as string[]
        };

        if (process.env.AWS_ACCESS_KEY_ID) {
            try {
                const promptText = `
Human: Summarize this meeting transcript and extract action items, risks, and decisions.

Return strictly a JSON object matching this schema:
{
  "summary": "String summarizing the meeting",
  "action_items": ["Array", "of", "strings"],
  "risks": [
     { "description": "String", "severity": "High/Medium/Low" }
  ],
  "decisions": ["Array", "of", "strings"]
}

Transcript:
<transcript>
${transcript}
</transcript>

Assistant: {`;

                const command = new InvokeModelCommand({
                    modelId: "anthropic.claude-3-haiku-20240307-v1:0",
                    contentType: "application/json",
                    accept: "application/json",
                    body: JSON.stringify({
                        anthropic_version: "bedrock-2023-05-31",
                        max_tokens: 1000,
                        messages: [{
                            role: "user",
                            content: promptText
                        }]
                    })
                });

                const response = await bedrockClient.send(command);
                const parsedBody = JSON.parse(new TextDecoder().decode(response.body));
                const rawOutput = "{" + parsedBody.content[0].text;
                aiInsights = JSON.parse(rawOutput);

            } catch (e: any) {
                console.error("Bedrock Analysis Failed:", e);
                // Fallback simulation
                aiInsights = {
                    summary: "Simulated summary due to Bedrock failure: " + e.message,
                    action_items: ["Fix AWS connection"],
                    risks: [{ description: "AWS Bedrock failed", severity: "High" }],
                    decisions: ["Use fallback simulation"]
                };
            }
        } else {
            console.warn("No AWS Credentials. Using simulated summary.");
            aiInsights = {
                summary: "Meeting discussed deployment. (Simulated)",
                action_items: ["Deploy staging server"],
                risks: [{ description: "Budget constraints", severity: "Medium" }],
                decisions: ["Use AWS Transcribe"]
            };
        }

        const newMeeting = {
            id: meetingId,
            title: meetingTitle || "Untitled Meeting",
            duration: duration || 0,
            transcriptUrl: transcript, // store raw transcript for testing
            summary: aiInsights.summary,
            actionItems: JSON.stringify(aiInsights.action_items || []),
            risks: JSON.stringify(aiInsights.risks || []),
            decisions: JSON.stringify(aiInsights.decisions || []),
            createdAt: new Date().toISOString()
        };

        // In-memory push
        meetings.push(newMeeting);

        return NextResponse.json({ success: true, meeting: newMeeting });
    } catch (error: any) {
        console.error("API POST error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
