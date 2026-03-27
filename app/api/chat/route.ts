import { google } from "@ai-sdk/google";
import { convertToModelMessages, streamText } from "ai";

export async function POST(request: Request) {
  try {
    const { messages, model, system, temperature, maxTokens } =
      await request.json();

    const result = streamText({
      model: google(model ?? "gemini-2.5-flash"),
      system: system || undefined,
      messages: await convertToModelMessages(messages),
      temperature: temperature ?? 0.7,
      maxOutputTokens: maxTokens ?? 1024,
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
