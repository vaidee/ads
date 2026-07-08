'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  parsePegasusResponse,
  stripMarkdownFences,
  validateContentMetadata,
} = require('../functions/parse-and-persist/parsePegasusResponse');

// SPEC_v2 V2-3: required on every response - reused across fixtures below that
// need to get past that check to exercise something else.
const VALID_CONTENT_METADATA = {
  summary: 'A creator applies serum at a bathroom vanity.',
  detected_objects: ['serum bottle', 'mirror'],
  setting: 'bathroom vanity',
  on_screen_text: ['STEP 1: CLEANSE'],
  mood_tone: 'calm, routine',
  key_moments: [{ timestamp: '00:05', description: 'Product reveal' }],
};

const VALID_JSON = JSON.stringify({
  product_category: 'skincare',
  ai_suitability_verdict: 'Needs Review',
  compliance_flags: [
    { timestamp: '00:42', category: 'C', description: 'Wine glass visible in background', confidence: 0.65 },
  ],
  content_metadata: VALID_CONTENT_METADATA,
});

test('strips markdown fences around JSON', () => {
  assert.equal(stripMarkdownFences('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripMarkdownFences('```\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripMarkdownFences('{"a":1}'), '{"a":1}');
});

test('parses a clean, spec-shaped response', () => {
  const result = parsePegasusResponse(VALID_JSON);
  assert.equal(result.productCategory, 'skincare');
  assert.equal(result.aiSuitabilityVerdict, 'Needs Review');
  assert.equal(result.complianceFlags.length, 1);
  assert.deepEqual(result.complianceFlags[0], {
    timestampSeconds: 42,
    timestampDisplay: '00:42',
    category: 'C',
    categoryLabel: 'alcohol',
    description: 'Wine glass visible in background',
    confidence: 0.65,
  });
});

test('parses a response wrapped in markdown fences (per the SPEC.md parsing note)', () => {
  const result = parsePegasusResponse('```json\n' + VALID_JSON + '\n```');
  assert.equal(result.productCategory, 'skincare');
});

test('handles an empty compliance_flags array', () => {
  const result = parsePegasusResponse(
    JSON.stringify({
      product_category: 'makeup',
      ai_suitability_verdict: 'Suitable',
      compliance_flags: [],
      content_metadata: VALID_CONTENT_METADATA,
    })
  );
  assert.deepEqual(result.complianceFlags, []);
  assert.deepEqual(result.contentMetadata, VALID_CONTENT_METADATA);
});

test('throws on malformed JSON rather than guessing', () => {
  assert.throws(() => parsePegasusResponse('not json at all'), /not valid JSON/);
});

test('throws on an invalid product_category', () => {
  const bad = JSON.stringify({ product_category: 'nope', ai_suitability_verdict: 'Suitable', compliance_flags: [] });
  assert.throws(() => parsePegasusResponse(bad), /Invalid product_category/);
});

test('throws on an invalid ai_suitability_verdict', () => {
  const bad = JSON.stringify({ product_category: 'skincare', ai_suitability_verdict: 'Meh', compliance_flags: [] });
  assert.throws(() => parsePegasusResponse(bad), /Invalid ai_suitability_verdict/);
});

test('throws on an invalid flag category', () => {
  const bad = JSON.stringify({
    product_category: 'skincare',
    ai_suitability_verdict: 'Suitable',
    compliance_flags: [{ timestamp: '00:10', category: 'Z', description: 'x', confidence: 0.5 }],
    content_metadata: VALID_CONTENT_METADATA,
  });
  assert.throws(() => parsePegasusResponse(bad), /invalid category/);
});

test('throws on an out-of-range confidence', () => {
  const bad = JSON.stringify({
    product_category: 'skincare',
    ai_suitability_verdict: 'Suitable',
    compliance_flags: [{ timestamp: '00:10', category: 'A', description: 'x', confidence: 1.5 }],
    content_metadata: VALID_CONTENT_METADATA,
  });
  assert.throws(() => parsePegasusResponse(bad), /invalid confidence/);
});

test('throws on a malformed timestamp', () => {
  const bad = JSON.stringify({
    product_category: 'skincare',
    ai_suitability_verdict: 'Suitable',
    compliance_flags: [{ timestamp: 'soon', category: 'A', description: 'x', confidence: 0.5 }],
    content_metadata: VALID_CONTENT_METADATA,
  });
  assert.throws(() => parsePegasusResponse(bad), /Invalid timestamp format/);
});

// SPEC_v2 V2-3: content_metadata is required on every response.
test('throws when content_metadata is missing', () => {
  const bad = JSON.stringify({ product_category: 'skincare', ai_suitability_verdict: 'Suitable', compliance_flags: [] });
  assert.throws(() => parsePegasusResponse(bad), /content_metadata is required/);
});

test('validateContentMetadata throws on a non-string summary/setting/mood_tone', () => {
  assert.throws(
    () => validateContentMetadata({ ...VALID_CONTENT_METADATA, summary: 123 }),
    /content_metadata\.summary must be a string/
  );
});

test('validateContentMetadata throws on a non-array detected_objects/on_screen_text/key_moments', () => {
  assert.throws(
    () => validateContentMetadata({ ...VALID_CONTENT_METADATA, key_moments: 'not an array' }),
    /content_metadata\.key_moments must be an array/
  );
});
