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

export async function uploadPaper(file, options = {}) {
  const form = new FormData();
  form.set('file', file);
  if (options.projectId) form.set('projectId', options.projectId);
  if (options.title) form.set('title', options.title);

  const response = await fetch('/api/papers/upload', {
    method: 'POST',
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Paper upload failed.');
  return payload;
}

export async function askPaperQuestion(question, paper, options = {}) {
  const response = await fetch('/api/chat/paper', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question,
      paperId: paper.paperId,
      mode: options.mode || 'paper_only',
      paperTitle: paper.title,
      selectedText: options.selectedText,
      currentPage: options.currentPage,
      chatHistory: options.chatHistory,
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Paper question failed.');
  return payload;
}
