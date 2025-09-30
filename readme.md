# Cloudflare Conference Agent 

> An AI-powered chat agent built on Cloudflare’s Agents SDK and Workers AI, with a lightweight React frontend.

## Deployed Link - [https://cf-agent-frontend.pages.dev/](https://cf-agent-frontend.pages.dev/)


-   **LLM**: Workers AI (`@cf/meta/llama-3.1-8b-instruct`, with a fallback to Mistral)
-   **Workflow / Coordination**: Durable Object Agent (`MyAgent`) using the Agents SDK router
-   **User Input**: Chat UI (Vite + React) with server-sent events (SSE) streaming
-   **Memory / State**: Agent-held conversation history (per Durable Object instance)
-   **Tool**: Simple “Local Time” tool (`/tools/time?city=...`) demonstrated via a UI button

---


## Project Structure

```

cf-agent-internship/
├── cf-agent-backend/
│   ├── src/
│   │   └── index.ts          \# Durable Object Agent (MyAgent) + router + tool endpoint
│   ├── wrangler.jsonc        \# Worker + Durable Object config
│   └── package.json
├── cf-agent-frontend/
│   ├── src/
│   │   ├── App.tsx           \# Simple chat UI with SSE streaming & “Time” tool button
│   │   └── App.css
│   ├── vite.config.ts        \# Dev proxy to backend
│   ├── index.html
│   └── package.json
└── README.md                 

````

---

## Architecture Overview

### High-Level Flow

1.  The React app collects user input and `POST`s it to the Agent endpoint: `POST /agents/my-agent/main-agent`.
2.  The backend routes the request via `routeAgentRequest` to the Durable Object Agent (`MyAgent`).
3.  `MyAgent.onRequest()` passes messages to `onChatMessage()`, which calls Workers AI with the current conversation and streams results back to the client as Server-Sent Events (SSE).
4.  While streaming, the agent accumulates the assistant’s text and stores it in per-agent in-memory history (satisfies **Memory/State**).
5.  `GET /agents/my-agent/main-agent` returns history so the UI can preload past messages.
6.  A simple tool endpoint (`/tools/time?city=...`) demonstrates action-taking outside the model.

### Why Durable Objects?

-   They’re **stateful**, so you can keep conversation state per agent instance.
-   They pair nicely with the **Agents SDK routing** (`/agents/<class>/<name>`).
-   They support **long-running, streaming interactions**.

---

## Local Development

### Backend (Worker + Durable Object Agent)

From the backend folder:
```bash
cd cf-agent-backend
npm install               # if needed
npx wrangler dev          # serves on http://localhost:8787
````

You should see `Ready on http://localhost:8787`.

  - The agent endpoint is `/agents/my-agent/main-agent`.
  - The tool endpoint is `/tools/time?city=London`.

### Frontend (Vite + React)

From the frontend folder (in a separate terminal):

```bash
cd cf-agent-frontend
npm install
npm run dev               # serves on http://localhost:5173
```

The dev server proxies `/agents` and `/tools` to the Worker (see `vite.config.ts`), so the UI can call the backend transparently in development.

**Open: `http://localhost:5173`**

  - Type a message and send, you should see the assistant’s response stream in.
  - Click `Time` to enter a city (e.g., “London”) to see the tool in action.

### Quick cURL Tests

**POST (chat, SSE stream)**

```bash
curl -N -X POST http://localhost:8787/agents/my-agent/main-agent \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello, who are you?"}]}'
```

**GET (history)**

```bash
curl http://localhost:8787/agents/my-agent/main-agent
# -> { "messages": [ { "sender": "user"|"assistant", "text": "..." }, ... ] }
```

**Tool (local time)**

```bash
curl "http://localhost:8787/tools/time?city=London"
```

-----

## Configuration

### Environment Variables

For local development, we rely on Cloudflare’s Workers AI binding, so no additional secrets are required.

### Model Selection & Fallback

We try a list of models in order. If one isn’t available, the code automatically tries the next.

```typescript
const MODEL_CANDIDATES = [
  "@cf/meta/llama-3.1-8b-instruct",       // widely available
  "@cf/mistral/mistral-7b-instruct-v0.2", // fallback
];
```


-----

## Endpoints

  - **Agent (GET)** – `GET /agents/my-agent/main-agent`
      - Returns history for the current DO instance.
  - **Agent (POST)** – `POST /agents/my-agent/main-agent`
      - Sends conversation messages and receives an SSE stream.
  - **Tool: Local Time** – `GET /tools/time?city=London`
      - Returns the local time for a given city.

-----

## How It Works (Key Files)

  - **Backend: `cf-agent-backend/src/index.ts`**

      - `MyAgent.onRequest(request)` handles `GET` (returns history) and `POST` (calls `onChatMessage`).
      - `MyAgent.onChatMessage()` calls `env.AI.run` with the conversation history and streams results back.
      - Includes a simple tool endpoint at `/tools/time`.

  - **Frontend: `cf-agent-frontend/src/App.tsx`**

      - Minimal chat UI that preloads history on mount.
      - Parses SSE data frames from Workers AI to append text deltas.
      - Includes a ` Time` button to call the tool endpoint.
      - `vite.config.ts` proxies `/agents` and `/tools` to `http://localhost:8787` in dev.



