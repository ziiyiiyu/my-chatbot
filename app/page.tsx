"use client";

import { Chat, useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { Send, Bot, User, Loader2, AlertCircle } from "lucide-react";

const MODELS = [
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

export default function Home() {
  const [model, setModel] = useState("gemini-2.5-flash");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState("");

  const [partyMode, setPartyMode] = useState(false);
  const [colors, setColors] = useState(defaultColors);

  // Typewriter effect
  const [typedText, setTypedText] = useState("");
  const queueRef = useRef<string[]>([]);
  const queuedUpToRef = useRef(0);
  const typingMsgIdRef = useRef<string | null>(null);

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

  const settingsRef = useRef({ model, system: systemPrompt, temperature, maxTokens });
  settingsRef.current = { model, system: systemPrompt, temperature, maxTokens };

  const [chat] = useState(() => new Chat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages: msgs, body, id }) => ({
        body: { ...body, messages: msgs, id, ...settingsRef.current },
      }),
    }),
  }));

  const { messages, setMessages, sendMessage, status, error } = useChat({ chat });

  const isLoading = status === "submitted" || status === "streaming";

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
          parts: [{ type: "text", text: "Party Mode activated!" }],
        },
      ]);
      setPartyMode(true);
      setInput("");
      return;
    }

    sendMessage({ text: input });
    setInput("");
  }

  // Queue new chars when streaming text arrives
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

  // Drain queue one char at a time
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
  }, [messages]);

  return (
    <div className="flex h-full min-w-[1024px]" style={{ backgroundColor: colors.mainBg }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col gap-6 p-5 overflow-y-auto"
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

        {/* Model Selection */}
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
          <div
            className="flex justify-between text-xs"
            style={{ color: "#A4B5C4" }}
          >
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
              setMaxTokens(
                Math.min(4096, Math.max(100, parseInt(e.target.value) || 100))
              )
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
      </aside>

      {/* Main Chat Area */}
      <main
        className="flex flex-col flex-1"
        style={{ backgroundColor: colors.mainBg }}
      >
        {/* Chat Header */}
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
                <Bot
                  size={48}
                  className="mx-auto mb-4"
                  style={{ color: "#4B6382" }}
                />
                <p
                  className="text-lg font-medium"
                  style={{ color: "#A4B5C4" }}
                >
                  Start a conversation
                </p>
                <p className="text-sm mt-1" style={{ color: "#4B6382" }}>
                  Configure the sidebar, then type a message below.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.role === "assistant" && (
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: colors.botAvatar }}
                >
                  <Bot size={16} style={{ color: "#071739" }} />
                </div>
              )}

              <div
                className="max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
                style={
                  msg.role === "user"
                    ? { backgroundColor: colors.userBubbleBg, color: "#071739" }
                    : {
                        backgroundColor: colors.botBubbleBg,
                        color: "#CDD5DB",
                        border: `1px solid ${colors.headerBorder}`,
                      }
                }
              >
                {msg.id === typingMsgIdRef.current
                  ? typedText
                  : msg.parts
                      .filter((p) => p.type === "text")
                      .map((p) => (p as { type: "text"; text: string }).text)
                      .join("")}
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
          ))}

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
                <Loader2
                  size={16}
                  className="animate-spin"
                  style={{ color: "#E3C39D" }}
                />
                <span className="text-sm" style={{ color: "#A4B5C4" }}>
                  Thinking...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error Banner */}
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

        {/* Input Area */}
        <div className="px-6 py-4" style={{ borderTop: `1px solid ${colors.headerBorder}` }}>
          <form onSubmit={handleSubmit} className="flex gap-3 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
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
