-- =========================================================
-- v3 additions: status redesign
--   - 'PUBLISHED' retired as a stored ads.status value, renamed to
--     'APPROVED' (content-review-only verdict; talent detections now floor
--     it at NEEDS_REVIEW - see apply-suggestion-logic/index.js).
--   - Platform-specific compliance becomes an independent, automatically
--     computed per-(ad, platform) result (table 14 below) instead of a
--     field bolted onto a manual publish_records click - it never feeds
--     back into ads.status.
-- =========================================================

-- Relabel existing rows so historical status/original_status values match
-- the new vocabulary going forward. No CHECK constraint exists on either
-- column (see schema.sql), so this is purely a data update.
UPDATE ads SET status = 'APPROVED' WHERE status = 'PUBLISHED';
UPDATE ads SET original_status = 'APPROVED' WHERE original_status = 'PUBLISHED';


-- ---------------------------------------------------------
-- 14. platform_compliance: one row per (ad, platform), computed
--     automatically (initial pipeline run, or re-triggered by a human
--     Approve override) - independent of publish_records, never feeds back
--     into ads.status.
-- ---------------------------------------------------------
CREATE TABLE platform_compliance (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id             UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,

  platform          VARCHAR NOT NULL,           -- 'meta' | 'tiktok' | 'youtube' | 'google_ads'
  platform_verdict  VARCHAR,                    -- 'Suitable' | 'Needs Review' | 'Not Suitable' | 'Error'
  platform_flags    JSONB,

  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (ad_id, platform)
);

CREATE INDEX idx_platform_compliance_ad_id ON platform_compliance(ad_id);


-- ---------------------------------------------------------
-- publish_records reverts to its original FR-14 pure-audit-log shape -
-- compliance results now live in platform_compliance above, not here.
-- ---------------------------------------------------------
ALTER TABLE publish_records DROP COLUMN IF EXISTS platform_verdict;
ALTER TABLE publish_records DROP COLUMN IF EXISTS platform_flags;
