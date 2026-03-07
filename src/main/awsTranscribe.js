require('dotenv').config();
const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = require('@aws-sdk/client-transcribe-streaming');
const { PassThrough } = require('stream');

class AwsTranscribeService {
    constructor(transcriptManager) {
        this.transcriptManager = transcriptManager;
        this.audioStream = null;
        this.isActive = false;

        this.chunkSentTimes = [];
        this.latencies = [];
        this.latencyInterval = null;

        const region = process.env.AWS_REGION || 'us-east-1';
        const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
        const sessionToken = process.env.AWS_SESSION_TOKEN;

        if (!accessKeyId || !secretAccessKey) {
            console.error("[AWS Transcribe] ERROR: Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY in .env");
            console.error("[AWS Transcribe] AWS Transcription is DISABLED.");
            this.isConfigured = false;
        } else {
            console.log("AWS credentials loaded successfully");
            console.log(`[AWS Transcribe] Region: ${region}`);
            this.isConfigured = true;

            const credentials = {
                accessKeyId,
                secretAccessKey,
            };

            if (sessionToken) {
                credentials.sessionToken = sessionToken;
            }

            this.client = new TranscribeStreamingClient({
                region,
                credentials
            });
        }
    }

    async startStream(onStatusChange) {
        if (!this.isConfigured) {
            console.error("[AWS Transcribe] Cannot start stream: AWS credentials missing.");
            if (onStatusChange) onStatusChange('inactive');
            return;
        }

        if (this.isActive) return;
        this.isActive = true;
        console.log("Starting AWS Transcribe stream...");
        onStatusChange('active');

        this.chunkSentTimes = [];
        this.latencies = [];
        this.latencyInterval = setInterval(() => {
            if (this.latencies.length > 0) {
                const avgLatency = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
                console.log(`[AWS Transcribe] Rolling 30s average latency: ${avgLatency.toFixed(2)} ms`);
                this.latencies = [];
            }
        }, 30000);

        // 🔥 FAILSAFE TIMER 🔥
        const maxDurationMs = parseInt(process.env.MAX_TRANSCRIBE_DURATION_MS) || 3600000;
        this.failsafeTimer = setTimeout(() => {
            console.warn(`⚠️ AWS TRANSCRIBE FAILSAFE TRIGGERED: ${maxDurationMs}ms reached. Forcing disconnect.`);
            this.stopStream(onStatusChange);
        }, maxDurationMs);

        this.audioStream = new PassThrough();

        const params = {
            LanguageCode: process.env.TRANSCRIBE_LANGUAGE || 'en-US',
            MediaEncoding: 'pcm',
            MediaSampleRateHertz: 16000,
            EnablePartialResultsStabilization: true,
            PartialResultsStability: "medium",
            ShowSpeakerLabel: true,
            MaxSpeakerLabels: 5,
            AudioStream: this.createAudioStreamAsyncIterable()
        };

        try {
            const command = new StartStreamTranscriptionCommand(params);
            const response = await this.client.send(command);

            this.handleTranscriptResponse(response);
        } catch (error) {
            console.error("Transcribe streaming error:", error);
            this.stopStream(onStatusChange);
        }
    }

    async handleTranscriptResponse(response) {
        try {
            for await (const event of response.TranscriptResultStream) {
                if (event.TranscriptEvent) {
                    const results = event.TranscriptEvent.Transcript.Results;
                    if (results && results.length > 0 && results[0].IsPartial === false) {
                        const alternatives = results[0].Alternatives;
                        if (alternatives && alternatives.length > 0) {
                            const text = alternatives[0].Transcript;
                            const items = alternatives[0].Items || [];

                            if (items.length > 0) {
                                const lines = [];
                                let currentSpeaker = null;
                                let currentSentence = "";

                                for (const item of items) {
                                    const speaker = item.Speaker;
                                    const word = item.Content || "";

                                    console.log("Speaker:", speaker);
                                    console.log("Word:", word);

                                    const activeSpeaker = speaker !== undefined ? speaker : currentSpeaker;

                                    if (currentSpeaker === null) {
                                        currentSpeaker = activeSpeaker;
                                        currentSentence = word;
                                    } else if (activeSpeaker !== currentSpeaker && activeSpeaker !== undefined) {
                                        const spkNum = parseInt(currentSpeaker, 10);
                                        const displayNum = !isNaN(spkNum) ? spkNum + 1 : currentSpeaker || "1";
                                        lines.push(`Speaker ${displayNum}: ${currentSentence.trim()}`);

                                        currentSpeaker = activeSpeaker;
                                        currentSentence = word;
                                    } else {
                                        if (word.match(/^[.,?!;:]$/)) {
                                            currentSentence += word;
                                        } else {
                                            currentSentence += (currentSentence.length > 0 ? " " : "") + word;
                                        }
                                    }
                                }

                                if (currentSentence.trim().length > 0) {
                                    const spkNum = parseInt(currentSpeaker, 10);
                                    const displayNum = !isNaN(spkNum) ? spkNum + 1 : currentSpeaker || "1";
                                    lines.push(`Speaker ${displayNum}: ${currentSentence.trim()}`);
                                }

                                const finalText = lines.join('\n');

                                const chunkSentTime = this.chunkSentTimes.shift();
                                console.log("Transcript received:\n" + finalText);
                                if (chunkSentTime) {
                                    const latency = Date.now() - chunkSentTime;
                                    console.log("Transcription latency:", latency, "ms");
                                    this.latencies.push(latency);
                                }

                                this.transcriptManager.addAwsText(finalText);
                            } else if (text) {
                                // Fallback if no items are present but text is
                                const chunkSentTime = this.chunkSentTimes.shift();
                                console.log("Transcript received:", text);
                                if (chunkSentTime) {
                                    const latency = Date.now() - chunkSentTime;
                                    console.log("Transcription latency:", latency, "ms");
                                    this.latencies.push(latency);
                                }

                                this.transcriptManager.addAwsText(text);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error processing transcript event:", error);
        }
    }

    async *createAudioStreamAsyncIterable() {
        for await (const chunk of this.audioStream) {
            yield { AudioEvent: { AudioChunk: chunk } };
        }
    }

    pushAudioChunk(chunk) {
        if (this.audioStream && this.isActive) {
            this.chunkSentTimes.push(Date.now());
            // Chunk should be a Buffer containing 16-bit PCM
            this.audioStream.write(Buffer.from(chunk));
            console.log("Audio chunk sent to AWS:", chunk.length);
        }
    }

    stopStream(onStatusChange) {
        this.isActive = false;

        if (this.latencyInterval) {
            clearInterval(this.latencyInterval);
            this.latencyInterval = null;
        }

        // Clear the failsafe timer when manually stopped
        if (this.failsafeTimer) {
            clearTimeout(this.failsafeTimer);
            this.failsafeTimer = null;
        }

        if (this.audioStream) {
            this.audioStream.end();
            this.audioStream = null;
        }
        if (onStatusChange) onStatusChange('inactive');
    }
}

module.exports = AwsTranscribeService;
