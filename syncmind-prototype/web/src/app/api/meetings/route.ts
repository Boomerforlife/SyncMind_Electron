import { NextResponse } from "next/server";
import { meetings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
    const sorted = [...meetings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json(sorted);
}

export async function POST(req: Request) {
    try {
        const { transcript } = await req.json();

        if (!transcript) {
            return NextResponse.json({ error: "Transcript is required" }, { status: 400 });
        }

        const meetingId = `meeting-${Date.now()}`;

        // AWS Processing Simulation (Will be called if AWS logic is not implemented yet)
        // User requirements stated "If AWS fails -> return fallback summary"
        let aiInsights = {
            summary: "Team discussed deployment timeline. (Simulated by Prototype Mode)",
            actionItems: ["Deploy staging server"],
            risks: [{ description: "Budget constraints", severity: "High" }],
            decisions: ["Use AWS Transcribe"]
        };

        // Attempting to forward to AWS Lambda later on can sit here
        try {
            const lambdaEndpoint = process.env.LAMBDA_API_ENDPOINT;
            if (lambdaEndpoint) {
                // Call Lambda
                const lambdaRes = await fetch(lambdaEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ transcript })
                });
                if (lambdaRes.ok) {
                    const lambdaData = await lambdaRes.json();
                    aiInsights = {
                        summary: lambdaData.summary || aiInsights.summary,
                        actionItems: lambdaData.action_items || aiInsights.actionItems,
                        risks: lambdaData.risks || aiInsights.risks,
                        decisions: lambdaData.decisions || aiInsights.decisions,
                    };
                }
            }
        } catch (e) {
            console.error("Failed to connect to Lambda, falling back to mock data.", e);
        }

        const newMeeting = {
            id: meetingId,
            title: `Meeting – ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`,
            duration: 0,
            transcript: transcript,
            summary: aiInsights.summary,
            actionItems: JSON.stringify(aiInsights.actionItems),
            risks: JSON.stringify(aiInsights.risks),
            decisions: JSON.stringify(aiInsights.decisions),
            createdAt: new Date().toISOString()
        };

        meetings.push(newMeeting);

        return NextResponse.json({ success: true, meetingId, meeting: newMeeting });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
