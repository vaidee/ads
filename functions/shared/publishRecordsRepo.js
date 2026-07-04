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

module.exports = { listByAdId, insert };
