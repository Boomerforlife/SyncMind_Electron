const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = require('@aws-sdk/client-transcribe-streaming');
const { PassThrough } = require('stream');

class AwsTranscribeService {
    constructor(transcriptManager) {
        this.client = new TranscribeStreamingClient({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
        });
        this.transcriptManager = transcriptManager;
        this.audioStream = null;
        this.isActive = false;
    }

    async startStream(onStatusChange) {
        if (this.isActive) return;
        this.isActive = true;
        onStatusChange('active');

        this.audioStream = new PassThrough();

        const params = {
            LanguageCode: 'en-US',
            MediaEncoding: 'pcm',
            MediaSampleRateHertz: 16000,
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
                    if (results.length > 0 && !results[0].IsPartial) {
                        const text = results[0].Alternatives[0].Transcript;
                        if (text) {
                            console.log("[AWS Transcribe]:", text);
                            this.transcriptManager.addAwsText(text);
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
            // Chunk should be a Buffer containing 16-bit PCM
            this.audioStream.write(Buffer.from(chunk));
        }
    }

    stopStream(onStatusChange) {
        this.isActive = false;
        if (this.audioStream) {
            this.audioStream.end();
            this.audioStream = null;
        }
        if (onStatusChange) onStatusChange('inactive');
    }
}

module.exports = AwsTranscribeService;
