import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendBranchAnswer,
  appendSelectionBranchAnswer,
  createDemoWorkspace,
  askDeeper,
  createWorkspace,
  createWorkspaceFromAssistant,
  mergeWorkspaceBlocks,
  splitWorkspaceBlock,
  synthesizeWorkspace,
} from '../src/domain/workspace-store.js';
import { createTestIdFactory } from '../src/utils/ids.js';

test('createWorkspace creates root messages and segmented blocks', () => {
  const workspace = createWorkspace('Plan the product', {
    makeId: createTestIdFactory(),
    answer: 'First block.\n\nSecond block.',
  });

  assert.equal(workspace.messages.length, 2);
  assert.equal(workspace.blocks.length, 2);
  assert.equal(workspace.branches.length, 0);
});

test('createWorkspaceFromAssistant uses server-provided assistant content', () => {
  const workspace = createWorkspaceFromAssistant('Hello', 'Server answer.\n\nSecond block.', {
    makeId: createTestIdFactory(),
  });

  assert.equal(workspace.messages[1].content, 'Server answer.\n\nSecond block.');
  assert.equal(workspace.blocks.length, 2);
});

test('askDeeper creates a branch with focused context', () => {
  const workspace = createWorkspace('Plan the product', {
    makeId: createTestIdFactory(),
    answer: 'Selected block.\n\nUnrelated sibling.',
  });
  const result = askDeeper(workspace, workspace.blocks[0].id, 'Why?', {
    makeId: createTestIdFactory(),
    answer: 'Because it narrows attention.',
  });
  const contextText = result.context.map((item) => item.content).join('\n');

  assert.equal(result.workspace.branches.length, 1);
  assert.equal(result.branch.depth, 1);
  assert.match(contextText, /Selected block/);
  assert.doesNotMatch(contextText, /Unrelated sibling/);
});

test('askDeeper segments branch answers so they can be explored again', () => {
  const makeId = createTestIdFactory();
  const workspace = createWorkspace('Plan the product', {
    makeId,
    answer: 'Root block.\n\nRoot sibling.',
  });
  const result = askDeeper(workspace, workspace.blocks[0].id, 'Why?', {
    makeId,
    answer: 'Branch answer block.\n\nSecond branch answer block.',
  });
  const branchAssistant = result.workspace.messages.find((message) => (
    message.branchId === result.branch.id && message.role === 'assistant'
  ));
  const branchBlocks = result.workspace.blocks.filter((block) => block.messageId === branchAssistant.id);

  assert.equal(branchBlocks.length, 2);
  assert.equal(branchBlocks[0].parentBlockId, workspace.blocks[0].id);
});

test('appendBranchAnswer uses server-provided branch answer', () => {
  const makeId = createTestIdFactory();
  const workspace = createWorkspace('Plan the product', {
    makeId,
    answer: 'Root block.\n\nRoot sibling.',
  });
  const result = appendBranchAnswer(workspace, workspace.blocks[0].id, 'Why?', 'Server branch answer.', { makeId });

  assert.match(result.workspace.messages.at(-1).content, /Server branch answer/);
});

test('appendSelectionBranchAnswer creates a branch from selected text', () => {
  const makeId = createTestIdFactory();
  const workspace = createWorkspace('Explain transformers', {
    makeId,
    answer: 'Self-Attention uses Query, Key, and Value vectors.',
  });
  const result = appendSelectionBranchAnswer(
    workspace,
    workspace.blocks[0].id,
    'Query, Key, and Value',
    'Explain this phrase.',
    'QKV explanation.',
    { makeId },
  );
  const source = result.workspace.blocks.find((block) => block.id === result.branch.sourceBlockId);

  assert.equal(source.sourceKind, 'text-selection');
  assert.equal(source.parentBlockId, workspace.blocks[0].id);
  assert.equal(source.content, 'Query, Key, and Value');
  assert.equal(result.workspace.branches.length, 1);
  assert.match(result.workspace.messages.at(-1).content, /QKV explanation/);
});

test('appendSelectionBranchAnswer keeps root text selections at depth 1 even when another branch is active', () => {
  const makeId = createTestIdFactory();
  let workspace = createWorkspace('Explain transformers', {
    makeId,
    answer: 'Root first block.\n\nRoot second block with Query details.',
  });
  workspace = appendBranchAnswer(
    workspace,
    workspace.blocks[0].id,
    'Open a different root branch.',
    'Different branch answer.',
    { makeId },
  ).workspace;
  const activeBranchId = workspace.activeBranchId;
  const result = appendSelectionBranchAnswer(
    workspace,
    workspace.blocks[1].id,
    'Query details',
    'Explain this root selection.',
    'Root selection branch answer.',
    { makeId, parentBranchId: activeBranchId, sourceRange: { start: 23, end: 36 } },
  );

  assert.equal(result.branch.depth, 1);
  assert.equal(result.branch.parentBranchId, undefined);
});

