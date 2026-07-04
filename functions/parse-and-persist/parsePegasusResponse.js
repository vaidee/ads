'use strict';

const { CATEGORY_LABELS, PRODUCT_CATEGORIES } = require('../shared/categories');

const VALID_VERDICTS = new Set(['Suitable', 'Needs Review', 'Not Suitable']);
const TIMESTAMP_PATTERN = /^(\d{1,3}):([0-5]\d)$/;

// SPEC.md section 4's parsing note: Pegasus output is LLM-generated text, and
// even with strict formatting instructions may include markdown fences.
function stripMarkdownFences(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function timestampToSeconds(timestamp) {
  const match = TIMESTAMP_PATTERN.exec(timestamp);
  if (!match) throw new Error(`Invalid timestamp format: ${JSON.stringify(timestamp)}`);
  const [, minutes, seconds] = match;
  return Number(minutes) * 60 + Number(seconds);
}

// Validates against the schema in SPEC.md section 4 and throws on any
// deviation, rather than assuming clean output - the caller's Catch turns that
// into an ERROR status (SPEC.md 3.1 step 9) instead of persisting garbage.
function parsePegasusResponse(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Empty Pegasus response');
  }

  let parsed;
  try {
    parsed = JSON.parse(stripMarkdownFences(rawText));
  } catch (err) {
    throw new Error(`Pegasus response is not valid JSON: ${err.message}`);
  }

  if (!PRODUCT_CATEGORIES.includes(parsed.product_category)) {
    throw new Error(`Invalid product_category: ${JSON.stringify(parsed.product_category)}`);
  }
  if (!VALID_VERDICTS.has(parsed.ai_suitability_verdict)) {
    throw new Error(`Invalid ai_suitability_verdict: ${JSON.stringify(parsed.ai_suitability_verdict)}`);
  }
  if (!Array.isArray(parsed.compliance_flags)) {
    throw new Error('compliance_flags is not an array');
  }

  const complianceFlags = parsed.compliance_flags.map((flag, i) => {
    if (!CATEGORY_LABELS[flag.category]) {
      throw new Error(`compliance_flags[${i}]: invalid category ${JSON.stringify(flag.category)}`);
    }
    if (typeof flag.description !== 'string' || !flag.description.trim()) {
      throw new Error(`compliance_flags[${i}]: missing description`);
    }
    if (typeof flag.confidence !== 'number' || flag.confidence < 0 || flag.confidence > 1) {
      throw new Error(`compliance_flags[${i}]: invalid confidence ${JSON.stringify(flag.confidence)}`);
    }

    return {
      timestampSeconds: timestampToSeconds(flag.timestamp),
      timestampDisplay: flag.timestamp,
      category: flag.category,
      categoryLabel: CATEGORY_LABELS[flag.category],
      description: flag.description,
      confidence: flag.confidence,
    };
  });

  return {
    productCategory: parsed.product_category,
    aiSuitabilityVerdict: parsed.ai_suitability_verdict,
    complianceFlags,
    rawParsed: parsed,
  };
}

module.exports = { parsePegasusResponse, stripMarkdownFences, timestampToSeconds };
