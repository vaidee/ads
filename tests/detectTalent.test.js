'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const adsRepo = require('../functions/shared/adsRepo');
const talentReferencesRepo = require('../functions/shared/talentReferencesRepo');
const talentDetectionsRepo = require('../functions/shared/talentDetectionsRepo');
const twelveLabs = require('../functions/shared/twelveLabs');
const detectTalent = require('../functions/detect-talent/index');
const { computeContractStatus } = detectTalent;

test('computeContractStatus: terminated overrides everything else', () => {
  const now = new Date('2026-06-01');
  assert.equal(computeContractStatus({ status: 'terminated', contract_end: '2030-01-01' }, now), 'terminated');
});

test('computeContractStatus: contract_end in the past is expired', () => {
  const now = new Date('2026-06-01');
  assert.equal(computeContractStatus({ status: 'active', contract_end: '2026-01-01' }, now), 'expired');
});

test('computeContractStatus: contract_end in the future is within_contract', () => {
  const now = new Date('2026-06-01');
  assert.equal(computeContractStatus({ status: 'active', contract_end: '2030-01-01' }, now), 'within_contract');
});

test('computeContractStatus: no contract_end at all is within_contract', () => {
  const now = new Date('2026-06-01');
  assert.equal(computeContractStatus({ status: 'active', contract_end: null }, now), 'within_contract');
});

// SPEC_v2 V2-1: this is the load-bearing safety property - a beta-API
// surprise (or anything else going wrong) must never fail the core pipeline.
test('handler never throws, even when a dependency does', async () => {
  adsRepo.findById = async () => {
    throw new Error('simulated DB outage');
  };
  const result = await detectTalent.handler({ adId: 'ad-1' });
  assert.deepEqual(result, { adId: 'ad-1' });
});

test('handler no-ops when the ad has no client_id assigned', async () => {
  adsRepo.findById = async () => ({ id: 'ad-1', client_id: null, tl_video_id: 'v1' });
  let called = false;
  talentReferencesRepo.listActiveByClientId = async () => {
    called = true;
    return [];
  };
  await detectTalent.handler({ adId: 'ad-1' });
  assert.equal(called, false);
});

test('handler flags a match against a talent reference with a lapsed contract', async () => {
  adsRepo.findById = async () => ({ id: 'ad-1', client_id: 'client-1', tl_video_id: 'v1' });
  talentReferencesRepo.listActiveByClientId = async () => [
    { id: 'ref-1', tl_entity_id: 'entity-1', status: 'active', contract_end: '2020-01-01' },
  ];
  twelveLabs.searchEntity = async () => ({ hits: [{ videoId: 'v1', score: 0.9, start: 12.4 }], totalResults: 1 });

  let inserted = null;
  talentDetectionsRepo.bulkInsert = async (adId, detections) => {
    inserted = { adId, detections };
    return detections;
  };

  await detectTalent.handler({ adId: 'ad-1' });

  assert.equal(inserted.adId, 'ad-1');
  assert.equal(inserted.detections.length, 1);
  assert.equal(inserted.detections[0].contractStatusAtDetection, 'expired');
  assert.equal(inserted.detections[0].flagged, true);
  assert.equal(inserted.detections[0].timestampSeconds, 12);
});

test('handler does not flag a match still within contract, and skips non-matching videos', async () => {
  adsRepo.findById = async () => ({ id: 'ad-1', client_id: 'client-1', tl_video_id: 'v1' });
  talentReferencesRepo.listActiveByClientId = async () => [
    { id: 'ref-1', tl_entity_id: 'entity-1', status: 'active', contract_end: '2030-01-01' },
    { id: 'ref-2', tl_entity_id: 'entity-2', status: 'active', contract_end: null },
  ];
  twelveLabs.searchEntity = async (indexId, entityId) =>
    entityId === 'entity-1'
      ? { hits: [{ videoId: 'v1', score: 0.8, start: 5 }], totalResults: 1 }
      : { hits: [{ videoId: 'some-other-video', score: 0.9, start: 1 }], totalResults: 1 };

  let inserted = null;
  talentDetectionsRepo.bulkInsert = async (adId, detections) => {
    inserted = detections;
  };

  await detectTalent.handler({ adId: 'ad-1' });

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].talentReferenceId, 'ref-1');
  assert.equal(inserted[0].flagged, false);
});
