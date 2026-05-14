# Branch Chat Continuation Summary

Last updated: 2026-05-10

This file is a handoff note for continuing the project after context loss.

## Product Goal

Branch Chat is a ChatGPT-like web app focused on academic/research exploration. The core idea is that an assistant answer is split into semantic blocks. A user can branch from a whole block or from a selected text range, ask a focused follow-up, and browse deeper or back upward without losing the original context.

The product should feel like ChatGPT with branching added, not like a landing page or static demo.

## Current App Shape

- Local web app served at `http://localhost:4173/`.
- Main source files:
  - `app/index.html`
  - `app/main.js`
  - `app/styles.css`
  - `app/sw.js`
  - `src/domain/*`
  - `tests/*.test.js`
- Sidebar shell:
  - `Chat`: main branching workspace.
  - `Papers`: placeholder for paper queue / PDF workflows.
  - `Notes`: placeholder for branch-derived research notes.
  - `Synthesis`: summary area.
- The top workspace bar was removed. Settings, provider pill, and synthesis controls live in the sidebar.
- As of Build 075, the workspace is moving from Finder-style columns to a compact chat-thread model inspired by Slack/Google Chat.
- The screen should show at most two depths:
  - Left pane: the full parent conversation.
  - Right pane: the currently selected child thread.
- When the user enters a deeper thread, the previous current thread becomes the parent pane and the new child thread appears on the right.
- Dev build badge appears only on local/dev hosts in the bottom-right corner.

## Current Build

Current implementation build: `079`.

Build number locations:

- `app/main.js`: `APP_BUILD`
- `app/index.html`: visible fallback badge text
- `app/sw.js`: `CACHE_NAME`

When app assets change, increment all three.

## Branching Model

Terminology agreed with the user:

- `Block`: a paragraph/semantic response block from an assistant answer.
- `Text block`: a user-created text selection inside one block.

Branching rules:

- A branch can originate from either a whole block or a text block.
- A root/depth 0 block or text block should create a depth 1 branch.
- Depth 1 creates depth 2, depth 2 creates depth 3, and so on.
- Active nested branches must not leak into root branch creation.
- Branch indicators show both direct branch count and max reachable depth, for example `↳ 2 D4`.
- Direct count and max depth are different:
  - `↳ 1 D2` means one direct branch, deepest descendant reaches depth 2.
- Text block branches leave inline highlighted source markers with chips.
- Multi-block text selection was intentionally dropped for now. If needed later, ask the user before reintroducing it.

## Interaction Rules

- First demo open should show depth 0 only.
- Branches should feel like message threads, not like an endlessly scrolling set of columns.
- Thread answers should be displayed as a normal user/assistant message timeline.
- Blocks inside assistant messages remain branchable, but they live inside chat bubbles.
- The parent side should show the whole parent conversation, not only the selected source block.
- Blocks show a compact branch/thread icon at the bottom only when a branch already exists. Clicking that icon opens the existing child thread on the right.
- Left-clicking a paragraph block only highlights the whole block. It must not navigate, rerender into another thread, or open a composer by itself.
- Build 077 makes plain block clicks stop at the block event handler and only update `.selected` classes in the existing DOM. It does not call `render()`, does not lock scroll, and does not let the click bubble to document-level cleanup handlers.
- Build 078 tightens the responsive layout: collapsed sidebar becomes icon-letter only, thread panes get inner padding, and split thread view collapses to a single active pane on medium/small screens to avoid clipping.
- Build 079 adds the first OpenAI paper assistant backend path:
  - `src/domain/paper-assistant.js` owns PDF upload, OpenAI vector store creation/reuse, file attachment, paper question calls, web-search mode selection, and citation extraction.
  - `POST /api/papers/upload` accepts PDF form data and stores returned OpenAI file/vector IDs locally.
  - `POST /api/chat/paper` asks with Responses API `file_search`, optionally adding `web_search` in modes that allow it.
  - The first chat composer can attach one PDF and ask the initial question against that paper.
  - `.branching-chat/` stores local paper metadata and remains ignored by Git.
