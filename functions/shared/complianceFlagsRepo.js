'use strict';

const db = require('./db');

const COLUMNS_PER_ROW = 7;

// SPEC.md 3.1 step 6 (ParseAndPersist): normalizes raw_ai_response.compliance_flags
// into rows for fast filtering (per schema.sql's stated purpose for this table).
async function bulkInsert(adId, flags) {
  if (!flags.length) return [];

  const values = [];
  const params = [];
  flags.forEach((f, i) => {
    const base = i * COLUMNS_PER_ROW;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
    );
    params.push(adId, f.timestampSeconds, f.timestampDisplay, f.category, f.categoryLabel, f.description, f.confidence);
  });

  const result = await db.query(
    `INSERT INTO compliance_flags
       (ad_id, timestamp_seconds, timestamp_display, category, category_label, description, confidence)
     VALUES ${values.join(', ')}
     RETURNING *`,
    params
  );
  return result.rows;
}

async function listByAdId(adId) {
  const result = await db.query('SELECT * FROM compliance_flags WHERE ad_id = $1 ORDER BY timestamp_seconds ASC', [
    adId,
  ]);
  return result.rows;
}

async function updateComputedVerdict(id, computedVerdict) {
  await db.query('UPDATE compliance_flags SET computed_verdict = $1 WHERE id = $2', [computedVerdict, id]);
}

module.exports = { bulkInsert, listByAdId, updateComputedVerdict };
