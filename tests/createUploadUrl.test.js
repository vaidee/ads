'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const adsRepo = require('../functions/shared/adsRepo');
const s3 = require('../functions/shared/s3');
const createUploadUrl = require('../functions/api/routes/createUploadUrl');

function eventWithBody(body) {
  return { body: JSON.stringify(body) };
}

test('rejects a duration over the 5-minute hard cap (FR-2)', async () => {
  const res = await createUploadUrl(eventWithBody({ filename: 'a.mp4', duration_seconds: 301 }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /hard maximum/);
});

test('rejects a missing filename', async () => {
  const res = await createUploadUrl(eventWithBody({ duration_seconds: 60 }));
  assert.equal(res.statusCode, 400);
});

test('rejects a duplicate filename (FR-3)', async () => {
  adsRepo.findByFilename = async () => ({ id: 'existing' });
  const res = await createUploadUrl(eventWithBody({ filename: 'dupe.mp4', duration_seconds: 60 }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /already exists/);
});

test('returns a presigned URL and required headers for a valid request', async () => {
  adsRepo.findByFilename = async () => null;
  s3.getPresignedPutUrl = async () => 'https://example.com/presigned-put';
  process.env.INGEST_BUCKET_NAME = 'ads-ingest-bucket';

  const res = await createUploadUrl(eventWithBody({ filename: 'new-ad.mp4', duration_seconds: 90 }));
  assert.equal(res.statusCode, 200);

  const body = JSON.parse(res.body);
  assert.equal(body.uploadUrl, 'https://example.com/presigned-put');
  assert.equal(body.requiredHeaders['Content-Type'], 'video/mp4');
  // x-amz-meta-* must NOT be required as headers - getPresignedPutUrl already
  // hoists them into the URL's query string, and sending them again as
  // literal headers makes S3 reject the request as tampered (see
  // createUploadUrl.js's comment).
  assert.equal(body.requiredHeaders['x-amz-meta-source'], undefined);
  assert.equal(body.requiredHeaders['x-amz-meta-duration-seconds'], undefined);
});
