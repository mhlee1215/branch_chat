import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createId } from '../utils/ids.js';
import { defaultOpenAIModel, extractResponseText } from './openai-provider.js';

const OPENAI_API_BASE = 'https://api.openai.com/v1';
const DEFAULT_STORE_PATH = join(process.cwd(), '.branching-chat', 'paper-store.json');
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const paperAssistantSystemInstructions = [
  'You are a careful research paper reading assistant.',
  'Answer in Korean unless the user asks otherwise.',
  'Preserve important technical phrases from the paper in English inside quotation marks.',
  'Use the uploaded paper as the primary source of truth.',
  'If the paper does not support an answer, say so clearly.',
  'Do not fabricate equations, datasets, baselines, metrics, ablations, citations, author claims, or implementation details.',
  'When using file search, cite the relevant paper evidence when possible.',
  'When using web search, clearly label it as external information and cite sources.',
  'Separate what the paper says from your interpretation.',
  'Prefer compact Korean headings and bullets.',
].join('\n');

export function createPaperAssistant({ apiKey, model, storePath = DEFAULT_STORE_PATH } = {}) {
  return new PaperAssistant({ apiKey, model, storePath });
}

export class PaperAssistant {
  constructor({ apiKey, model = defaultOpenAIModel, storePath = DEFAULT_STORE_PATH } = {}) {
    this.apiKey = apiKey || '';
    this.model = model || defaultOpenAIModel;
    this.store = new PaperStore(storePath);
  }

  async createOrGetProjectVectorStore(projectId) {
    if (!projectId) throw new Error('projectId is required.');
    const existing = this.store.findProject(projectId);
    if (existing?.vectorStoreId) return existing.vectorStoreId;

    const vectorStore = await this.createVectorStore(`branch-chat-project-${projectId}`);
    const project = {
      id: projectId,
      name: projectId,
      vectorStoreId: vectorStore.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.store.upsertProject(project);
    return vectorStore.id;
  }

  async uploadPaperToOpenAI({ fileBuffer, originalName, projectId, title }) {
    if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      throw httpError(400, 'PDF file is required.');
    }
    if (fileBuffer.length > MAX_UPLOAD_BYTES) {
      throw httpError(400, 'PDF must be 50MB or smaller.');
    }
    if (!isPdfName(originalName)) {
      throw httpError(400, 'Only PDF files are supported.');
    }

    const vectorStoreId = projectId
      ? await this.createOrGetProjectVectorStore(projectId)
      : (await this.createVectorStore(`branch-chat-paper-${safeFileTitle(originalName)}`)).id;
    const openaiFile = await this.uploadFile(fileBuffer, originalName);
    const vectorStoreFile = await this.attachFileToVectorStore(vectorStoreId, openaiFile.id);
    await this.waitForVectorStoreFile(vectorStoreId, openaiFile.id);

    const paper = {
      id: createId('paper'),
      projectId: projectId || null,
      title: title || safeFileTitle(originalName),
      originalName: basename(originalName),
      localPath: null,
      openaiFileId: openaiFile.id,
      vectorStoreId,
      vectorStoreFileId: vectorStoreFile.id || openaiFile.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.store.upsertPaper(paper);
    return paper;
  }

  async askPaperQuestion({
    question,
    paperId,
    projectId,
    mode = 'paper_only',
    selectedText,
    currentPage,
    paperTitle,
    chatHistory = [],
  }) {
    if (!question?.trim()) throw httpError(400, 'Question is required.');
    const target = this.resolveTarget({ paperId, projectId });
    if (!target.vectorStoreId) {
      throw httpError(500, 'No vector store found for this paper or project.');
    }

    const sessionId = createId('session');
    const userMessage = {
      id: createId('message'),
      sessionId,
      role: 'user',
      content: question.trim(),
      createdAt: nowIso(),
    };
    this.store.appendMessage(userMessage);

    const response = await this.createPaperResponse({
      question: question.trim(),
      vectorStoreId: target.vectorStoreId,
      mode,
      selectedText,
      currentPage,
      paperTitle: paperTitle || target.title,
      chatHistory,
    });

    const text = extractResponseText(response)
      || '답변을 생성하지 못했습니다. 질문을 조금 더 구체적으로 바꿔주세요.';
    const citations = extractCitationsFromResponse(response);
    this.store.appendMessage({
      id: createId('message'),
      sessionId,
      role: 'assistant',
      content: text,
      rawResponse: response,
      citations,
      createdAt: nowIso(),
    });

    return {
      text,
      citations,
      rawResponse: response,
      sessionId,
    };
  }

  resolveTarget({ paperId, projectId }) {
    if (projectId) {
      const project = this.store.findProject(projectId);
      if (project?.vectorStoreId) return project;
    }
    if (paperId) {
      const paper = this.store.findPaper(paperId);
      if (paper?.vectorStoreId) return paper;
    }
    throw httpError(404, 'Paper or project was not found.');
  }

  async createVectorStore(name) {
    return this.openAIJson('/vector_stores', {
      method: 'POST',
      body: { name },
    });
  }

  async uploadFile(fileBuffer, originalName) {
    const form = new FormData();
    form.set('purpose', 'assistants');
    form.set('file', new Blob([fileBuffer], { type: 'application/pdf' }), basename(originalName));
    return this.openAIForm('/files', form);
  }

  async attachFileToVectorStore(vectorStoreId, fileId) {
    return this.openAIJson(`/vector_stores/${encodeURIComponent(vectorStoreId)}/files`, {
      method: 'POST',
      body: { file_id: fileId },
    });
  }

  async waitForVectorStoreFile(vectorStoreId, fileId, options = {}) {
    const maxAttempts = options.maxAttempts || 30;
    const delayMs = options.delayMs || 900;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const file = await this.openAIJson(
        `/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`,
      );
      if (file.status === 'completed') return file;
      if (['failed', 'cancelled'].includes(file.status)) {
        throw httpError(502, `OpenAI vector store indexing ${file.status}.`);
      }
      await delay(delayMs);
    }
    throw httpError(502, 'OpenAI vector store indexing timed out.');
  }

