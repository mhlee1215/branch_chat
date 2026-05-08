import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBranchContext, createSynthesisInput } from '../src/domain/context-builder.js';
import { createWorkspace } from '../src/domain/workspace-store.js';
import { createTestIdFactory } from '../src/utils/ids.js';

test('buildBranchContext includes selected block and excludes sibling blocks by default', () => {
  const workspace = createWorkspace('Original question', {
    makeId: createTestIdFactory(),
    answer: 'Selected block content.\n\nSibling block should stay out.',
  });
  const branch = {
    id: 'branch-1',
    conversationId: workspace.conversationId,
    sourceBlockId: workspace.blocks[0].id,
    title: 'Selected',
    depth: 1,
    columnOrder: 1,
    isOpen: true,
  };
  const context = buildBranchContext({ ...workspace, branches: [branch] }, branch.id, 'Follow up?');
  const serialized = context.map((item) => item.content).join('\n');

  assert.match(serialized, /Original question/);
  assert.match(serialized, /Selected block content/);
  assert.doesNotMatch(serialized, /Sibling block should stay out/);
  assert.match(serialized, /Follow up\?/);
});

test('parent-answer mode includes sibling blocks when explicitly requested', () => {
  const workspace = createWorkspace('Original question', {
    makeId: createTestIdFactory(),
    answer: 'Selected block content.\n\nSibling block included.',
  });
  const branch = {
    id: 'branch-1',
    conversationId: workspace.conversationId,
    sourceBlockId: workspace.blocks[0].id,
    title: 'Selected',
    depth: 1,
    columnOrder: 1,
    isOpen: true,
  };
  const context = buildBranchContext({ ...workspace, branches: [branch] }, branch.id, 'Follow up?', { mode: 'parent-answer' });
  const serialized = context.map((item) => item.content).join('\n');

  assert.match(serialized, /Sibling block included/);
});

test('createSynthesisInput includes selected blocks and open branches', () => {
  const workspace = createWorkspace('Original question', {
    makeId: createTestIdFactory(),
    answer: 'First block.\n\nSecond block.',
  });
  const input = createSynthesisInput({
    ...workspace,
    blocks: [
      { ...workspace.blocks[0], includeInSummary: true },
      { ...workspace.blocks[1], includeInSummary: false },
    ],
    branches: [
      { id: 'open', conversationId: workspace.conversationId, sourceBlockId: workspace.blocks[0].id, title: 'Open', depth: 1, columnOrder: 1, isOpen: true },
      { id: 'closed', conversationId: workspace.conversationId, sourceBlockId: workspace.blocks[1].id, title: 'Closed', depth: 1, columnOrder: 2, isOpen: false },
    ],
  });

  assert.equal(input.blocks.length, 1);
  assert.equal(input.branches.length, 1);
});
