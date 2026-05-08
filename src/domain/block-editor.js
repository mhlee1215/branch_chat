import { createId } from '../utils/ids.js';

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function guessBlockType(text) {
  const lowered = text.toLowerCase();
  if (lowered.includes('method') || lowered.includes('approach') || lowered.includes('procedure')) return 'method';
  if (lowered.includes('result') || lowered.includes('finding') || lowered.includes('outcome')) return 'result';
  if (lowered.includes('evidence') || lowered.includes('because') || lowered.includes('shows')) return 'evidence';
  if (lowered.includes('define') || lowered.includes('means') || lowered.includes('is called')) return 'definition';
  if (text.trim().endsWith('?')) return 'question';
  return 'claim';
}

function titleFromContent(content, fallback) {
  const firstSentence = normalizeWhitespace(content).split(/[.!?]/)[0] || fallback;
  const words = firstSentence.split(' ').filter(Boolean).slice(0, 7).join(' ');
  return words || fallback;
}

export function segmentAnswer(content, options = {}) {
  const makeId = options.makeId || createId;
  const messageId = options.messageId || makeId('message');
  const paragraphs = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const parts = paragraphs.length === 1 && paragraphs[0].length > 420
    ? paragraphs[0].split(/(?<=\.)\s+(?=[A-Z0-9])/).map((part) => part.trim()).filter(Boolean)
    : paragraphs;

  return parts.map((part, index) => ({
    id: makeId('block'),
    messageId,
    index,
    title: titleFromContent(part, `Block ${index + 1}`),
    content: part,
    blockType: guessBlockType(part),
    includeInSummary: true,
  }));
}

export function splitBlock(blocks, blockId, splitAt, options = {}) {
  const makeId = options.makeId || createId;
  const targetIndex = blocks.findIndex((block) => block.id === blockId);
  if (targetIndex === -1) throw new Error(`Block not found: ${blockId}`);

  const target = blocks[targetIndex];
  if (splitAt <= 0 || splitAt >= target.content.length) {
    throw new Error('splitAt must be inside the block content.');
  }

  const first = target.content.slice(0, splitAt).trim();
  const second = target.content.slice(splitAt).trim();
  if (!first || !second) throw new Error('Split would create an empty block.');

  return reindex([
    ...blocks.slice(0, targetIndex),
    { ...target, content: first, title: titleFromContent(first, target.title) },
    {
      ...target,
      id: makeId('block'),
      content: second,
      title: titleFromContent(second, `${target.title} continued`),
    },
    ...blocks.slice(targetIndex + 1),
  ]);
}

export function splitBlockRange(blocks, blockId, start, end, options = {}) {
  const makeId = options.makeId || createId;
  const targetIndex = blocks.findIndex((block) => block.id === blockId);
  if (targetIndex === -1) throw new Error(`Block not found: ${blockId}`);

  const target = blocks[targetIndex];
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(target.content.length, Math.max(start, end));
  if (from === to) throw new Error('Selection range cannot be empty.');

  const parts = [
    target.content.slice(0, from).trim(),
    target.content.slice(from, to).trim(),
    target.content.slice(to).trim(),
  ].filter(Boolean);
  if (parts.length < 2) throw new Error('Selection must split the block into at least two parts.');

  const replacement = parts.map((content, index) => ({
    ...target,
    id: index === 0 ? target.id : makeId('block'),
    title: titleFromContent(content, target.title),
    content,
  }));

  return reindex([...blocks.slice(0, targetIndex), ...replacement, ...blocks.slice(targetIndex + 1)]);
}

export function mergeBlocks(blocks, blockIds) {
  if (blockIds.length < 2) throw new Error('At least two blocks are required to merge.');
  const selected = blocks.filter((block) => blockIds.includes(block.id)).sort((a, b) => a.index - b.index);
  if (selected.length !== blockIds.length) throw new Error('One or more blocks were not found.');
  if (new Set(selected.map((block) => block.messageId)).size !== 1) {
    throw new Error('Only blocks from the same assistant answer can be merged.');
  }

  for (let index = 1; index < selected.length; index += 1) {
    if (selected[index].index !== selected[index - 1].index + 1) {
      throw new Error('Only adjacent blocks can be merged.');
    }
  }

  const merged = {
    ...selected[0],
    title: selected.map((block) => block.title).join(' + '),
    content: selected.map((block) => block.content).join('\n\n'),
    includeInSummary: selected.some((block) => block.includeInSummary),
  };

  const selectedIds = new Set(blockIds);
  const nextBlocks = [];
  for (const block of blocks) {
    if (block.id === selected[0].id) nextBlocks.push(merged);
    else if (!selectedIds.has(block.id)) nextBlocks.push(block);
  }
  return reindex(nextBlocks);
}

export function renameBlock(blocks, blockId, title) {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error('Block title cannot be empty.');
  return blocks.map((block) => (block.id === blockId ? { ...block, title: cleanTitle } : block));
}

export function setBlockSummaryInclusion(blocks, blockId, includeInSummary) {
  return blocks.map((block) => (block.id === blockId ? { ...block, includeInSummary } : block));
}

export function reindex(blocks) {
  const counters = new Map();
  return blocks.map((block) => {
    const nextIndex = counters.get(block.messageId) || 0;
    counters.set(block.messageId, nextIndex + 1);
    return { ...block, index: nextIndex };
  });
}
