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

// /analyze streams NDJSON by default - one JSON object per line
// ({event_type: "stream_start"|"text_generation"|"stream_end", ...}) instead
// of a single JSON document, which is exactly what makes plain JSON.parse
// choke partway through. Reassemble the text_generation fragments into the
// same {data: "..."} shape every other (non-streaming) endpoint returns, so
// callers don't need to know or care that this one streams.
function parseResponseBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    const events = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const data = events
      .filter((e) => e.event_type === 'text_generation')
      .map((e) => e.text || '')
      .join('');
    return { data };
  }
}

async function request(method, path, body, { isFormData = false } = {}) {
  const apiKey = await getApiKey();
  const headers = { 'x-api-key': apiKey };
  // Let fetch set Content-Type itself for FormData bodies - it needs to
  // include the multipart boundary, which we have no way to compute by hand.
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`TwelveLabs ${method} ${path} failed (${response.status}): ${text}`);
  }
  return text ? parseResponseBody(text) : {};
}

// SPEC.md 3.1 step 3: submit the video (by presigned URL) for indexing into the
// app's single persistent index (NFR-1 - one index, reused across all videos).
// /tasks specifically rejects application/json ("content_type_invalid") -
// unlike the other endpoints below, it requires multipart/form-data.
async function createIndexingTask(indexId, videoUrl) {
  const form = new FormData();
  form.append('index_id', indexId);
  form.append('video_url', videoUrl);
  const result = await request('POST', '/tasks', form, { isFormData: true });
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

// SPEC.md section 4: single combined Pegasus Analyze call (NFR-1). Pegasus
// 1.5's /analyze takes a video URL directly (model_name + analysis_mode
// "general") rather than an indexed video_id - unlike search, generate no
// longer needs the video's index to have any particular model enabled, and
// "index_not_supported_for_generate" from the old video_id-based call goes
// away entirely since indexing isn't involved in this request at all.
async function analyzeVideo(videoUrl, prompt) {
  const result = await request('POST', '/analyze', {
    model_name: 'pegasus1.5',
    analysis_mode: 'general',
    video: { type: 'url', url: videoUrl },
    prompt,
  });
  return result.data;
}

// FR-12 semantic search fallback. Like /tasks, /search rejects application/json
// ("content_type_invalid") and requires multipart/form-data - only discovered
// live once a query actually fell through to this tier (structured + full-text
// search apparently never missed in earlier testing). Array fields
// (search_options) go as repeated form fields, the standard multipart
// convention, mirroring createIndexingTask's form-building approach.
async function semanticSearch(indexId, query) {
  const form = new FormData();
  form.append('index_id', indexId);
  form.append('query_text', query);
  form.append('search_options', 'visual');
  form.append('search_options', 'audio');
  // Raised from the API's default (10) to its documented max, so a hit
  // further down the ranking isn't silently truncated out of the response -
  // see searchEntity below for the live case that surfaced this.
  form.append('page_limit', '50');
  const result = await request('POST', '/search', form, { isFormData: true });
  return (result.data || []).map((hit) => ({ videoId: hit.video_id, score: hit.score }));
}

// SPEC_v2 V2-1: closed-set talent matching via Entity Search (Marengo 3.0,
// beta - unverified against a live account, expect this to need at least one
// live-iteration round same as /tasks and /analyze did). Reuses the same
// /search endpoint semanticSearch does - Entity Search isn't a separate
// endpoint, it's the standard search API with the target entity's id embedded
// in query_text using TwelveLabs' <@entity_id> marker syntax. The index must
// have Marengo 3.0 enabled for this to work. Same multipart requirement as
// semanticSearch above.
async function searchEntity(indexId, entityId) {
  const form = new FormData();
  form.append('index_id', indexId);
  form.append('query_text', `<@${entityId}> appears`);
  form.append('search_options', 'visual');
  // Live-observed: hitCount landed on exactly 10 across repeated runs against
  // an index with more than 10 videos - that's the API's default page_limit
  // truncating the response, not "only 10 videos in the index contain this
  // entity." Raised to the documented max (50) so a match ranked below the
  // old default isn't silently dropped. totalResults is returned alongside
  // hits so a still-truncated response (>50 total) is visible in the logs
  // rather than looking identical to a genuine no-match.
  form.append('page_limit', '50');
  const result = await request('POST', '/search', form, { isFormData: true });
  const hits = (result.data || []).map((hit) => ({ videoId: hit.video_id, score: hit.score, start: hit.start }));
  return { hits, totalResults: result.page_info ? result.page_info.total_results : null };
}

// Read-only lookup used by db/import-talent-reference.js to fetch/confirm an
// entity the user already created directly in the TwelveLabs Playground
// (rather than this app creating entities/uploading reference images itself).
async function getEntity(entityCollectionId, entityId) {
  return request('GET', `/entity-collections/${entityCollectionId}/entities/${entityId}`);
}

module.exports = { createIndexingTask, getTaskStatus, analyzeVideo, semanticSearch, searchEntity, getEntity };
