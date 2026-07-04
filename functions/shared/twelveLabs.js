'use strict';

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const secretsClient = new SecretsManagerClient({});

let cachedApiKey;

// NOTE: endpoint paths/payload shapes below follow TwelveLabs' documented v1.3
// Tasks/Analyze/Search API shape at the time this was written. Confirm against
// the current TwelveLabs API docs before relying on this in production - SaaS
// API contracts drift, and this hasn't been exercised against a live account.
const BASE_URL = process.env.TL_API_BASE_URL || 'https://api.twelvelabs.io/v1.3';

async function getApiKey() {
  if (cachedApiKey) return cachedApiKey;
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: process.env.TL_API_KEY_SECRET_ARN })
  );
  // Stored as a plain-text secret (the raw API key), not a JSON blob.
  cachedApiKey = response.SecretString;
  return cachedApiKey;
}

async function request(method, path, body) {
  const apiKey = await getApiKey();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`TwelveLabs ${method} ${path} failed (${response.status}): ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

// SPEC.md 3.1 step 3: submit the video (by presigned URL) for indexing into the
// app's single persistent index (NFR-1 - one index, reused across all videos).
async function createIndexingTask(indexId, videoUrl) {
  const result = await request('POST', '/tasks', { index_id: indexId, url: videoUrl });
  return { taskId: result._id || result.id };
}

// SPEC.md 3.1 step 4 (WaitForIndexing poll). Maps TwelveLabs' raw task status to
// the three outcomes the Choice state cares about; "processing" covers every
// in-progress value (pending/queued/indexing/validating/...).
async function getTaskStatus(taskId) {
  const result = await request('GET', `/tasks/${taskId}`);
  const raw = result.status;
  const outcome = raw === 'ready' ? 'ready' : raw === 'failed' ? 'failed' : 'processing';
  return { raw, outcome, videoId: result.video_id || null };
}

// SPEC.md section 4: single combined Pegasus Analyze call (NFR-1).
async function analyzeVideo(videoId, prompt) {
  const result = await request('POST', '/analyze', { video_id: videoId, prompt });
  return result.data;
}

// FR-12 semantic search fallback.
async function semanticSearch(indexId, query) {
  const result = await request('POST', '/search', {
    index_id: indexId,
    query_text: query,
    search_options: ['visual', 'audio'],
  });
  return (result.data || []).map((hit) => ({ videoId: hit.video_id, score: hit.score }));
}

module.exports = { createIndexingTask, getTaskStatus, analyzeVideo, semanticSearch };
