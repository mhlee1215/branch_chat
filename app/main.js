import {
  appendBranchAnswer,
  appendSelectionBranchAnswer,
  createDemoWorkspace,
  createWorkspaceFromAssistant,
  mergeWorkspaceBlocks,
  renameWorkspaceBlock,
  setWorkspaceBlockSummaryInclusion,
  splitWorkspaceBlock,
  splitWorkspaceBlockRange,
  synthesizeWorkspace,
} from '../src/domain/workspace-store.js';
import { buildBranchContext } from '../src/domain/context-builder.js';
import { createId } from '../src/utils/ids.js';
import {
  askPaperQuestion,
  fetchRuntimeConfig,
  requestAssistantResponse,
  saveRuntimeSettings,
  uploadPaper,
} from '../src/domain/api-client.js';

const APP_BUILD = '079';
const questionInput = document.querySelector('#questionInput');
const startButton = document.querySelector('#startButton');
const attachPaperButton = document.querySelector('#attachPaperButton');
const paperFileInput = document.querySelector('#paperFileInput');
const paperAttachmentStatus = document.querySelector('#paperAttachmentStatus');
const synthesizeButton = document.querySelector('#synthesizeButton');
const settingsButton = document.querySelector('#settingsButton');
const sidebarToggle = document.querySelector('#sidebarToggle');
const newChatButton = document.querySelector('#newChatButton');
const sidebarViewButtons = document.querySelectorAll('[data-view]');
const settingsDialog = document.querySelector('#settingsDialog');
const apiKeyInput = document.querySelector('#apiKeyInput');
const modelInput = document.querySelector('#modelInput');
const persistSettingsInput = document.querySelector('#persistSettingsInput');
const saveSettingsButton = document.querySelector('#saveSettingsButton');
const workspaceWrapEl = document.querySelector('#workspaceWrap');
const workspaceEl = document.querySelector('#workspace');
const branchRailEl = document.querySelector('#branchRail');
const viewPanelEl = document.querySelector('#viewPanel');
const summaryPanelEl = document.querySelector('#summaryPanel');
const providerStatusEl = document.querySelector('#providerStatus');
const buildBadgeEl = document.querySelector('#buildBadge');
const promptChips = document.querySelectorAll('.prompt-chips button');

let workspace = null;
let appView = 'chat';
let mobileActiveColumn = 'root';
let runtimeConfig = { openaiConfigured: false, model: 'mock' };
let isBusy = false;
let selectedBlockIds = new Set();
let contextMenuEl = null;
let selectionMenuEl = null;
let depthMenuEl = null;
let activeTextSelection = null;
let pendingColumnFocusId = null;
let savedScrollPositions = new Map();
let lockedScrollPositions = new Map();
let isDraggingTextSelection = false;
let textSelectionPointer = null;
let suppressNextBlockClick = false;
let isPointerDownInBlockContent = false;
let selectionMenuTimer = null;
let textSelectionStartBlockId = null;
let pendingBranchBlockId = null;
let pendingTextBranchSelection = null;
let pendingThreadPreview = null;
let allowSelectionBranchFromDrag = false;
let lastRenderedActiveColumnId = null;
let activeColumnTransition = 'none';
let columnTransitionAnimation = null;
let attachedPaperFile = null;

showDevelopmentBuildBadge();

startButton.addEventListener('click', async () => {
  const question = questionInput.value.trim();
  if (!question || isBusy) return;
  await startConversation(question);
});

attachPaperButton.addEventListener('click', () => {
  paperFileInput.click();
});

paperFileInput.addEventListener('change', () => {
  attachedPaperFile = paperFileInput.files?.[0] || null;
  renderPaperAttachmentStatus();
});

questionInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    startButton.click();
  }
});

synthesizeButton.addEventListener('click', () => {
  pendingBranchBlockId = null;
  pendingTextBranchSelection = null;
  if (!workspace) {
    workspace = startDemoAtRoot(createDemoWorkspace());
    mobileActiveColumn = 'root';
    appView = 'chat';
  } else {
    workspace = synthesizeWorkspace(workspace);
    appView = 'synthesis';
  }
  render();
});

settingsButton.addEventListener('click', () => {
  openSettingsDialog();
});

sidebarToggle.addEventListener('click', () => {
  document.body.classList.toggle('sidebar-collapsed');
});

newChatButton.addEventListener('click', () => {
  workspace = null;
  appView = 'chat';
  mobileActiveColumn = 'root';
  selectedBlockIds = new Set();
  pendingColumnFocusId = null;
  pendingBranchBlockId = null;
  pendingTextBranchSelection = null;
  activeTextSelection = null;
  attachedPaperFile = null;
  paperFileInput.value = '';
  renderPaperAttachmentStatus();
  questionInput.value = '';
  render();
  questionInput.focus();
});

sidebarViewButtons.forEach((button) => {
  button.addEventListener('click', () => {
    appView = button.dataset.view;
    render();
  });
});

saveSettingsButton.addEventListener('click', async () => {
  saveSettingsButton.disabled = true;
  saveSettingsButton.textContent = 'Saving...';
  try {
    runtimeConfig = await saveRuntimeSettings({
      openaiApiKey: apiKeyInput.value,
      model: modelInput.value,
      persist: persistSettingsInput.checked,
    });
    apiKeyInput.value = '';
    settingsDialog.close();
    render();
  } catch (error) {
    alert(error.message);
  } finally {
    saveSettingsButton.disabled = false;
    saveSettingsButton.textContent = 'Save settings';
  }
});

promptChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    questionInput.value = chip.textContent;
    questionInput.focus();
  });
});

workspaceEl.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target.closest('.branch-jump-button, .text-branch-chip, .column-composer, .thread-back-button, .depth-menu-button')) {
    resetTextSelectionDrag();
    return;
  }
  if (!event.target.closest('.block-content')) {
    resetTextSelectionDrag();
    return;
  }
  isPointerDownInBlockContent = true;
  textSelectionStartBlockId = event.target.closest('.block-card[data-block-id]')?.dataset.blockId || null;
  hideSelectionMenu();
  activeTextSelection = null;
  allowSelectionBranchFromDrag = false;
  window.getSelection()?.removeAllRanges();
  textSelectionPointer = { x: event.clientX, y: event.clientY };
});

workspaceEl.addEventListener('contextmenu', (event) => {
  if (!event.target.closest('.block-card')) return;
  event.preventDefault();
  event.stopPropagation();
  resetTextSelectionDrag();
});

workspaceEl.addEventListener('pointermove', (event) => {
  if (!textSelectionPointer || isDraggingTextSelection) return;
  const dx = Math.abs(event.clientX - textSelectionPointer.x);
  const dy = Math.abs(event.clientY - textSelectionPointer.y);
  if (dx < 4 && dy < 4) return;
  isDraggingTextSelection = true;
  document.body.classList.add('is-selecting-text');
});

document.addEventListener('pointerup', (event) => {
  const hadTextDrag = isDraggingTextSelection;
  isPointerDownInBlockContent = false;
  textSelectionPointer = null;
  if (hadTextDrag) {
    suppressNextBlockClick = true;
    isDraggingTextSelection = false;
    document.body.classList.remove('is-selecting-text');
    window.setTimeout(() => {
      suppressNextBlockClick = false;
    }, 250);
    const selectedText = cleanSelectedText(window.getSelection()?.toString());
    if (selectedText) {
      allowSelectionBranchFromDrag = true;
      queueSelectionMenu(event);
    } else {
      allowSelectionBranchFromDrag = false;
      textSelectionStartBlockId = null;
    }
  }
});

function resetTextSelectionDrag() {
  isPointerDownInBlockContent = false;
  textSelectionPointer = null;
  isDraggingTextSelection = false;
  allowSelectionBranchFromDrag = false;
  document.body.classList.remove('is-selecting-text');
}

document.addEventListener('pointercancel', resetTextSelectionDrag);
window.addEventListener('blur', resetTextSelectionDrag);

document.addEventListener('mouseup', (event) => {
  if (!workspace || selectionMenuEl?.contains(event.target)) return;
  queueSelectionMenu(event);
});

