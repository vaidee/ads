# Ad Content Compliance Validator — Specification

**Project:** `ads`
**Status:** v1 — ready for implementation
**Purpose of this document:** Single source of truth for spec-driven development. Update this file to change scope; regenerate/modify source code from it rather than editing code and letting the spec drift.

---

## 1. Overview

An internal tool that validates beauty product video ad creatives for compliance and brand safety
before publication. Videos are ingested from S3, analyzed by TwelveLabs' Pegasus model against a
defined set of compliance categories, scored against configurable confidence thresholds, and routed
to reviewers through a web UI for a final publish decision.

### Goals
- Automatically flag nudity, hate speech, alcohol, adult content, violence, and (best-effort) copyright issues in video ads
- Reduce manual review burden while keeping a human in the loop for ambiguous cases
- Provide timestamped, explainable findings a reviewer can act on quickly
- Track review outcomes over time to evaluate and tune AI accuracy

### Explicitly out of scope (v1)
- Image ad support — video only
- Ad versioning / resubmission workflow — each ad is a single, standalone record
- Real ad-platform API integration — "publish" buttons are tracking-only, no actual upload to Meta/TikTok/etc.
- Admin UI for editing compliance rule thresholds — managed via direct SQL for now
- Real copyright fingerprinting — copyright checks are best-effort AI judgment only, never auto-reject
- Golden-dataset active evaluation — deferred; v1 ships passive evaluation only

---

## 2. Requirements

### 2.1 Functional
| ID | Requirement |
|----|-------------|
| FR-1 | Accept beauty product video ads via S3 watch-folder (automated drop) or manual upload through the UI (which also lands in S3) |
| FR-2 | Enforce duration guidance: recommended under 2 minutes, hard maximum 5 minutes (validated client-side and server-side) |
| FR-3 | Deduplicate by filename at ingestion — reject/skip a file whose filename already exists in `ads` |
| FR-4 | Index each video in TwelveLabs and run one combined Pegasus Analyze call returning: product category, compliance flags (category, timestamp, confidence, explainable description), and an advisory AI suitability verdict |
| FR-5 | Apply a configurable, per-category confidence-threshold rules table to compute a system status: `PUBLISHED`, `NEEDS_REVIEW`, or `REJECTED` |
| FR-6 | Persist raw AI output, normalized per-flag records, and computed status to Aurora Postgres |
| FR-7 | Surface results in a UI: dashboard/list view, ad detail/review view, upload view |
| FR-8 | Support reviewer actions on `NEEDS_REVIEW` ads: Approve → `PUBLISHED`, Reject → `REJECTED`, Send back → `SENT_BACK` |
| FR-9 | Allow reviewers to override any status, including already-`PUBLISHED` ads |
| FR-10 | Allow per-finding and general comments on an ad, persisted independently of the AI output |
| FR-11 | Show timestamped flag markers on the video scrubber; clicking a finding seeks the player |
| FR-12 | Support structured search/filter (status, category, filename, date) via Aurora, and natural-language semantic search via TwelveLabs, auto-detected from a single search box (structured tried first, semantic as fallback on zero results) — kept as separate, non-combinable result sets in v1 |
| FR-13 | Support CSV export of the current filtered ad list |
| FR-14 | Show "Publish to ad account" tracking buttons (Meta, TikTok, Google Ads, ...) only on `PUBLISHED` ads; clicking logs a record, no external API call |
| FR-15 | Support manual "Reprocess" on any ad (primarily for `ERROR` status) — re-runs analysis on the same S3 file, clears prior flags, does not create a new version |
| FR-16 | Authenticate all UI/API access via a small set of Cognito-managed user logins |
| FR-17 | Automatically tag each ad with a product category (skincare / makeup / haircare / fragrance / tools_devices / other) — no manual tagging |
| FR-18 | Compute weekly passive evaluation metrics: reviewer override rate overall and per compliance category, using existing review data (no extra AI cost) |

### 2.2 Non-functional
| ID | Requirement |
|----|-------------|
| NFR-1 | Minimize TwelveLabs Analyze minutes — one combined prompt per video, not multiple parallel analyses |
| NFR-2 | All infrastructure on AWS (S3, Step Functions, Lambda, Aurora Serverless v2, Cognito, API Gateway, EventBridge) |
| NFR-3 | Every status transition (system or human) is logged to an audit trail |
| NFR-4 | Video storage retained indefinitely (no deletion lifecycle in v1) |
| NFR-5 | Errored pipeline runs sit in `ERROR` status for manual retry — no automatic retry loop |

---

## 3. Architecture

```
S3 bucket (watched via S3 Event Notification → EventBridge → Step Functions)
  ├─ Automated drop  → triggers pipeline, source = 'auto'
  └─ UI manual upload → uploads via pre-signed URL → same S3 event fires, source = 'manual_upload'

Manual reprocess (UI button) → API Gateway → Lambda → starts same state machine directly,
  source = 'reprocess', bypasses duplicate check, reuses existing ad_id
```

### 3.1 Step Functions flow

