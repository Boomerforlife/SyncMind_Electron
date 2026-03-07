class SummaryEngine {
    constructor() {
        this.segments = [];
        this.summaryInterval = setInterval(() => this.generateSummary(), 120000); // 2 minutes
    }

    addSegment(segment) {
        this.segments.push(segment);
    }

    generateSummary() {
        if (this.segments.length === 0) return;

        const transcriptChunk = this.segments.join(' ');
        this.segments = [];

        const generatedSummary = {
            summary: "Summary generation pending",
            key_points: [],
            action_items: []
        };

        console.log("[SummaryEngine] Generated placeholder summary for chunk length:", transcriptChunk.length);
        return generatedSummary;
    }

    destroy() {
        if (this.summaryInterval) {
            clearInterval(this.summaryInterval);
        }
    }
}

module.exports = SummaryEngine;
