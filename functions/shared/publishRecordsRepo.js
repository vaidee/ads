'use strict';

const db = require('./db');

async function listByAdId(adId) {
  const result = await db.query('SELECT * FROM publish_records WHERE ad_id = $1 ORDER BY marked_at DESC', [adId]);
  return result.rows;
}

// FR-14: tracking-only, no external API call.
async function insert({ adId, platform, markedBy, notes }) {
  const result = await db.query(
    `INSERT INTO publish_records (ad_id, platform, marked_by, notes)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [adId, platform, markedBy, notes || null]
  );
  return result.rows[0];
}

// SPEC_v2 V2-2: filled in later by run-platform-compliance, once its
// asynchronously-invoked supplementary Analyze call finishes.
async function updatePlatformResult({ id, platformVerdict, platformFlags }) {
  const result = await db.query(
    `UPDATE publish_records SET platform_verdict = $1, platform_flags = $2 WHERE id = $3 RETURNING *`,
    [platformVerdict, JSON.stringify(platformFlags), id]
  );
  return result.rows[0] || null;
}

module.exports = { listByAdId, insert, updatePlatformResult };