document.addEventListener('selectionchange', () => {
  if (!workspace || isPointerDownInBlockContent) return;
  queueSelectionMenu();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/app/sw.js').catch(() => {});
}

render();
loadRuntimeConfig();

async function loadRuntimeConfig() {
  try {
    runtimeConfig = await fetchRuntimeConfig();
  } catch {
    runtimeConfig = { openaiConfigured: false, model: 'mock unavailable' };
  }
  renderProviderStatus();
}

function render() {
  hideContextMenu();
  hideSelectionMenu();
  hideDepthMenu();
  captureScrollPositions();
  document.body.classList.toggle('has-workspace', Boolean(workspace));
  document.body.classList.toggle('is-busy', isBusy);
  document.body.dataset.view = appView;
  synthesizeButton.disabled = isBusy;
  synthesizeButton.textContent = workspace ? 'Synthesis' : 'Demo';
  startButton.disabled = isBusy;
  renderNavigation();
  renderProviderStatus();
  renderWorkspace();
  renderViewPanel();
  renderSummary();
  restoreScrollPositions();
  requestAnimationFrame(() => {
    focusPendingColumn();
  });
}

async function startConversation(question) {
  setBusy(true);
  try {
    const answer = attachedPaperFile
      ? await askInitialPaperQuestion(question)
      : await askInitialAssistantQuestion(question);
    workspace = createWorkspaceFromAssistant(question, answer);
    mobileActiveColumn = 'root';
    questionInput.value = '';
    attachedPaperFile = null;
    paperFileInput.value = '';
    renderPaperAttachmentStatus();
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

async function askInitialAssistantQuestion(question) {
  const payload = await requestAssistantResponse([
    { role: 'user', content: question },
  ], { messageId: createId('message') });
  return payload.message.content;
}

async function askInitialPaperQuestion(question) {
  setPaperAttachmentStatus(`Uploading ${attachedPaperFile.name}...`);
  const paper = await uploadPaper(attachedPaperFile, { title: attachedPaperFile.name.replace(/\.pdf$/i, '') });
  setPaperAttachmentStatus(`Reading ${paper.originalName}...`);
  const answer = await askPaperQuestion(question, paper, { mode: 'paper_only' });
  return answer.text;
}

function setBusy(value) {
  isBusy = value;
  startButton.textContent = value ? 'Thinking...' : 'Send';
  render();
}

function openSettingsDialog() {
  modelInput.value = runtimeConfig.model || 'gpt-5.4-mini';
  settingsDialog.showModal();
}

function renderNavigation() {
  sidebarViewButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.view === appView);
  });
}

function renderProviderStatus() {
  providerStatusEl.textContent = runtimeConfig.openaiConfigured
    ? `OpenAI ${runtimeConfig.model}`
    : 'Mock mode';
  providerStatusEl.className = runtimeConfig.openaiConfigured
    ? 'provider-pill configured'
    : 'provider-pill';
}

function renderPaperAttachmentStatus() {
  if (!paperAttachmentStatus) return;
  if (!attachedPaperFile) {
    paperAttachmentStatus.hidden = true;
    paperAttachmentStatus.textContent = '';
    return;
  }
  setPaperAttachmentStatus(`Attached PDF: ${attachedPaperFile.name}`);
}

function setPaperAttachmentStatus(text) {
  if (!paperAttachmentStatus) return;
  paperAttachmentStatus.hidden = false;
  paperAttachmentStatus.textContent = text;
}

function showDevelopmentBuildBadge() {
  if (!buildBadgeEl) return;
  const isDevelopmentHost = ['localhost', '127.0.0.1', '::1', ''].includes(window.location.hostname);
  if (!isDevelopmentHost) return;
  buildBadgeEl.textContent = `Build ${APP_BUILD}`;
  buildBadgeEl.hidden = false;
  document.body.dataset.build = APP_BUILD;
}

function renderWorkspace() {
  if (!workspace) {
    lastRenderedActiveColumnId = null;
    activeColumnTransition = 'none';
    workspaceEl.dataset.transition = 'none';
    const empty = document.createElement('section');
    empty.className = 'empty-state';
    const title = document.createElement('h2');
    title.textContent = 'Start with a normal chat message';
    const body = document.createElement('p');
    body.textContent = 'The assistant answer will become blocks. Tap Ask on any block to open a focused branch.';
    empty.append(title, body);
    workspaceEl.replaceChildren(empty);
    return;
  }

  renderThreadWorkspace();
}

function renderThreadWorkspace() {
  columnTransitionAnimation?.cancel?.();
  columnTransitionAnimation = null;
  activeColumnTransition = 'none';
  workspaceEl.dataset.transition = 'none';
  workspaceEl.dataset.mode = 'threads';

  const activeBranch = workspace.branches.find((branch) => branch.id === workspace.activeBranchId);
  if (pendingThreadPreview) {
    workspaceEl.dataset.threadDepth = 'split';
    const parentPaneId = pendingThreadPreview.parentPaneId || 'root';
    workspaceEl.replaceChildren(
      renderThreadPane(parentPaneId, 'parent'),
      renderPendingThreadPane(pendingThreadPreview),
    );
    lastRenderedActiveColumnId = 'pending-thread';
    return;
  }

  workspaceEl.dataset.threadDepth = activeBranch ? 'split' : 'single';
  const parentPaneId = activeBranch?.parentBranchId || 'root';
  const panes = [renderThreadPane(parentPaneId, activeBranch ? 'parent' : 'primary')];
  if (activeBranch) panes.push(renderThreadPane(activeBranch.id, 'active'));
  lastRenderedActiveColumnId = activeBranch?.id || 'root';
  workspaceEl.replaceChildren(...panes);
}

function renderThreadPane(paneId, role) {
  const isRoot = paneId === 'root';
  const branch = isRoot ? null : workspace.branches.find((item) => item.id === paneId);
  const pane = document.createElement('section');
  pane.className = `thread-pane ${role}`;
  pane.dataset.columnId = paneId;
  pane.dataset.threadRole = role;
  pane.style.setProperty('--link-color', branch ? connectionColor(branch.depth - 1) : connectionColor(0));

  const header = document.createElement('header');
  header.className = 'thread-header';
  if (!isRoot && branch) {
    header.append(renderThreadDepthNav(branch));
  }
  const copy = document.createElement('div');
  copy.className = 'thread-header-copy';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'thread-eyebrow';
  eyebrow.textContent = isRoot ? 'Main chat' : `Thread D${branch?.depth || 0}`;
  const title = document.createElement('h2');
  title.textContent = isRoot ? workspaceTitle() : branch?.title || 'Thread';
  const subtitle = document.createElement('p');
  subtitle.textContent = isRoot ? workspaceSummary() : branchSubtitle(branch);
  copy.append(eyebrow, title, subtitle);
  header.append(copy);

  const controls = document.createElement('div');
  controls.className = 'thread-header-actions';
  const browse = button(isRoot ? 'D0' : `D${branch?.depth || 0}`, (event) => {
    event.preventDefault();
    event.stopPropagation();
    showDepthMenu(event);
  }, 'Browse thread depth');
  browse.className = 'depth-menu-button';
  controls.append(browse);
  header.append(controls);

  const timeline = document.createElement('div');
  timeline.className = 'thread-timeline column-body';
  if (isRoot) {
    timeline.append(renderTimelineUserMessage(workspace.originalQuestion, 'Original question'));
    timeline.append(renderTimelineAssistantBlocks(
      workspace.blocks.filter((block) => block.messageId === workspace.rootMessageId),
      'Assistant',
    ));
  } else {
    workspace.messages
      .filter((message) => message.branchId === branch?.id)
      .forEach((message) => {
        if (message.role === 'user') {
          timeline.append(renderTimelineUserMessage(message.content, 'Question'));
          return;
        }
        if (message.role === 'assistant') {
          timeline.append(renderTimelineAssistantBlocks(
            workspace.blocks.filter((block) => block.messageId === message.id),
            'Assistant',
          ));
          return;
        }
        timeline.append(renderTimelinePlainMessage(message));
      });
  }

  pane.append(header, timeline);
  const hoverZone = document.createElement('div');
  hoverZone.className = 'composer-hover-zone';
  hoverZone.setAttribute('aria-hidden', 'true');
  setupColumnComposerHover(pane, hoverZone);
  pane.append(hoverZone);
  if (!appendPendingBranchComposer(pane)) {
    const fallbackBlock = firstBlockForPane(paneId);
    pane.append(renderColumnComposer(isRoot ? 'Message this chat' : 'Reply in this thread', (question) => askColumnQuestion(fallbackBlock, question)));
  }
  return pane;
}

function renderThreadDepthNav(branch) {
  const nav = document.createElement('nav');
  nav.className = 'thread-depth-nav';
  nav.setAttribute('aria-label', 'Thread depth navigation');

  const back = button('', () => activateColumn(branch.parentBranchId || 'root'), 'Open parent thread');
  back.className = 'thread-back-button';
  back.setAttribute('aria-label', 'Open parent thread');

  const dots = document.createElement('div');
  dots.className = 'thread-depth-dots';
  threadDepthEntries(branch).forEach((entry) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = entry.id === branch.id ? 'active' : '';
    dot.title = entry.label;
    dot.setAttribute('aria-label', entry.label);
    dot.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      activateColumn(entry.id);
    });
    dots.append(dot);
  });

  nav.append(back, dots);
  return nav;
}

function threadDepthEntries(branch) {
  const branches = [];
  let current = branch;
  while (current) {
    branches.unshift(current);
    current = workspace.branches.find((item) => item.id === current.parentBranchId);
  }
  return [
    { id: 'root', label: 'Depth 0' },
    ...branches.map((item) => ({ id: item.id, label: `Depth ${item.depth}` })),
  ];
}

function renderTimelineUserMessage(content, label) {
  const item = document.createElement('article');
  item.className = 'timeline-message user';
  const meta = document.createElement('p');
  meta.className = 'timeline-meta';
  meta.textContent = label;
  const bubble = document.createElement('div');
  bubble.className = 'timeline-bubble';
  bubble.textContent = content;
  item.append(meta, bubble);
  return item;
}

