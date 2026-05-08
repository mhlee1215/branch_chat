# Branching Chat GUI

A local-first prototype for a horizontal, block-based conversation workspace.

Instead of forcing every AI interaction into one vertical timeline, assistant answers are split into meaningful blocks. Each block can open a focused follow-up branch in a new column, so the user can explore one idea without dragging unrelated sibling blocks into the context.

## Status

Version: `0.1.0` prototype

Current scope:

- Text-based branching chat
- ChatGPT-like sidebar app shell for chat, papers, notes, synthesis, and settings
- Automatic answer block segmentation
- Horizontal branch columns
- Finder-style column workspace after chat starts
- Block split, merge, rename, and summary inclusion controls
- Text-selection branching with inline source indicators
- Direct branch count and max-depth indicators at every depth
- Focused branch context builder
- OpenAI provider adapter scaffold
- In-app OpenAI settings modal
- One-click demo workspace with varied depth 2 to 5 branches
- Markdown-shaped rendering for code and math examples
- Hover-revealed floating composers per column
- Local static hosting
- Node unit tests

## Project Structure

```text
app/       Browser GUI
docs/      Architecture notes
src/       Reusable product logic
tests/     Unit tests
server.js  Local static server
```

## Run Locally

Create local environment settings:

```bash
cp .env.example .env
```

Then edit `.env`:

```text
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.4-mini
```

`OPENAI_API_KEY` is optional during UI development. If it is empty, the app runs in mock mode.

```bash
npm start
```

If `npm` is not available in the local shell, run the server directly:

```bash
node server.js
```

Open:

```text
http://localhost:4173
```

Concept demo:

```text
http://localhost:4173/demo
```

The demo shows the intended interaction without model calls: independent column scrolling, hover-revealed floating composers, semantic response blocks, varied depth 2 to 5 branch paths, direct branch-count and max-depth indicators, multi-block merge affordance, text-selection split and branch affordances, inline selected-text branch chips, and Markdown-shaped content including code and math examples.

## Test

```bash
npm test
```

If `npm` is not available:

```bash
node --test tests/*.test.js
```

The tests use Node's built-in test runner, so no dependency installation is required.

## Deployment Direction

The first version is intentionally static, responsive, and portable. Later, the same frontend can be moved to Vercel, Netlify, Cloudflare Pages, wrapped with Capacitor for iOS and Android, or migrated into Next.js. AI calls, persistence, and document processing should be added behind API boundaries instead of being embedded directly in the UI.

## OpenAI Integration

The prototype currently uses `src/domain/mock-ai.js` so the UI can run without credentials. The intended production path is:

1. Keep API keys on a server, never in browser JavaScript.
2. Send focused branch context to a backend endpoint.
3. Have the backend call the OpenAI Responses API.
4. Segment the returned assistant text into blocks.
5. Store messages, blocks, and branch metadata.

If the UI should live inside ChatGPT itself, that is a different path: build a ChatGPT app with the Apps SDK and expose app behavior through MCP.

For the MVP, keep the UI outside ChatGPT as an independent web app. This is simpler and keeps the branching interface fully under our control.

Runtime endpoints:

```text
GET  /api/config
POST /api/assistant/respond
```

The browser never reads `OPENAI_API_KEY`. The server loads it from `.env` and calls OpenAI from the backend side.

The app also has a Settings modal. This supports a common local/BYOK workflow used by many AI web apps:

- paste an API key into the app settings,
- keep the key on the local server side,
- optionally persist it into `.env`,
- show provider status in the UI.

## UI Spec

The Finder-style column interaction spec is stored at [docs/llm_finder_column_chat_ui_spec.md](./docs/llm_finder_column_chat_ui_spec.md). The current continuation notes and implementation invariants are in [branching-chat-gui-plan.md](./branching-chat-gui-plan.md), especially section 15.

## Design Document

See [branching-chat-gui-plan.md](./branching-chat-gui-plan.md).
