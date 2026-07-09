'use strict';

const db = require('./db');

const COLUMNS_PER_ROW = 6;

// SPEC_v2 V2-1: results of Entity Search run against an ad, one row per
// (ad, talent_reference) match. Mirrors complianceFlagsRepo.bulkInsert's
// shape - contract_status_at_detection/flagged are computed by the caller
// (detect-talent), not here, same as computed_verdict is computed by
// apply-suggestion-logic rather than in SQL.
async function bulkInsert(adId, detections) {
  if (!detections.length) return [];

  const values = [];
  const params = [];
  detections.forEach((d, i) => {
    const base = i * COLUMNS_PER_ROW;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
    );
    params.push(
      adId,
      d.talentReferenceId,
      d.timestampSeconds,
      d.confidence,
      d.contractStatusAtDetection,
      d.flagged
    );
  });

  const result = await db.query(
    `INSERT INTO talent_detections
       (ad_id, talent_reference_id, timestamp_seconds, confidence, contract_status_at_detection, flagged)
     VALUES ${values.join(', ')}
     RETURNING *`,
    params
  );
  return result.rows;
}

// Joins in the talent's name for display in the Ad Detail "Talent Compliance"
// section - the UI has no other way to look that up.
async function listByAdId(adId) {
  const result = await db.query(
    `SELECT td.*, tr.name AS talent_name
     FROM talent_detections td
     JOIN talent_references tr ON tr.id = td.talent_reference_id
     WHERE td.ad_id = $1
     ORDER BY td.timestamp_seconds ASC`,
    [adId]
  );
  return result.rows;
}

module.exports = { bulkInsert, listByAdId };
