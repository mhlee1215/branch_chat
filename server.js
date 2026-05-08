import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { segmentAnswer } from './src/domain/block-editor.js';
import { buildResponsesRequest, callOpenAIResponses, defaultOpenAIModel } from './src/domain/openai-provider.js';

const port = Number(process.env.PORT || 4173);
const root = resolve('.');
const runtimeSettings = {
  openaiApiKey: '',
  openaiModel: '',
};
loadEnv();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function resolveRequestPath(url) {
  const parsedUrl = new URL(url, `http://localhost:${port}`);
  const pathname = parsedUrl.pathname === '/'
    ? '/app/index.html'
    : parsedUrl.pathname === '/demo'
      ? '/app/demo.html'
      : parsedUrl.pathname;
  const filePath = normalize(join(root, pathname));
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

createServer(async (request, response) => {
  if (request.url?.startsWith('/api/')) {
    await handleApi(request, response);
    return;
  }

  const filePath = resolveRequestPath(request.url || '/');
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Branching Chat GUI running at http://localhost:${port}`);
  console.log(`OpenAI provider: ${process.env.OPENAI_API_KEY ? 'configured' : 'mock fallback'}`);
});

async function handleApi(request, response) {
  try {
    if (request.method === 'GET' && request.url === '/api/config') {
      sendJson(response, 200, {
        openaiConfigured: Boolean(getOpenAIKey()),
        model: getOpenAIModel(),
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/settings') {
      const body = await readJson(request);
      updateSettings(body);
      sendJson(response, 200, {
        openaiConfigured: Boolean(getOpenAIKey()),
        model: getOpenAIModel(),
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/assistant/respond') {
      const body = await readJson(request);
      const context = Array.isArray(body.context) ? body.context : [];
      const apiKey = getOpenAIKey();
      const content = apiKey
        ? await callOpenAIResponses(context, {
          apiKey,
          model: getOpenAIModel(),
        })
        : mockResponse(context);
      sendJson(response, 200, {
        message: { role: 'assistant', content },
        blocks: segmentAnswer(content, { messageId: body.messageId || 'preview-message' }),
        provider: apiKey ? 'openai' : 'mock',
        requestPreview: buildResponsesRequest(context, { model: getOpenAIModel() }),
      });
      return;
    }

    sendJson(response, 404, { error: 'API route not found.' });
  } catch (error) {
    sendJson(response, 500, { error: error.message || 'Unexpected server error.' });
  }
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function mockResponse(context) {
  const lastUserMessage = [...context].reverse().find((item) => item.role === 'user')?.content || 'your message';
  return [
    `Mock response. I received: ${lastUserMessage}`,
    '',
    'This local response is being used because OPENAI_API_KEY is not configured.',
    '',
    'Once the key is added on the server, this same UI will call the OpenAI Responses API through /api/assistant/respond.',
  ].join('\n');
}

function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function getOpenAIKey() {
  return runtimeSettings.openaiApiKey || process.env.OPENAI_API_KEY || '';
}

function getOpenAIModel() {
  return runtimeSettings.openaiModel || process.env.OPENAI_MODEL || defaultOpenAIModel;
}

function updateSettings(body) {
  if (typeof body.openaiApiKey === 'string' && body.openaiApiKey.trim()) {
    runtimeSettings.openaiApiKey = body.openaiApiKey.trim();
  }
  if (typeof body.model === 'string' && body.model.trim()) {
    runtimeSettings.openaiModel = body.model.trim();
  }
  if (body.persist === true) {
    const envContent = [
      `OPENAI_API_KEY=${runtimeSettings.openaiApiKey || process.env.OPENAI_API_KEY || ''}`,
      `OPENAI_MODEL=${getOpenAIModel()}`,
      '',
    ].join('\n');
    writeFileSync(join(root, '.env'), envContent, 'utf8');
  }
}
