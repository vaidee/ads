'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const s3 = require('../functions/shared/s3');
const adsRepo = require('../functions/shared/adsRepo');
const { handler } = require('../functions/trigger-ingest/index');

test('flags a filename that already exists in ads as a duplicate', async () => {
  s3.headObject = async () => ({ Metadata: { source: 'auto' } });
  s3.getPresignedGetUrl = async () => 'https://example.com/presigned';
  adsRepo.findByFilename = async () => ({ id: 'existing-ad-id', status: 'APPROVED' });

  const result = await handler({
    source: 'aws.s3',
    'detail-type': 'Object Created',
    detail: { bucket: { name: 'ads-ingest-bucket' }, object: { key: 'incoming/spring-promo.mp4' } },
  });

  assert.equal(result.isDuplicate, true);
  assert.equal(result.adId, 'existing-ad-id');
  assert.equal(result.source, 'auto');
  assert.equal(result.presignedUrl, 'https://example.com/presigned');
});

test('a reprocess run is never treated as a duplicate and skips the filename lookup', async () => {
  let lookupCalled = false;
  adsRepo.findByFilename = async () => {
    lookupCalled = true;
    return { id: 'should-not-be-used' };
  };
  s3.getPresignedGetUrl = async () => 'https://example.com/presigned';

  const result = await handler({
    source: 'reprocess',
    adId: 'existing-ad-id',
    s3Bucket: 'ads-ingest-bucket',
    s3Key: 'incoming/spring-promo.mp4',
    filename: 'spring-promo.mp4',
  });

  assert.equal(lookupCalled, false);
  assert.equal(result.isDuplicate, false);
  assert.equal(result.adId, 'existing-ad-id');
  assert.equal(result.source, 'reprocess');
});

test('defaults source to auto when the S3 object has no source metadata', async () => {
  s3.headObject = async () => ({ Metadata: {} });
  s3.getPresignedGetUrl = async () => 'https://example.com/presigned';
  adsRepo.findByFilename = async () => null;

  const result = await handler({
    detail: { bucket: { name: 'ads-ingest-bucket' }, object: { key: 'incoming/new-ad.mp4' } },
  });

  assert.equal(result.source, 'auto');
  assert.equal(result.isDuplicate, false);
  assert.equal(result.adId, null);
});

test('reads manual_upload source from S3 object metadata', async () => {
  s3.headObject = async () => ({ Metadata: { source: 'manual_upload' } });
  s3.getPresignedGetUrl = async () => 'https://example.com/presigned';
  adsRepo.findByFilename = async () => null;

  const result = await handler({
    detail: { bucket: { name: 'ads-ingest-bucket' }, object: { key: 'incoming/uploaded-ad.mp4' } },
  });

  assert.equal(result.source, 'manual_upload');
});
