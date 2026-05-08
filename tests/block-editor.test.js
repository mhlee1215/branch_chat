import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBlocks, renameBlock, segmentAnswer, splitBlock, splitBlockRange } from '../src/domain/block-editor.js';
import { createTestIdFactory } from '../src/utils/ids.js';

test('segmentAnswer creates ordered blocks from paragraphs', () => {
  const makeId = createTestIdFactory();
  const blocks = segmentAnswer('First claim.\n\nMethod details.\n\nResult finding.', { makeId, messageId: 'message-1' });

  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks.map((block) => block.index), [0, 1, 2]);
  assert.equal(blocks[1].blockType, 'method');
  assert.equal(blocks[2].includeInSummary, true);
});

test('splitBlock splits one block and reindexes the result', () => {
  const blocks = segmentAnswer('A long enough block for splitting.\n\nSecond block.', {
    makeId: createTestIdFactory(),
    messageId: 'message-1',
  });
  const nextBlocks = splitBlock(blocks, blocks[0].id, 14, { makeId: createTestIdFactory() });

  assert.equal(nextBlocks.length, 3);
  assert.deepEqual(nextBlocks.map((block) => block.index), [0, 1, 2]);
  assert.match(nextBlocks[0].content, /A long enough/);
});

test('splitBlockRange creates three blocks for a middle selection', () => {
  const blocks = segmentAnswer('The quick brown fox jumps.', {
    makeId: createTestIdFactory(),
    messageId: 'message-1',
  });
  const nextBlocks = splitBlockRange(blocks, blocks[0].id, 4, 15, { makeId: createTestIdFactory() });

  assert.equal(nextBlocks.length, 3);
  assert.deepEqual(nextBlocks.map((block) => block.content), ['The', 'quick brown', 'fox jumps.']);
});

test('mergeBlocks only merges adjacent blocks in order', () => {
  const blocks = segmentAnswer('First block.\n\nSecond block.\n\nThird block.', {
    makeId: createTestIdFactory(),
    messageId: 'message-1',
  });
  const merged = mergeBlocks(blocks, [blocks[0].id, blocks[1].id]);

  assert.equal(merged.length, 2);
  assert.match(merged[0].content, /First block\.\n\nSecond block\./);
  assert.deepEqual(merged.map((block) => block.index), [0, 1]);
});

test('mergeBlocks rejects blocks from different assistant answers', () => {
  const makeId = createTestIdFactory();
  const first = segmentAnswer('First block.', { makeId, messageId: 'message-1' });
  const second = segmentAnswer('Second block.', { makeId, messageId: 'message-2' });

  assert.throws(() => mergeBlocks([...first, ...second], [first[0].id, second[0].id]), /same assistant answer/);
});

test('renameBlock trims and updates only the target block', () => {
  const blocks = segmentAnswer('First block.\n\nSecond block.', {
    makeId: createTestIdFactory(),
    messageId: 'message-1',
  });
  const renamed = renameBlock(blocks, blocks[1].id, '  Better title  ');

  assert.equal(renamed[1].title, 'Better title');
  assert.equal(renamed[0].title, blocks[0].title);
});
