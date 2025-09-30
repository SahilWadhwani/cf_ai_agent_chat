import { routeAgentRequest } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";

function withCors(res: Response, origin = "*") {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, headers });
}

interface Env {
  AI: any; // Workers AI binding
  MyAgent: DurableObjectNamespace;
}

/* ------------------------ Model selection w/ fallback ----------------------- */
const MODEL_CANDIDATES = [
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/mistral/mistral-7b-instruct-v0.2",
];

async function runWithFallback(env: Env, messages: any[], stream = true) {
  let lastErr: unknown;
  for (const model of MODEL_CANDIDATES) {
    try {
      console.log("[WorkersAI] trying model:", model);
      return await env.AI.run(model as any, { messages, stream });
    } catch (err) {
      console.error(`[WorkersAI] model failed ${model}:`, err);
      lastErr = err;
    }
  }
  throw lastErr;
}

/* ------------------------------ SSE utilities ------------------------------ */
function extractDelta(payload: string): string | null {
  try {
    const obj = JSON.parse(payload);
    if (typeof obj.response === "string") return obj.response;
    if (typeof obj.delta === "string") return obj.delta;
    if (typeof obj.output_text === "string") return obj.output_text;
    const ch = obj.choices?.[0];
    const openaiDelta = ch?.delta?.content ?? ch?.text;
    if (typeof openaiDelta === "string") return openaiDelta;
    return null;
  } catch {
    if (payload && payload !== "[DONE]") return payload;
    return null;
  }
}

/* --------------------------------- Agent ----------------------------------- */
type HistoryItem = { sender: "user" | "assistant"; text: string };
const HISTORY_LIMIT = 200;

export class MyAgent extends AIChatAgent<Env> {
  // per-agent in-memory history (within the DO’s lifetime)
  private _history: HistoryItem[] = [];

  private loadHistory(): HistoryItem[] {
    return this._history;
  }
  private saveHistory(history: HistoryItem[]) {
    // trim and assign
    this._history = history.slice(-HISTORY_LIMIT);
  }
  private appendMessage(item: HistoryItem) {
    const h = this.loadHistory();
    h.push(item);
    this.saveHistory(h);
  }

  // Stream reply, tee to client and append assistant text to history
  async onChatMessage(_onFinish: unknown) {
    const messages = [
      { role: "system", content: "You are a friendly assistant." },
      ...(this.messages ?? []),
    ];

    const aiStream: ReadableStream = await runWithFallback(this.env, messages, true);

    const ts = new TransformStream();
    const writer = ts.writable.getWriter();
    const reader = aiStream.getReader();
    const decoder = new TextDecoder();

    let buf = "";
    let assistantText = "";

    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          // pass-through to client
          await writer.write(value);

          // accumulate assistant text
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            const delta = extractDelta(payload);
            if (delta) assistantText += delta;
          }
        }
      } finally {
        await writer.close();
        const text = assistantText.trim();
        if (text) {
          try {
            this.appendMessage({ sender: "assistant", text });
          } catch (e) {
            console.error("failed to persist assistant message:", e);
          }
        }
      }
    })();

    return new Response(ts.readable, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  // Handle HTTP calls within the DO
  async onRequest(request: Request): Promise<Response> {
    if (request.method === "GET") {
      const history = this.loadHistory();
      return Response.json({ messages: history });
    }

    if (request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { messages?: any[] };
      const incoming = Array.isArray(body?.messages) ? body.messages : [];

      // Save the last user message
      const last = incoming[incoming.length - 1];
      if (last?.role === "user" && typeof last.content === "string") {
        this.appendMessage({ sender: "user", text: last.content });
      }

      // Expose full convo to the model
      (this as any).messages = incoming;

      return this.onChatMessage(null);
    }

    return new Response("Not Found", { status: 404 });
  }
}

/* ------------------------------- Tool route -------------------------------- */
function timeFor(cityRaw: string | null): string | null {
  if (!cityRaw) return null;
  const city = cityRaw.toLowerCase().trim();

  const TZ: Record<string, string> = {
    "new york": "America/New_York",
    nyc: "America/New_York",
    "san francisco": "America/Los_Angeles",
    sf: "America/Los_Angeles",
    "los angeles": "America/Los_Angeles",
    london: "Europe/London",
    paris: "Europe/Paris",
    berlin: "Europe/Berlin",
    tokyo: "Asia/Tokyo",
    delhi: "Asia/Kolkata",
    mumbai: "Asia/Kolkata",
    sydney: "Australia/Sydney",
  };

  const tz = TZ[city];
  if (!tz) return null;

  const now = new Date();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now);
}

/* --------------------------------- Worker ---------------------------------- */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname === "/tools/time" && request.method === "GET") {
      const city = url.searchParams.get("city");
      const text = timeFor(city);
      const res = Response.json(
        text
          ? { ok: true, city, time: text }
          : { ok: false, error: "Unknown city. Try: New York, SF, London, Tokyo, Delhi, Sydney." },
        { status: text ? 200 : 400 }
      );
      return withCors(res);
    }

    const routed = await routeAgentRequest(request, env);
    if (routed) return withCors(routed);

    return withCors(new Response("Not Found", { status: 404 }));
  },
};