test('appendSelectionBranchAnswer nests text selections from branch answers under that branch', () => {
  const makeId = createTestIdFactory();
  let workspace = createWorkspace('Explain transformers', {
    makeId,
    answer: 'Root block.',
  });
  const rootBranchResult = appendBranchAnswer(
    workspace,
    workspace.blocks[0].id,
    'Open root branch.',
    'Branch answer with Query details.',
    { makeId },
  );
  workspace = rootBranchResult.workspace;
  const branchAnswerBlock = workspace.blocks.find((block) => block.parentBlockId === workspace.blocks[0].id);
  const result = appendSelectionBranchAnswer(
    workspace,
    branchAnswerBlock.id,
    'Query details',
    'Explain branch answer selection.',
    'Nested selection answer.',
    { makeId },
  );

  assert.equal(result.branch.depth, 2);
  assert.equal(result.branch.parentBranchId, rootBranchResult.branch.id);
});

test('block edits can split and merge inside a workspace', () => {
  const makeId = createTestIdFactory();
  let workspace = createWorkspace('Plan the product', {
    makeId,
    answer: 'First block has enough words.\n\nSecond block.',
  });
  workspace = splitWorkspaceBlock(workspace, workspace.blocks[0].id, 12, { makeId });
  assert.equal(workspace.blocks.length, 3);

  workspace = mergeWorkspaceBlocks(workspace, [workspace.blocks[0].id, workspace.blocks[1].id]);
  assert.equal(workspace.blocks.length, 2);
});

test('mergeWorkspaceBlocks reparents child branches and selected-text branches', () => {
  const makeId = createTestIdFactory();
  let workspace = createWorkspace('Explain attention', {
    makeId,
    answer: 'First block mentions query.\n\nSecond block mentions key and value.\n\nThird block stays separate.',
  });
  const firstBlockId = workspace.blocks[0].id;
  const secondBlockId = workspace.blocks[1].id;

  workspace = appendBranchAnswer(workspace, firstBlockId, 'Follow first?', 'First branch answer.', { makeId }).workspace;
  workspace = appendBranchAnswer(workspace, secondBlockId, 'Follow second?', 'Second branch answer.', { makeId }).workspace;
  workspace = appendSelectionBranchAnswer(
    workspace,
    secondBlockId,
    'key and value',
    'Explain selected text.',
    'Selection branch answer.',
    { makeId, sourceRange: { start: 22, end: 35 } },
  ).workspace;

  workspace = mergeWorkspaceBlocks(workspace, [firstBlockId, secondBlockId]);
  const mergedBlock = workspace.blocks.find((block) => block.id === firstBlockId);
  const removedBlock = workspace.blocks.find((block) => block.id === secondBlockId);
  const directBranches = workspace.branches.filter((branch) => branch.sourceBlockId === firstBlockId);
  const selectionSource = workspace.blocks.find((block) => block.sourceKind === 'text-selection');

  assert.equal(removedBlock, undefined);
  assert.match(mergedBlock.content, /First block mentions query/);
  assert.match(mergedBlock.content, /Second block mentions key and value/);
  assert.equal(directBranches.length, 2);
  assert.equal(selectionSource.parentBlockId, firstBlockId);
  assert.deepEqual(selectionSource.sourceRange, { start: 51, end: 64 });
  assert.equal(workspace.branches.some((branch) => branch.sourceBlockId === secondBlockId), false);
});

test('synthesizeWorkspace writes a summary', () => {
  const workspace = createWorkspace('Plan the product', {
    makeId: createTestIdFactory(),
    answer: 'First block.\n\nSecond block.',
  });
  const synthesized = synthesizeWorkspace(workspace);

  assert.match(synthesized.synthesis, /Synthesis for: Plan the product/);
});

test('createDemoWorkspace creates varied depth 2 to 5 branch paths', () => {
  const workspace = createDemoWorkspace({ makeId: createTestIdFactory() });
  const depths = new Set(workspace.branches.map((branch) => branch.depth));
  const serializedBlocks = workspace.blocks.map((block) => block.content).join('\n\n');

  assert.ok(workspace.branches.length >= 10);
  assert.equal(Math.max(...workspace.branches.map((branch) => branch.depth)), 5);
  assert.ok(depths.has(2));
  assert.ok(depths.has(3));
  assert.ok(depths.has(4));
  assert.ok(depths.has(5));
  assert.equal(workspace.branches.find((branch) => branch.id === workspace.activeBranchId).depth, 5);
  assert.match(serializedBlocks, /\$\$Attention\(Q, K, V\)/);
  assert.match(serializedBlocks, /```js/);
  assert.match(serializedBlocks, /```python/);
  assert.match(serializedBlocks, /softmax는 여러 후보/);
});
