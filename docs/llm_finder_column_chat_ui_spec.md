# LLM Finder Column Chat UI Specification

> Current note, 2026-05-08: this file began as the broad UI concept spec. The latest implementation decisions are recorded in section 26 below and in `branching-chat-gui-plan.md` section 15. When older MVP notes conflict with section 26, section 26 is the source of truth.

## 1. Product Concept

### Working Names

- ColumnChat
- BranchFlow
- MillerChat
- LLM Finder View

### Core Idea

Instead of showing an LLM conversation as one long vertical chat thread, the app treats each meaningful part of an LLM response as a selectable block.

When the user asks a follow-up question about a specific block, the answer does not appear below the current chat. Instead, it opens in a new column to the right, similar to macOS Finder's column view.

```text
Column 1              Column 2              Column 3
Root answer      ->   Item 1 detail    ->   Sub-detail
Item 1                Follow-up Q/A          More follow-up
Item 2
Item 3
Item 4
...
```

This lets the user explore one idea deeply while keeping sibling ideas visible in the left column.

---

## 2. Problem Statement

Most LLM chat interfaces are linear and scroll-based.

Example:

```text
User: Explain this topic.

LLM:
1. A
2. B
3. C
4. D
5. E

User: Explain item 1 more deeply.

LLM:
Long explanation of A...
```

After the follow-up, items 2 through 5 are pushed out of view. The user loses spatial context and must scroll back up to compare or continue exploring other items.

The goal of this UI is to support non-linear exploration.

Desired behavior:

```text
Column 1                    Column 2
Original answer        ->   Detail about item 1
1. A selected               A-1
2. B                        A-2
3. C                        A-3
4. D
5. E
```

The user can keep the original answer visible while expanding only the selected part to the right.

---

## 3. Mental Model

The app represents a conversation as a tree, not as a flat transcript.

### Core Concepts

#### Conversation

A full workspace or chat session.

#### Node

A single conversational unit. Usually one user prompt and one assistant response.

#### Block

A selectable semantic unit inside an assistant response.

Examples:

- A bullet item
- A numbered item
- A paragraph
- A heading section
- A sentence
- A code block
- A table row
- A list item inside a nested list

#### Branch

A follow-up conversation created from a selected block.

#### Path

The currently visible sequence of selected branches from left to right.

Example:

```text
Root answer -> Item 1 -> Item 1.2 -> Code example
```

---

## 4. UI Layout

## 4.1 Main Layout

The app uses a horizontally scrollable set of columns.

```text
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Column 0     │ Column 1     │ Column 2     │ Column 3     │
│ Root Chat    │ Branch A     │ Branch A-1   │ Branch A-1-a │
│              │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

Each column represents one node in the current branch path.

### Recommended Column Width

```ts
const COLUMN_WIDTH = 420;
const COLUMN_MIN_WIDTH = 320;
const COLUMN_MAX_WIDTH = 560;
```

Column width can be fixed at first. Resizable columns can be added later.

---

## 4.2 Column Structure

Each column has three main regions:

```text
┌────────────────────────────┐
│ Header                     │
├────────────────────────────┤
│ Body                       │
│ - User prompt              │
│ - Assistant response       │
│ - Selectable blocks        │
├────────────────────────────┤
│ Composer                   │
└────────────────────────────┘
```

---

## 4.3 Column Header

The header shows where this column came from.

Example:

```text
Item 1: Early fusion
Source: From root answer
Actions: Collapse | Pin | Export
```

Suggested fields:

```ts
type ColumnHeader = {
  title: string;
  sourceBlockPreview?: string;
  depth: number;
  actions: ColumnAction[];
};
```

Actions:

- Collapse column
- Pin column
- Rename branch
- Export branch
- Copy branch path
- Open as standalone chat

---

## 4.4 Column Body

The body displays the current node's prompt, answer, and parsed blocks.

Example:

```text
User asked:
Explain different multimodal fusion strategies.