function renderTimelinePlainMessage(message) {
  const item = document.createElement('article');
  item.className = `timeline-message ${message.role}`;
  const meta = document.createElement('p');
  meta.className = 'timeline-meta';
  meta.textContent = message.role;
  const bubble = document.createElement('div');
  bubble.className = 'timeline-bubble';
  bubble.textContent = message.content;
  item.append(meta, bubble);
  return item;
}

function renderTimelineAssistantBlocks(blocks, label) {
  const item = document.createElement('article');
  item.className = 'timeline-message assistant';
  const meta = document.createElement('p');
  meta.className = 'timeline-meta';
  meta.textContent = label;
  const bubble = document.createElement('div');
  bubble.className = 'timeline-bubble assistant-blocks';
  if (blocks.length) bubble.append(...blocks.map((block) => renderBlock(block)));
  else bubble.textContent = 'No assistant blocks yet.';
  item.append(meta, bubble);
  return item;
}

function renderPendingThreadPane(preview) {
  const pane = document.createElement('section');
  pane.className = 'thread-pane active pending-thread';
  pane.dataset.columnId = 'pending-thread';
  pane.dataset.threadRole = 'active';
  pane.style.setProperty('--link-color', connectionColor(preview.depth - 1));

  const header = document.createElement('header');
  header.className = 'thread-header';
  const copy = document.createElement('div');
  copy.className = 'thread-header-copy';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'thread-eyebrow';
  eyebrow.textContent = `Thread D${preview.depth}`;
  const title = document.createElement('h2');
  title.textContent = preview.title || 'New thread';
  const subtitle = document.createElement('p');
  subtitle.textContent = preview.sourceSummary || 'Preparing branch answer';
  copy.append(eyebrow, title, subtitle);
  header.append(copy);

  const timeline = document.createElement('div');
  timeline.className = 'thread-timeline column-body';
  timeline.append(
    renderTimelineUserMessage(preview.question, 'Question'),
    renderTimelinePlainMessage({ role: 'assistant pending', content: 'Thinking...' }),
  );
  pane.append(header, timeline);
  return pane;
}

function firstBlockForPane(paneId) {
  if (paneId === 'root') {
    return workspace.blocks.find((block) => block.messageId === workspace.rootMessageId);
  }
  const assistantMessage = workspace.messages.find((message) => message.branchId === paneId && message.role === 'assistant');
  return workspace.blocks.find((block) => block.messageId === assistantMessage?.id);
}

function applyImmersiveColumnClasses(columns) {
  const activeColumnId = mobileActiveColumn || workspace.activeBranchId || 'root';
  const activeIndex = Math.max(0, columns.findIndex((column) => column.dataset.columnId === activeColumnId));
  const previousColumnId = lastRenderedActiveColumnId;
  const transition = depthTransition(previousColumnId, activeColumnId);
  activeColumnTransition = transition;
  workspaceEl.dataset.transition = transition;
  columns.forEach((column, index) => {
    column.classList.toggle('active', index === activeIndex);
    column.classList.toggle('peek', index !== activeIndex);
    column.classList.toggle('peek-left', index === activeIndex - 1);
    column.classList.toggle('peek-right', index === activeIndex + 1);
    column.classList.toggle('hidden-depth', Math.abs(index - activeIndex) > 1);
    column.dataset.depthPosition = index < activeIndex ? 'parent' : index > activeIndex ? 'child' : 'current';
  });
  lastRenderedActiveColumnId = activeColumnId;
}

function captureDepthTransition(nextColumnId) {
  const transition = depthTransition(lastRenderedActiveColumnId, nextColumnId);
  if (!['deeper', 'shallower'].includes(transition)) return null;
  const column = workspaceEl.querySelector('.column.active');
  if (!column) return null;
  const rect = column.getBoundingClientRect();
  return {
    sourceClone: column.cloneNode(true),
    transition,
    width: rect.width,
  };
}

function animateDepthTransition(snapshot) {
  if (!snapshot || snapshot.transition !== activeColumnTransition) return;
  const sourcePeekSelector = snapshot.transition === 'deeper' ? '.column.peek-left' : '.column.peek-right';
  const sourceSlot = workspaceEl.querySelector(sourcePeekSelector);
  const target = workspaceEl.querySelector('.column.active');
  if (!target) return;
  columnTransitionAnimation?.cancel();

  // For 'shallower' transitions the closing branch is removed from the DOM by
  // activateBranchPath (isOpen → false), so sourceSlot may not exist.
  // Fall back to any remaining peek column's width to get the peek dimension.
  const fallbackPeek = workspaceEl.querySelector('.column.peek-left, .column.peek-right');
  const sourceEndWidth = sourceSlot
    ? sourceSlot.getBoundingClientRect().width
    : (fallbackPeek?.getBoundingClientRect().width ?? 56);
  const targetEndWidth = target.getBoundingClientRect().width;
  const targetStartWidth = Math.max(Math.min(sourceEndWidth, 72), 48);
  const sourceStartWidth = Math.max(snapshot.width, targetEndWidth);
  const source = snapshot.sourceClone;
  const targetClone = target.cloneNode(true);
  const stage = document.createElement('div');
  let timerId = null;
  const sourceShift = snapshot.transition === 'deeper' ? '-12px' : '12px';
  const targetShift = snapshot.transition === 'deeper' ? '18px' : '-18px';

  source.className = 'column transition-panel transition-source';
  targetClone.className = 'column transition-panel transition-target';
  stage.className = `depth-transition-stage ${snapshot.transition}`;
  stage.style.setProperty('--source-start-width', `${sourceStartWidth}px`);
  stage.style.setProperty('--source-end-width', `${sourceEndWidth}px`);
  stage.style.setProperty('--target-start-width', `${targetStartWidth}px`);
  stage.style.setProperty('--target-end-width', `${targetEndWidth}px`);
  stage.style.setProperty('--source-shift', sourceShift);
  stage.style.setProperty('--target-shift', targetShift);

  if (snapshot.transition === 'deeper') stage.append(source, targetClone);
  else stage.append(targetClone, source);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timerId);
    source.removeEventListener('animationend', onAnimationEnd);
    targetClone.removeEventListener('animationend', onAnimationEnd);
    stage.remove();
    workspaceEl.classList.remove('is-transitioning-depth');
    columnTransitionAnimation = null;
  };

  let animationsEnded = 0;
  const onAnimationEnd = (event) => {
    // Ignore events that bubbled up from child elements — only count the panel's own animation.
    // Also guard against unrelated animationName values from re-used class names.
    if (event.target !== event.currentTarget) return;
    animationsEnded++;
    if (animationsEnded >= 2) finish();
  };

  workspaceEl.classList.add('is-transitioning-depth');
  workspaceEl.append(stage);

  source.addEventListener('animationend', onAnimationEnd);
  targetClone.addEventListener('animationend', onAnimationEnd);

  // Fallback timeout: CSS duration(1700ms) + 200ms buffer
  columnTransitionAnimation = { cancel: finish };
  timerId = window.setTimeout(finish, 1900);
}

function depthTransition(previousColumnId, nextColumnId) {
  if (!previousColumnId || previousColumnId === nextColumnId) return 'none';
  const previousDepth = columnDepth(previousColumnId);
  const nextDepth = columnDepth(nextColumnId);
  if (!Number.isInteger(previousDepth) || !Number.isInteger(nextDepth)) return 'switch';
  if (nextDepth > previousDepth) return 'deeper';
  if (nextDepth < previousDepth) return 'shallower';
  return 'switch';
}

function columnDepth(columnId) {
  if (columnId === 'root') return 0;
  return workspace?.branches.find((branch) => branch.id === columnId)?.depth;
}

