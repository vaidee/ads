-- =========================================================
-- v2 additions
-- =========================================================

-- ---------------------------------------------------------
-- 9. clients: minimal multi-tenancy scaffold.
--    NOTE: this is a minimal FK skeleton to unblock talent_references
--    (which must be scoped per client). Full multi-tenant redesign —
--    per-client compliance_rules, Cognito group-based access scoping,
--    dashboard client filtering — remains a separate v2 thread, not
--    fully designed here.
-- ---------------------------------------------------------
CREATE TABLE clients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR NOT NULL,
  type                VARCHAR NOT NULL DEFAULT 'brand',   -- 'brand' | 'agency'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ads ADD COLUMN client_id UUID REFERENCES clients(id);
CREATE INDEX idx_ads_client_id ON ads(client_id);

CREATE TABLE user_client_access (
  cognito_sub         VARCHAR NOT NULL REFERENCES users(cognito_sub) ON DELETE CASCADE,
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  PRIMARY KEY (cognito_sub, client_id)
);


-- ---------------------------------------------------------
-- 10. talent_references: closed-set contracted-talent roster,
--     matched via TwelveLabs Entity Search (Marengo 3.0, beta).
--     Reference images/consent are handled outside this table
--     (S3 + a client attestation step) — this stores the linkage
--     to TwelveLabs' entity_collection/entity, not the images themselves.
-- ---------------------------------------------------------
CREATE TABLE talent_references (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  name                   VARCHAR NOT NULL,
  tl_entity_collection_id VARCHAR NOT NULL,
  tl_entity_id            VARCHAR NOT NULL,

  contract_start          DATE,
  contract_end             DATE,
  status                    VARCHAR NOT NULL DEFAULT 'active',  -- 'active' | 'expired' | 'terminated'

  consent_confirmed_by      VARCHAR,          -- Cognito user who attested rights to upload reference images
  consent_confirmed_at        TIMESTAMPTZ,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_talent_references_client_id ON talent_references(client_id);
CREATE INDEX idx_talent_references_status ON talent_references(status);


-- ---------------------------------------------------------
-- 11. talent_detections: results of Entity Search run against an ad,
--     scoped to that client's currently-active talent only (cost control —
--     do not search the full historical roster on every ad)
-- ---------------------------------------------------------
CREATE TABLE talent_detections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id                   UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  talent_reference_id      UUID NOT NULL REFERENCES talent_references(id) ON DELETE CASCADE,

  timestamp_seconds         INTEGER,
  confidence                 NUMERIC(4,3),

  -- Computed by comparing detection against talent_references.contract_end at detection time
  contract_status_at_detection VARCHAR,      -- 'within_contract' | 'expired' | 'terminated'
  flagged                    BOOLEAN NOT NULL DEFAULT false,   -- true if contract_status was NOT within_contract

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_talent_detections_ad_id ON talent_detections(ad_id);
CREATE INDEX idx_talent_detections_flagged ON talent_detections(flagged);


-- ---------------------------------------------------------
-- 12. Platform-specific compliance — extends publish_records.
--     Runs on-demand, only when a reviewer clicks "Publish to [platform]"
--     on an already-PUBLISHED ad. One lightweight supplementary Analyze
--     call per platform actually targeted — not run speculatively upfront.
-- ---------------------------------------------------------
ALTER TABLE publish_records ADD COLUMN platform_verdict VARCHAR;      -- 'Suitable' | 'Needs Review' | 'Not Suitable'
ALTER TABLE publish_records ADD COLUMN platform_flags JSONB;          -- platform-specific findings, same shape as compliance_flags


-- ---------------------------------------------------------
-- 13. Enriched content metadata + free-tier full-text search.
--     Captured in the SAME core Analyze call (no added TwelveLabs cost),
--     used for display and as a free search tier before falling back
--     to paid TwelveLabs semantic search.
-- ---------------------------------------------------------
ALTER TABLE ads ADD COLUMN content_metadata JSONB;

ALTER TABLE ads ADD COLUMN content_search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(content_metadata->>'summary', '') || ' ' ||
      coalesce(content_metadata->>'setting', '') || ' ' ||
      coalesce(content_metadata->>'mood_tone', '') || ' ' ||
      coalesce(content_metadata->>'detected_objects', '') || ' ' ||
      coalesce(content_metadata->>'on_screen_text', '')
    )
  ) STORED;

CREATE INDEX idx_ads_content_search ON ads USING GIN (content_search_vector);
