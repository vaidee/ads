-- =========================================================
-- Ads Compliance Validator — Aurora PostgreSQL Schema (Draft v3)
-- Versioning removed — flat ads table, SENT_BACK added as a status
-- =========================================================

-- ---------------------------------------------------------
-- 1. ads: core table, one row per video ad
-- ---------------------------------------------------------
CREATE TABLE ads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- File identity / dedup
  filename            VARCHAR NOT NULL UNIQUE,
  s3_bucket           VARCHAR NOT NULL,
  s3_key              VARCHAR NOT NULL,
  duration_seconds    INTEGER,

  -- Ingestion metadata
  source              VARCHAR NOT NULL,           -- 'auto' | 'manual_upload' | 'reprocess'
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- TwelveLabs linkage
  tl_index_id         VARCHAR,
  tl_video_id         VARCHAR,
  tl_task_status      VARCHAR,                    -- 'pending' | 'indexing' | 'analyzing' | 'done' | 'error'

  -- AI output
  product_category         VARCHAR,
  ai_suitability_verdict   VARCHAR,                -- advisory only, shown alongside system verdict
  raw_ai_response          JSONB,

  -- System-computed status (source of truth, from compliance_rules)
  status              VARCHAR NOT NULL DEFAULT 'PROCESSING',
                        -- 'PROCESSING' | 'PUBLISHED' | 'NEEDS_REVIEW' | 'REJECTED' | 'SENT_BACK' | 'ERROR'
  status_reason       VARCHAR,
  original_status     VARCHAR,                    -- snapshot of system-computed status immediately after pipeline
                                                    -- completion, BEFORE any human action. Never updated again.
                                                    -- Used as the "prediction" for weekly evaluation.

  -- Manual override tracking
  is_overridden       BOOLEAN NOT NULL DEFAULT false,
  overridden_by       VARCHAR,
  overridden_at       TIMESTAMPTZ,
  override_note       TEXT,

  -- Error handling / manual reprocess
  error_message       TEXT,
  retry_count         INTEGER NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ads_status ON ads(status);
CREATE INDEX idx_ads_product_category ON ads(product_category);
CREATE INDEX idx_ads_uploaded_at ON ads(uploaded_at);


-- ---------------------------------------------------------
-- 2. compliance_flags: one row per flagged issue per ad
-- ---------------------------------------------------------
CREATE TABLE compliance_flags (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id               UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,

  timestamp_seconds   INTEGER NOT NULL,
  timestamp_display   VARCHAR NOT NULL,

  category            VARCHAR NOT NULL,           -- 'A' | 'B' | 'C' | 'D' | 'E'
  category_label      VARCHAR,                    -- 'adult_content' | 'brand_safety' | 'alcohol' | 'dangerous_harmful' | 'copyright'

  description          TEXT,                       -- doubles as explainability: "why" the flag triggered
  confidence            NUMERIC(4,3) NOT NULL,

  computed_verdict      VARCHAR,                    -- 'REJECT' | 'NEEDS_REVIEW' | 'IGNORED'

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_flags_ad_id ON compliance_flags(ad_id);
CREATE INDEX idx_flags_category ON compliance_flags(category_label);
CREATE INDEX idx_flags_verdict ON compliance_flags(computed_verdict);


-- ---------------------------------------------------------
-- 3. compliance_rules: configurable thresholds per category
-- ---------------------------------------------------------
CREATE TABLE compliance_rules (
  id                     SERIAL PRIMARY KEY,
  category_label          VARCHAR NOT NULL UNIQUE,

  min_confidence_reject    NUMERIC(4,3),
  min_confidence_review    NUMERIC(4,3),

  enabled                  BOOLEAN NOT NULL DEFAULT true,
  notes                    TEXT,

  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO compliance_rules (category_label, min_confidence_reject, min_confidence_review, notes) VALUES
  ('adult_content',      0.70, 0.35, 'Hard-line category, lower reject threshold'),
  ('brand_safety',       0.70, 0.35, 'Hate speech / hate symbols — hard-line'),
  ('alcohol',            0.95, 0.50, 'Lenient — beauty ads may legitimately show alcohol in lifestyle context'),
  ('dangerous_harmful',  0.75, 0.40, 'Violence, weapons, drugs'),
  ('copyright',          1.01, 0.30, 'Best-effort only — 1.01 threshold means REJECT never auto-triggers');


-- ---------------------------------------------------------
-- 4. status_history: audit trail of status changes
--    Covers PUBLISHED / NEEDS_REVIEW / REJECTED / SENT_BACK / ERROR transitions,
--    both system-computed and manual (approve/reject/send back/override).
-- ---------------------------------------------------------
CREATE TABLE status_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id               UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,

  old_status          VARCHAR,
  new_status          VARCHAR NOT NULL,

  changed_by          VARCHAR,                    -- 'system' or Cognito user sub/email
  reason              TEXT,

  changed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_history_ad_id ON status_history(ad_id);


-- ---------------------------------------------------------
-- 5. review_comments: reviewer comments, scoped to an ad
--    and optionally a specific finding
-- ---------------------------------------------------------
CREATE TABLE review_comments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id               UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  finding_id          UUID REFERENCES compliance_flags(id) ON DELETE CASCADE,  -- NULL = general comment

  comment_text        TEXT NOT NULL,
  commented_by        VARCHAR NOT NULL,            -- Cognito user sub/email

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_comments_ad_id ON review_comments(ad_id);
CREATE INDEX idx_review_comments_finding_id ON review_comments(finding_id);


-- ---------------------------------------------------------
-- 6. publish_records: tracking-only log of "marked as sent to SMP"
--    No real API integration in v1 — manual action, logged here.
-- ---------------------------------------------------------
CREATE TABLE publish_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id               UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,

  platform             VARCHAR NOT NULL,           -- 'meta' | 'tiktok' | 'youtube' | 'google_ads' | ...
  marked_by             VARCHAR NOT NULL,
  marked_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes                  TEXT
);

CREATE INDEX idx_publish_records_ad_id ON publish_records(ad_id);


-- ---------------------------------------------------------
-- 7. users: lightweight app-side profile, identity via Cognito
-- ---------------------------------------------------------
CREATE TABLE users (
  cognito_sub         VARCHAR PRIMARY KEY,
  email               VARCHAR NOT NULL UNIQUE,
  display_name        VARCHAR,
  role                VARCHAR NOT NULL DEFAULT 'reviewer',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------
-- 8. weekly_eval_metrics: passive evaluation, aggregated weekly
--    Compares original_status (system prediction) vs the reviewer's
--    final action (approve/reject/send back) to measure override rate,
--    overall and per compliance category. No TwelveLabs cost — pure
--    aggregation of data already collected during normal review.
-- ---------------------------------------------------------
CREATE TABLE weekly_eval_metrics (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start          DATE NOT NULL,
  week_end            DATE NOT NULL,

  category_label      VARCHAR,                    -- NULL row = overall metrics across all categories
                                                    -- otherwise 'adult_content' | 'brand_safety' | 'alcohol' | 'dangerous_harmful' | 'copyright'

  total_reviewed      INTEGER NOT NULL,            -- ads with a human action this week (approve/reject/sendback)
  total_overridden    INTEGER NOT NULL,            -- of those, how many differed from original_status
  override_rate       NUMERIC(5,4),                -- total_overridden / total_reviewed

  computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (week_start, category_label)
);

CREATE INDEX idx_weekly_eval_week ON weekly_eval_metrics(week_start);
CREATE INDEX idx_weekly_eval_category ON weekly_eval_metrics(category_label);