function renderViewPanel() {
  if (appView === 'chat') {
    viewPanelEl.replaceChildren();
    return;
  }

  if (appView === 'papers') {
    viewPanelEl.replaceChildren(
      viewPanelHeader('Paper Library', 'Keep PDFs, reading queues, and paper-specific branch chats in one place.'),
      viewGrid([
        ['Queued paper', 'Attention Is All You Need', 'Transformer architecture, positional encoding, attention heads'],
        ['Reading plan', 'Method section deep dive', 'Branch questions by architecture, math, and experiments'],
        ['Coming next', 'PDF upload and citation-aware chunks', 'The core branching chat stays the same; papers become structured sources.'],
      ]),
    );
    return;
  }

  if (appView === 'notes') {
    viewPanelEl.replaceChildren(
      viewPanelHeader('Research Notes', 'Collect branch insights after exploration, then turn them into summaries or paper notes.'),
      viewGrid([
        ['Open question', 'Why does multi-head attention help?', 'Compare syntax heads, reference heads, and long-range dependency heads.'],
        ['Definition', 'Selected-text branches', 'A phrase can become its own source context without carrying the whole block.'],
        ['Implementation note', 'Graph ownership on merge', 'When blocks merge, their child conversations must merge with them.'],
      ]),
    );
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'view-card synthesis-view';
  const title = document.createElement('h2');
  title.textContent = 'Synthesis';
  const body = document.createElement('p');
  body.textContent = workspace
    ? 'Create a compact summary from the current branch workspace.'
    : 'Start a chat or open the demo first, then synthesize the explored branches.';
  const action = button(workspace?.synthesis ? 'Refresh synthesis' : 'Create synthesis', () => {
    if (!workspace) {
      workspace = createDemoWorkspace();
      appView = 'chat';
    } else {
      workspace = synthesizeWorkspace(workspace);
    }
    render();
  });
  action.className = 'view-action';
  panel.append(title, body, action);
  if (workspace?.synthesis) {
    const result = document.createElement('pre');
    result.textContent = workspace.synthesis;
    panel.append(result);
  }
  viewPanelEl.replaceChildren(panel);
}

function viewPanelHeader(titleText, bodyText) {
  const header = document.createElement('header');
  header.className = 'view-panel-header';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Academic workspace';
  const title = document.createElement('h1');
  title.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  header.append(eyebrow, title, body);
  return header;
}

function viewGrid(items) {
  const grid = document.createElement('div');
  grid.className = 'view-grid';
  items.forEach(([label, titleText, bodyText]) => {
    const card = document.createElement('article');
    card.className = 'view-card';
    const meta = document.createElement('p');
    meta.className = 'eyebrow';
    meta.textContent = label;
    const title = document.createElement('h2');
    title.textContent = titleText;
    const body = document.createElement('p');
    body.textContent = bodyText;
    card.append(meta, title, body);
    grid.append(card);
  });
  return grid;
}

function captureScrollPositions() {
  if (!workspaceEl) return;
  savedScrollPositions = new Map([...workspaceEl.querySelectorAll('.column, .thread-pane')].map((column) => {
    const key = column.dataset.columnId;
    const body = column.querySelector('.column-body');
    return [key, body?.scrollTop || 0];
  }));
  lockedScrollPositions.forEach((scrollTop, key) => {
    savedScrollPositions.set(key, scrollTop);
  });
}

function restoreScrollPositions() {
  const entries = [...savedScrollPositions.entries()];
  entries.forEach(([key, scrollTop]) => {
    const body = workspaceEl.querySelector(`[data-column-id="${key}"] .column-body`);
    if (body) body.scrollTop = scrollTop;
  });
  requestAnimationFrame(() => {
    entries.forEach(([key, scrollTop]) => {
      const body = workspaceEl.querySelector(`[data-column-id="${key}"] .column-body`);
      if (body && Math.abs(body.scrollTop - scrollTop) > 1) body.scrollTop = scrollTop;
    });
  });
}

function lockColumnScrollFromEvent(event) {
  const column = event?.currentTarget?.closest?.('.column, .thread-pane');
  const body = column?.querySelector('.column-body');
  if (!column?.dataset.columnId || !body) return;
  lockedScrollPositions.set(column.dataset.columnId, body.scrollTop);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      lockedScrollPositions.delete(column.dataset.columnId);
    });
  });
}

function renderRootColumn() {
  const column = createColumn('root', workspaceTitle(), workspaceSummary());
  const body = column.querySelector('.column-body');
  body.append(...workspace.blocks.filter((block) => block.messageId === workspace.rootMessageId).map((block) => renderBlock(block)));
  if (!appendPendingBranchComposer(column)) {
    column.append(renderColumnComposer('Ask anything about this answer', (question) => askColumnQuestion(workspace.blocks.find((block) => block.messageId === workspace.rootMessageId), question)));
  }
  return column;
}

function startDemoAtRoot(demoWorkspace) {
  return {
    ...demoWorkspace,
    activeBranchId: null,
    branches: demoWorkspace.branches.map((branch) => ({ ...branch, isOpen: false })),
  };
}

function workspaceTitle() {
  if (!workspace?.originalQuestion) return 'Chat';
  if (/transformer|트랜스포머/i.test(workspace.originalQuestion)) return 'Transformer basics';
  if (/paper|논문/i.test(workspace.originalQuestion)) return 'Paper reading';
  return 'Chat';
}

function workspaceSummary() {
  const question = workspace?.originalQuestion?.trim() || '';
  if (!question) return 'Focused branch workspace';
  if (/transformer|트랜스포머/i.test(question)) return 'Transformer 구조를 대학생 눈높이로 설명';
  if (question.length <= 54) return question;
  return `${question.slice(0, 54).trim()}...`;
}

function renderBranchColumn(branch) {
  const messages = workspace.messages.filter((message) => message.branchId === branch.id);
  const column = createColumn(branch.id, branch.title, `Depth ${branch.depth}`);
  const body = column.querySelector('.column-body');
  messages.forEach((message) => {
    if (message.role === 'assistant') {
      const blocks = workspace.blocks.filter((block) => block.messageId === message.id);
      if (blocks.length) {
        body.append(...blocks.map((block) => renderBlock(block)));
        return;
      }
    }
    if (message.role !== 'user') body.append(renderMessage(message));
  });
  const firstBlock = workspace.blocks.find((block) => block.messageId === messages.find((message) => message.role === 'assistant')?.id);
  if (!appendPendingBranchComposer(column)) {
    column.append(renderColumnComposer('Ask anything about this column', (question) => askColumnQuestion(firstBlock, question)));
  }
  return column;
}

function appendPendingBranchComposer(column) {
  if (pendingBranchBlockId) {
    const pendingBlock = workspace.blocks.find((block) => block.id === pendingBranchBlockId);
    if (!pendingBlock) return false;
    const belongsToColumn = column.dataset.columnId === columnIdForBlock(pendingBlock);
    if (belongsToColumn) {
      column.append(renderBranchQuestionComposer(pendingBlock));
      return true;
    }
    return false;
  }

  if (pendingTextBranchSelection) {
    const parentBlock = workspace.blocks.find((block) => block.id === pendingTextBranchSelection.blockId);
    if (!parentBlock) return false;
    const belongsToColumn = column.dataset.columnId === columnIdForBlock(parentBlock);
    if (belongsToColumn) {
      column.append(renderTextSelectionQuestionComposer(pendingTextBranchSelection));
      return true;
    }
  }
  return false;
}

function columnIdForBlock(block) {
  if (block.messageId === workspace.rootMessageId) return 'root';
  const message = workspace.messages.find((item) => item.id === block.messageId);
  return message?.branchId || 'root';
}

function renderMessage(message) {
  const bubble = document.createElement('article');
  bubble.className = `message ${message.role}`;
  bubble.textContent = message.content;
  return bubble;
}

function createColumn(id, title, subtitle) {
  const section = document.createElement('section');
  section.className = 'column';
  section.dataset.columnId = id;
  const branch = workspace?.branches.find((item) => item.id === id);
  section.style.setProperty('--link-color', branch ? connectionColor(branch.depth - 1) : connectionColor(0));
  section.addEventListener('click', (event) => {
    if (!section.classList.contains('peek')) return;
    event.preventDefault();
    event.stopPropagation();
    showDepthMenu(event);
  });

  const header = document.createElement('header');
  header.className = 'column-header';
  const heading = document.createElement('h2');
  heading.textContent = title;
  if (id === 'root') {
    const details = document.createElement('details');
    details.className = 'initial-question';
    const summary = document.createElement('summary');
    summary.textContent = subtitle;
    const question = document.createElement('p');
    question.textContent = workspace.originalQuestion;
    details.append(summary, question);
    header.append(heading, details);
  } else {
    const meta = document.createElement('p');
    meta.textContent = subtitle;
    header.append(heading, meta);
  }
  const depthButton = button(id === 'root' ? 'D0' : `D${branch?.depth || 0}`, (event) => {
    event.preventDefault();
    event.stopPropagation();
    showDepthMenu(event);
  }, 'Browse branch depth');
  depthButton.className = 'depth-menu-button';
  header.append(depthButton);
  section.append(header);
  const body = document.createElement('div');
  body.className = 'column-body';
  section.append(body);
  const hoverZone = document.createElement('div');
  hoverZone.className = 'composer-hover-zone';
  hoverZone.setAttribute('aria-hidden', 'true');
  setupColumnComposerHover(section, hoverZone);
  section.append(hoverZone);
  return section;
}

function setupColumnComposerHover(column, hoverZone) {
  let closeTimer = null;
  const arm = () => {
    window.clearTimeout(closeTimer);
    if (!isDraggingTextSelection) document.body.classList.remove('is-selecting-text');
    column.classList.add('composer-armed');
  };
  const disarmSoon = () => {
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      if (
        column.matches(':focus-within')
        || column.querySelector('.column-composer:hover')
        || hoverZone.matches(':hover')
      ) {
        column.classList.add('composer-armed');
        return;
      }
      column.classList.remove('composer-armed');
    }, 180);
  };

  hoverZone.addEventListener('pointerenter', arm);
  hoverZone.addEventListener('pointerleave', disarmSoon);
  column.addEventListener('focusin', arm);
  column.addEventListener('focusout', disarmSoon);
  column.addEventListener('pointerleave', disarmSoon);
}

function renderBlock(block) {
  const card = document.createElement('article');
  card.className = isBlockSelected(block) ? 'block-card selected' : 'block-card';
  card.dataset.blockId = block.id;
  const childBranch = branchForBlock(block);
  if (childBranch) {
    card.classList.add('linked');
  }
  card.style.setProperty('--link-color', blockConnectionColor(block));
  card.addEventListener('click', (event) => handleBlockClick(event, block));
  card.addEventListener('contextmenu', (event) => showBlockContextMenu(event, block));

  const header = document.createElement('header');
  const title = document.createElement('h3');
  title.textContent = block.title;
  header.append(title);

  const content = renderRichText(block.content, selectionMarkersForBlock(block));
  content.classList.add('block-content');

  const footer = document.createElement('footer');
  footer.className = 'block-footer';
  const branchButton = renderBranchJumpButton(block);
  if (branchButton) footer.append(branchButton);

  card.append(header, content, footer);
  return card;
}

