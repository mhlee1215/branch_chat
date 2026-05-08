import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResponsesRequest,
  callOpenAIResponses,
  describeIntegrationMode,
  extractResponseText,
} from '../src/domain/openai-provider.js';

test('buildResponsesRequest converts focused context into Responses API input', () => {
  const request = buildResponsesRequest([
    { role: 'system', content: 'Be focused.' },
    { role: 'user', content: 'Original question' },
    { role: 'assistant', content: 'Selected block' },
  ], { model: 'gpt-test' });

  assert.equal(request.model, 'gpt-test');
  assert.equal(request.input[0].role, 'developer');
  assert.equal(request.input[1].content, 'Original question');
  assert.match(request.instructions, /branching chat UI/);
});

test('extractResponseText supports output_text and structured output', () => {
  assert.equal(extractResponseText({ output_text: 'Hello' }), 'Hello');
  assert.equal(extractResponseText({
    output: [
      { content: [{ text: 'Hello' }, { text: ' world' }] },
    ],
  }), 'Hello\n world');
});

test('describeIntegrationMode documents standalone and ChatGPT app paths', () => {
  const modes = describeIntegrationMode();

  assert.match(modes.standaloneApp, /backend proxy/);
  assert.match(modes.chatgptApp, /Apps SDK/);
});

test('callOpenAIResponses requires server-side API key', async () => {
  await assert.rejects(() => callOpenAIResponses([{ role: 'user', content: 'Hello' }]), /OPENAI_API_KEY/);
});
