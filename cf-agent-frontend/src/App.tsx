import { useState, useEffect, useRef } from "react";
import type { FormEvent } from "react";
import "./App.css";

interface Message {
  role: "user" | "assistant";
  content: string;
}


const AGENT_BASE = import.meta.env.VITE_AGENT_BASE ?? "";
const agentUrl = `${AGENT_BASE}/agents/my-agent/main-agent`;
const toolUrl = (city: string) => `${AGENT_BASE}/tools/time?city=${encodeURIComponent(city)}`;

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(agentUrl);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data?.messages)) {
          setMessages(
            data.messages.map((m: any) => ({
              role: (m.sender as "user" | "assistant") ?? "assistant",
              content: m.text ?? "",
            }))
          );
        }
      } catch (e) {
        console.warn("history fetch failed:", e);
      }
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function extractTextFromSSEData(data: string): string | null {
    try {
      const obj = JSON.parse(data);
      if (typeof obj.response === "string") return obj.response;
      if (typeof obj.delta === "string") return obj.delta;
      if (typeof obj.output_text === "string") return obj.output_text;
      const ch = obj.choices?.[0];
      const delta = ch?.delta?.content ?? ch?.text;
      if (typeof delta === "string") return delta;
      return null;
    } catch {
      if (data && data !== "[DONE]") return data;
      return null;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(agentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMessage] }),
      });

      if (!res.body) {
        setIsLoading(false);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          const delta = extractTextFromSSEData(payload);
          if (!delta) continue;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== "assistant") return prev;
            return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
          });
        }
      }
    } catch (err) {
      console.error("send error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function doTimeTool() {
    const city = prompt("City (e.g., London, New York, Tokyo):")?.trim();
    if (!city) return;
    try {
      const res = await fetch(toolUrl(city));
      const data = await res.json();
      const text = data?.ok
        ? `Local time in ${city}: ${data.time}`
        : `Could not resolve time for "${city}". Try: New York, SF, London, Tokyo, Delhi, Sydney.`;
      setMessages((prev) => [...prev, { role: "assistant", content: text }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Tool failed." }]);
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", background: "#f7f7fb" }}>
      <div style={{ width: 520, background: "white", borderRadius: 14, boxShadow: "0 14px 38px rgba(0,0,0,.08)", border: "1px solid #eee" }}>
        <div style={{ padding: 16, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Cloudflare Agent Chat</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={doTimeTool} title="Get local time"
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fafafa" }}>
               Time
            </button>
          </div>
        </div>

        <div style={{ padding: 16, maxHeight: "65vh", overflowY: "auto" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 12, lineHeight: 1.45 }}>
              <div style={{ fontWeight: 600, color: m.role === "user" ? "#333" : "#0c5" }}>
                {m.role}:
              </div>
              <div>{m.content}</div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, padding: 12, borderTop: "1px solid #eee" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            style={{
              flex: 1, padding: "12px 14px", borderRadius: 10,
              border: "1px solid #dcdcdc", background: "#fff"
            }}
          />
          <button type="submit" disabled={isLoading || !input.trim()}
            style={{ padding: "12px 16px", borderRadius: 10, background: "#2563eb", color: "#fff", border: "none" }}>
            {isLoading ? "…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}