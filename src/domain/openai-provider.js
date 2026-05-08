export const defaultOpenAIModel = 'gpt-5.4-mini';

export function buildResponsesRequest(context, options = {}) {
  return {
    model: options.model || defaultOpenAIModel,
    instructions: options.instructions || [
      'You are the assistant inside a branching chat UI.',
      'Answer naturally like a normal chatbot.',
      'Use the provided focused context only unless the user asks to broaden scope.',
      'Structure the response into clear paragraphs that can become independent blocks.',
    ].join(' '),
    input: context.map((item) => ({
      role: item.role === 'system' ? 'developer' : item.role,
      content: item.content,
    })),
  };
}

export async function callOpenAIResponses(context, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required.');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildResponsesRequest(context, options)),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI request failed with ${response.status}`;
    throw new Error(message);
  }

  return extractResponseText(payload);
}

export function extractResponseText(responsePayload) {
  if (typeof responsePayload?.output_text === 'string') return responsePayload.output_text;
  const output = responsePayload?.output || [];
  return output
    .flatMap((item) => item.content || [])
    .map((content) => content.text || '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function describeIntegrationMode() {
  return {
    standaloneApp: 'Use the OpenAI Responses API from a backend proxy. Do not expose API keys in the browser.',
    chatgptApp: 'Use the OpenAI Apps SDK if this UI should run inside ChatGPT as an app.',
  };
}