Assistant answered:
1. Early fusion
2. Late fusion
3. Cross-attention
4. Mixture of experts
```

Each block should be selectable.

Selectable block behavior:

- Hover highlights the block.
- Click selects the block.
- Double-click or action button opens follow-up composer.
- Existing child branches are shown as small indicators.

---

## 4.5 Composer

Each column has a composer at the bottom.

There are two composer modes.

### General Follow-up Mode

The user asks a follow-up about the whole current column.

```text
Ask about this answer...
```

### Block Follow-up Mode

The user selects a block and asks a follow-up about that block.

```text
Ask about selected block: "1. Early fusion"
```

Submitting a block follow-up creates a new child node and opens it in the next column to the right.

---

# 5. Interaction Model

## 5.1 Basic Flow

1. User enters an initial prompt.
2. LLM returns an answer.
3. App parses the answer into blocks.
4. Blocks are displayed in Column 0.
5. User selects a block.
6. User asks a follow-up.
7. App creates a child node.
8. Child node opens in Column 1.
9. User can continue expanding to the right.

---

## 5.2 Block Selection

Each assistant response should be parsed into a block tree.

Example assistant response:

```markdown
## Fusion Strategies

1. Early fusion combines image and text tokens early.
2. Late fusion processes modalities separately.
3. Cross-attention lets text query visual features.
```

Parsed blocks:

```json
[
  {
    "id": "block_1",
    "type": "heading",
    "text": "Fusion Strategies"
  },
  {
    "id": "block_2",
    "type": "numbered_item",
    "text": "Early fusion combines image and text tokens early."
  },
  {
    "id": "block_3",
    "type": "numbered_item",
    "text": "Late fusion processes modalities separately."
  },
  {
    "id": "block_4",
    "type": "numbered_item",
    "text": "Cross-attention lets text query visual features."
  }
]
```

---

## 5.3 Branch Creation

When the user asks a question about a block, create a new node.

Example:

```ts
type BranchCreateInput = {
  parentNodeId: string;
  sourceBlockId: string;
  userPrompt: string;
};
```

The new node stores:

```ts
type ConversationNode = {
  id: string;
  parentId: string | null;
  sourceBlockId?: string;
  title: string;
  userPrompt: string;
  assistantResponse: string;
  blocks: ResponseBlock[];
  children: string[];
  createdAt: string;
  updatedAt: string;
};
```

---

## 5.4 Navigation Behavior

When a user opens a child branch:

- Columns to the left stay visible.
- The selected block in the parent column is highlighted.
- Any columns to the right that are not part of the new path are replaced.

Example:

Current path:

```text
Root -> A -> A1
```

User goes back to Root and selects B.

New path:

```text
Root -> B
```

The previous `A -> A1` branch still exists in the data model, but it is not in the active path.

---

## 5.5 Multiple Branches from One Block

A single block can have multiple child branches.

Example:

```text
Block: Early fusion
- Branch 1: Explain intuitively
- Branch 2: Compare with cross-attention
- Branch 3: Give PyTorch implementation
```

UI options:

- Show a small branch count badge on the block.
- Clicking the badge opens a branch picker.
- The user can choose an existing branch or create a new one.

---

# 6. Data Model

## 6.1 Conversation

```ts
type Conversation = {
  id: string;
  title: string;
  rootNodeId: string;
  nodes: Record<string, ConversationNode>;
  activePath: string[];
  createdAt: string;
  updatedAt: string;
};
```

---

## 6.2 Conversation Node

```ts
type ConversationNode = {
  id: string;
  parentId: string | null;
  sourceBlockId?: string;
  title: string;
  userPrompt: string;
  assistantResponse: string;
  blocks: ResponseBlock[];
  children: string[];
  metadata: NodeMetadata;
  createdAt: string;
  updatedAt: string;
};
```

---

## 6.3 Response Block

```ts
type ResponseBlock = {
  id: string;
  nodeId: string;
  type: BlockType;
  text: string;
  markdown?: string;
  startOffset?: number;
  endOffset?: number;
  parentBlockId?: string;
  children?: string[];
  branchIds: string[];
};
```

---

## 6.4 Block Type

```ts
type BlockType =
  | "heading"
  | "paragraph"
  | "sentence"
  | "bullet_item"
  | "numbered_item"
  | "code_block"
  | "table"
  | "table_row"
  | "quote"
  | "image"
  | "unknown";
