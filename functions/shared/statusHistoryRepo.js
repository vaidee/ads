'use strict';

const db = require('./db');

async function listByAdId(adId) {
  const result = await db.query('SELECT * FROM status_history WHERE ad_id = $1 ORDER BY changed_at ASC', [adId]);
  return result.rows;
}

module.exports = { listByAdId };
