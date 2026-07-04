'use strict';

const db = require('./db');

async function listByAdId(adId) {
  const result = await db.query('SELECT * FROM review_comments WHERE ad_id = $1 ORDER BY created_at ASC', [adId]);
  return result.rows;
}

async function insert({ adId, findingId, commentText, commentedBy }) {
  const result = await db.query(
    `INSERT INTO review_comments (ad_id, finding_id, comment_text, commented_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [adId, findingId || null, commentText, commentedBy]
  );
  return result.rows[0];
}

module.exports = { listByAdId, insert };
