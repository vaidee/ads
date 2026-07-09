'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { computeVerdict, computeOverallStatus } = require('../functions/apply-suggestion-logic/index');

const rule = { min_confidence_reject: 0.7, min_confidence_review: 0.35 };

test('computeVerdict rejects at/above the reject threshold', () => {
  assert.equal(computeVerdict(rule, 0.7), 'REJECT');
  assert.equal(computeVerdict(rule, 0.95), 'REJECT');
});

test('computeVerdict flags for review between thresholds', () => {
  assert.equal(computeVerdict(rule, 0.35), 'NEEDS_REVIEW');
  assert.equal(computeVerdict(rule, 0.5), 'NEEDS_REVIEW');
});

test('computeVerdict ignores below the review threshold', () => {
  assert.equal(computeVerdict(rule, 0.34), 'IGNORED');
});

test('computeVerdict ignores when there is no enabled rule for the category', () => {
  assert.equal(computeVerdict(undefined, 0.99), 'IGNORED');
});

test('computeOverallStatus: worst-flag-wins (SPEC.md 3.2) - REJECT beats NEEDS_REVIEW', () => {
  assert.equal(computeOverallStatus(['IGNORED', 'NEEDS_REVIEW', 'REJECT'], false), 'REJECTED');
});

test('computeOverallStatus: NEEDS_REVIEW beats no flags/IGNORED-only', () => {
  assert.equal(computeOverallStatus(['IGNORED', 'NEEDS_REVIEW'], false), 'NEEDS_REVIEW');
});

test('computeOverallStatus: no flags at all -> APPROVED by default', () => {
  assert.equal(computeOverallStatus([], false), 'APPROVED');
});

test('computeOverallStatus: all IGNORED -> APPROVED', () => {
  assert.equal(computeOverallStatus(['IGNORED', 'IGNORED'], false), 'APPROVED');
});

// v3 status redesign: a flagged talent detection floors an otherwise-clean
// result at NEEDS_REVIEW, but never downgrades an existing REJECTED.
test('computeOverallStatus: talentFlagged floors a clean result at NEEDS_REVIEW', () => {
  assert.equal(computeOverallStatus(['IGNORED'], true), 'NEEDS_REVIEW');
  assert.equal(computeOverallStatus([], true), 'NEEDS_REVIEW');
});

test('computeOverallStatus: talentFlagged does not downgrade an existing REJECTED', () => {
  assert.equal(computeOverallStatus(['REJECT'], true), 'REJECTED');
});

test('computeOverallStatus: talentFlagged false and no flags -> still APPROVED', () => {
  assert.equal(computeOverallStatus([], false), 'APPROVED');
});
