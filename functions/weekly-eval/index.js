'use strict';

const db = require('../shared/db');
const weeklyEvalRepo = require('../shared/weeklyEvalRepo');
const { getPreviousWeekRange } = require('./weekRange');

const OVERALL_SQL = `
  WITH reviewed_ads AS (
    SELECT DISTINCT ad_id
    FROM status_history
    WHERE changed_by <> 'system'
      AND changed_at >= $1
      AND changed_at < ($2::date + INTERVAL '1 day')
  ),
  scored AS (
    SELECT a.id, (a.original_status IS NOT NULL AND a.status <> a.original_status) AS overridden
    FROM ads a
    JOIN reviewed_ads r ON r.ad_id = a.id
  )
  SELECT COUNT(*)::int AS total_reviewed, COUNT(*) FILTER (WHERE overridden)::int AS total_overridden
  FROM scored
`;

const PER_CATEGORY_SQL = `
  WITH reviewed_ads AS (
    SELECT DISTINCT ad_id
    FROM status_history
    WHERE changed_by <> 'system'
      AND changed_at >= $1
      AND changed_at < ($2::date + INTERVAL '1 day')
  ),
  scored AS (
    SELECT a.id, (a.original_status IS NOT NULL AND a.status <> a.original_status) AS overridden
    FROM ads a
    JOIN reviewed_ads r ON r.ad_id = a.id
  )
  SELECT
    cf.category_label,
    COUNT(DISTINCT s.id)::int AS total_reviewed,
    COUNT(DISTINCT s.id) FILTER (WHERE s.overridden)::int AS total_overridden
  FROM scored s
  JOIN compliance_flags cf ON cf.ad_id = s.id
  GROUP BY cf.category_label
`;

// SPEC.md section 8.1: weekly EventBridge-scheduled passive evaluation. Uses
// only existing review data (no extra TwelveLabs cost, per NFR-1's spirit).
exports.handler = async (event) => {
  const { weekStart, weekEnd } = getPreviousWeekRange(event && event.referenceDate ? new Date(event.referenceDate) : undefined);

  const [overallResult, perCategoryResult] = await Promise.all([
    db.query(OVERALL_SQL, [weekStart, weekEnd]),
    db.query(PER_CATEGORY_SQL, [weekStart, weekEnd]),
  ]);

  const overall = overallResult.rows[0];
  await weeklyEvalRepo.upsert({
    weekStart,
    weekEnd,
    categoryLabel: null,
    totalReviewed: overall.total_reviewed,
    totalOverridden: overall.total_overridden,
  });

  await Promise.all(
    perCategoryResult.rows.map((row) =>
      weeklyEvalRepo.upsert({
        weekStart,
        weekEnd,
        categoryLabel: row.category_label,
        totalReviewed: row.total_reviewed,
        totalOverridden: row.total_overridden,
      })
    )
  );

  return { weekStart, weekEnd, overall, perCategory: perCategoryResult.rows };
};