```

---

## 6.5 Node Metadata

```ts
type NodeMetadata = {
  model?: string;
  temperature?: number;
  tokenCount?: number;
  sourceSummary?: string;
  tags?: string[];
};
```

---

# 7. Branch Prompt Construction

When creating a follow-up branch, the LLM should receive enough context to answer the selected block specifically.

## 7.1 Prompt Template

```text
You are continuing a branched conversation.

Original user prompt:
{root_or_parent_prompt}

Assistant response context:
{parent_response_summary_or_relevant_excerpt}

The user selected this specific block:
{selected_block_text}

User follow-up question:
{follow_up_question}

Answer the follow-up question with focus on the selected block. Do not repeat unrelated sibling sections unless needed for comparison.
```

---

## 7.2 Context Strategy

For MVP, pass:

- Parent user prompt
- Parent assistant answer
- Selected block text
- User follow-up question

Later optimization:

- Summarize parent answer if too long
- Include sibling block titles only
- Include full ancestor path
- Use embeddings to retrieve relevant previous nodes

---

# 8. Rendering Rules

## 8.1 Markdown Rendering

Assistant responses should support:

- Headings
- Paragraphs
- Bullet lists
- Numbered lists
- Code blocks
- Tables
- Blockquotes
- Inline code

Recommended libraries:

- `react-markdown`
- `remark-gfm`
- `rehype-highlight` or Shiki

---

## 8.2 Block Wrapping

Each parsed block should be rendered as an interactive wrapper.

Example React structure:

```tsx
<BlockWrapper
  block={block}
  selected={selectedBlockId === block.id}
  onClick={() => selectBlock(block.id)}
  onAskFollowUp={() => openFollowUp(block.id)}
/>
```

---

## 8.3 Visual States

Each block should have states:

```ts
type BlockVisualState =
  | "default"
  | "hovered"
  | "selected"
  | "has_branch"
  | "active_path"
  | "loading";
```

Visual behavior:

- Default: normal text
- Hovered: subtle background
- Selected: stronger background and left border
- Has branch: branch badge
- Active path: persistent highlight
- Loading: skeleton or spinner

---

# 9. Minimum Viable Product

## 9.1 MVP Features

The first version should support:

1. Initial prompt
2. LLM response rendering
3. Basic response block parsing
4. Selectable numbered and bullet list items
5. Follow-up question on selected block
6. Right-side column creation
7. Active path navigation
8. Local persistence in browser storage

---

## 9.2 MVP Non-Goals

Do not build these in the first version:

- Real-time collaboration
- Complex graph visualization
- Full semantic parser
- Multi-model comparison
- Branch merging
- Advanced search
- Mobile optimization
- Plugin system

---

# 10. Recommended Tech Stack

## 10.1 Frontend

Recommended:

- React
- TypeScript
- Vite or Next.js
- Tailwind CSS
- Zustand or Redux Toolkit
- react-markdown
- remark-gfm

Optional:

- Framer Motion for column transitions
- Shiki for code highlighting
- Dexie for IndexedDB persistence

---

## 10.2 Backend

For MVP, backend can be minimal.

Options:

### Option A: Fully frontend with local API key during prototype

Good for quick local experiments, but not safe for production.

### Option B: Next.js API route

Recommended for small app.

```text
Frontend -> /api/chat -> LLM provider
```

### Option C: FastAPI backend

Good if you want heavier backend logic later.

```text
React frontend -> FastAPI backend -> LLM provider
```

---

# 11. State Management

## 11.1 App State

```ts
type AppState = {
  conversation: Conversation | null;
  selectedBlockByNodeId: Record<string, string | null>;
  activePath: string[];
  isGeneratingByNodeId: Record<string, boolean>;
};
```

---

## 11.2 Core Actions

```ts
type AppActions = {
  createRootNode: (prompt: string) => Promise<void>;
  selectBlock: (nodeId: string, blockId: string) => void;
  createBranch: (
    parentNodeId: string,
    sourceBlockId: string,
    prompt: string
  ) => Promise<void>;
  openExistingBranch: (nodeId: string) => void;
  setActivePath: (path: string[]) => void;
  renameNode: (nodeId: string, title: string) => void;
  deleteBranch: (nodeId: string) => void;
};
```

---

# 12. Block Parsing Strategy

## 12.1 MVP Parser

For MVP, parse only top-level markdown structures.

Priority:

1. Headings
2. Numbered list items
3. Bullet list items
4. Code blocks
5. Paragraphs

Simple parsing approach:

```ts
function parseMarkdownBlocks(markdown: string): ResponseBlock[] {
  // 1. Split by lines
  // 2. Detect fenced code blocks
  // 3. Detect headings
  // 4. Detect numbered list items
  // 5. Detect bullet list items
  // 6. Group remaining lines into paragraphs
}
```

---

## 12.2 Better Parser Later

Later, use a real markdown AST parser:

- `unified`
- `remark-parse`
- `mdast`

This allows exact source positions and nested block relationships.

---

# 13. Persistence

## 13.1 Local Storage MVP

Save conversation state to local storage.

```ts
localStorage.setItem("columnchat:conversation", JSON.stringify(conversation));
```

Load on app start.

```ts
const saved = localStorage.getItem("columnchat:conversation");
```

---

## 13.2 IndexedDB Later

Use IndexedDB when conversations become large.

Recommended library:

- Dexie

Possible schema:

```ts
table conversations
  id
  title
  rootNodeId
  createdAt
  updatedAt

