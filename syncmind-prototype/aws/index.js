const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body);
        const transcript = body.transcript;

        if (!transcript) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "No transcript provided" }),
            };
        }

        // If credentials are valid and Bedrock is available, we call process it.
        // For the sake of the prototype testing as requested by the user, if AWS fails,
        // we provide a fallback simulated output.
        let aiInsights = null;

        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            try {
                const promptText = `
Human: Summarize this meeting transcript and extract action items, risks, and decisions.

Return strictly a JSON object matching this schema:
{
  "summary": "String",
  "action_items": ["Array", "of", "strings"],
  "risks": [{ "description": "String", "severity": "High/Medium/Low" }],
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
                        messages: [{ role: "user", content: promptText }]
                    })
                });

                const response = await client.send(command);
                const parsedBody = JSON.parse(new TextDecoder().decode(response.body));
                const rawOutput = "{" + parsedBody.content[0].text;

                aiInsights = JSON.parse(rawOutput);
            } catch (err) {
                console.error("Bedrock invocation failed:", err);
            }
        }

        if (!aiInsights) {
            console.warn("Using simulated Lambda output for prototype testing due to explicit environment failure.");
            aiInsights = {
                summary: "Prototype Testing Simulation. The AWS Lambda successfully received the payload.",
                action_items: ["Finish Lambda Bedrock deployment", "Configure IAM policies securely"],
                risks: [{ description: "Currently using fallback Lambda data instead of live Bedrock.", severity: "Low" }],
                decisions: ["Verified Lambda triggers successfully", "Electron -> Next.js -> Lambda Pipeline OK"]
            };
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(aiInsights)
        };

    } catch (error) {
        console.error("Handler error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error" }),
        };
    }
};