  async createPaperResponse(params) {
    const tools = buildPaperTools(params.mode, params.vectorStoreId, params.question);
    return this.openAIJson('/responses', {
      method: 'POST',
      body: {
        model: this.model,
        instructions: paperAssistantSystemInstructions,
        tools,
        input: buildPaperInput(params),
      },
    });
  }

  async openAIJson(path, { method = 'GET', body } = {}) {
    this.assertApiKey();
    const response = await fetch(`${OPENAI_API_BASE}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return parseOpenAIResponse(response);
  }

  async openAIForm(path, form) {
    this.assertApiKey();
    const response = await fetch(`${OPENAI_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
      },
      body: form,
    });
    return parseOpenAIResponse(response);
  }

  assertApiKey() {
    if (!this.apiKey) throw httpError(500, 'OPENAI_API_KEY is required.');
  }
}

export function buildPaperInput({
  question,
  mode = 'paper_only',
  selectedText,
  currentPage,
  paperTitle,
  chatHistory = [],
}) {
  const context = [
    'Current app context:',
    `- Paper title: ${paperTitle || 'Unknown'}`,
    `- Current page: ${currentPage || 'Unknown'}`,
    `- Selected text: ${selectedText || 'None'}`,
    `- Mode: ${mode}`,
    '',
    'Mode behavior:',
    '- paper_only: Use the uploaded paper only. Do not use web search.',
    '- paper_plus_web: Use the uploaded paper first, then web search for external context.',
    '- implementation_mode: Focus on reproducibility and engineering details. Use web search only for official code, project pages, or missing implementation details.',
    '- review_mode: Be critical but fair. Use the uploaded paper only unless web search is explicitly requested.',
    '',
    `User question:\n${question}`,
  ].join('\n');

  return [
    ...chatHistory.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.content || ''),
    })),
    { role: 'user', content: context },
  ];
}

export function buildPaperTools(mode, vectorStoreId, question = '') {
  const tools = [
    {
      type: 'file_search',
      vector_store_ids: [vectorStoreId],
    },
  ];
  if (shouldUseWebSearch(mode, question)) {
    tools.push({ type: 'web_search' });
  }
  return tools;
}

export function shouldUseWebSearch(mode, question = '') {
  if (mode === 'paper_plus_web') return true;
  if (mode === 'review_mode' || mode === 'paper_only') return false;
  if (mode !== 'implementation_mode') return false;
  return /official|github|repo|repository|project page|implementation|package|library|최신|구현|공식|깃허브|저장소/i.test(question);
}

export function extractCitationsFromResponse(response) {
  const citations = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (Array.isArray(value.annotations)) {
      citations.push(...value.annotations);
    }
    Object.values(value).forEach(visit);
  };
  visit(response?.output);
  return citations;
}

async function parseOpenAIResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI request failed with ${response.status}`;
    throw httpError(502, 'OpenAI API request failed.', message);
  }
  return payload;
}

export class PaperStore {
  constructor(storePath = DEFAULT_STORE_PATH) {
    this.storePath = storePath;
  }

  read() {
    if (!existsSync(this.storePath)) {
      return { papers: [], projects: [], messages: [] };
    }
    try {
      return JSON.parse(readFileSync(this.storePath, 'utf8'));
    } catch {
      return { papers: [], projects: [], messages: [] };
    }
  }

  write(data) {
    mkdirSync(join(this.storePath, '..'), { recursive: true });
    writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf8');
  }

  findPaper(id) {
    return this.read().papers.find((paper) => paper.id === id);
  }

  findProject(id) {
    return this.read().projects.find((project) => project.id === id);
  }

  upsertPaper(paper) {
    const data = this.read();
    const index = data.papers.findIndex((item) => item.id === paper.id);
    if (index === -1) data.papers.push(paper);
    else data.papers[index] = { ...data.papers[index], ...paper, updatedAt: nowIso() };
    this.write(data);
  }

  upsertProject(project) {
    const data = this.read();
    const index = data.projects.findIndex((item) => item.id === project.id);
    if (index === -1) data.projects.push(project);
    else data.projects[index] = { ...data.projects[index], ...project, updatedAt: nowIso() };
    this.write(data);
  }

  appendMessage(message) {
    const data = this.read();
    data.messages.push(message);
    this.write(data);
  }
}

function isPdfName(name = '') {
  return /\.pdf$/i.test(name);
}

function safeFileTitle(name = '') {
  return basename(name).replace(/\.pdf$/i, '').replace(/[^\w .()[\]-]+/g, ' ').trim() || 'paper';
}

function nowIso() {
  return new Date().toISOString();
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function httpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
}