1. **TriggerIngest** (Lambda) — receive S3 event, generate pre-signed URL reference, look up filename in `ads`
2. **Choice: IsDuplicate?**
   - Yes (and not a reprocess) → log skipped, end
   - No → continue
3. **IndexVideo** (Lambda) — submit to TwelveLabs, get task ID, create `ads` row with `status = PROCESSING`
4. **WaitForIndexing** — polling loop (Wait state + Choice state checking TwelveLabs task status every N seconds)
5. **RunComplianceAnalysis** (Lambda) — single Pegasus Analyze call using the prompt in Section 4
6. **ParseAndPersist** (Lambda) —
   - Defensively parse JSON response (strip markdown fences, validate schema, handle malformed output)
   - Insert rows into `compliance_flags`
   - Store `raw_ai_response`, `product_category`, `ai_suitability_verdict`
7. **ApplySuggestionLogic** (Lambda) — read `compliance_rules`, compute per-flag `computed_verdict`, compute overall `status` (worst flag wins: REJECT > NEEDS_REVIEW > PASS), set `original_status` and `status`
8. **PersistFinal** (Lambda) — update `ads` row, insert `status_history` entry (`changed_by = 'system'`)
9. **Choice: Error at any step?** → `status = ERROR`, `error_message` set, `retry_count` incremented, sit for manual Reprocess trigger

### 3.2 Suggestion logic detail

- Each flag: `computed_verdict = REJECT` if `confidence >= min_confidence_reject`, else `NEEDS_REVIEW` if `confidence >= min_confidence_review`, else `IGNORED`
- Ad-level `status`: worst verdict across all flags (`REJECT` > `NEEDS_REVIEW` > none/`IGNORED` → `PUBLISHED`)
- No flags at all → `PUBLISHED` by default
- `original_status` is set once, immediately after step 7, and never changes again — it's the system's unmodified prediction, used later for evaluation

---

## 4. AI Prompt (TwelveLabs Pegasus Analyze)

Single combined call per video — do not split into separate compliance/category/summary calls (cost control, NFR-1).

```
Analyze this beauty product video ad and return ONLY valid JSON (no markdown fences, no preamble, no explanation text outside the JSON structure).

Check for the following compliance categories:

A - ADULT CONTENT
- Nudity or sexual content
- Sexually suggestive content
- Adult themes

B - BRAND SAFETY
- Inflammatory or demeaning content
- Hateful content or symbols targeting protected groups
- Harmful or dangerous acts
- Shocking or graphic content
- Profanity or crude language

C - ALCOHOL
- Depiction or promotion of alcoholic beverages
- Alcohol branding or consumption

D - DANGEROUS/HARMFUL
- Violence or graphic content
- Drugs or dangerous substances (excluding alcohol, covered separately in C)
- Firearms and weapons
- Health misinformation or unverified claims

E - COPYRIGHT (best-effort, informational only — not a substitute for formal copyright clearance)
- Recognizable copyrighted music
- Recognizable third-party video/image content
- Visible third-party brand logos other than the advertised product

Also classify the video's PRODUCT CATEGORY as exactly one of:
["skincare", "makeup", "haircare", "fragrance", "tools_devices", "other"]

For each compliance issue found, report:
- timestamp (mm:ss when it first appears)
- category (A, B, C, D, or E)
- description: explain BOTH what was observed AND why it violates this category —
  e.g. "Wine glass visible at 0:42 during product demo; flagged under alcohol policy as
  the beverage is prominently featured rather than incidental background detail."
  Two sentences max, but must state the reasoning, not just the observation.
- confidence (a number between 0 and 1 reflecting your certainty)

Also provide your own overall suitability verdict as one of: "Suitable", "Needs Review", "Not Suitable".
This is your independent assessment only — it is advisory and will be shown alongside a separate
rules-based verdict for comparison. It does not determine the final published status.

Return exactly this JSON structure:

{
  "product_category": "skincare",
  "ai_suitability_verdict": "Needs Review",
  "compliance_flags": [
    {
      "timestamp": "00:42",
      "category": "C",
      "description": "Wine glass visible in background during product demo",
      "confidence": 0.65
    }
  ]
}

If no issues are found, return an empty array for compliance_flags. Do not omit any field.
```

**Parsing note:** Pegasus output is LLM-generated text. Even with strict formatting instructions, real responses may include markdown fences or minor deviations. `ParseAndPersist` must strip fences, validate against the expected schema, and handle malformed JSON gracefully (log + `ERROR` status) rather than assume clean output.

---

## 5. Database Schema (Aurora Serverless v2 — PostgreSQL)

See `schema.sql` in this repo for the full DDL. Summary of tables:

| Table | Purpose |
|---|---|
| `ads` | Core record — one row per video ad, includes `status`, `original_status`, AI output, override tracking |
| `compliance_flags` | One row per flagged issue per ad, normalized from `raw_ai_response` for fast filtering |
| `compliance_rules` | Configurable per-category confidence thresholds driving the suggestion logic |
| `status_history` | Full audit trail of every status transition, system or human |
| `review_comments` | Reviewer comments, optionally scoped to a specific finding |
| `publish_records` | Tracking-only log of "marked as sent to [SMP]" actions |
| `weekly_eval_metrics` | Weekly aggregated override rate, overall and per category |
| `users` | Lightweight app-side profile mapped to Cognito identity |