function askBlockQuestion(block, event) {
  openBranchComposer(block, event);
}

function renderBranchJumpButton(block) {
  const stats = branchStatsForBlock(block);
  const childBranch = branchForBlock(block);
  if (!childBranch || stats.count <= 0) return null;
  const title = `${stats.count} thread${stats.count > 1 ? 's' : ''}, deepest depth ${stats.maxDepth}`;
  const branchButton = button('', (event) => {
    event.preventDefault();
    event.stopPropagation();
    lockColumnScrollFromEvent(event);
    openBranchById(childBranch.id);
  }, title);
  branchButton.setAttribute('aria-label', title);
  branchButton.className = 'branch-jump-button has-branches';
  branchButton.innerHTML = '<span class="branch-icon" aria-hidden="true"></span>';
  return branchButton;
}

function renderRichText(markdown, markers = []) {
  const container = document.createElement('div');
  container.className = 'rich-text';
  const lines = markdown.split('\n');
  let paragraph = [];
  let codeLines = [];
  let codeLanguage = '';
  let inCode = false;
  let offset = 0;

  const flushParagraph = () => {
    const rawText = paragraph.map((line) => line.text).join('\n');
    const trimStart = rawText.length - rawText.trimStart().length;
    const text = rawText.trim();
    if (!text) {
      paragraph = [];
      return;
    }
    const paragraphStart = paragraph[0].start + trimStart;
    const paragraphEnd = paragraphStart + text.length;
    const paragraphMarkers = markers
      .filter((marker) => marker.end > paragraphStart && marker.start < paragraphEnd)
      .map((marker) => ({
        ...marker,
        start: Math.max(marker.start, paragraphStart) - paragraphStart,
        end: Math.min(marker.end, paragraphEnd) - paragraphStart,
      }))
      .filter((marker) => marker.end > marker.start);
    const annotatedText = annotateSelectionMarkers(text, paragraphMarkers);
    const paragraphEl = document.createElement('p');
    appendInlineRichText(paragraphEl, annotatedText, paragraphMarkers);
    container.append(paragraphEl);
    paragraph = [];
  };

  const flushCode = () => {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    if (codeLanguage) code.dataset.language = codeLanguage;
    code.textContent = codeLines.join('\n');
    pre.append(code);
    container.append(pre);
    codeLines = [];
    codeLanguage = '';
  };

  lines.forEach((line) => {
    const lineStart = offset;
    offset += line.length + 1;
    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence && !inCode) {
      flushParagraph();
      inCode = true;
      codeLanguage = fence[1] || '';
      return;
    }
    if (fence && inCode) {
      inCode = false;
      flushCode();
      return;
    }
    if (inCode) {
      codeLines.push(line);
      return;
    }
    if (/^\$\$/.test(line.trim()) && /\$\$$/.test(line.trim()) && line.trim().length > 4) {
      flushParagraph();
      const math = document.createElement('div');
      math.className = 'math-block';
      math.textContent = line.trim().replace(/^\$\$/, '').replace(/\$\$$/, '').trim();
      container.append(math);
      return;
    }
    if (!line.trim()) {
      flushParagraph();
      return;
    }
    paragraph.push({ text: line, start: lineStart });
  });

  if (inCode) flushCode();
  flushParagraph();
  return container;
}

function annotateSelectionMarkers(markdown, markers) {
  return markers
    .map((marker, markerIndex) => ({ ...marker, markerIndex }))
    .sort((a, b) => b.start - a.start)
    .reduce((nextMarkdown, marker) => {
      return [
        nextMarkdown.slice(0, marker.start),
        `\uE000${marker.markerIndex}\uE001`,
        nextMarkdown.slice(marker.start, marker.end),
        '\uE002',
        nextMarkdown.slice(marker.end),
      ].join('');
    }, markdown);
}

function appendInlineRichText(parent, text, markers = []) {
  const pattern = /(\uE000(\d+)\uE001([\s\S]*?)\uE002|`[^`]+`|\$[^$\n]+\$)/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
    if (match[2]) {
      const marker = markers[Number(match[2])];
      parent.append(renderTextBranchMarker(match[3], marker));
      cursor = match.index + match[0].length;
      continue;
    }
    const token = match[0];
    const inline = document.createElement(token.startsWith('`') ? 'code' : 'span');
    inline.className = token.startsWith('`') ? 'inline-code' : 'math-inline';
    inline.textContent = token.slice(1, -1);
    parent.append(inline);
    cursor = match.index + token.length;
  }
  if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
}

function renderTextBranchMarker(text, marker) {
  const wrap = document.createElement('span');
  wrap.className = marker.active ? 'text-branch-marker active' : 'text-branch-marker';
  if (marker.pending) wrap.classList.add('pending');
  wrap.style.setProperty('--link-color', marker.color || connectionColor(0));
  appendInlineRichText(wrap, text, []);
  if (marker.pending) return wrap;

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'text-branch-chip';
  chip.title = `${marker.count} text branch${marker.count > 1 ? 'es' : ''}; deepest depth ${marker.maxDepth}`;
  chip.setAttribute('aria-label', chip.title);
  chip.textContent = `↳ ${marker.count} D${marker.maxDepth}`;
  ['pointerdown', 'pointerup', 'mouseup'].forEach((eventName) => {
    chip.addEventListener(eventName, (event) => {
      event.stopPropagation();
    });
  });
  chip.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openTextBranchMarker(marker, event);
  });
  wrap.append(chip);
  return wrap;
}

function openTextBranchMarker(marker, event) {
  lockColumnScrollFromEvent(event);
  if (marker.parentBlockId) selectedBlockIds = new Set([marker.parentBlockId]);
  openBranchById(marker.activeBranchId || marker.branchIds[0]);
}

function selectionSourceTouchesBlock(source, blockId) {
  return source.parentBlockId === blockId
    || source.sourceRanges?.some((range) => range.blockId === blockId);
}

function selectionMarkersForBlock(block) {
  const byRange = new Map();
  workspace.blocks
    .filter((item) => item.sourceKind === 'text-selection' && selectionSourceTouchesBlock(item, block.id))
    .forEach((source) => {
      const branch = workspace.branches.find((item) => item.sourceBlockId === source.id);
      if (!branch) return;
      const range = normalizedSourceRange(block, source);
      if (!range) return;
      const key = `${range.start}:${range.end}`;
      const previous = byRange.get(key) || {
        ...range,
        parentBlockId: block.id,
        branchIds: [],
        count: 0,
        maxDepth: 0,
        active: false,
        activeBranchId: null,
        color: null,
      };
      previous.branchIds.push(branch.id);
      previous.count += 1;
      previous.maxDepth = Math.max(previous.maxDepth, deepestDepthFromBranch(branch, new Set()));
      if (branch.isOpen || branch.id === workspace.activeBranchId) {
        previous.active = true;
        previous.activeBranchId = branch.id;
        previous.color = connectionColor(branch.depth - 1);
      }
      if (!previous.color) previous.color = connectionColor(branch.depth - 1);
      byRange.set(key, previous);
    });

  if (pendingTextBranchSelection?.blockId === block.id) {
    const start = pendingTextBranchSelection.start;
    const end = pendingTextBranchSelection.end;
    if (Number.isInteger(start) && Number.isInteger(end) && end > start) {
      byRange.set(`${start}:${end}:pending`, {
        start,
        end,
        parentBlockId: block.id,
        branchIds: [],
        count: 0,
        maxDepth: 0,
        active: true,
        activeBranchId: null,
        color: blockConnectionColor(block),
        pending: true,
      });
    }
  }

  const markers = [...byRange.values()].sort((a, b) => a.start - b.start);
  return markers.filter((marker, index) => index === 0 || marker.start >= markers[index - 1].end);
}

function normalizedSourceRange(parentBlock, sourceBlock) {
  const multiRange = sourceBlock.sourceRanges?.find((range) => range.blockId === parentBlock.id);
  if (multiRange) {
    if (
      Number.isInteger(multiRange.start)
      && Number.isInteger(multiRange.end)
      && multiRange.start >= 0
      && multiRange.end > multiRange.start
      && parentBlock.content.slice(multiRange.start, multiRange.end).trim() === multiRange.text.trim()
    ) {
      return { start: multiRange.start, end: multiRange.end };
    }
    const multiFallbackStart = parentBlock.content.indexOf(multiRange.text);
    if (multiFallbackStart !== -1) {
      return { start: multiFallbackStart, end: multiFallbackStart + multiRange.text.length };
    }
  }

  const start = sourceBlock.sourceRange?.start;
  const end = sourceBlock.sourceRange?.end;
  if (
    Number.isInteger(start)
    && Number.isInteger(end)
    && start >= 0
    && end > start
    && parentBlock.content.slice(start, end) === sourceBlock.content
  ) {
    return { start, end };
  }
  const fallbackStart = parentBlock.content.indexOf(sourceBlock.content);
  if (fallbackStart === -1) return null;
  return { start: fallbackStart, end: fallbackStart + sourceBlock.content.length };
}

