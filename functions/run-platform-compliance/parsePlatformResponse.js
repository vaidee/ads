'use strict';

const { stripMarkdownFences, timestampToSeconds } = require('../parse-and-persist/parsePegasusResponse');

const VALID_VERDICTS = new Set(['Suitable', 'Needs Review', 'Not Suitable']);

// Same "throw on any deviation rather than persist garbage" philosophy as
// parsePegasusResponse.js. platform_flags.category is free-form per platform
// (e.g. "before_after_claims", "branded_content_disclosure") rather than the
// fixed A-E set, since this is stored as JSONB on publish_records, not
// normalized into the compliance_flags table.
function parsePlatformResponse(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Empty platform compliance response');
  }

  let parsed;
  try {
    parsed = JSON.parse(stripMarkdownFences(rawText));
  } catch (err) {
    throw new Error(`Platform compliance response is not valid JSON: ${err.message}`);
  }

  if (!VALID_VERDICTS.has(parsed.platform_verdict)) {
    throw new Error(`Invalid platform_verdict: ${JSON.stringify(parsed.platform_verdict)}`);
  }
  if (!Array.isArray(parsed.platform_flags)) {
    throw new Error('platform_flags is not an array');
  }

  const platformFlags = parsed.platform_flags.map((flag, i) => {
    if (typeof flag.category !== 'string' || !flag.category.trim()) {
      throw new Error(`platform_flags[${i}]: missing category`);
    }
    if (typeof flag.description !== 'string' || !flag.description.trim()) {
      throw new Error(`platform_flags[${i}]: missing description`);
    }
    if (typeof flag.confidence !== 'number' || flag.confidence < 0 || flag.confidence > 1) {
      throw new Error(`platform_flags[${i}]: invalid confidence ${JSON.stringify(flag.confidence)}`);
    }
    timestampToSeconds(flag.timestamp); // throws on a malformed timestamp; only used to validate here

    return {
      timestamp: flag.timestamp,
      category: flag.category,
      description: flag.description,
      confidence: flag.confidence,
    };
  });

  return { platformVerdict: parsed.platform_verdict, platformFlags };
}

module.exports = { parsePlatformResponse };
