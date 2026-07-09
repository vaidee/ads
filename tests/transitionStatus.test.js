'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const adsRepo = require('../functions/shared/adsRepo');
const lambdaInvoker = require('../functions/shared/lambdaInvoker');
const { makeTransitionHandler } = require('../functions/api/routes/transitionStatus');

function eventWithBody(id, body) {
  return { pathParameters: { id }, body: JSON.stringify(body || {}) };
}

// v3 status redesign: only the approve route is registered with
// { triggerPlatformCompliance: true } (see functions/api/index.js) - platform
// compliance runs automatically whenever an ad reaches APPROVED, whether the
// system computed that or a human override did.
test('approve handler invokes run-platform-compliance after a successful transition', async () => {
  adsRepo.transitionStatus = async () => ({ id: 'ad-1', status: 'APPROVED' });
  let invokedWith = null;
  lambdaInvoker.invokeAsync = async (functionName, payload) => {
    invokedWith = { functionName, payload };
  };
  process.env.RUN_PLATFORM_COMPLIANCE_FUNCTION_NAME = 'ads-ingest-run-platform-compliance';

  const approve = makeTransitionHandler('APPROVED', { triggerPlatformCompliance: true });
  const res = await approve(eventWithBody('ad-1'), { identity: 'reviewer@x.com' });

  assert.equal(res.statusCode, 200);
  assert.equal(invokedWith.functionName, 'ads-ingest-run-platform-compliance');
  assert.deepEqual(invokedWith.payload, { adId: 'ad-1' });
});

test('reject/sendback handlers never invoke run-platform-compliance', async () => {
  adsRepo.transitionStatus = async () => ({ id: 'ad-1', status: 'REJECTED' });
  let invoked = false;
  lambdaInvoker.invokeAsync = async () => {
    invoked = true;
  };

  const reject = makeTransitionHandler('REJECTED');
  const res = await reject(eventWithBody('ad-1'), { identity: 'reviewer@x.com' });

  assert.equal(res.statusCode, 200);
  assert.equal(invoked, false);
});

test('returns 404 when the ad does not exist, without invoking anything', async () => {
  adsRepo.transitionStatus = async () => null;
  let invoked = false;
  lambdaInvoker.invokeAsync = async () => {
    invoked = true;
  };

  const approve = makeTransitionHandler('APPROVED', { triggerPlatformCompliance: true });
  const res = await approve(eventWithBody('missing-ad'), { identity: 'reviewer@x.com' });

  assert.equal(res.statusCode, 404);
  assert.equal(invoked, false);
});