function branchStatsForBlock(block) {
  const directBranches = directBranchesForBlock(block);
  if (!directBranches.length) return { count: 0, maxDepth: 0 };
  const visitedBranchIds = new Set();
  const maxDepth = directBranches.reduce((max, branch) => (
    Math.max(max, deepestDepthFromBranch(branch, visitedBranchIds))
  ), 0);
  return { count: directBranches.length, maxDepth };
}

function directBranchesForBlock(block) {
  const textSelectionSourceIds = new Set(
    workspace?.blocks
      .filter((item) => item.sourceKind === 'text-selection' && selectionSourceTouchesBlock(item, block.id))
      .map((item) => item.id) || [],
  );
  return workspace?.branches.filter((branch) => (
    branch.sourceBlockId === block.id || textSelectionSourceIds.has(branch.sourceBlockId)
  )) || [];
}

function deepestDepthFromBranch(branch, visitedBranchIds) {
  if (visitedBranchIds.has(branch.id)) return branch.depth;
  visitedBranchIds.add(branch.id);
  const assistantMessageIds = workspace.messages
    .filter((message) => message.branchId === branch.id && message.role === 'assistant')
    .map((message) => message.id);
  const childBlocks = workspace.blocks.filter((block) => assistantMessageIds.includes(block.messageId));
  const childBranches = childBlocks.flatMap((block) => directBranchesForBlock(block));
  return childBranches.reduce((max, childBranch) => (
    Math.max(max, deepestDepthFromBranch(childBranch, visitedBranchIds))
  ), branch.depth);
}

function findVisibleChildBranch(block) {
  const directChild = directBranchesForBlock(block).find((branch) => branch.isOpen);
  if (directChild) return directChild;
  return null;
}

function isBlockSelected(block) {
  return selectedBlockIds.has(block.id)
    || workspace.branches.some((branch) => branch.isOpen && branch.sourceBlockId === block.id)
    || workspace.branches.some((branch) => {
      if (!branch.isOpen) return false;
      const source = workspace.blocks.find((item) => item.id === branch.sourceBlockId);
      return source?.sourceKind === 'text-selection' && selectionSourceTouchesBlock(source, block.id);
    });
}

function branchForBlock(block) {
  return findVisibleChildBranch(block)
    || workspace.branches.find((branch) => branch.sourceBlockId === block.id)
    || workspace.branches.find((branch) => {
      const source = workspace.blocks.find((item) => item.id === branch.sourceBlockId);
      return source?.sourceKind === 'text-selection' && selectionSourceTouchesBlock(source, block.id);
    })
    || null;
}

function blockConnectionColor(block) {
  const childBranch = branchForBlock(block);
  if (childBranch) return connectionColor(childBranch.depth - 1);
  const message = workspace.messages.find((item) => item.id === block.messageId);
  const parentBranch = workspace.branches.find((branch) => branch.id === message?.branchId);
  return parentBranch ? connectionColor(parentBranch.depth - 1) : connectionColor(0);
}

function handleBlockClick(event, block) {
  event.preventDefault();
  event.stopPropagation();
  if (suppressNextBlockClick) {
    suppressNextBlockClick = false;
    return;
  }
  if (window.getSelection()?.toString().trim() || isDraggingTextSelection) {
    return;
  }
  if (event.shiftKey) {
    if (selectedBlockIds.has(block.id)) selectedBlockIds.delete(block.id);
    else selectedBlockIds.add(block.id);
    updateBlockSelectionDom();
    return;
  }
  selectedBlockIds = new Set([block.id]);
  updateBlockSelectionDom();
}

function updateBlockSelectionDom() {
  workspaceEl.querySelectorAll('.block-card[data-block-id]').forEach((card) => {
    const block = workspace.blocks.find((item) => item.id === card.dataset.blockId);
    if (!block) return;
    card.classList.toggle('selected', isBlockSelected(block));
  });
}

function selectBlock(block) {
  const childBranch = branchForBlock(block);
  if (!childBranch) return false;
  openBranchById(childBranch.id);
  return true;
}

function openBranchById(branchId) {
  const branch = workspace.branches.find((item) => item.id === branchId);
  if (!branch) return;
  activateBranchPath(branch.id);
  render();
}

function activateColumn(columnId) {
  if (columnId === 'root') {
    pendingBranchBlockId = null;
    pendingTextBranchSelection = null;
    mobileActiveColumn = 'root';
    workspace = {
      ...workspace,
      activeBranchId: null,
      branches: workspace.branches.map((branch) => ({ ...branch, isOpen: false })),
    };
    render();
    return;
  }
  openBranchById(columnId);
}

function activateBranchPath(branchId) {
  const branch = workspace.branches.find((item) => item.id === branchId);
  if (!branch) return;
  mobileActiveColumn = branch.id;
  pendingColumnFocusId = branch.id;
  pendingBranchBlockId = null;
  pendingTextBranchSelection = null;
  const visibleBranchIds = getBranchPathIds(branch.id);
  workspace = {
    ...workspace,
    branches: workspace.branches.map((item) => ({
      ...item,
      isOpen: visibleBranchIds.has(item.id),
    })),
    activeBranchId: branch.id,
  };
}

function connectionColor(index) {
  const colors = ['#ff6a00', '#2c7be5', '#12a88a', '#9b5de5', '#e24a8d'];
  return colors[index % colors.length];
}

function getBranchPathIds(branchId) {
  const ids = [];
  let current = workspace.branches.find((branch) => branch.id === branchId);
  while (current) {
    ids.unshift(current.id);
    current = workspace.branches.find((branch) => branch.id === current.parentBranchId);
  }
  return new Set(ids);
}

function showBlockContextMenu(event, block) {
  event.preventDefault();
  event.stopPropagation();
  resetTextSelectionDrag();
  hideContextMenu();
  hideSelectionMenu();
  window.getSelection()?.removeAllRanges();
  selectedBlockIds = new Set([block.id]);
  updateBlockSelectionDom();

  contextMenuEl = document.createElement('div');
  contextMenuEl.className = 'context-menu';
  contextMenuEl.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
  contextMenuEl.style.top = `${Math.min(event.clientY, window.innerHeight - 80)}px`;
  contextMenuEl.append(menuButton('Make a branch', () => {
    openBranchComposer(block, event);
  }));
  document.body.append(contextMenuEl);
}

function splitSelectedTextOrBlock(block) {
  const selectedText = window.getSelection()?.toString().trim();
  if (selectedText && block.content.includes(selectedText)) {
    const start = block.content.indexOf(selectedText);
    workspace = splitWorkspaceBlockRange(workspace, block.id, start, start + selectedText.length);
    return;
  }
  workspace = splitWorkspaceBlock(workspace, block.id, Math.floor(block.content.length / 2));
}

function openBranchComposer(block, event) {
  lockColumnScrollFromEvent(event);
  pendingBranchBlockId = block.id;
  pendingTextBranchSelection = null;
  selectedBlockIds = new Set([block.id]);
  const columnId = columnIdForBlock(block);
  mobileActiveColumn = columnId;
  hideContextMenu();
  render();
  requestAnimationFrame(() => {
    const textarea = workspaceEl.querySelector('.branch-question-composer textarea');
    textarea?.focus();
  });
}

function queueSelectionMenu(event) {
  if (!workspace || selectionMenuEl?.contains(event?.target)) return;
  if (event && event.button !== 0) return;
  if (!allowSelectionBranchFromDrag) return;
  const selectedText = cleanSelectedText(window.getSelection()?.toString());
  if (!selectedText) {
    allowSelectionBranchFromDrag = false;
    textSelectionStartBlockId = null;
    return;
  }
  window.clearTimeout(selectionMenuTimer);
  selectionMenuTimer = window.setTimeout(() => showSelectionBranchMenu(), 30);
}

function showSelectionBranchMenu() {
  allowSelectionBranchFromDrag = false;
  const selection = window.getSelection();
  const selectedText = cleanSelectedText(selection?.toString());
  if (!selectedText || !selection.rangeCount) {
    textSelectionStartBlockId = null;
    return;
  }
  const range = selection.getRangeAt(0);
  const selectedRanges = collectSelectedBlockRanges(selection, selectedText);
  if (!selectedRanges.length) {
    textSelectionStartBlockId = null;
    return;
  }
  if (selectedRanges.length > 1) {
    textSelectionStartBlockId = null;
    return;
  }
  const sourceRange = selectedRanges.length === 1
    ? { start: selectedRanges[0].start, end: selectedRanges[0].end }
    : null;

  const rect = range.getBoundingClientRect();
  const menuRect = rect.width || rect.height ? rect : range.getClientRects()[0];
  if (!menuRect) return;
  activeTextSelection = {
    blockId: selectedRanges[0].blockId,
    text: selectedRanges.map((item) => item.text).join('\n\n'),
    start: sourceRange?.start,
    end: sourceRange?.end,
    ranges: selectedRanges,
    mode: 'branch',
  };
  hideSelectionMenu();
  selectionMenuEl = document.createElement('div');
  selectionMenuEl.className = 'selection-menu';
  selectionMenuEl.style.left = `${Math.min(menuRect.left, window.innerWidth - 220)}px`;
  selectionMenuEl.style.top = `${Math.min(menuRect.bottom + 8, window.innerHeight - 54)}px`;
  const branchButton = menuButton('Make a branch', () => {});
  branchButton.addEventListener('pointerdown', (pointerEvent) => {
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    openTextSelectionBranchComposer(activeTextSelection, pointerEvent);
  });
  selectionMenuEl.append(branchButton);
  document.body.append(selectionMenuEl);
}

