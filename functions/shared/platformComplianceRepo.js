'use strict';

const db = require('./db');

// v3 status redesign: platform compliance is now an independent,
// automatically-computed per-(ad, platform) result - one row per platform,
// upserted in place on every run (initial pipeline run or a re-trigger from
// the Approve CTA), rather than a field bolted onto a manual publish_records
// click (see schema_v3.sql).
async function upsert({ adId, platform, platformVerdict, platformFlags }) {
  const result = await db.query(
    `INSERT INTO platform_compliance (ad_id, platform, platform_verdict, platform_flags, computed_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (ad_id, platform) DO UPDATE
       SET platform_verdict = EXCLUDED.platform_verdict,
           platform_flags = EXCLUDED.platform_flags,
           computed_at = now()
     RETURNING *`,
    [adId, platform, platformVerdict, JSON.stringify(platformFlags)]
  );
  return result.rows[0];
}

async function listByAdId(adId) {
  const result = await db.query('SELECT * FROM platform_compliance WHERE ad_id = $1 ORDER BY platform ASC', [adId]);
  return result.rows;
}

module.exports = { upsert, listByAdId };
