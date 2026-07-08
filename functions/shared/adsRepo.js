'use strict';

const db = require('./db');

const SORTABLE_FIELDS = new Set(['uploaded_at', 'updated_at', 'filename', 'status', 'product_category']);

function parseSort(sort) {
  const [fieldRaw, dirRaw] = (sort || '').split(':');
  const field = SORTABLE_FIELDS.has(fieldRaw) ? fieldRaw : 'updated_at';
  const dir = (dirRaw || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { field, dir };
}

// Shared by list() and listForExport() - both filter on the same set of fields
// (GET /ads and GET /ads/export use identical query params per SPEC.md section 6).
function buildFilterClause({ status, productCategory, dateFrom, dateTo }) {
  const clauses = [];
  const params = [];

  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (productCategory) {
    params.push(productCategory);
    clauses.push(`product_category = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    clauses.push(`uploaded_at >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    clauses.push(`uploaded_at <= $${params.length}`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function findByFilename(filename) {
  const result = await db.query('SELECT * FROM ads WHERE filename = $1', [filename]);
  return result.rows[0] || null;
}

async function findById(id) {
  const result = await db.query('SELECT * FROM ads WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function findByTlVideoIds(videoIds) {
  if (!videoIds.length) return [];
  const result = await db.query('SELECT * FROM ads WHERE tl_video_id = ANY($1)', [videoIds]);
  return result.rows;
}

// FR-12 structured search: tried first, before the TwelveLabs semantic fallback.
async function searchByFilename(q, limit = 50) {
  const result = await db.query(
    'SELECT * FROM ads WHERE filename ILIKE $1 ORDER BY updated_at DESC LIMIT $2',
    [`%${q}%`, limit]
  );
  return result.rows;
}

// SPEC_v2 V2-3, search tier 2 (free full-text, between the structured filename
// match above and the paid TwelveLabs semantic fallback). websearch_to_tsquery
// (not plainto_tsquery) so quoted phrases/OR/- exclusions in the user's query
// behave the way a search-box user expects them to.
async function searchByContent(q, limit = 50) {
  const result = await db.query(
    `SELECT * FROM ads WHERE content_search_vector @@ websearch_to_tsquery('english', $1)
     ORDER BY updated_at DESC LIMIT $2`,
    [q, limit]
  );
  return result.rows;
}

// GET /ads: filters + offset pagination (SPEC.md section 6).
async function list({ status, productCategory, dateFrom, dateTo, sort, page = 1, limit = 25 } = {}) {
  const { where, params } = buildFilterClause({ status, productCategory, dateFrom, dateTo });
  const { field, dir } = parseSort(sort); // field/dir come from a fixed whitelist, safe to interpolate
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const countResult = await db.query(`SELECT COUNT(*)::int AS count FROM ads ${where}`, params);
  const rowsResult = await db.query(
    `SELECT * FROM ads ${where} ORDER BY ${field} ${dir} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, safeLimit, offset]
  );

  return { rows: rowsResult.rows, total: countResult.rows[0].count, page: safePage, limit: safeLimit };
}

// GET /ads/export (FR-13): same filters as list(), no pagination, capped so a
// runaway filter can't pull the whole table into Lambda memory.
async function listForExport({ status, productCategory, dateFrom, dateTo }, maxRows = 5000) {
  const { where, params } = buildFilterClause({ status, productCategory, dateFrom, dateTo });
  const result = await db.query(
    `SELECT * FROM ads ${where} ORDER BY updated_at DESC LIMIT $${params.length + 1}`,
    [...params, maxRows]
  );
  return result.rows;
}

// SPEC.md 3.1 step 3 (IndexVideo), first time a filename is seen.
async function insertForIndexing({ filename, s3Bucket, s3Key, source, durationSeconds, tlIndexId, tlTaskStatus }) {
  const result = await db.query(
    `INSERT INTO ads (filename, s3_bucket, s3_key, duration_seconds, source, tl_index_id, tl_task_status, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'PROCESSING')
     RETURNING *`,
    [filename, s3Bucket, s3Key, durationSeconds || null, source, tlIndexId, tlTaskStatus]
  );
  return result.rows[0];
}

// SPEC.md 3.1 step 3 (IndexVideo) on a reprocess run - flags were already cleared
// by the /ads/{id}/reprocess API route, so this just resets the AI/indexing state.
async function resetForReindex({ id, tlIndexId, tlTaskStatus }) {
  const result = await db.query(
    `UPDATE ads SET
       tl_index_id = $1, tl_task_status = $2, tl_video_id = NULL, status = 'PROCESSING',
       status_reason = NULL, error_message = NULL,
       product_category = NULL, ai_suitability_verdict = NULL, raw_ai_response = NULL,
       updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [tlIndexId, tlTaskStatus, id]
  );
  return result.rows[0] || null;
}

// SPEC.md 3.1 step 4 (WaitForIndexing poll) - progress checkpoint, not a status transition.
async function updateIndexingProgress({ id, tlTaskStatus, tlVideoId }) {
  const result = await db.query(
    `UPDATE ads SET tl_task_status = $1, tl_video_id = COALESCE($2, tl_video_id), updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [tlTaskStatus, tlVideoId || null, id]
  );
  return result.rows[0] || null;
}

async function setTlTaskStatus(id, tlTaskStatus) {
  const result = await db.query('UPDATE ads SET tl_task_status = $1, updated_at = now() WHERE id = $2 RETURNING *', [
    tlTaskStatus,
    id,
  ]);
  return result.rows[0] || null;
}

// SPEC.md 3.1 step 6 (ParseAndPersist). content_metadata (SPEC_v2 V2-3) drives
// the generated content_search_vector column automatically - no separate write needed for that.
async function persistAnalysis({ id, productCategory, aiSuitabilityVerdict, rawAiResponse, contentMetadata }) {
  const result = await db.query(
    `UPDATE ads SET product_category = $1, ai_suitability_verdict = $2, raw_ai_response = $3,
       content_metadata = $4, updated_at = now()
     WHERE id = $5
     RETURNING *`,
    [productCategory, aiSuitabilityVerdict, JSON.stringify(rawAiResponse), JSON.stringify(contentMetadata), id]
  );
  return result.rows[0] || null;
}

async function _recordTransition(client, { id, newStatus, changedBy, reason, setOriginalStatus }) {
  const current = await db.query('SELECT status, original_status FROM ads WHERE id = $1 FOR UPDATE', [id], client);
  if (!current.rows[0]) return null;
  const oldStatus = current.rows[0].status;

  const updated = await db.query(
    `UPDATE ads SET
       status = $1,
       original_status = CASE WHEN $2 THEN COALESCE(original_status, $1) ELSE original_status END,
       updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [newStatus, setOriginalStatus, id],
    client
  );

  await db.query(
    'INSERT INTO status_history (ad_id, old_status, new_status, changed_by, reason) VALUES ($1, $2, $3, $4, $5)',
    [id, oldStatus, newStatus, changedBy, reason || null],
    client
  );

  return { ad: updated.rows[0], originalStatusBefore: current.rows[0].original_status };
}

// SPEC.md 3.1 step 8 (PersistFinal) - the system-computed verdict. Sets
// original_status only the first time (COALESCE), per section 3.2's "set once,
// never changes again" rule, even across a reprocess re-run.
async function setComputedStatus({ id, newStatus }) {
  return db.withTransaction(async (client) => {
    const result = await _recordTransition(client, {
      id,
      newStatus,
      changedBy: 'system',
      reason: null,
      setOriginalStatus: true,
    });
    return result && result.ad;
  });
}

// SPEC.md section 6: approve/reject/sendback. Computes the override flag itself
// (newStatus differs from the immutable original_status) rather than trusting
// the caller, so every human transition path gets it right.
async function transitionStatus({ id, newStatus, changedBy, reason }) {
  return db.withTransaction(async (client) => {
    const result = await _recordTransition(client, {
      id,
      newStatus,
      changedBy,
      reason,
      setOriginalStatus: false,
    });
    if (!result) return null;

    const isOverride = result.originalStatusBefore !== null && newStatus !== result.originalStatusBefore;
    if (!isOverride) return result.ad;

    const updated = await db.query(
      `UPDATE ads SET is_overridden = true, overridden_by = $1, overridden_at = now(), override_note = $2
       WHERE id = $3
       RETURNING *`,
      [changedBy, reason || null, id],
      client
    );
    return updated.rows[0];
  });
}

// SPEC.md 3.1 step 9 (pipeline error) - NFR-5: sits in ERROR for manual retry.
async function markError({ id, message }) {
  return db.withTransaction(async (client) => {
    const current = await db.query('SELECT status FROM ads WHERE id = $1 FOR UPDATE', [id], client);
    if (!current.rows[0]) return null;
    const oldStatus = current.rows[0].status;

    const updated = await db.query(
      `UPDATE ads SET status = 'ERROR', tl_task_status = 'error', error_message = $1,
         retry_count = retry_count + 1, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [message, id],
      client
    );

    await db.query(
      "INSERT INTO status_history (ad_id, old_status, new_status, changed_by, reason) VALUES ($1, $2, 'ERROR', 'system', $3)",
      [id, oldStatus, message],
      client
    );

    return updated.rows[0];
  });
}

// POST /ads/{id}/reprocess: increments retry_count and clears prior flags
// up front (FR-15), before the state machine execution is (re-)started.
async function prepareReprocess(id) {
  return db.withTransaction(async (client) => {
    const result = await db.query(
      'UPDATE ads SET retry_count = retry_count + 1, updated_at = now() WHERE id = $1 RETURNING *',
      [id],
      client
    );
    if (!result.rows[0]) return null;
    await db.query('DELETE FROM compliance_flags WHERE ad_id = $1', [id], client);
    return result.rows[0];
  });
}

module.exports = {
  findByFilename,
  findById,
  findByTlVideoIds,
  searchByFilename,
  searchByContent,
  list,
  listForExport,
  insertForIndexing,
  resetForReindex,
  updateIndexingProgress,
  setTlTaskStatus,
  persistAnalysis,
  setComputedStatus,
  transitionStatus,
  markError,
  prepareReprocess,
};
