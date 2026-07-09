'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parsePlatformResponse } = require('../functions/run-platform-compliance/parsePlatformResponse');

const VALID_JSON = JSON.stringify({
  platform_verdict: 'Needs Review',
  platform_flags: [
    { timestamp: '00:30', category: 'before_after_claims', description: 'Unsubstantiated transformation claim.', confidence: 0.7 },
  ],
});

test('parses a clean, platform-shaped response', () => {
  const result = parsePlatformResponse(VALID_JSON);
  assert.equal(result.platformVerdict, 'Needs Review');
  assert.deepEqual(result.platformFlags, [
    { timestamp: '00:30', category: 'before_after_claims', description: 'Unsubstantiated transformation claim.', confidence: 0.7 },
  ]);
});

test('parses a response wrapped in markdown fences', () => {
  const result = parsePlatformResponse('```json\n' + VALID_JSON + '\n```');
  assert.equal(result.platformVerdict, 'Needs Review');
});

test('handles an empty platform_flags array', () => {
  const result = parsePlatformResponse(JSON.stringify({ platform_verdict: 'Suitable', platform_flags: [] }));
  assert.deepEqual(result.platformFlags, []);
});

test('throws on malformed JSON rather than guessing', () => {
  assert.throws(() => parsePlatformResponse('not json at all'), /not valid JSON/);
});

test('throws on an invalid platform_verdict', () => {
  const bad = JSON.stringify({ platform_verdict: 'Meh', platform_flags: [] });
  assert.throws(() => parsePlatformResponse(bad), /Invalid platform_verdict/);
});

test('throws on a platform_flags entry missing a category', () => {
  const bad = JSON.stringify({
    platform_verdict: 'Suitable',
    platform_flags: [{ timestamp: '00:10', description: 'x', confidence: 0.5 }],
  });
  assert.throws(() => parsePlatformResponse(bad), /missing category/);
});

test('throws on an out-of-range confidence', () => {
  const bad = JSON.stringify({
    platform_verdict: 'Suitable',
    platform_flags: [{ timestamp: '00:10', category: 'landing_page_policy', description: 'x', confidence: 1.5 }],
  });
  assert.throws(() => parsePlatformResponse(bad), /invalid confidence/);
});

test('throws on a malformed timestamp', () => {
  const bad = JSON.stringify({
    platform_verdict: 'Suitable',
    platform_flags: [{ timestamp: 'soon', category: 'misleading_claims', description: 'x', confidence: 0.5 }],
  });
  assert.throws(() => parsePlatformResponse(bad), /Invalid timestamp format/);
});
