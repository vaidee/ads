'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const adsRepo = require('../functions/shared/adsRepo');
const platformComplianceRepo = require('../functions/shared/platformComplianceRepo');
const s3 = require('../functions/shared/s3');
const twelveLabs = require('../functions/shared/twelveLabs');
const runPlatformCompliance = require('../functions/run-platform-compliance/index');

const PLATFORM_RESPONSE = JSON.stringify({ platform_verdict: 'Suitable', platform_flags: [] });

test('runs all 4 platforms and upserts a row for each', async () => {
  adsRepo.findById = async () => ({ id: 'ad-1', s3_bucket: 'bucket', s3_key: 'key' });
  s3.getPresignedGetUrl = async () => 'https://example.com/video.mp4';
  twelveLabs.analyzeVideo = async () => PLATFORM_RESPONSE;

  const upserted = [];
  platformComplianceRepo.upsert = async (args) => {
    upserted.push(args);
    return args;
  };

  await runPlatformCompliance.handler({ adId: 'ad-1' });

  assert.equal(upserted.length, 4);
  const platforms = upserted.map((u) => u.platform).sort();
  assert.deepEqual(platforms, ['google_ads', 'meta', 'tiktok', 'youtube']);
  upserted.forEach((u) => assert.equal(u.platformVerdict, 'Suitable'));
});

// One platform's TwelveLabs call failing must not block the other three -
// each is isolated in its own try/catch (see run-platform-compliance/index.js).
test('one platform failing does not block the other three, and persists an Error verdict for it', async () => {
  adsRepo.findById = async () => ({ id: 'ad-1', s3_bucket: 'bucket', s3_key: 'key' });
  s3.getPresignedGetUrl = async () => 'https://example.com/video.mp4';
  twelveLabs.analyzeVideo = async (videoUrl, prompt) => {
    if (prompt.includes('Meta')) throw new Error('simulated TwelveLabs outage');
    return PLATFORM_RESPONSE;
  };

  const upserted = [];
  platformComplianceRepo.upsert = async (args) => {
    upserted.push(args);
    return args;
  };

  await runPlatformCompliance.handler({ adId: 'ad-1' });

  assert.equal(upserted.length, 4);
  const meta = upserted.find((u) => u.platform === 'meta');
  assert.equal(meta.platformVerdict, 'Error');
  const others = upserted.filter((u) => u.platform !== 'meta');
  others.forEach((u) => assert.equal(u.platformVerdict, 'Suitable'));
});
