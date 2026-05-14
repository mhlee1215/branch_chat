import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPaperInput,
  buildPaperTools,
  extractCitationsFromResponse,
  shouldUseWebSearch,
} from '../src/domain/paper-assistant.js';

test('buildPaperTools uses file search for paper-only mode', () => {
  assert.deepEqual(buildPaperTools('paper_only', 'vs_123'), [
    { type: 'file_search', vector_store_ids: ['vs_123'] },
  ]);
});

test('buildPaperTools adds web search only when mode allows it', () => {
  assert.equal(shouldUseWebSearch('paper_only', 'latest repo?'), false);
  assert.equal(shouldUseWebSearch('paper_plus_web', 'related work'), true);
  assert.equal(shouldUseWebSearch('implementation_mode', 'official GitHub implementation'), true);
  assert.equal(shouldUseWebSearch('review_mode', 'latest critique'), false);

  assert.deepEqual(buildPaperTools('paper_plus_web', 'vs_123'), [
    { type: 'file_search', vector_store_ids: ['vs_123'] },
    { type: 'web_search' },
  ]);
});

test('buildPaperInput includes runtime context without losing chat history', () => {
  const input = buildPaperInput({
    question: 'What is the contribution?',
    mode: 'paper_only',
    paperTitle: 'Attention Is All You Need',
    selectedText: 'Scaled dot-product attention',
    currentPage: 3,
    chatHistory: [{ role: 'assistant', content: 'Earlier answer' }],
  });

  assert.equal(input[0].role, 'assistant');
  assert.match(input[1].content, /Paper title: Attention Is All You Need/);
  assert.match(input[1].content, /Selected text: Scaled dot-product attention/);
  assert.match(input[1].content, /User question:\nWhat is the contribution\?/);
});

test('extractCitationsFromResponse preserves nested annotations', () => {
  const citations = extractCitationsFromResponse({
    output: [
      {
        content: [
          {
            text: 'Answer',
            annotations: [{ type: 'file_citation', file_id: 'file_123' }],
          },
        ],
      },
    ],
  });

  assert.deepEqual(citations, [{ type: 'file_citation', file_id: 'file_123' }]);
});