table nodes
  id
  conversationId
  parentId
  sourceBlockId
  title
  userPrompt
  assistantResponse
  createdAt
  updatedAt

table blocks
  id
  nodeId
  type
  text
  markdown
  startOffset
  endOffset
```

---

# 14. Keyboard Shortcuts

Suggested shortcuts:

```text
Arrow Left      Move to parent column
Arrow Right     Open selected branch or focus next column
Arrow Up        Move to previous block
Arrow Down      Move to next block
Enter           Ask follow-up or open selected branch
Cmd+Enter       Submit composer
Esc             Clear block selection
Cmd+K           Command palette
Cmd+B           Show branch picker
Cmd+S           Save/export
```

---

# 15. Branch Picker

If a selected block already has multiple branches, show a picker.

```text
Branches from "Early fusion"

1. Explain intuitively
2. Compare with cross-attention
3. PyTorch implementation
4. Create new branch...
```

Data shape:

```ts
type BranchSummary = {
  nodeId: string;
  title: string;
  userPrompt: string;
  createdAt: string;
};
```

---

# 16. Export

Export options:

## 16.1 Export Current Path

Exports only the visible left-to-right path.

```markdown
# Root Prompt
...

## Branch: Item 1
...

## Branch: Sub-detail
...
```

## 16.2 Export Whole Tree

Exports the whole conversation tree.

```markdown
# Conversation Title

## Root

### Branch A

#### Branch A-1

### Branch B
```

## 16.3 Export Selected Column

Exports only the currently focused node.

---

# 17. Advanced Features

These are not needed for MVP, but are useful later.

## 17.1 Pin Columns

Pinned columns stay visible even when navigating to another branch.

Use case:

- Keep the original answer visible
- Compare two branches side by side

---

## 17.2 Compare Branches

Allow opening two branches from the same block side by side.

Example:

```text
Column 1: Early fusion
Column 2A: Explain intuitively
Column 2B: PyTorch implementation
```

---

## 17.3 Branch Merge

Let the user merge several branches into a synthesized answer.

Example prompt:

```text
Combine these three branches into a clean summary:
- Branch A
- Branch B
- Branch C
```

---

## 17.4 Breadcrumb Path

Show path at the top.

```text
Root > Fusion Strategies > Early Fusion > PyTorch Implementation
```

---

## 17.5 Map View

A small minimap showing the whole conversation tree.

```text
Root
├── A
│   ├── A1
│   └── A2
├── B
└── C
```

---

# 18. LLM API Contract

## 18.1 Chat Request

```ts
type ChatRequest = {
  conversationId: string;
  parentNodeId?: string;
  sourceBlockId?: string;
  messages: ChatMessage[];
  metadata?: {
    selectedBlockText?: string;
    activePath?: string[];
  };
};
```

---

## 18.2 Chat Message

```ts
type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
```

---

## 18.3 Chat Response

```ts
type ChatResponse = {
  assistantResponse: string;
  title?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};