- Right-clicking a paragraph block opens a single `Make a branch` menu. Choosing it opens the bottom question composer with explanatory copy saying the question will create a child branch.
- Drag-selecting text inside one block opens a `Make a branch` menu on mouse release. Choosing it opens the bottom question composer with explanatory copy saying the question will create a child branch from the selected text block.
- Features that conflict with those rules should be removed or disabled.
- Non-root thread headers include a compact left-side parent/back icon and dot breadcrumb for the depth path.
- The user should open a branch by:
  1. Selecting/right-clicking a whole block and choosing `Make a branch`, or
  2. Drag-selecting text inside a single block and choosing `Make a branch`.
  3. A floating question UI appears.
  4. After the user submits the question, the next depth opens.
- All branch creation paths should pass through the floating question UI.
- Clicking a selected source should not scroll the current column to top.
- Each column has its own vertical scroll.
- The floating composer should appear only when the pointer moves near the bottom of a column, not merely when entering the column.
- The selected block/text marker and the next-depth column should share the same color theme.
- Only the selected block should be highlighted. Do not tint every block in the current column.

## Current Demo Data

The demo is based on a Transformer explanation in Korean.

Demo requirements already implemented or expected:

- Depth paths from 2 to 5.
- Whole-block branches.
- Text-selection branches.
- Code and formula examples to verify rendering.
- Inline selected-text branch chips.
- Direct count and max-depth indicators.

## Animation History

The depth transition animation has been the hardest UI issue.

What did not work well:

- Relying on ordinary active/peek column CSS transitions.
- JS `requestAnimationFrame` interpolation on the real columns.
- CSS transitions on real columns while `active`, `peek`, and inline width styles all changed together.

Symptoms seen by the user:

- The transition looked like it ended immediately.
- Hover movement was visible, but branch navigation did not clearly animate.
- The desired effect is: when going to the next depth, the current column visibly narrows while the next column expands. When going upward, the parent column expands back.

Build 063 approach:

- During a depth transition, the actual rendered columns are temporarily hidden.
- A dedicated `.depth-transition-stage` is placed over the workspace.
- The stage contains two cloned panels:
  - `.transition-source`
  - `.transition-target`
- CSS keyframes animate width/flex-basis/max-width and opacity:
  - `depthSourceCollapse`
  - `depthTargetExpand`
- Duration is currently `1700ms`.
- The stage is removed after `1850ms`.

Important files/functions:

- `app/main.js`
  - `captureDepthTransition(nextColumnId)`
  - `animateDepthTransition(snapshot)`
  - `applyImmersiveColumnClasses(columns)`
- `app/styles.css`
  - `.depth-transition-stage`
  - `.transition-panel`
  - `.transition-source`
  - `.transition-target`
  - `@keyframes depthSourceCollapse`
  - `@keyframes depthTargetExpand`

If animation still looks wrong, next debugging step:

1. Do not rewrite the data model.
2. Instrument the transition stage visually:
   - show source/target widths as temporary debug labels,
   - log `sourceStartWidth`, `sourceEndWidth`, `targetStartWidth`, `targetEndWidth`.
3. Verify whether the stage appears for the full 1.85 seconds.
4. If the stage appears but width does not animate, the issue is CSS keyframes/layout.
5. If the stage does not appear, the issue is transition capture/render timing.

Build 068 direction:

- The UI is no longer relying on the multi-column depth animation as the main navigation metaphor.
- Depth navigation should be redesigned around a two-pane thread layout.
- Any future animation should be a simpler thread-pane slide/fade, not a full Finder-column width morph.

## Testing Checklist

Run these after every code change:

```bash
node --check app/main.js
node --check app/sw.js
node --test tests/*.test.js
```

Current expected test count: 25 passing tests.

## GitHub

Remote repo:

```text
git@github.com:mhlee1215/branch_chat.git
```

Recent pushed commits:

- `dfbb7e0` - simplified real-column transition attempt.
- `b387c26` - improved timing/source visibility attempt.
- Build 063 should be committed after the current stage-keyframe change is verified.

## Design Direction

The user wants an immersive, readable UI:

- Main focus should be one current depth column.
- Parent/child depth context can be visible as narrow side panels.
- Avoid horizontal scrolling as the primary way to understand the workspace.
- The interface should feel academic and efficient, not decorative.
- Compact controls, consistent buttons, and readable typography matter.
- Mobile compatibility is required, but desktop research flow is the current priority.

## Known Deferred Items

- Real OpenAI Responses API integration exists conceptually and settings UI is present, but the current focus has been interaction quality.
- Multi-block text selection branching is deferred.
- PDF upload, citation-aware chunks, and paper-grounded retrieval are future work.
- Browser-level visual automation is not yet in the test suite.
