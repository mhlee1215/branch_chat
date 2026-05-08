# Branching Chat GUI Project Plan

## 1. Project Overview

This project is a web-based interactive conversation GUI that improves on the limitations of a vertical chat timeline.

Instead of treating every answer as one long message, the system splits AI responses into meaningful blocks. Each block can become the starting point of a focused follow-up conversation. When the user asks about one block, a new column opens horizontally to the right. The new conversation uses only the necessary context, such as the original question and the selected answer block, instead of carrying every sibling block into the prompt.

This interaction model is especially useful for paper reading, research workflows, code review, planning, and any task where questions naturally branch into deeper subquestions.

## 2. Core Concept

Traditional chat:

```text
Question
Answer
Follow-up question
Answer
Follow-up question
Answer
```

Branching chat:

```text
Original Question
  ├─ Answer Block 1 ── Follow-up ── Deeper Follow-up
  ├─ Answer Block 2
  ├─ Answer Block 3
  └─ Answer Block 4
```

When the user follows up on `Answer Block 1`, the UI creates a new column to the right. The context for that branch is focused on:

1. The original question.
2. The selected answer block.
3. The existing messages inside the current branch.
4. The new user question.

Sibling blocks are excluded by default to reduce context noise.

## 3. Design Phases

The design is divided into **8 phases**.

### Phase 1: Product Definition

Define the product goal, target workflows, and core interaction model.

Deliverables:

- Product goal
- Primary user scenarios
- MVP scope
- Non-goals for the first version
- Success criteria

### Phase 2: Information Architecture

Define how conversations, answers, blocks, branches, and summaries relate to each other.

Deliverables:

- Conversation graph model
- Block hierarchy model
- Branch path rules
- Summary inclusion rules
- Navigation model

### Phase 3: Backend Architecture

Define the backend service, database schema, API contracts, and AI orchestration layer.

Deliverables:

- Backend framework decision
- Database schema
- API endpoint list
- Context-building rules
- AI prompt pipeline
- Persistence strategy

### Phase 4: Frontend GUI Design

Define the web interface, screen layout, column behavior, block controls, and interaction states.

Deliverables:

- Main workspace layout
- Column layout
- Block card design
- Horizontal navigation behavior
- Breadcrumb behavior
- Summary panel design
- Empty, loading, and error states

### Phase 5: Core MVP Implementation

Build the first working text-based version of the branching chat interface.

Deliverables:

- Initial question input
- AI answer generation
- Automatic block segmentation
- Block rendering
- Block-level follow-up
- Horizontal branch columns
- Conversation persistence

### Phase 6: Block Editing And Control

Add manual control over block structure and branch organization.

Deliverables:

- Split block
- Merge blocks
- Rename block
- Reorder blocks
- Include or exclude block from synthesis
- Close and reopen branch columns

### Phase 7: Paper Reading Workflow

Extend the product for academic paper reading and document-grounded analysis.

Deliverables:

- PDF upload
- Text extraction
- Section detection
- Paragraph selection
- Source-aware follow-up questions
- Citation or page reference display

### Phase 8: Synthesis, Export, And Iteration Process

Define how branch results are combined into useful output and how future versions are managed.

Deliverables:

- Branch synthesis
- Reading summary
- Markdown export
- PDF export
- Version roadmap
- Test coverage policy
- Release checklist

## 4. Recommended Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui or Radix UI
- Zustand or Jotai for local UI state
- TanStack Query for server state

### Backend

For the first version, a monolithic architecture is recommended.

Recommended option:

- Next.js API routes
- PostgreSQL
- Prisma
- OpenAI API

Alternative option:

- FastAPI
- PostgreSQL
- SQLAlchemy
- OpenAI API

### Storage

- PostgreSQL for conversations, messages, blocks, branches, summaries, and documents
- Object storage for PDFs and extracted assets
- Vector database only after the paper-reading workflow requires retrieval at scale

## 4.1 Project Folder Structure

Code should be organized by responsibility so future feature requests can be added without turning the project into one large mixed file. The repository should follow a common GitHub-style layout: browser app files, reusable source modules, tests, documentation, and project scripts should live in separate folders.

Recommended structure:

```text
branching-chat-gui/
|-- app/
|   |-- index.html
|   |-- main.js
|   `-- styles.css
|-- docs/
|   `-- architecture.md
|-- src/
|   |-- domain/
|   |   |-- block-editor.js
|   |   |-- context-builder.js
|   |   |-- mock-ai.js
|   |   |-- openai-provider.js
|   |   `-- workspace-store.js
|   |-- types/
|   |   `-- models.js
|   `-- utils/
|       `-- ids.js
|-- tests/
|   |-- block-editor.test.js
|   |-- context-builder.test.js
|   `-- workspace-store.test.js
|-- README.md
|-- package.json
|-- server.js
`-- branching-chat-gui-plan.md
```

Folder responsibilities:

- `app/`: browser-facing GUI files.
- `docs/`: architecture notes and future design documents.
- `src/domain/`: product logic such as block splitting, merging, branch creation, context building, and synthesis selection.
- `src/types/`: shared model definitions or typedefs.
- `src/utils/`: small reusable helpers.
- `tests/`: unit tests and integration-like workflow tests.

Rules:

- UI code should call domain functions instead of implementing product logic directly.
- Context-building logic must stay testable outside the browser.
- Block split, merge, branch creation, and synthesis selection must each have unit tests.
- New features should add or update tests in the same change.
- Local hosting should use a small static server first, while keeping the app portable to Vercel, Netlify, Cloudflare Pages, or a future Next.js backend.

## 4.2 Platform Strategy

The product must work well on both laptop and mobile phone.

Recommended approach:

1. Start with a mobile-first responsive web app.
2. Add Progressive Web App features so the same app can be installed from the browser.
3. Keep domain logic in `src/domain/` so the UI can later move to React, Next.js, Expo, or Capacitor without rewriting the product model.
4. Consider native packaging only after the core workflow is proven.

Decision:

- MVP platform: responsive web app plus PWA foundation.
- Later web hosting: Vercel, Netlify, Cloudflare Pages, or any static host.
- Later native path: Capacitor if the existing web UI should be wrapped for iOS and Android; Expo/React Native if the project needs a truly native UI and app-store-first development.

Reasoning:

- A PWA is still a website, but it can be installable and app-like on supported browsers.
- Capacitor is designed for teams that want to keep web tooling while shipping to iOS, Android, and the web.
- Expo and React Native are strong choices for universal native apps, but they add more setup than this MVP needs.

Mobile UX rules:

- Design mobile first, then expand to tablet and desktop.
- On desktop, branches appear as horizontal columns.
- On mobile, branches appear as a column stack with a top branch switcher, avoiding cramped side-by-side panes.
- The selected branch path must always be visible through breadcrumb text or compact tabs.
- Touch targets should be at least 44px tall.
- Textareas, buttons, and block controls must remain usable on narrow screens.
- Horizontal scrolling is acceptable for branch navigation, but reading should happen in one comfortable column on phones.
- PWA files such as a web app manifest and service worker should be included early, even if offline behavior starts simple.

## 4.3 ChatGPT And OpenAI Integration Strategy

The product should feel like a normal chatbot first. Branching is an additional interaction layer, not the content of the default answer.

The initial screen should not contain a project-specific prompt as a default user message. It should start empty with a general message composer.

There are two possible OpenAI integration modes:

1. Standalone app with OpenAI API.
2. ChatGPT app with Apps SDK and MCP.

Decision for MVP:

- Use the standalone app path.
- Keep the UI independent.
- Call OpenAI through a backend proxy.
- Use the Responses API for new model interactions.
- Store branch context in this app's own data model.
- Keep ChatGPT Apps SDK as a later distribution path if the UI should run inside ChatGPT itself.
- Do not put the UI inside ChatGPT for the MVP. Keeping it outside is simpler because it avoids Apps SDK setup, MCP server requirements, ChatGPT app packaging, and extra distribution constraints.

UI direction:

- The first screen should look and behave like a normal chatbot.
- The user should see a familiar message composer first.
- Branching controls should appear after an assistant answer is created.
- The branching interface is an extension of chat, not a landing page explaining the product.

Rules:

- Never put an OpenAI API key in browser JavaScript.
- Browser UI sends the selected branch context to the backend.
- Backend calls OpenAI and returns assistant text.
- Assistant text is segmented into blocks by the app.
- Each branch should still use focused context by default.
- The OpenAI provider should be swappable with mock, local, or alternative providers for testing.
- Local configuration should use `.env` copied from `.env.example`.
- If `OPENAI_API_KEY` is missing, the app should show mock mode instead of failing.
- The first screen should display provider status, such as `Mock mode` or `OpenAI gpt-5.4-mini`.
- The app should provide a Settings modal for local/BYOK setup, matching the common pattern used by many AI web apps.
- Settings can update the local server runtime without exposing the key to client-side OpenAI calls.
- The Settings modal may optionally persist local settings into `.env`.

Local environment:

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
```

Recommended backend endpoint:

```text
POST /api/assistant/respond
```

Request:

```json
{
  "conversationId": "conversation-id",
  "branchId": "branch-id-or-null",
  "context": [
    { "role": "user", "content": "Original question" },
    { "role": "assistant", "content": "Selected source block" },
    { "role": "user", "content": "Follow-up question" }
  ]
}
```

## 4.4 Finder-Style Column UI

The detailed column interaction spec is saved in:

```text
docs/llm_finder_column_chat_ui_spec.md
```

A static concept demo can be reached through the local app route:

```text
/demo
```

The first screen should look and behave like a compact normal chatbot. After the first assistant response or demo start, the UI shifts into a horizontal column workspace:

```text
┌────────────────────┬────────────────────┬────────────────────┐
│ Root answer column │ Branch column      │ Deeper branch      │
│ - original prompt  │ - focused answer   │ - focused answer   │
│ - answer blocks    │ - answer blocks    │ - answer blocks    │
│ - hover composer   │ - hover composer   │ - hover composer   │
└────────────────────┴────────────────────┴────────────────────┘
```

Rules:

- The landing page remains a familiar chatbot input, not a product explanation page.
- Once a conversation starts, every visible pane is a branch column. There is no separate permanent transcript panel.
- The workspace is horizontally scrollable on desktop and laptop.
- Each assistant answer is segmented into selectable blocks.
- Segmentation should be requested from the model as semantic/contextual blocks. It must not depend on visible `Step 1`, `Step 2`, or other explicit headings.
- Asking about a block opens or appends a column to the right.
- More columns may be added as the user goes deeper.
- On mobile, show one active column at a time with branch navigation.
- The app should include a demo mode that creates varied branch depths, roughly depth 2 to 5, without calling the model so the intended interaction can be reviewed quickly.
- Each column owns its own vertical scroll.
- Each column has a floating bottom composer for continuing the conversation from that column.
- The composer should appear only when the pointer enters the lower hover zone of that column. Hovering the whole column must not immediately cover the text.
- When the composer is hidden, it should not reserve vertical layout space; the answer text remains readable behind that bottom area.
- Blocks with child branches should show a compact indicator with both direct branch count and deepest reachable branch depth, such as `2 / D4`. This indicator applies to blocks at every depth, not only root blocks.
- Branches created from selected text ranges should also leave an inline highlight and a small branch chip on the exact source text, so the user can see the branch origin while scrolling.
- Block action buttons should be hidden in the normal reading state.
- Selecting multiple blocks should reveal a merge menu.
- Merging blocks must merge their graph ownership, not only their text. Direct child branches, selected-text source blocks, and branch answer blocks that were attached to any merged block must be reparented to the resulting merged block.
- Selecting text inside one block should reveal a split menu.
- Selecting text inside one block should also support opening a focused branch from only that selected text range, not just from the whole semantic block.
- Markdown rendering is required for assistant responses, including fenced code blocks, inline code, inline math, and display math notation.

Split behavior:

- Selecting from the beginning to a middle point splits one block into two blocks: selected beginning and remaining end.
- Selecting from a middle point to the end splits one block into two blocks: beginning and selected end.
- Selecting from the middle to another middle point splits one block into three blocks: beginning, selected middle, and remaining end.

Response:

```json
{
  "message": {
    "role": "assistant",
    "content": "Assistant response"
  },
  "blocks": []
}
```

## 5. Data Model

### Core Entities

```text
User
Conversation
Message
MessageBlock
Branch
Summary
Document
DocumentChunk
```

### MessageBlock

```ts
type MessageBlock = {
  id: string;
  messageId: string;
  index: number;
  title: string;
  content: string;
  blockType:
    | "claim"
    | "definition"
    | "method"
    | "evidence"
    | "result"
    | "question"
    | "other";
  parentBlockId?: string;
  includeInSummary: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### Branch

```ts
type Branch = {
  id: string;
  conversationId: string;
  sourceBlockId: string;
  parentBranchId?: string;
  title: string;
  depth: number;
  columnOrder: number;
  isOpen: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### Message

```ts
type Message = {
  id: string;
  conversationId: string;
  branchId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};
```

## 6. Context-Building Rules

Context control is the most important part of the product.

When a user asks a follow-up question on a specific block, the default context should include:

1. Original user question.
2. Selected source block.
3. Messages already created in the current branch.
4. Current user question.

Default context should exclude:

- Sibling answer blocks
- Unrelated branch messages
- Closed branches
- Full document text unless explicitly requested

When a user creates a branch from a selected text range, the selected text becomes a synthetic source block linked back to its parent block. The branch prompt should treat that selected range as the primary source context and include the parent block only as optional surrounding context when needed.

Optional context modes:

- Selected block only
- Selected text range only
- Selected block plus nearby blocks
- Entire parent answer
- Entire current branch
- Entire document

## 7. AI Pipeline

The AI layer should be split into separate tasks.

### Main Answer Generator

Generates the first answer to the user's initial question.

### Block Segmenter

Splits an assistant answer into meaningful blocks.

Expected structured output:

```json
{
  "blocks": [
    {
      "title": "Core claim",
      "type": "claim",
      "content": "..."
    }
  ]
}
```

### Branch Answer Generator

Answers follow-up questions for a selected block using focused context.

### Synthesis Generator

Combines selected branch results into a final summary, research note, or reading note.

## 8. GUI Design

### Main Layout

```text
┌───────────────┬────────────────────┬────────────────────┬────────────────────┐
│ Source Panel  │ Column 1           │ Column 2           │ Column 3           │
│               │ Main Answer        │ Branch From Block  │ Deeper Branch      │
└───────────────┴────────────────────┴────────────────────┴────────────────────┘
```

### Source Panel

The source panel contains:

- Original question
- Uploaded document
- Paper outline
- Selected text
- Conversation list
- Global synthesis button

### Column

Each column contains:

- Branch title
- Parent context preview
- User question
- AI answer blocks
- Branch-level actions

### Block Controls

Each answer block should support:

- Ask deeper
- Split
- Merge
- Rename
- Reorder
- Pin
- Include in summary
- Exclude from summary
- View source

### Navigation

The interface should support:

- Horizontal scroll
- Active branch highlighting
- Breadcrumb path
- Collapsible columns
- Branch map in later versions

Example breadcrumb:

```text
Paper Summary > Method Block > Loss Function > Temperature Parameter
```

## 9. Required Features

### MVP Features

- Create a new conversation
- Submit initial question
- Generate AI answer
- Automatically split answer into blocks
- Render answer blocks
- Ask follow-up question on a block
- Open follow-up as a new right-side column
- Build focused context for branch answer
- Save conversations
- Generate synthesis from selected branches

### Version 0.2 Features

- Manual block split
- Manual block merge
- Rename block
- Reorder blocks
- Include or exclude blocks from synthesis
- Close and reopen branch columns

### Version 0.3 Features

- PDF upload
- Paper text extraction
- Section detection
- Select paragraph and ask question
- Display page or section references

### Version 0.4 Features

- Branch map view
- Cross-link related branches
- Compare branches
- Add tags
- Add bookmarks
- Mark importance

### Version 0.5 Features

- Final research note generation
- Markdown export
- PDF export
- Citation metadata
- Team sharing

## 10. API Design

Initial API endpoints:

```text
POST /api/conversations
GET  /api/conversations/:id
POST /api/conversations/:id/messages
POST /api/messages/:id/segment
POST /api/blocks/:id/branches
POST /api/branches/:id/messages
PATCH /api/blocks/:id
POST /api/blocks/:id/split
POST /api/blocks/merge
POST /api/conversations/:id/synthesize
```

Paper workflow endpoints:

```text
POST /api/documents/upload
GET  /api/documents/:id
POST /api/documents/:id/extract
POST /api/document-chunks/:id/branches
```

## 11. Unit Test Plan

### Backend Unit Tests

- Answer segmentation returns valid schema.
- Empty answer is handled safely.
- Very short answer creates an appropriate number of blocks.
- Long answer is split into stable block boundaries.
- Block split creates two valid blocks.
- Block merge combines selected blocks in correct order.
- Block rename updates only the target block.
- Branch creation stores the correct `sourceBlockId`.
- Branch depth is calculated correctly.
- Context builder includes the original question.
- Context builder includes the selected block.
- Context builder excludes sibling blocks by default.
- Context builder excludes unrelated branches.
- Synthesis includes only selected branches or blocks.
- Synthesis handles empty branch selection safely.

### Frontend Unit Tests

- Initial conversation screen renders.
- Answer blocks render in order.
- Block action buttons render correctly.
- Ask deeper creates a new column.
- Active branch is highlighted.
- Breadcrumb updates after branch creation.
- Split block modal opens and applies changes.
- Merge block action combines selected blocks.
- Include in summary toggle updates state.
- Horizontal scroll position is preserved.
- Loading states render during AI calls.
- Error states render after failed API calls.

### Integration Tests

- Initial question creates answer and blocks.
- Block follow-up creates a branch.
- Branch answer appears in a new right-side column.
- Branch prompt excludes sibling blocks by default.
- Multiple branches can be synthesized.
- Saved conversation can be reloaded.
- Block edits persist across reload.

### E2E Tests

- User creates conversation from text question.
- User follows up on the first answer block.
- User creates a deeper branch from the follow-up answer.
- User edits block boundaries.
- User generates a final synthesis.
- User reloads the page and sees the same branch structure.
- User uploads a paper PDF in later versions.
- User asks questions from abstract, method, and result sections.
- User generates a paper reading summary.

## 12. Iterative Development Process

Each version should follow the same loop:

1. Define the user workflow.
2. Write or update the API contract.
3. Update the data model if needed.
4. Build backend behavior.
5. Build frontend interaction.
6. Add unit tests.
7. Add integration tests for the main workflow.
8. Run manual GUI verification.
9. Update this planning document.
10. Tag or record the version.

## 13. Release Checklist

Before each version is considered complete:

- All backend unit tests pass.
- All frontend unit tests pass.
- Main integration flow passes.
- Core E2E flow passes.
- No unrelated changes are included.
- Context builder behavior is verified.
- UI handles loading and error states.
- Long conversations remain usable.
- Existing saved conversations still load.
- Planning document is updated.

## 14. MVP Recommendation

The first implementation should focus on a text-based branching chat, not PDF reading.

Recommended MVP scope:

- Text input
- AI answer
- Automatic block segmentation
- Horizontal branch columns
- Focused branch context
- Basic synthesis

PDF upload, citation tracking, and document-grounded retrieval should come after the core branching interaction feels reliable.

The highest-risk part of the system is not the AI answer itself. The highest-risk part is context management: the product must make it clear which block a branch came from, which context was used, and which branches are being synthesized.

## 15. Current Prototype State And Continuation Notes

This section records the current design decisions as of 2026-05-08 so the project can be resumed safely after context loss.

### 15.1 Product Intent

The product is a normal chatbot that can expand horizontally.

The user starts with a familiar chat input. After an answer is generated, the answer is divided into semantic blocks. When the user asks a follow-up about one block, the app opens a new column to the right. That new column should use focused context:

1. The original user question.
2. The selected source block or selected source text.
3. The branch-local conversation history.

Sibling blocks are excluded by default. This is the core value of the product: deeper exploration without dragging unrelated answer sections into the next prompt.

The first target workflow is research and paper-reading style exploration, but the MVP is text chat. PDF upload, citation tracking, and retrieval should come later.

### 15.2 Current Folder Structure

The code should stay organized in a GitHub-friendly structure:

```text
branching-chat-gui/
|-- app/
|   |-- index.html       # Browser shell
|   |-- main.js          # UI rendering and event handling
|   |-- styles.css       # Responsive visual system
|   `-- sw.js            # Local PWA cache
|-- docs/
|   |-- architecture.md
|   `-- llm_finder_column_chat_ui_spec.md
|-- src/
|   `-- domain/
|       |-- api-client.js
|       |-- block-editor.js
|       |-- context-builder.js
|       |-- mock-ai.js
|       |-- openai-provider.js
|       `-- workspace-store.js
|-- tests/
|   |-- api-client.test.js
|   |-- block-editor.test.js
|   |-- context-builder.test.js
|   |-- mock-ai.test.js
|   |-- openai-provider.test.js
|   `-- workspace-store.test.js
|-- README.md
|-- branching-chat-gui-plan.md
`-- server.js
```

Rules:

- `app/` owns browser UI only.
- `src/domain/` owns reusable product logic and should remain testable without the browser.
- `tests/` should cover domain behavior first. UI tests can be added when the interaction stabilizes.
- Do not place API secrets in `app/` or any browser-shipped file.

### 15.3 Current Runtime

Local URL:

```text
http://localhost:4173/
```

Run:

```bash
node server.js
```

When `npm` is available:

```bash
npm start
```

Test:

```bash
node --test tests/*.test.js
```

Current known test state after the latest implementation work:

```text
25 passing
0 failing
```

If the local shell does not find `node`, use the Codex bundled Node runtime.

### 15.4 ChatGPT / OpenAI Integration Decision

The MVP should be a standalone web app using the OpenAI Responses API through the local backend.

Reason:

- It is simpler than building a ChatGPT Apps SDK/MCP app.
- It gives full control over the custom horizontal UI.
- It is easier to host later on Vercel, Netlify, Cloudflare, or a custom server.
- It keeps the option open to build a ChatGPT app later.

Rules:

- The browser never calls OpenAI directly.
- The browser calls `/api/assistant/respond`.
- The server reads `OPENAI_API_KEY` from `.env` or runtime settings.
- The Settings UI may collect a key for local development, but the app must treat it as a server-side setting.
- `.env` must stay gitignored.
- Do not print or document real API keys.

Runtime endpoints:

```text
GET  /api/config
POST /api/settings
POST /api/assistant/respond
```

### 15.5 Current Workspace UI Rules

Initial screen:

- Looks like a compact general chatbot.
- Does not show the project prompt as default output.
- Has provider status and Settings access.
- Has a demo/synthesis entry point for showing the branching concept without model calls.

Conversation workspace:

- Uses horizontally scrollable columns on desktop.
- Each column is visually separated with spacing, border, and subtle depth accent color.
- Each column has its own independent vertical scroll.
- Clicking a block must not reset that column's scroll position.
- Clicking a block opens the appropriate child branch column on the right.
- If a block at depth 1 opens a branch, the depth 0/root UI should also refresh so branch indicators remain accurate.
- The active path should feel connected through color, not through arrows. Arrow connectors were removed because they became visually noisy and unreliable while scrolling.
- The highlighted source block color and the next-depth column accent color should match.
- Opening a right-side branch should only move the horizontal workspace scroll. It must not reset any column's vertical scroll position.
- A selected source block should use the color of the branch/column it opens, not just the color of its own parent column.

Column composer:

- The composer is floating inside each column near the bottom.
- It appears when the pointer enters the lower hover zone of that column.
- It should not appear just because the pointer is anywhere inside the column.
- It should not reserve layout space while hidden.
- Hidden composer state must allow the text behind it to remain visible/readable.
- Tool buttons should be compact and visually consistent with header buttons.

Mobile:

- Use one readable active column at a time.
- Preserve the same branch graph model.
- Provide compact branch/depth navigation rather than forcing multiple cramped columns.

### 15.6 Semantic Block Rules

Assistant output should be split into semantic blocks. The model should be asked to return block boundaries by meaning/context, not by visible numbering.

Correct:

- Introductory concept block.
- Architecture block.
- Attention mechanism block.
- Code/math example block.
- Summary block.

Incorrect:

- Assuming all answers are `Step 1`, `Step 2`, `Step 3`.
- Forcing every paragraph into a separate block if it destroys reading flow.
- Showing internal labels like `claim` in the normal UI.

Blocks should look like natural reading sections. They may have subtle hover/selected styling, but normal action buttons should stay hidden until selection/context actions require them.

### 15.7 Branch Indicator Rules

Every branchable source can show branch metadata:

- Semantic answer block.
- Selected text range inside a block.
- Blocks inside depth 1, depth 2, and deeper columns.

The indicator should show both:

- Direct child branch count from that exact source.
- Deepest reachable descendant depth from that source.

Example:

```text
↳ 3   D4
```

Meaning:

- `↳ 3`: this exact block or selected text has 3 immediate child branches.
- `D4`: the deepest path below this source reaches depth 4.

Important distinction:

- Direct branch count is not total descendant count.
- Maximum depth is not the same as direct branch count.

If a block has one direct branch and that child has a grandchild, the indicator should be `↳ 1 D2`, not `↳ 2`.

### 15.8 Selected Text Branch Rules

Users must be able to select text inside a block and create a branch from only that selected text.

Flow:

1. User drags across text inside one block.
2. A floating `Branch from selection` menu appears near the selection.
3. Clicking it creates a synthetic selected-text source block.
4. The new branch opens at the next depth relative to the selected text's owning block.
5. The original block receives an inline highlight at the selected range.
6. The inline highlight shows a small branch chip with direct count and max depth.
7. Clicking the chip reopens that selected-text branch.

Depth rule:

- Selecting text in a root/depth 0 block creates a depth 1 branch.
- Selecting text in a depth 1 answer block creates a depth 2 branch.
- Selecting text in a depth 2 answer block creates a depth 3 branch.
- Active branch state must not leak into root selections. A root text selection must not accidentally create depth 2.

Implementation note:

- The UI should use the selected block's graph ownership to determine `parentBranchId`, not only the currently active branch.
- Root blocks should pass no parent branch id when creating selected-text branches.

### 15.9 Split Rules

Selecting text inside a block can also split the block.

Cases:

- Beginning to middle: two blocks, selected beginning and remaining end.
- Middle to end: two blocks, beginning and selected end.
- Middle to middle: three blocks, beginning, selected middle, remaining end.

Split is a block-editing operation. Branch-from-selection is a graph operation. They should share selection detection but remain separate domain concepts.

### 15.10 Merge Rules

When two or more blocks are merged, their text is not the only thing that merges. Their graph ownership must merge too.

Required behavior:

- The merged block keeps the combined content in reading order.
- Direct child branches attached to any merged block are reparented to the new merged block.
- Selected-text source blocks under any merged block are reparented to the new merged block.
- Selected-text source ranges must be remapped into the merged block's new content offsets.
- Branch answer blocks whose parent source was one of the merged blocks must point to the new merged block.
- Branch indicators must refresh after merge.

Reason:

If block A and block B are merged but their existing child conversations disappear or stay attached to deleted block ids, the workspace becomes impossible to trust.

### 15.11 Demo Data Rules

The current demo uses the question:

```text
Transformer 가 뭔지 대학생에게 알려주듯이 알려줘
```

The answer should be natural Korean explanatory prose, not artificially rigid cards.

Demo should include:

- Depth 2 to 5 branch paths.
- Branches from whole semantic blocks.
- Branches from selected text ranges.
- Inline selected-text branch chips.
- Code examples.
- Inline code.
- Inline math.
- Display math.
- Enough mock data that clicking blocks, branch chips, and selection menus visibly changes the workspace.

Example rendering content:

````text
$$Attention(Q, K, V) = softmax((QK^T) / sqrt(d_k))V$$

`causal mask`

```js
const nextToken = sample(probabilities);
```
````

The demo does not need every generated answer to be semantically perfect. It must be coherent enough to validate interaction behavior.

### 15.12 Markdown, Code, And Math Rendering

Assistant responses should support Markdown-shaped content:

- Paragraphs.
- Bold text where needed.
- Inline code.
- Fenced code blocks.
- Inline math notation with `$...$`.
- Display math notation with `$$...$$`.

Current implementation uses a lightweight renderer, not a full Markdown/LaTeX engine. Before production, consider replacing or hardening this with a well-maintained Markdown parser plus math rendering.

### 15.13 Design Direction

The UI should feel like a compact professional work tool, not a landing page.

Design rules:

- Keep buttons compact.
- Use consistent pill/button styling across Settings, Synthesis, provider status, and composer tools.
- Avoid oversized marketing hero sections.
- Use restrained typography.
- Use smaller font sizes in the workspace so dense research content is readable.
- Use color to communicate branch relationships.
- Avoid decorative arrows between columns.
- Do not move the clicked block unexpectedly.
- Preserve reading position whenever possible.

The product should feel closer to a research workspace, code editor side panel, or file explorer than a consumer landing page.

### 15.14 Current Domain Invariants

The workspace graph should be treated as the source of truth.

Important entities:

- Workspace/conversation.
- Column.
- Answer block.
- Branch.
- Selected-text source block.
- Active branch path.

Important invariants:

- A branch has exactly one source: either a semantic block or a selected-text source.
- A selected-text source belongs to a parent block and stores its selected range.
- Opening a child branch activates all ancestors so columns refresh together.
- Sibling branch context is excluded from focused prompts.
- Merge and split should preserve or explicitly update graph links.
- UI rendering should be derived from store state, not from hidden DOM assumptions.

### 15.15 Current Unit Test Expectations

Domain tests should cover:

- Block splitting.
- Block merging.
- Merge graph reparenting.
- Context building with sibling exclusion.
- Root text-selection branch depth.
- Nested text-selection branch depth.
- Branch path activation.
- Mock AI demo data shape.
- OpenAI request shaping.

Every bug fix should add a test when the bug lives in domain logic. If the bug is purely visual CSS hover behavior, manual browser verification may be enough.

### 15.16 Iteration Process From Here

For each new request:

1. Update the design document when the request changes product behavior.
2. Implement the smallest coherent code change.
3. Add or update domain tests when state/graph behavior changes.
4. Run `node --test tests/*.test.js`.
5. Manually verify the affected browser flow.
6. If `app/` assets changed and the service worker may cache stale files, bump the cache version in `app/sw.js`.
7. Keep README and architecture notes in sync when user-facing behavior changes.

### 15.17 Known Next Steps

Near-term:

- Make visual polish more consistent across all controls.
- Add stronger keyboard accessibility for block navigation and context menus.
- Add UI-level tests for scroll preservation and hover composer behavior.
- Replace lightweight Markdown/math rendering with hardened libraries before public deployment.
- Add persistence beyond local in-memory/demo state.
- Build real synthesis flow across selected branches.

Later:

- Document upload and chunking.
- Citation-aware branch context.
- Search across branches.
- Compare two branches.
- Export synthesis to Markdown/PDF.
- Optional ChatGPT Apps SDK/MCP version after standalone MVP is stable.

### 15.18 Sidebar Navigation Direction

The app should now be treated as a ChatGPT-like shell with branching chat as the core workspace.

Sidebar purpose:

- Let the user move between chat, paper reading, notes, and synthesis areas.
- Preserve the current branch workspace when the user temporarily visits another menu.
- Make the product feel like an academic/research assistant rather than a one-off demo page.

Current sidebar sections:

- `Chat`: the main branching conversation workspace.
- `Papers`: placeholder for paper queue, PDF upload, and paper-specific reading sessions.
- `Notes`: placeholder for branch-derived research notes and open questions.
- `Synthesis`: summary/synthesis area for collecting explored branches.
- `Settings`: provider and local OpenAI configuration.

Design rules:

- Keep the sidebar compact, similar to a productivity/chat app shell.
- The current branch graph remains in memory while navigating menus.
- `New chat` resets only the active chat workspace, not provider settings.
- The sidebar may collapse on desktop.
- On mobile, sidebar navigation should become compact and horizontally usable instead of consuming a fixed left column.

This does not change the core model: the chat workspace is still a horizontally branching column UI. The sidebar is navigation chrome around that model.
