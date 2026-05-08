export async function fetchRuntimeConfig() {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Failed to load runtime config.');
  return response.json();
}

export async function requestAssistantResponse(context, options = {}) {
  const response = await fetch('/api/assistant/respond', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      context,
      messageId: options.messageId,
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Assistant request failed.');
  return payload;
}

export async function saveRuntimeSettings(settings) {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(settings),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Failed to save settings.');
  return payload;
}
