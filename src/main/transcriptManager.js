const axios = require('axios');

class TranscriptManager {
    constructor() {
        this.scraperQueue = [];
        this.awsQueue = [];
        this.accumulatedTranscript = "";

        this.lastOcrText = "";
        this.lastOcrEmitTime = 0;
        this.lastOcrEmitText = "";
    }

    addAwsText(text) {
        const timestamp = Date.now();
        this.awsQueue.push({ text, timestamp });
        this.mergeQueues();
    }

    getIncrementalText(previous, current) {
        if (!previous) return current;
        if (current.startsWith(previous)) {
            return current.slice(previous.length).trim();
        }
        if (current.includes(previous)) {
            return current.replace(previous, "").trim();
        }
        return current;
    }

    isLikelyGarbage(text) {
        if (text.length < 5) return true;
        if (/\d{1,2}:\d{2}/.test(text)) return true;
        if (/[^\w\s]{3,}/.test(text)) return true;
        const nonLetterCount = text.replace(/[\w\s]/g, '').length;
        if (nonLetterCount / text.length > 0.3) return true;
        return false;
    }

    addScraperText(text) {
        const cleanedText = text.trim().replace(/\s+/g, ' ');
        if (cleanedText.length < 5) return;

        let incrementalText = cleanedText;

        if (this.lastOcrText && cleanedText.startsWith(this.lastOcrText)) {
            incrementalText = cleanedText.slice(this.lastOcrText.length).trim();
            if (!incrementalText) return;
        }

        this.lastOcrText = cleanedText;

        const timestamp = Date.now();
        this.scraperQueue.push({ text: incrementalText, timestamp });
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
                    return this.calculateSimilarity(sc.text, awsItem.text) > 85;
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

    calculateSimilarity(a, b) {
        if (!a || !b) return 0;
        const getWords = str => {
            const cleaned = String(str).toLowerCase().replace(/[^\w\s]|_/g, '');
            return new Set(cleaned.split(/\s+/).filter(Boolean));
        };

        const setA = getWords(a);
        const setB = getWords(b);

        if (setA.size === 0 && setB.size === 0) return 100;

        let intersection = 0;
        for (const word of setA) {
            if (setB.has(word)) intersection++;
        }

        const union = setA.size + setB.size - intersection;
        return union === 0 ? 100 : (intersection / union) * 100;
    }

    async uploadFinalTranscript(token, durationSeconds, meetingTitle) {
        if (!this.accumulatedTranscript.trim() || !token) {
            console.log("Skipping upload: No transcript or missing token.");
            return;
        }

        const payload = {
            transcript: this.accumulatedTranscript.trim(),
            duration: durationSeconds,
            meetingTitle
        };

        try {
            console.log('Valid transcript ready. Uploading to SyncMind Dashboard API...');
            const endpoint = process.env.NEXTJS_API_ENDPOINT || 'http://localhost:3001/api/meetings';

            await axios.post(endpoint, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            console.log('Successfully posted Meeting Transcript to Dashboard API.');
            // Clear transcript for next meeting
            this.accumulatedTranscript = "";
            this.scraperQueue = [];
            this.awsQueue = [];
        } catch (error) {
            console.error('Failed to post accumulated transcript:', error.message);
        }
    }

    destroy() {
        // Cleanup if needed

    }
}

module.exports = TranscriptManager;