```

---

# 19. Suggested Folder Structure

```text
src/
  app/
    App.tsx
  components/
    ColumnView.tsx
    ConversationColumn.tsx
    ColumnHeader.tsx
    ColumnBody.tsx
    BlockRenderer.tsx
    BranchBadge.tsx
    BranchPicker.tsx
    Composer.tsx
  state/
    conversationStore.ts
  lib/
    parseMarkdownBlocks.ts
    buildBranchPrompt.ts
    llmClient.ts
    persistence.ts
  types/
    conversation.ts
  styles/
    globals.css
```

---

# 20. MVP Implementation Plan

## Step 1: Static Column Layout

Build a horizontally scrollable layout with mock columns.

Acceptance criteria:

- Columns appear left to right.
- Each column has header, body, and composer.
- Horizontal scrolling works.

---

## Step 2: Conversation Data Model

Implement TypeScript types and simple in-memory state.

Acceptance criteria:

- Root node can be created.
- Child node can be added.
- Active path can be updated.

---

## Step 3: Markdown Block Parser

Implement simple markdown block parsing.

Acceptance criteria:

- Numbered list items become selectable blocks.
- Bullet list items become selectable blocks.
- Paragraphs become selectable blocks.
- Code blocks are preserved.

---

## Step 4: Block Selection UI

Implement selectable block rendering.

Acceptance criteria:

- Hover state works.
- Selected state works.
- Selected block is tracked in state.

---

## Step 5: Branch Creation

Implement follow-up composer for selected block.

Acceptance criteria:

- User selects a block.
- User enters follow-up question.
- New child node is created.
- New child node appears in the column to the right.

---

## Step 6: LLM Integration

Connect branch creation to an actual LLM API.

Acceptance criteria:

- Root prompt gets model response.
- Follow-up prompt includes selected block context.
- Response is parsed into blocks.
- Loading state is visible while generating.

---

## Step 7: Persistence

Save and load conversation from local storage.

Acceptance criteria:

- Refreshing the page keeps the conversation.
- Active path is restored.

---

# 21. Example User Flow

## Initial Prompt

```text
Explain the main approaches to multimodal LLM fusion.
```

## LLM Answer in Column 0

```text
1. Early fusion
2. Late fusion
3. Cross-attention
4. Perceiver-style resampling
5. Mixture of experts
```

## User Selects Block

```text
1. Early fusion
```

## User Follow-up

```text
Explain early fusion with an implementation-level example.
```

## Column 1 Opens

```text
Early fusion usually projects visual tokens into the same hidden dimension as text tokens...

