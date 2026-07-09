'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const adsRepo = require('../functions/shared/adsRepo');
const publishRecordsRepo = require('../functions/shared/publishRecordsRepo');
const lambdaInvoker = require('../functions/shared/lambdaInvoker');
const publishAd = require('../functions/api/routes/publishAd');

function eventWithBody(id, body) {
  return { pathParameters: { id }, body: JSON.stringify(body) };
}

test('rejects an invalid platform', async () => {
  const res = await publishAd(eventWithBody('ad-1', { platform: 'not-a-real-platform' }), { identity: 'reviewer@x.com' });
  assert.equal(res.statusCode, 400);
});

test('rejects publishing an ad that is not PUBLISHED', async () => {
  adsRepo.findById = async () => ({ id: 'ad-1', status: 'NEEDS_REVIEW' });
  const res = await publishAd(eventWithBody('ad-1', { platform: 'meta' }), { identity: 'reviewer@x.com' });
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /must be PUBLISHED/);
});

// SPEC_v2 V2-2: the whole point of the async invoke is that the API response
// doesn't wait on it - assert it's fired with the right payload without ever
// awaiting/resolving it here.
test('asynchronously invokes run-platform-compliance with the new publish record', async () => {
  adsRepo.findById = async () => ({ id: 'ad-1', status: 'PUBLISHED' });
  publishRecordsRepo.insert = async () => ({ id: 'record-1', ad_id: 'ad-1', platform: 'meta' });

  let invokedWith = null;
  lambdaInvoker.invokeAsync = async (functionName, payload) => {
    invokedWith = { functionName, payload };
  };
  process.env.RUN_PLATFORM_COMPLIANCE_FUNCTION_NAME = 'ads-ingest-run-platform-compliance';

  const res = await publishAd(eventWithBody('ad-1', { platform: 'meta' }), { identity: 'reviewer@x.com' });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { record: { id: 'record-1', ad_id: 'ad-1', platform: 'meta' } });
  assert.equal(invokedWith.functionName, 'ads-ingest-run-platform-compliance');
  assert.deepEqual(invokedWith.payload, { adId: 'ad-1', publishRecordId: 'record-1', platform: 'meta' });
});
