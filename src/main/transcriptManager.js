const axios = require('axios');

class TranscriptManager {
    constructor() {
        this.scraperQueue = [];
        this.awsQueue = [];
        this.accumulatedTranscript = "";

        // Every 20 seconds, process the transcript and POST to AWS Lambda
        this.postInterval = setInterval(() => {
            this.postAccumulatedTranscript();
        }, 20000);
    }

    addAwsText(text) {
        const timestamp = Date.now();
        this.awsQueue.push({ text, timestamp });
        this.mergeQueues();
    }

    addScraperText(text) {
        const timestamp = Date.now();
        this.scraperQueue.push({ text, timestamp });
        this.mergeQueues();
    }

    mergeQueues() {
        // Basic deduplication logic: if text from AWS and Scraper are within 2 seconds
        // and share >70% similarity, discard one. Here we favor the scraper text usually
        // for exact matches, but we can just append if no conflict.

        // We'll process from AWS queue as the primary, and check scraper for dupes
        while (this.awsQueue.length > 0) {
            const awsItem = this.awsQueue.shift();
            const duplicateIndex = this.scraperQueue.findIndex(sc => {
                const timeDiff = Math.abs(sc.timestamp - awsItem.timestamp);
                if (timeDiff <= 2000) {
                    return this.calculateSimilarity(sc.text, awsItem.text) > 0.7;
                }
                return false;
            });

            if (duplicateIndex !== -1) {
                // It's a duplicate, we can discard the aws one and keep the scraper one,
                // or just append the aws one and remove the scraper one so we don't process it later.
                this.accumulatedTranscript += awsItem.text + " ";
                this.scraperQueue.splice(duplicateIndex, 1);
            } else {
                this.accumulatedTranscript += awsItem.text + " ";
            }
        }

        // Process remaining scraper text that had no AWS duplicate
        while (this.scraperQueue.length > 0) {
            const scItem = this.scraperQueue.shift();
            this.accumulatedTranscript += scItem.text + " ";
        }

        // Emit live transcript to the React Renderer
        const { BrowserWindow } = require('electron');
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
            mainWindow.webContents.send('transcript-updated', this.accumulatedTranscript);
        }
    }

    calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        // Simple token matching similarity
        const set1 = new Set(str1.toLowerCase().split(/\s+/));
        const set2 = new Set(str2.toLowerCase().split(/\s+/));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }

    async postAccumulatedTranscript() {
        if (!this.accumulatedTranscript.trim()) return;

        const payload = {
            transcript: this.accumulatedTranscript.trim()
        };

        // Clear buffer after extracting payload
        this.accumulatedTranscript = "";

        try {
            // Placeholder Lambda endpoint
            const endpoint = process.env.LAMBDA_ENDPOINT || 'https://placeholder.execute-api.us-east-1.amazonaws.com/dev/accumulate';
            // await axios.post(endpoint, payload);
            console.log('Successfully posted Accumulated Transcript to Lambda (Mock):', payload.transcript);
        } catch (error) {
            console.error('Failed to post accumulated transcript:', error.message);
            // Depending on robustness requirements, we might want to put the text back
            // this.accumulatedTranscript = payload.transcript + " " + this.accumulatedTranscript;
        }
    }

    destroy() {
        clearInterval(this.postInterval);
    }
}

module.exports = TranscriptManager;
