"use client";

import { Chat, useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  Paperclip,
  X,
  Brain,
  Wrench,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

const MODELS = [
  { id: "auto", label: "Auto (Router)" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
];

const randomColor = () =>
  `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;

const defaultColors = {
  sidebarBg: "#1a2d4a",
  mainBg: "#071739",
  headerBorder: "#4B6382",
  botAvatar: "#A68868",
  userAvatar: "#A4B5C4",
  userBubbleBg: "#A4B5C4",
  botBubbleBg: "#1f3558",
  sendBtn: "#E3C39D",
  inputBg: "#0e2540",
};

const MEMORY_KEY = "chatbot_memory_facts";
const HISTORY_KEY = "chatbot_history";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolPart {
  type: string;
  toolName?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}

// ── Tool call card ────────────────────────────────────────────────────────────

function ToolCard({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const name = part.toolName ?? part.type.replace(/^tool-/, "");
  const isDone = part.state === "output-available";
  return (
    <div
      className="rounded-lg text-xs my-1"
      style={{ border: "1px solid #4B6382", backgroundColor: "#0e2540" }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
        style={{ color: isDone ? "#E3C39D" : "#A4B5C4" }}
      >
        <Wrench size={12} />
        <span className="font-mono">{name}</span>
        <span className="ml-auto opacity-60">
          {isDone ? "done" : "calling…"}
        </span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-1" style={{ color: "#CDD5DB" }}>
          {part.input !== undefined && (
            <div>
              <span className="opacity-50">input: </span>
              <code>{JSON.stringify(part.input)}</code>
            </div>
          )}
          {part.output !== undefined && (
            <div>
              <span className="opacity-50">output: </span>
              <code className="whitespace-pre-wrap">
                {typeof part.output === "string"
                  ? part.output
                  : JSON.stringify(part.output, null, 2)}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Home() {
  const [model, setModel] = useState("auto");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);

  // Memory
  const [memoryFacts, setMemoryFacts] = useState<string[]>([]);
  const [memoryOpen, setMemoryOpen] = useState(false);

  // Routing badge per message id
  const [routingInfo, setRoutingInfo] = useState<
    Record<string, { model: string; reason: string }>
  >({});
  // Used by custom fetch to surface routing headers
  const pendingRoutingRef = useRef<{ model: string; reason: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);

  // Party mode
  const [partyMode, setPartyMode] = useState(false);
  const [colors, setColors] = useState(defaultColors);

  // Typewriter
  const [typedText, setTypedText] = useState("");
  const queueRef = useRef<string[]>([]);
  const queuedUpToRef = useRef(0);
  const typingMsgIdRef = useRef<string | null>(null);

  // ── Load memory + history from localStorage ──────────────────────────────

  const [historyLoaded, setHistoryLoaded] = useState(false);

  // ── Party mode interval ───────────────────────────────────────────────────

  useEffect(() => {
    if (!partyMode) return;
    const interval = setInterval(() => {
      setColors({
        sidebarBg: randomColor(),
        mainBg: randomColor(),
        headerBorder: randomColor(),
        botAvatar: randomColor(),
        userAvatar: randomColor(),
        userBubbleBg: randomColor(),
        botBubbleBg: randomColor(),
        sendBtn: randomColor(),
        inputBg: randomColor(),
      });
    }, 300);
    return () => clearInterval(interval);
  }, [partyMode]);

  // ── Chat setup ────────────────────────────────────────────────────────────

  const settingsRef = useRef({ model, system: systemPrompt, temperature, maxTokens });
  settingsRef.current = { model, system: systemPrompt, temperature, maxTokens };

  const memoryRef = useRef(memoryFacts);
  memoryRef.current = memoryFacts;

  const [chat] = useState(
    () =>
      new Chat({
        transport: new DefaultChatTransport({
          api: "/api/chat",
          prepareSendMessagesRequest: ({ messages: msgs, body, id }) => ({
            body: { ...body, messages: msgs, id, ...settingsRef.current },
          }),
          fetch: async (url, options) => {
            const res = await globalThis.fetch(url, options as RequestInit);
            const routedModel = res.headers.get("X-Routed-Model");
            const routeReason = res.headers.get("X-Route-Reason");
            if (routedModel) {
              pendingRoutingRef.current = {
                model: routedModel,
                reason: routeReason ?? "",
              };
            }
            return res;
          },
        }),
      })
  );

  const { messages, setMessages, sendMessage, status, error } = useChat({ chat });

  const isLoading = status === "submitted" || status === "streaming";

  // ── Load history + memory from localStorage ───────────────────────────────

  useEffect(() => {
    try {
      const facts = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? "[]");
      setMemoryFacts(facts);
    } catch {}
    try {
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
      if (Array.isArray(history) && history.length > 0) {
        setMessages(history);
      }
    } catch {}
    setHistoryLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist history ───────────────────────────────────────────────────────

  useEffect(() => {
    if (messages.length === 0) return;
    try {
      // Keep last 40 messages to avoid blowing localStorage quota
      const toStore = messages.slice(-40).map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts.filter((p) => p.type === "text"),
      }));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(toStore));
    } catch {}
  }, [messages]);

  // ── Extract memories after each assistant reply ───────────────────────────

  const extractMemory = useCallback(async () => {
    if (messages.length < 2) return;
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          existingMemory: memoryRef.current,
        }),
      });
      const { facts } = await res.json();
      if (facts.length > 0) {
        setMemoryFacts((prev) => {
          const merged = [...new Set([...prev, ...facts])];
          localStorage.setItem(MEMORY_KEY, JSON.stringify(merged));
          return merged;
        });
      }
    } catch {}
  }, [messages]);

  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === "streaming" && status === "ready") {
      extractMemory();
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "assistant" && pendingRoutingRef.current) {
        const info = pendingRoutingRef.current;
        pendingRoutingRef.current = null;
        setRoutingInfo((prev) => ({ ...prev, [lastMsg.id]: info }));
      }
    }
    prevStatus.current = status;
  }, [status, messages, extractMemory]);

  // ── Inject memory into system prompt ─────────────────────────────────────

  useEffect(() => {
    if (memoryFacts.length === 0) return;
    setSystemPrompt((prev) => {
      const tag = "<!-- memory -->";
      const memLine = `${tag}\nKnown facts about the user:\n${memoryFacts.map((f) => `- ${f}`).join("\n")}`;
      if (prev.includes(tag)) {
        return prev.replace(
          /<!-- memory -->[\s\S]*$/,
          memLine
        );
      }
      return prev ? `${prev}\n\n${memLine}` : memLine;
    });
  }, [memoryFacts]);

  // ── Typewriter ────────────────────────────────────────────────────────────

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return;
    const fullText = lastMsg.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join("");
    if (typingMsgIdRef.current !== lastMsg.id) {
      typingMsgIdRef.current = lastMsg.id;
      queueRef.current = [];
      queuedUpToRef.current = 0;
      setTypedText("");
    }
    const newChars = fullText.slice(queuedUpToRef.current).split("");
    queueRef.current.push(...newChars);
    queuedUpToRef.current = fullText.length;
  }, [messages]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (queueRef.current.length === 0) return;
      const char = queueRef.current.shift()!;
      setTypedText((prev) => prev + char);
    }, 15);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typedText]);

  // ── Submit ────────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (input.trim() === "/partymode") {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          parts: [{ type: "text", text: "/partymode" }],
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          parts: [{ type: "text", text: "Party Mode activated! 🎉" }],
        },
      ]);
      setPartyMode(true);
      setInput("");
      return;
    }

    sendMessage({
      text: input,
      files: pendingFiles ?? undefined,
    });
    setInput("");
    setPendingFiles(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Render message parts ──────────────────────────────────────────────────

  function renderParts(
    msg: (typeof messages)[0],
    isTyping: boolean
  ) {
    const textParts: React.ReactElement[] = [];
    const toolParts: React.ReactElement[] = [];

    msg.parts.forEach((p, i) => {
      if (p.type === "text") {
        const text = isTyping
          ? typedText
          : (p as { type: "text"; text: string }).text;
        textParts.push(
          <span key={i} className="whitespace-pre-wrap">
            {text}
          </span>
        );
      } else if (p.type === "file") {
        const fp = p as {
          type: "file";
          mediaType?: string;
          url?: string;
          filename?: string;
        };
        if (fp.mediaType?.startsWith("image/") && fp.url) {
          textParts.push(
            <img
              key={i}
              src={fp.url}
              alt={fp.filename ?? "image"}
              className="max-w-[200px] rounded-lg mt-1"
            />
          );
        }
      } else if (p.type.startsWith("tool-")) {
        toolParts.push(<ToolCard key={i} part={p as unknown as ToolPart} />);
      }
    });

    return (
      <>
        {toolParts.length > 0 && <div className="mb-2">{toolParts}</div>}
        {textParts}
      </>
    );
  }

  if (!historyLoaded) return null;

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex h-full min-w-[1024px]"
      style={{ backgroundColor: colors.mainBg }}
    >
      {/* ── Sidebar ── */}
      <aside
        className="flex flex-col gap-5 p-5 overflow-y-auto"
        style={{
          width: "280px",
          minWidth: "280px",
          backgroundColor: colors.sidebarBg,
          borderRight: `1px solid ${colors.headerBorder}`,
        }}
      >
        <div>
          <h1 className="text-xl font-bold mb-1" style={{ color: "#E3C39D" }}>
            My ChatBot
          </h1>
          <p className="text-xs" style={{ color: "#A4B5C4" }}>
            Powered by Google Gemini
          </p>
        </div>

        {/* Model */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold" style={{ color: "#CDD5DB" }}>
            Model
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
            style={{
              backgroundColor: "#071739",
              border: "1px solid #4B6382",
              color: "#CDD5DB",
            }}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* System Prompt */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold" style={{ color: "#CDD5DB" }}>
            System Prompt
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Define the assistant's behavior..."
            rows={5}
            className="rounded-lg px-3 py-2 text-sm resize-none outline-none"
            style={{
              backgroundColor: "#071739",
              border: "1px solid #4B6382",
              color: "#CDD5DB",
            }}
          />
        </div>

        {/* Temperature */}
        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-semibold flex justify-between"
            style={{ color: "#CDD5DB" }}
          >
            <span>Temperature</span>
            <span style={{ color: "#E3C39D" }}>{temperature.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full cursor-pointer accent-[#E3C39D]"
          />
          <div className="flex justify-between text-xs" style={{ color: "#A4B5C4" }}>
            <span>0 (precise)</span>
            <span>2 (creative)</span>
          </div>
        </div>

        {/* Max Tokens */}
        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-semibold flex justify-between"
            style={{ color: "#CDD5DB" }}
          >
            <span>Max Tokens</span>
            <span style={{ color: "#E3C39D" }}>{maxTokens}</span>
          </label>
          <input
            type="number"
            min={100}
            max={4096}
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value) || 0)}
            onBlur={(e) =>
              setMaxTokens(Math.min(4096, Math.max(100, parseInt(e.target.value) || 100)))
            }
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: "#071739",
              border: "1px solid #4B6382",
              color: "#CDD5DB",
            }}
          />
          <p className="text-xs" style={{ color: "#A4B5C4" }}>
            Range: 100 – 4096
          </p>
        </div>

        {/* Memory Panel */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setMemoryOpen((o) => !o)}
            className="flex items-center gap-2 text-sm font-semibold"
            style={{ color: "#CDD5DB" }}
          >
            <Brain size={14} style={{ color: "#E3C39D" }} />
            <span>Memory</span>
            <span
              className="ml-auto rounded-full px-2 py-0.5 text-xs"
              style={{ backgroundColor: "#071739", color: "#E3C39D" }}
            >
              {memoryFacts.length}
            </span>
            {memoryOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {memoryOpen && (
            <div
              className="rounded-lg p-3 text-xs flex flex-col gap-1"
              style={{
                backgroundColor: "#071739",
                border: "1px solid #4B6382",
                color: "#CDD5DB",
                maxHeight: "160px",
                overflowY: "auto",
              }}
            >
              {memoryFacts.length === 0 ? (
                <span style={{ color: "#4B6382" }}>No memories yet.</span>
              ) : (
                memoryFacts.map((f, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <span style={{ color: "#E3C39D" }}>•</span>
                    <span>{f}</span>
                    <button
                      onClick={() =>
                        setMemoryFacts((prev) => {
                          const next = prev.filter((_, j) => j !== i);
                          localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
                          return next;
                        })
                      }
                      className="ml-auto opacity-40 hover:opacity-100"
                      style={{ color: "#ff6b6b" }}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
              {memoryFacts.length > 0 && (
                <button
                  onClick={() => {
                    setMemoryFacts([]);
                    localStorage.removeItem(MEMORY_KEY);
                  }}
                  className="mt-2 text-xs self-start"
                  style={{ color: "#ff6b6b" }}
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>

        {/* Clear History */}
        <button
          onClick={() => {
            setMessages([]);
            localStorage.removeItem(HISTORY_KEY);
          }}
          className="text-xs self-start"
          style={{ color: "#4B6382" }}
        >
          Clear chat history
        </button>
      </aside>

      {/* ── Main chat area ── */}
      <main
        className="flex flex-col flex-1"
        style={{ backgroundColor: colors.mainBg }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center gap-2"
          style={{ borderBottom: `1px solid ${colors.headerBorder}` }}
        >
          <Bot size={20} style={{ color: "#E3C39D" }} />
          <span className="font-semibold" style={{ color: "#CDD5DB" }}>
            {MODELS.find((m) => m.id === model)?.label ?? model}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Bot size={48} className="mx-auto mb-4" style={{ color: "#4B6382" }} />
                <p className="text-lg font-medium" style={{ color: "#A4B5C4" }}>
                  Start a conversation
                </p>
                <p className="text-sm mt-1" style={{ color: "#4B6382" }}>
                  Configure the sidebar, then type a message below.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const isTyping = msg.id === typingMsgIdRef.current;
            const routing = routingInfo[msg.id];
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: colors.botAvatar }}
                  >
                    <Bot size={16} style={{ color: "#071739" }} />
                  </div>
                )}

                <div className="flex flex-col gap-1 max-w-[70%]">
                  {/* Routing badge */}
                  {msg.role === "assistant" && routing && (
                    <span
                      className="text-xs self-start px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "#0e2540",
                        border: "1px solid #4B6382",
                        color: "#A4B5C4",
                      }}
                    >
                      {routing.model} · {routing.reason}
                    </span>
                  )}

                  <div
                    className="rounded-2xl px-4 py-3 text-sm leading-relaxed"
                    style={
                      msg.role === "user"
                        ? {
                            backgroundColor: colors.userBubbleBg,
                            color: "#071739",
                          }
                        : {
                            backgroundColor: colors.botBubbleBg,
                            color: "#CDD5DB",
                            border: `1px solid ${colors.headerBorder}`,
                          }
                    }
                  >
                    {renderParts(msg, isTyping)}
                  </div>
                </div>

                {msg.role === "user" && (
                  <div
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: colors.userAvatar }}
                  >
                    <User size={16} style={{ color: "#071739" }} />
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: colors.botAvatar }}
              >
                <Bot size={16} style={{ color: "#071739" }} />
              </div>
              <div
                className="rounded-2xl px-4 py-3 flex items-center gap-2"
                style={{
                  backgroundColor: colors.botBubbleBg,
                  border: `1px solid ${colors.headerBorder}`,
                }}
              >
                <Loader2 size={16} className="animate-spin" style={{ color: "#E3C39D" }} />
                <span className="text-sm" style={{ color: "#A4B5C4" }}>
                  Thinking...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div
            className="mx-6 mb-2 px-4 py-3 rounded-lg flex items-center gap-2 text-sm"
            style={{
              backgroundColor: "#3d1515",
              border: "1px solid #a33",
              color: "#ffaaaa",
            }}
          >
            <AlertCircle size={16} />
            <span>{error.message}</span>
          </div>
        )}

        {/* Image preview */}
        {pendingFiles && pendingFiles.length > 0 && (
          <div
            className="mx-6 mb-2 flex gap-2 flex-wrap"
          >
            {Array.from(pendingFiles).map((file, i) => (
              <div key={i} className="relative">
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="h-16 w-16 rounded-lg object-cover"
                  style={{ border: "1px solid #4B6382" }}
                />
                <button
                  onClick={() => {
                    setPendingFiles(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="absolute -top-1 -right-1 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                  style={{ backgroundColor: "#ff6b6b", color: "white" }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div
          className="px-6 py-4"
          style={{ borderTop: `1px solid ${colors.headerBorder}` }}
        >
          <form onSubmit={handleSubmit} className="flex gap-3 items-end">
            {/* File upload */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl px-3 py-3 flex items-center justify-center transition-opacity"
              style={{
                backgroundColor: colors.inputBg,
                border: `1px solid ${colors.headerBorder}`,
                color: pendingFiles ? "#E3C39D" : "#4B6382",
                minHeight: "48px",
              }}
              title="Attach image"
            >
              <Paperclip size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => setPendingFiles(e.target.files)}
            />

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
              rows={1}
              className="flex-1 rounded-xl px-4 py-3 text-sm resize-none outline-none"
              style={{
                backgroundColor: colors.inputBg,
                border: `1px solid ${colors.headerBorder}`,
                color: "#CDD5DB",
                minHeight: "48px",
                maxHeight: "160px",
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="rounded-xl px-4 py-3 font-semibold text-sm flex items-center gap-2 transition-opacity disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              style={{
                backgroundColor: colors.sendBtn,
                color: "#071739",
                minHeight: "48px",
              }}
            >
              <Send size={16} />
              Send
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