### 5.1 Status values
`PROCESSING | PUBLISHED | NEEDS_REVIEW | REJECTED | SENT_BACK | ERROR`

### 5.2 Default compliance rules (tune via SQL as real data comes in)

| category_label | min_confidence_reject | min_confidence_review | notes |
|---|---|---|---|
| adult_content | 0.70 | 0.35 | Hard-line |
| brand_safety | 0.70 | 0.35 | Hate speech/symbols — hard-line |
| alcohol | 0.95 | 0.50 | Lenient — lifestyle context common in beauty ads |
| dangerous_harmful | 0.75 | 0.40 | Violence, weapons, drugs |
| copyright | 1.01 | 0.30 | Never auto-rejects (threshold > 1.0 is unreachable), best-effort only |

---

## 6. API Layer

API Gateway (HTTP API) + Cognito JWT authorizer on every route → Lambda → Aurora (via RDS Proxy) / TwelveLabs. S3 uploads bypass API Gateway (pre-signed URL, direct browser→S3).

| Method | Path | Purpose |
|---|---|---|
| GET | `/ads` | List with filters: `status`, `product_category`, `date_from`, `date_to`, `sort`, `page`, `limit` (offset pagination) |
| GET | `/ads/search?q=...` | Structured search first, falls back to TwelveLabs semantic search on zero results |
| GET | `/ads/export?...` | CSV export, same filters as `/ads` |
| GET | `/ads/{id}` | Full detail: ad + flags + comments + status history + publish records |
| POST | `/ads/{id}/approve` | → `PUBLISHED`, logs `status_history`, sets override flag if applicable |
| POST | `/ads/{id}/reject` | → `REJECTED` |
| POST | `/ads/{id}/sendback` | → `SENT_BACK` |
| POST | `/ads/{id}/reprocess` | Re-runs pipeline on the same S3 file; clears prior `compliance_flags`; increments `retry_count` |
| POST | `/ads/{id}/comments` | Body: `{comment_text, finding_id?}` |
| POST | `/ads/{id}/publish` | Body: `{platform}` — tracking-only `publish_records` insert |
| POST | `/ads/upload-url` | Body: `{filename, duration_seconds}` — server-side duplicate + 5-min cap check, returns S3 pre-signed PUT URL |
| GET | `/eval/weekly` | Weekly override-rate metrics, overall and per category |

---

## 7. UI Screens

### 7.1 Dashboard
- Two-pane layout: left = filters (status, product category, date range), right = search bar + table + export
- Search bar: single input, auto-suggestions, recent searches, auto-detects structured vs semantic intent
- Table columns: thumbnail, filename, status (color-coded badge), product category, AI verdict, updated date
- Export button: CSV of current filtered view

### 7.2 Ad Detail / Review
- Left pane: video player, timecode scrubber with colored markers at each flag's timestamp, filename/category/duration metadata, Reprocess button
- Right pane:
  - AI verdict vs system verdict shown side by side; AI verdict hidden if missing/malformed from parsing
  - Findings list: timestamp (click to seek), category badge, confidence, explainable description, per-finding comment input
  - Summary/action-items text field
  - Actions: Approve, Reject, Send back
  - "Publish to ad account" section (Meta / TikTok / Google Ads buttons) — **visible only when status = PUBLISHED**

### 7.3 Upload
- Drag-and-drop + file picker
- Duration validation: no warning under 2 min; soft warning 2–5 min ("recommended under 2 min"); hard block over 5 min
- Duplicate filename check before upload starts, blocks with warning
- Upload progress list showing per-file state: uploading / queued for processing / rejected (with reason)

---

## 8. Evaluation

### 8.1 Passive evaluation (v1 — no extra AI cost)
- Weekly EventBridge-scheduled Lambda
- For all ads with a human action in the past week, compare `original_status` (system prediction, immutable) against the final human decision
- Compute overall override rate + per-category override rate (via `compliance_flags.category_label` join)
- Persist to `weekly_eval_metrics`
- High per-category override rate over time is the signal to retune that category's thresholds in `compliance_rules`

### 8.2 Active evaluation (deferred, not in v1)
- Golden/benchmark dataset with known-correct labels, periodically re-run to catch prompt/model drift and A/B test prompt changes before rollout
- Costs TwelveLabs minutes — run sparingly (monthly or on-demand), not continuously

---

## 9. Open items / future phases
- Admin UI for editing `compliance_rules` thresholds (currently SQL-managed)
- Real ad-platform API integration (currently tracking-only)
- Image ad support
- Ad versioning / resubmission workflow
- Active (golden-dataset) evaluation pipeline
- UI surface for `weekly_eval_metrics` (currently query-only via `GET /eval/weekly` or direct SQL)