function openTextSelectionBranchComposer(selection, event) {
  if (!selection) return;
  lockColumnScrollFromEvent(event);
  const parentBlock = workspace.blocks.find((block) => block.id === selection.blockId);
  if (!parentBlock) return;
  pendingBranchBlockId = null;
  pendingTextBranchSelection = { ...selection };
  selectedBlockIds = new Set([selection.blockId]);
  mobileActiveColumn = columnIdForBlock(parentBlock);
  hideSelectionMenu();
  window.getSelection()?.removeAllRanges();
  render();
  requestAnimationFrame(() => {
    const textarea = workspaceEl.querySelector('.branch-question-composer textarea');
    textarea?.focus();
  });
}

function collectSelectedBlockRanges(selection, selectedText) {
  if (!selection?.rangeCount) return [];
  const selectionRange = selection.getRangeAt(0);
  const selectedCards = [...workspaceEl.querySelectorAll('.block-card[data-block-id]')]
    .map((card) => {
      const block = workspace.blocks.find((item) => item.id === card.dataset.blockId);
      const contentEl = card.querySelector('.block-content');
      if (!block || !contentEl) return null;
      if (!rangeTouchesNode(selectionRange, contentEl)) return null;
      const intersection = rangeIntersectionForNode(selectionRange, contentEl);
      const text = cleanSelectedText(intersection.toString()) || selectedTextForBlockFallback(block, selectedText);
      if (!text) return null;
      const sourceRange = findSelectionRangeInText(block.content, text);
      if (!sourceRange) return null;
      return {
        blockId: block.id,
        messageId: block.messageId,
        index: block.index,
        text,
        start: sourceRange.start,
        end: sourceRange.end,
      };
    })
    .filter(Boolean);

  if (!selectedCards.length) return collectSelectedBlockRangesFallback(selectionRange, selectedText);
  const selectedMessageIds = new Set(selectedCards.map((item) => item.messageId));
  if (selectedMessageIds.size > 1) return [];
  return selectedCards.sort((a, b) => a.index - b.index);
}

function rangeTouchesNode(range, node) {
  if (typeof range.intersectsNode === 'function') {
    try {
      return range.intersectsNode(node);
    } catch {
      return false;
    }
  }
  const nodeRange = document.createRange();
  nodeRange.selectNodeContents(node);
  return range.compareBoundaryPoints(Range.END_TO_START, nodeRange) > 0
    && range.compareBoundaryPoints(Range.START_TO_END, nodeRange) < 0;
}

function rangeIntersectionForNode(selectionRange, node) {
  const contentRange = document.createRange();
  contentRange.selectNodeContents(node);
  const intersection = document.createRange();
  if (node.contains(selectionRange.startContainer)) {
    intersection.setStart(selectionRange.startContainer, selectionRange.startOffset);
  } else {
    intersection.setStart(contentRange.startContainer, contentRange.startOffset);
  }
  if (node.contains(selectionRange.endContainer)) {
    intersection.setEnd(selectionRange.endContainer, selectionRange.endOffset);
  } else {
    intersection.setEnd(contentRange.endContainer, contentRange.endOffset);
  }
  return intersection;
}

function collectSelectedBlockRangesFallback(selectionRange, selectedText) {
  const nearestCard = closestBlockCard(selectionRange.startContainer)
    || closestBlockCard(selectionRange.endContainer)
    || (textSelectionStartBlockId
      ? workspaceEl.querySelector(`.block-card[data-block-id="${CSS.escape(textSelectionStartBlockId)}"]`)
      : null);
  if (!nearestCard) return [];
  const block = workspace.blocks.find((item) => item.id === nearestCard.dataset.blockId);
  if (!block) return [];
  const text = selectedTextForBlockFallback(block, selectedText);
  if (!text) return [];
  const sourceRange = findSelectionRangeInText(block.content, text);
  if (!sourceRange) return [];
  return [{
    blockId: block.id,
    messageId: block.messageId,
    index: block.index,
    text,
    start: sourceRange.start,
    end: sourceRange.end,
  }];
}

