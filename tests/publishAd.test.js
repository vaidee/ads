'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const adsRepo = require('../functions/shared/adsRepo');
const publishRecordsRepo = require('../functions/shared/publishRecordsRepo');
const publishAd = require('../functions/api/routes/publishAd');

function eventWithBody(id, body) {
  return { pathParameters: { id }, body: JSON.stringify(body) };
}

test('rejects an invalid platform', async () => {
  const res = await publishAd(eventWithBody('ad-1', { platform: 'not-a-real-platform' }), { identity: 'reviewer@x.com' });
  assert.equal(res.statusCode, 400);
});

test('rejects publishing an ad that is not APPROVED', async () => {
  adsRepo.findById = async () => ({ id: 'ad-1', status: 'NEEDS_REVIEW' });
  const res = await publishAd(eventWithBody('ad-1', { platform: 'meta' }), { identity: 'reviewer@x.com' });
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /must be APPROVED/);
});

// v3 status redesign: publishAd is pure FR-14 bookkeeping again - platform
// compliance runs automatically elsewhere (pipeline + Approve CTA), so this
// route no longer invokes anything, just records the tracking row.
test('records a tracking-only publish record with no side effects', async () => {
  adsRepo.findById = async () => ({ id: 'ad-1', status: 'APPROVED' });
  let inserted = null;
  publishRecordsRepo.insert = async (args) => {
    inserted = args;
    return { id: 'record-1', ad_id: 'ad-1', platform: 'meta' };
  };

  const res = await publishAd(eventWithBody('ad-1', { platform: 'meta' }), { identity: 'reviewer@x.com' });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { record: { id: 'record-1', ad_id: 'ad-1', platform: 'meta' } });
  assert.equal(inserted.platform, 'meta');
  assert.equal(inserted.markedBy, 'reviewer@x.com');
});
