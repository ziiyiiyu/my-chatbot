import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

const MEMORY_FILE = path.join(process.cwd(), "memory-store.json");

function loadMemory(): string[] {
  try {
    const data = fs.readFileSync(MEMORY_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveMemory(facts: string[]) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(facts, null, 2));
}

const server = new McpServer({
  name: "chatbot-memory",
  version: "1.0.0",
});

server.tool(
  "search_memory",
  "Search stored user memories and facts. Use this when you need to recall things about the user.",
  { query: z.string().describe("Keywords to search in memory") },
  async ({ query }) => {
    const facts = loadMemory();
    const lower = query.toLowerCase();
    const matches = facts.filter((f) =>
      f.toLowerCase().includes(lower)
    );
    const result =
      matches.length > 0
        ? matches.join("\n")
        : facts.length > 0
        ? facts.join("\n")
        : "No memories stored yet.";
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "save_memory",
  "Save a new fact about the user to long-term memory.",
  { fact: z.string().describe("The fact to remember") },
  async ({ fact }) => {
    const facts = loadMemory();
    if (!facts.includes(fact)) {
      facts.push(fact);
      saveMemory(facts);
    }
    return {
      content: [{ type: "text", text: `Saved: "${fact}"` }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
