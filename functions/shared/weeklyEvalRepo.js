'use strict';

const db = require('./db');

// week_start/category_label is UNIQUE, but category_label is nullable (NULL =
// overall) and Postgres treats NULL as distinct for uniqueness/ON CONFLICT
// purposes, so ON CONFLICT would never match the overall row. Delete-then-insert
// with IS NOT DISTINCT FROM sidesteps that instead.
async function upsert({ weekStart, weekEnd, categoryLabel, totalReviewed, totalOverridden }) {
  const overrideRate = totalReviewed > 0 ? totalOverridden / totalReviewed : null;

  return db.withTransaction(async (client) => {
    await db.query(
      'DELETE FROM weekly_eval_metrics WHERE week_start = $1 AND category_label IS NOT DISTINCT FROM $2',
      [weekStart, categoryLabel || null],
      client
    );

    const result = await db.query(
      `INSERT INTO weekly_eval_metrics (week_start, week_end, category_label, total_reviewed, total_overridden, override_rate)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [weekStart, weekEnd, categoryLabel || null, totalReviewed, totalOverridden, overrideRate],
      client
    );
    return result.rows[0];
  });
}

async function listRecent(limit = 12) {
  const result = await db.query('SELECT * FROM weekly_eval_metrics ORDER BY week_start DESC LIMIT $1', [limit]);
  return result.rows;
}

module.exports = { upsert, listRecent };
