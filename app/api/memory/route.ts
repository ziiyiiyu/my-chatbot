import { google } from "@ai-sdk/google";
import { generateText } from "ai";

export async function POST(request: Request) {
  try {
    const { messages, existingMemory } = await request.json();

    const conversationText = messages
      .slice(-6)
      .map(
        (m: { role: string; parts: { type: string; text?: string }[] }) =>
          `${m.role}: ${m.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("")}`
      )
      .join("\n");

    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: `You are a memory extractor. Given this conversation excerpt and existing memory, extract NEW facts worth remembering (name, preferences, goals, context). Return a JSON object with a "facts" array of short strings. Only include NEW facts not already in existing memory. If nothing new, return {"facts":[]}.

Existing memory: ${JSON.stringify(existingMemory)}

Conversation:
${conversationText}

Return ONLY valid JSON.`,
    });

    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return Response.json({ facts: parsed.facts ?? [] });
  } catch {
    return Response.json({ facts: [] });
  }
}