function selectedTextForBlockFallback(block, selectedText) {
  if (!selectedText) return '';
  const exactRange = findSelectionRangeInText(block.content, selectedText);
  if (exactRange) return selectedText;

  const selectedParts = selectedText
    .split(/\n{1,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const matchingPart = selectedParts.find((part) => findSelectionRangeInText(block.content, part));
  if (matchingPart) return matchingPart;

  const selectedWords = selectedText.match(/[\p{L}\p{N}_'"-]+/gu) || [];
  for (let length = Math.min(selectedWords.length, 16); length >= 3; length -= 1) {
    for (let start = 0; start <= selectedWords.length - length; start += 1) {
      const phrase = selectedWords.slice(start, start + length).join(' ');
      if (findSelectionRangeInText(block.content, phrase)) return phrase;
    }
  }
  return '';
}

function closestBlockCard(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return element?.closest?.('.block-card[data-block-id]') || null;
}

function cleanSelectedText(text = '') {
  return text.replace(/[\uE000-\uE002]/g, '').trim();
}

function findSelectionRangeInText(content, selectedText) {
  const exactStart = content.indexOf(selectedText);
  if (exactStart !== -1) return { start: exactStart, end: exactStart + selectedText.length };

  const normalizedNeedle = selectedText.replace(/\s+/g, ' ').trim();
  if (!normalizedNeedle) return null;

  let normalizedContent = '';
  const indexMap = [];
  let previousWasSpace = false;
  [...content].forEach((character, index) => {
    if (/\s/.test(character)) {
      if (previousWasSpace) return;
      normalizedContent += ' ';
      indexMap.push(index);
      previousWasSpace = true;
      return;
    }
    normalizedContent += character;
    indexMap.push(index);
    previousWasSpace = false;
  });

  const normalizedStart = normalizedContent.indexOf(normalizedNeedle);
  if (normalizedStart === -1) return null;
  const normalizedEnd = normalizedStart + normalizedNeedle.length - 1;
  return {
    start: indexMap[normalizedStart],
    end: indexMap[normalizedEnd] + 1,
  };
}

async function askTextSelectionQuestion(selection, question) {
  if (!selection || !question?.trim() || isBusy) return;
  const parentBlock = workspace.blocks.find((block) => block.id === selection.blockId);
  if (!parentBlock) return;
  const trimmedQuestion = question.trim();
  const parentBranchId = parentBranchIdForBlock(selection.blockId);
  const parentBranch = workspace.branches.find((branch) => branch.id === parentBranchId);
  pendingThreadPreview = {
    parentPaneId: columnIdForBlock(parentBlock),
    title: shortText(selection.text, parentBlock.title),
    sourceSummary: branchSubtitleForContent(selection.text),
    question: trimmedQuestion,
    depth: parentBranch ? parentBranch.depth + 1 : 1,
  };
  setBusy(true);
  let pendingResult = null;
  try {
    const context = buildTextSelectionBranchContext(selection, trimmedQuestion);
    const payload = await requestAssistantResponse(context, { messageId: createId('message') });
    pendingResult = appendSelectionBranchAnswer(
      workspace,
      selection.blockId,
      selection.text,
      trimmedQuestion,
      payload.message.content,
      {
        parentBranchId,
        sourceRange: { start: selection.start, end: selection.end },
      },
    );
    activeTextSelection = null;
    pendingTextBranchSelection = null;
    textSelectionStartBlockId = null;
    selectedBlockIds = new Set();
    window.getSelection()?.removeAllRanges();
  } catch (error) {
    pendingThreadPreview = null;
    alert(error.message);
  } finally {
    setBusy(false);
  }
  if (pendingResult) {
    pendingThreadPreview = null;
    workspace = pendingResult.workspace;
    openBranchById(pendingResult.branch.id);
  }
}

function buildTextSelectionBranchContext(selection, question) {
  const parentBlock = workspace.blocks.find((block) => block.id === selection.blockId);
  return [
    { role: 'system', content: 'Answer using the selected text as the focused branch context. Keep the answer tied to that selection.' },
    { role: 'user', content: workspace.originalQuestion },
    { role: 'assistant', content: `[Parent block: ${parentBlock?.title || 'Selected block'}]\n${parentBlock?.content || ''}` },
    { role: 'assistant', content: `[Selected text]\n${selection.text}` },
    { role: 'user', content: question },
  ];
}

function parentBranchIdForBlock(blockId) {
  const block = workspace.blocks.find((item) => item.id === blockId);
  if (!block || block.messageId === workspace.rootMessageId) return undefined;
  const message = workspace.messages.find((item) => item.id === block?.messageId);
  return message?.branchId;
}

function menuButton(label, onClick) {
  const item = document.createElement('button');
  item.type = 'button';
  item.textContent = label;
  item.addEventListener('click', onClick);
  return item;
}

function hideContextMenu() {
  contextMenuEl?.remove();
  contextMenuEl = null;
}

function hideSelectionMenu() {
  window.clearTimeout(selectionMenuTimer);
  selectionMenuTimer = null;
  selectionMenuEl?.remove();
  selectionMenuEl = null;
}

function showDepthMenu(event) {
  if (!workspace) return;
  hideContextMenu();
  hideSelectionMenu();
  hideDepthMenu();

  const entries = depthMenuEntries();
  if (!entries.length) return;
  const rect = event.currentTarget?.getBoundingClientRect?.();
  const left = Math.min(rect?.left ?? event.clientX, window.innerWidth - 280);
  const top = Math.min((rect?.bottom ?? event.clientY) + 8, window.innerHeight - 280);
  depthMenuEl = document.createElement('div');
  depthMenuEl.className = 'depth-menu';
  depthMenuEl.style.left = `${Math.max(8, left)}px`;
  depthMenuEl.style.top = `${Math.max(8, top)}px`;

  const title = document.createElement('p');
  title.className = 'depth-menu-title';
  title.textContent = 'Browse depth';
  depthMenuEl.append(title);

  const currentColumnId = mobileActiveColumn || workspace.activeBranchId || 'root';
  entries.forEach((entry) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = entry.id === currentColumnId ? 'active' : '';
    item.innerHTML = [
      `<span class="depth-menu-depth">${entry.depthLabel}</span>`,
      `<span class="depth-menu-copy"><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.subtitle)}</small></span>`,
    ].join('');
    item.addEventListener('click', () => {
      hideDepthMenu();
      activateColumn(entry.id);
    });
    depthMenuEl.append(item);
  });

  document.body.append(depthMenuEl);
}

function depthMenuEntries() {
  const entries = [{
    id: 'root',
    depthLabel: 'D0',
    title: workspaceTitle(),
    subtitle: workspaceSummary(),
  }];
  const openBranches = workspace.branches
    .filter((branch) => branch.isOpen)
    .sort((a, b) => a.depth - b.depth || a.columnOrder - b.columnOrder);
  openBranches.forEach((branch) => {
    entries.push({
      id: branch.id,
      depthLabel: `D${branch.depth}`,
      title: branch.title,
      subtitle: branchSubtitle(branch),
    });
  });
  return entries;
}

function branchSubtitle(branch) {
  const source = workspace.blocks.find((block) => block.id === branch.sourceBlockId);
  if (!source) return 'Branch';
  return branchSubtitleForContent(source.content);
}

function branchSubtitleForContent(content = '') {
  const text = content.replace(/\s+/g, ' ').trim();
  return text.length > 68 ? `${text.slice(0, 68)}...` : text;
}

function shortText(content = '', fallback = 'Thread') {
  const text = content.replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.length > 42 ? `${text.slice(0, 42)}...` : text;
}

function hideDepthMenu() {
  depthMenuEl?.remove();
  depthMenuEl = null;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function focusPendingColumn() {
  pendingColumnFocusId = null;
}

document.addEventListener('click', (event) => {
  if (contextMenuEl && !contextMenuEl.contains(event.target)) hideContextMenu();
  if (depthMenuEl && !depthMenuEl.contains(event.target)) hideDepthMenu();
  if (selectionMenuEl?.contains(event.target)) return;
  const hasActiveSelection = Boolean(window.getSelection()?.toString().trim());
  if (selectionMenuEl && !selectionMenuEl.contains(event.target) && !hasActiveSelection) {
    activeTextSelection = null;
    hideSelectionMenu();
  }
});

async function askColumnQuestion(block, question) {
  if (!question?.trim() || isBusy) return;
  if (!block) return;
  const trimmedQuestion = question.trim();
  const parentBranchId = parentBranchIdForBlock(block.id);
  const parentBranch = workspace.branches.find((branch) => branch.id === parentBranchId);
  pendingThreadPreview = {
    parentPaneId: columnIdForBlock(block),
    title: block.title,
    sourceSummary: branchSubtitleForContent(block.content),
    question: trimmedQuestion,
    depth: parentBranch ? parentBranch.depth + 1 : 1,
  };
  setBusy(true);
  let pendingResult = null;
  try {
    const previewBranch = {
      id: 'preview-branch',
      conversationId: workspace.conversationId,
      sourceBlockId: block.id,
      parentBranchId,
      title: block.title,
      depth: parentBranch ? parentBranch.depth + 1 : 1,
      columnOrder: workspace.branches.length + 1,
      isOpen: true,
    };
    const context = buildBranchContext({ ...workspace, branches: [...workspace.branches, previewBranch] }, previewBranch.id, trimmedQuestion);
    const payload = await requestAssistantResponse(context, { messageId: createId('message') });
    pendingResult = appendBranchAnswer(workspace, block.id, trimmedQuestion, payload.message.content, { parentBranchId });
  } catch (error) {
    pendingThreadPreview = null;
    alert(error.message);
  } finally {
    // setBusy(false) renders with the OLD workspace (no new branch visible yet).
    // workspace is updated AFTER this so that openBranchById triggers the depth
    // transition animation cleanly without an intermediate peek-state flash.
    setBusy(false);
  }
  if (pendingResult) {
    pendingThreadPreview = null;
    workspace = pendingResult.workspace;
    openBranchById(pendingResult.branch.id);
  }
}

function renderColumnComposer(placeholder, onSubmit, description = '') {
  const footer = document.createElement('footer');
  footer.className = 'column-composer';
  ['pointerdown', 'pointerup', 'click'].forEach((eventName) => {
    footer.addEventListener(eventName, (event) => {
      event.stopPropagation();
    });
  });
  const textarea = document.createElement('textarea');
  textarea.rows = 2;
  textarea.placeholder = placeholder;
  if (description) {
    const hint = document.createElement('p');
    hint.className = 'composer-hint';
    hint.textContent = description;
    footer.append(hint);
  }
  const actions = document.createElement('div');
  actions.className = 'composer-actions';
  const tools = document.createElement('div');
  tools.className = 'tool-row';
  tools.append(button('+', () => {}, 'Attach'), button('Tools', () => {}, 'Tools'));
  const send = button('Send', () => {
    const question = textarea.value.trim();
    if (!question) return;
    textarea.value = '';
    onSubmit(question);
  });
  send.id = '';
  send.className = 'column-send';
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send.click();
    }
  });
  actions.append(tools, send);
  footer.append(textarea, actions);
  return footer;
}

function renderBranchQuestionComposer(block) {
  const footer = renderColumnComposer(`Reply to "${block.title}"`, async (question) => {
    await askColumnQuestion(block, question);
  }, '선택한 블록을 기준으로 질문하면 하위 브랜치가 만들어집니다.');
  footer.classList.add('branch-question-composer');
  const cancel = button('Cancel', () => {
    pendingBranchBlockId = null;
    render();
  }, 'Cancel branch question');
  cancel.className = 'tool-button';
  footer.querySelector('.tool-row')?.append(cancel);
  return footer;
}

function renderTextSelectionQuestionComposer(selection) {
  const preview = selection.text.length > 38 ? `${selection.text.slice(0, 38)}...` : selection.text;
  const footer = renderColumnComposer(`Ask about selected text: "${preview}"`, async (question) => {
    await askTextSelectionQuestion(selection, question);
  }, '선택한 텍스트 블록을 기준으로 질문하면 하위 브랜치가 만들어집니다.');
  footer.classList.add('branch-question-composer');
  const cancel = button('Cancel', () => {
    pendingTextBranchSelection = null;
    activeTextSelection = null;
    render();
  }, 'Cancel branch question');
  cancel.className = 'tool-button';
  footer.querySelector('.tool-row')?.append(cancel);
  return footer;
}

function splitBlockAtPrompt(block) {
  const splitAt = Math.floor(block.content.length / 2);
  workspace = splitWorkspaceBlock(workspace, block.id, splitAt);
  render();
}

function mergeWithNext(block) {
  const next = workspace.blocks.find((item) => item.messageId === block.messageId && item.index === block.index + 1);
  if (!next) return;
  workspace = mergeWorkspaceBlocks(workspace, [block.id, next.id]);
  render();
}

function renameBlockAtPrompt(block) {
  const title = prompt('New block title', block.title);
  if (!title?.trim()) return;
  workspace = renameWorkspaceBlock(workspace, block.id, title.trim());
  render();
}

function toggleSummary(block) {
  workspace = setWorkspaceBlockSummaryInclusion(workspace, block.id, !block.includeInSummary);
  render();
}

function renderSummary() {
  if (!workspace?.synthesis) {
    summaryPanelEl.innerHTML = '';
    return;
  }
  const title = document.createElement('h2');
  title.textContent = 'Synthesis';
  const body = document.createElement('pre');
  body.textContent = workspace.synthesis;
  summaryPanelEl.replaceChildren(title, body);
}

function button(label, onClick, title = label) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.title = title;
  element.addEventListener('click', onClick);
  return element;
}
