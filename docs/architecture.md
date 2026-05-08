# Architecture

The prototype separates browser UI from product logic.

## Layers

```text
app/
  Browser rendering and event handling

src/domain/
  Block editing, context building, workspace updates, and mock AI responses

tests/
  Unit tests for product logic
```

## Portability

The app currently runs as static files through `server.js`. This keeps local hosting simple while making the project easy to move later:

- Static host: serve `app/` and `src/`.
- Next.js: move `app/` UI into React components and keep `src/domain/`.
- PWA: keep the manifest and service worker in `app/`.
- Capacitor: wrap the built web app when native iOS and Android shells become useful.
- Expo or React Native: consider only if the app needs a truly native UI layer.
- Backend API: replace `src/domain/mock-ai.js` with API calls.
- OpenAI provider: use `src/domain/openai-provider.js` to shape focused branch context for the Responses API.
- Database: persist the workspace model from `src/domain/workspace-store.js`.

## Responsive Layout

Desktop uses horizontal branch columns. Mobile uses one readable column at a time with a top branch rail for switching context. This keeps the core branching model intact without making phone screens unreadable.

## Context Rule

The default branch prompt includes the original question, the selected source block, branch-local messages, and the new user question. Sibling blocks are excluded by default. A highlighted text range can also become a synthetic source block, which lets the user branch from a phrase or sentence fragment without branching from the whole semantic block.

## OpenAI Integration Modes

There are two possible integration modes:

- Standalone app: this UI is the product, and a backend proxy calls the OpenAI Responses API.
- ChatGPT app: this UI becomes an app inside ChatGPT using the Apps SDK and MCP.

For the MVP, use the standalone app path. It keeps local development and later web hosting simple, while preserving the option to build a ChatGPT app later.

## Environment

Local OpenAI settings live in `.env`.

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
```

The browser calls `/api/config` to show whether OpenAI is configured. Assistant calls go through `/api/assistant/respond`, so secrets never enter browser JavaScript.

The Settings modal can update runtime provider settings through `POST /api/settings`. For local use, the user may optionally persist those settings to `.env`.

## Finder-Style UI

The detailed product spec is stored in `docs/llm_finder_column_chat_ui_spec.md`.

When a chat starts, the UI becomes a horizontally scrollable column workspace. The first column is the root assistant answer, and each follow-up branch opens to the right. There is no permanent separate transcript panel in the current prototype.

Each column owns its own vertical scroll and a hover-revealed floating composer near the bottom. The composer appears only when the pointer enters the lower hover zone, and hidden composer state should not reserve layout space.

The active branch path is communicated with color. The selected source block and the next-depth column use the same accent color; arrow connectors are intentionally avoided.

## App Shell

The browser UI now wraps the branching chat in a ChatGPT-like app shell with a left sidebar.

- `Chat` shows the branching column workspace.
- `Papers` is reserved for paper queues, PDF upload, and citation-aware reading sessions.
- `Notes` is reserved for branch-derived research notes.
- `Synthesis` can create or display a summary from the current workspace.
- `Settings` opens provider configuration.

Changing sidebar views should not destroy the current workspace. `New chat` intentionally resets only the chat workspace.

## Branch Graph Invariants

- A branch originates from either a whole semantic block or a selected text range.
- A selected text range is represented as a synthetic source block linked back to its parent block and character range.
- Direct branch count and maximum reachable depth are shown for branchable sources at every depth.
- Creating a branch activates its ancestor path so parent columns refresh together.
- Merging blocks must also merge graph ownership: child branches, selected-text sources, range offsets, and branch answer parent references must be reparented to the merged block.
- Root text-selection branches must create depth 1 branches. Active nested branches must not leak into root branch creation.
