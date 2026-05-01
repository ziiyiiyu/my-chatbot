import { google } from "@ai-sdk/google";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { convertToModelMessages, streamText, tool, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { z } from "zod";
import path from "path";

// ── Auto-routing ─────────────────────────────────────────────────────────────

type ModelId = "gemini-2.5-flash" | "gemini-2.5-pro" | "gemini-2.5-flash-lite";

const COMPLEX_KEYWORDS =
  /analyze|compare|explain in detail|step by step|write code|refactor|debug|review|summarize|translate|essay|report/i;

function pickModel(
  requestedModel: string,
  lastUserText: string,
  hasImage: boolean
): { model: ModelId; reason: string } {
  if (requestedModel !== "auto") {
    return { model: requestedModel as ModelId, reason: "user-selected" };
  }
  // Images always use Flash (Pro is overkill and often overloaded)
  if (hasImage) {
    return { model: "gemini-2.5-flash", reason: "multimodal" };
  }
  if (COMPLEX_KEYWORDS.test(lastUserText) || lastUserText.length > 300) {
    return { model: "gemini-2.5-pro", reason: "complex" };
  }
  if (lastUserText.length < 60) {
    return { model: "gemini-2.5-flash-lite", reason: "short/simple" };
  }
  return { model: "gemini-2.5-flash", reason: "default" };
}

// ── Fix data: URLs in model messages ─────────────────────────────────────────
// Node.js undici (built-in fetch) rejects data: URLs.
// Convert any image/file parts that carry a data: URL into a Buffer so the
// Google provider can inline the bytes without trying to fetch() them.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fixDataUrlImages(messages: ModelMessage[]): ModelMessage[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (messages as any[]).map((msg: any) => {
    if (msg.role !== "user" || !Array.isArray(msg.content)) return msg;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newContent = msg.content.map((part: any) => {
      if (part.type !== "image" && part.type !== "file") return part;

      const raw: unknown = part.image ?? part.data;
      let dataUrl: string | null = null;

      if (typeof raw === "string" && raw.startsWith("data:")) {
        dataUrl = raw;
      } else if (raw instanceof URL && raw.protocol === "data:") {
        dataUrl = raw.toString();
      }

      if (!dataUrl) return part;

      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return part;

      return {
        type: "image" as const,
        image: Buffer.from(match[2], "base64"),
        mimeType: match[1],
      };
    });

    return { ...msg, content: newContent };
  }) as ModelMessage[];
}

// ── Built-in tools ────────────────────────────────────────────────────────────

const builtinTools = {
  get_current_time: tool({
    description: "Get the current date and time.",
    inputSchema: z.object({}),
    execute: async () => new Date().toLocaleString(),
  }),
  calculate: tool({
    description: "Evaluate a safe arithmetic expression (numbers and operators only).",
    inputSchema: z.object({
      expression: z.string().describe("A math expression like '17 * 23' or '(100 + 5) / 3'"),
    }),
    execute: async ({ expression }) => {
      if (!/^[\d\s+\-*/().%]+$/.test(expression)) return "Error: only numeric arithmetic is allowed.";
      try {
        // eslint-disable-next-line no-new-func
        return String(new Function(`return (${expression})`)());
      } catch {
        return "Error: invalid expression.";
      }
    },
  }),
  fetch_url: tool({
    description: "Fetch the text content of a public URL.",
    inputSchema: z.object({ url: z.string().url().describe("The URL to fetch") }),
    execute: async ({ url }) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        return (await res.text()).slice(0, 3000);
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  }),
};

// ── Shared streamText options builder ─────────────────────────────────────────

async function buildStreamResult(
  modelId: ModelId,
  opts: {
    system: string;
    messages: ModelMessage[];
    temperature: number;
    maxOutputTokens: number;
    tools: Record<string, unknown>;
    onFinish: () => Promise<void>;
  }
) {
  return streamText({
    model: google(modelId),
    system: opts.system,
    messages: opts.messages,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens,
    tools: opts.tools as Parameters<typeof streamText>[0]["tools"],
    stopWhen: stepCountIs(5),
    onFinish: opts.onFinish,
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const { messages, model: requestedModel, system, temperature, maxTokens } =
      await request.json();

    const lastUserMsg = messages.findLast((m: { role: string }) => m.role === "user");
    const lastUserText: string =
      lastUserMsg?.parts
        ?.filter((p: { type: string }) => p.type === "text")
        ?.map((p: { text: string }) => p.text)
        ?.join("") ?? "";
    const hasImage =
      lastUserMsg?.parts?.some(
        (p: { type: string }) => p.type === "file" || p.type === "image"
      ) ?? false;

    const { model: chosenModel, reason } = pickModel(
      requestedModel ?? "gemini-2.5-flash",
      lastUserText,
      hasImage
    );

    // MCP client (stdio)
    let mcpTools = {};
    let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;
    try {
      mcpClient = await createMCPClient({
        transport: new StdioMCPTransport({
          command: "node",
          args: ["--import", "tsx/esm", path.join(process.cwd(), "mcp-server/index.ts")],
        }),
      });
      mcpTools = await mcpClient.tools();
    } catch {
      // MCP unavailable — continue without it
    }

    const allTools = { ...builtinTools, ...mcpTools };

    const systemPrompt = [
      system || "You are a helpful assistant.",
      `Today is ${new Date().toLocaleDateString()}.`,
      "You have tools: get_current_time, calculate, fetch_url, and memory tools if available.",
    ].join(" ");

    // Fix data: URL image parts so Node.js fetch doesn't choke on them
    const modelMessages = fixDataUrlImages(await convertToModelMessages(messages));

    const streamOpts = {
      system: systemPrompt,
      messages: modelMessages,
      temperature: temperature ?? 0.7,
      maxOutputTokens: maxTokens ?? 1024,
      tools: allTools,
      onFinish: async () => { await mcpClient?.close(); },
    };

    // Try chosen model; if Pro is overloaded fall back to Flash
    let result;
    try {
      result = await buildStreamResult(chosenModel, streamOpts);
    } catch (modelErr) {
      const msg = String(modelErr);
      if (chosenModel === "gemini-2.5-pro" && msg.includes("high demand")) {
        result = await buildStreamResult("gemini-2.5-flash", {
          ...streamOpts,
          system: streamOpts.system,
        });
        return result.toUIMessageStreamResponse({
          headers: {
            "X-Routed-Model": "gemini-2.5-flash",
            "X-Route-Reason": "pro-overloaded→flash",
          },
        });
      }
      throw modelErr;
    }

    return result.toUIMessageStreamResponse({
      headers: {
        "X-Routed-Model": chosenModel,
        "X-Route-Reason": reason,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
