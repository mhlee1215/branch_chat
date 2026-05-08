import { segmentAnswer } from './block-editor.js';

export function generateInitialAnswer(question) {
  const subject = question.trim() || 'your message';
  return [
    `Direct answer. Here is a concise response to: ${subject}`,
    'Key detail. This answer is divided into blocks so each idea can be explored independently.',
    'Branching option. Use Ask on any block to continue with only that block as focused context.',
    'Wrap-up. When several branches are complete, use synthesis to combine the useful conclusions.',
  ].join('\n\n');
}

export function generateBranchAnswer(sourceBlock, question) {
  return [
    `Focused answer for "${sourceBlock.title}".`,
    `Your question was: ${question}`,
    'The useful next step is to inspect the assumption inside this block, decide what evidence is needed, and record the conclusion so it can feed the final synthesis.',
  ].join(' ');
}

export function generateSynthesis(input) {
  const blockTitles = input.blocks.map((block) => block.title).join(', ') || 'no selected blocks';
  const branchCount = input.branches.length;
  return [
    `Synthesis for: ${input.originalQuestion}`,
    '',
    `Included blocks: ${blockTitles}.`,
    `Open branches reviewed: ${branchCount}.`,
    '',
    'Current takeaway: keep each branch focused, then merge only the conclusions that remain useful after exploration.',
  ].join('\n');
}

export function answerAndSegment(question, options = {}) {
  const answer = generateInitialAnswer(question);
  return {
    answer,
    blocks: segmentAnswer(answer, options),
  };
}