1. Token projection
2. Positional encoding
3. Concatenation
4. Self-attention over combined sequence
5. Output decoding
```

## User Selects Another Block in Column 0

```text
3. Cross-attention
```

## Column 1 Replaces Current Branch

```text
Cross-attention lets text tokens query visual tokens...
```

The early fusion branch still exists, but the active path now follows cross-attention.

---

# 22. Design Principles

## 22.1 Preserve Spatial Context

The user should not lose sight of sibling ideas when exploring one idea deeply.

## 22.2 Make Branches First-Class

Branches should not feel like hidden chat history. They should be visible, named, and navigable.

## 22.3 Keep the UI Lightweight

Do not overcomplicate the first version with graph layouts. Finder-style columns are enough.

## 22.4 Let Structure Emerge from LLM Output

The app should parse LLM output into blocks automatically, but the user should also be able to manually select text later.

## 22.5 Optimize for Thinking, Not Messaging

This is less like a messenger app and more like an interactive thinking workspace.

---

# 23. Open Questions

Questions to decide during implementation:

1. Should a column represent one node or one branch thread?
2. Should each block be parsed automatically, manually selected, or both?
3. Should sibling branches be visible as tabs, badges, or a branch picker?
4. Should branch titles be generated automatically by the LLM?
5. Should the app allow merging branches back into a parent summary?
6. Should selected text ranges be supported in addition to parsed blocks?
7. Should columns be independently scrollable?
8. Should the active path be encoded in the URL?

---

# 24. Suggested First Prototype Scope

Build the first prototype with these constraints:

- One conversation at a time
- One active path at a time
- Columns are fixed width
- Blocks are parsed from markdown list items and paragraphs
- Branches are stored in local storage
- LLM call is done through one backend endpoint
- No auth
- No collaboration
- No branch merging

This is enough to validate the core UX.

---

# 25. Minimal Acceptance Criteria

The prototype is successful if:

1. A user can ask an initial question.
2. The answer appears as selectable blocks.
3. The user can select one block.
4. The user can ask a follow-up about that block.
5. The follow-up appears in a new column to the right.
6. The original answer remains visible on the left.
7. The user can return to another block and open a different branch.
8. Previous branches are preserved.

---

# 26. Current Prototype Alignment

This section reflects the current working prototype and user decisions.

## 26.1 Product Shape

- The first screen is a normal compact chatbot input.
- After the first answer or demo start, the app becomes a horizontal column workspace.
- Every visible pane in the workspace is a branch column. There is no permanent separate left transcript panel.
- Each column has independent vertical scroll.
- Columns are visually separated with spacing and subtle accent colors.
- The clicked block should not move or cause its column to scroll to the top.

## 26.2 Composer Behavior

- Each column has its own floating bottom composer.
- The composer appears only when the pointer enters the lower hover zone of that column.
- Hovering the whole column must not immediately reveal the composer.
- When hidden, the composer must not reserve vertical space; content behind that area remains visible.
- Tool buttons and header buttons should be compact and visually consistent.

## 26.3 Branch Relationship Visualization

- Do not use arrows between columns in the current design.
- Use color instead: the selected source block and its child column share the same accent color.
- Branch indicators appear on both full semantic blocks and selected text ranges.
- Indicators show direct child branch count and deepest reachable descendant depth.
- Example: `↳ 3 D4` means three direct branches from that source and deepest path reaches depth 4.

## 26.4 Block And Text Branching

- The model should segment answers into semantic/contextual blocks. The UI must not assume headings like `Step 1` or `Step 2`.
- Users can branch from a whole semantic block.
- Users can also select text inside a block and branch from only that selection.
- Text-selection branches create a synthetic source block and leave an inline highlighted source marker.
- Clicking the inline marker reopens that branch.
- Root/depth 0 selected-text branches must open depth 1, even if a deeper branch is currently active.
- Depth 1 selected-text branches open depth 2; depth 2 opens depth 3, and so on.

## 26.5 Split And Merge

- Selecting text inside a block can split the block into two or three blocks depending on selection range.
- Shift-click supports multi-select blocks.
- Right-click on multiple selected blocks enables merge.
- Merging blocks must also merge graph ownership, not only text.
- Child branches, selected-text source blocks, selected range offsets, and branch answer parent references must all be reparented to the merged block.

## 26.6 Demo Content

- The current demo question is: `Transformer 가 뭔지 대학생에게 알려주듯이 알려줘`.
- Demo data should include varied depth 2 to 5 branches.
- Demo data should include whole-block branches and selected-text branches.
- Demo data should include Korean explanatory prose, code blocks, inline code, inline math, and display math.
- Demo data can be imperfect, but every visible interaction should feel functional.

## 26.7 OpenAI Integration

- MVP uses standalone web app mode.
- Browser calls the local backend, not OpenAI directly.
- Server-side endpoint calls the OpenAI Responses API.
- Settings UI can configure local OpenAI settings.
- API keys must not be committed or shipped to browser JavaScript.

## 26.8 App Shell And Sidebar

- The product now uses a ChatGPT-like app shell.
- A persistent sidebar lets users switch between Chat, Papers, Notes, Synthesis, and Settings.
- Chat remains the primary workspace and contains the horizontal branching columns.
- Papers and Notes are academic workflow placeholders for later PDF reading, citation-aware chunks, and branch-derived research notes.
- Synthesis can show or create a summary from the current branch workspace.
- Moving between sidebar menus should preserve the current branch workspace.
- On mobile, sidebar navigation should become compact and horizontally usable.
