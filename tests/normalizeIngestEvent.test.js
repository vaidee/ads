'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeIngestEvent } = require('../functions/trigger-ingest/normalizeIngestEvent');

test('normalizes an EventBridge S3 Object Created event', () => {
  const result = normalizeIngestEvent({
    source: 'aws.s3',
    'detail-type': 'Object Created',
    detail: {
      bucket: { name: 'ads-ingest-bucket' },
      object: { key: 'incoming/spring-promo.mp4' },
    },
  });

  assert.deepEqual(result, {
    source: null,
    s3Bucket: 'ads-ingest-bucket',
    s3Key: 'incoming/spring-promo.mp4',
    filename: 'spring-promo.mp4',
    existingAdId: null,
  });
});

test('normalizes a reprocess execution input', () => {
  const result = normalizeIngestEvent({
    source: 'reprocess',
    adId: 'ad-123',
    s3Bucket: 'ads-ingest-bucket',
    s3Key: 'incoming/spring-promo.mp4',
    filename: 'spring-promo.mp4',
  });

  assert.deepEqual(result, {
    source: 'reprocess',
    s3Bucket: 'ads-ingest-bucket',
    s3Key: 'incoming/spring-promo.mp4',
    filename: 'spring-promo.mp4',
    existingAdId: 'ad-123',
  });
});

test('derives filename from s3Key when a reprocess input omits it', () => {
  const result = normalizeIngestEvent({
    source: 'reprocess',
    adId: 'ad-123',
    s3Bucket: 'ads-ingest-bucket',
    s3Key: 'incoming/spring-promo.mp4',
  });

  assert.equal(result.filename, 'spring-promo.mp4');
});

test('throws on a reprocess input missing required fields', () => {
  assert.throws(() => normalizeIngestEvent({ source: 'reprocess', adId: 'ad-123' }));
});

test('throws on an unrecognized event shape', () => {
  assert.throws(() => normalizeIngestEvent({ foo: 'bar' }));
});
