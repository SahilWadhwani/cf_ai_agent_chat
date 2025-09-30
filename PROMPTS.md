## Prompt 1 – Routing & 404 Errors

### Context

While testing with `curl`, my requests to `/agents/my-agent/main-agent` kept returning `404 Not Found`. I wasn’t sure if the route binding was wrong or if my `MyAgent` class wasn’t being called.

### Prompt I Asked AI

> I’m using Cloudflare’s Agents SDK with a Durable Object called `MyAgent`. I keep getting 404 on `POST /agents/my-agent/main-agent`. Can you check if I need to implement `onRequest`, or if `routeAgentRequest` should automatically handle this? 

---

## Prompt 2 – Handling Streaming Responses

### Context

The AI responses weren’t streaming into the frontend — I was only seeing a static response after the request completed.

### Prompt I Asked AI

> How do I stream Workers AI responses back to the frontend using SSE in a Durable Object? Right now I call `env.AI.run(...)`, but the frontend only gets the final text. Show me how to tee the `ReadableStream` so the client sees tokens while also saving the assistant’s full text for history.

---

## Prompt 3 – State / Persistence Errors

### Context

When I tried saving history, I first attempted `agent.sql.exec` and later `agent.getState()`, but both threw runtime errors (`agent.sql.exec is not a function`, `agent.getState is not a function`). I needed guidance on how to correctly persist conversation history.

### Prompt I Asked AI

> In my Durable Object `MyAgent`, I want to persist chat history. `agent.sql.exec` and `agent.getState` both fail with runtime errors. What’s the simplest way to store conversation history in-memory per agent instance, so I can return it on `GET /agents/...`? 

---
