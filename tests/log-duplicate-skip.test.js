'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { handler } = require('../functions/log-duplicate-skip/index');

test('logs the skipped duplicate and passes the input through with skipped=true', async () => {
  const originalLog = console.log;
  let logged;
  console.log = (msg) => {
    logged = msg;
  };

  try {
    const input = {
      filename: 'spring-promo.mp4',
      s3Bucket: 'ads-ingest-bucket',
      s3Key: 'incoming/spring-promo.mp4',
      source: 'auto',
      adId: 'existing-ad-id',
      isDuplicate: true,
    };

    const result = await handler(input);

    assert.equal(result.skipped, true);
    assert.equal(result.adId, 'existing-ad-id');

    const parsed = JSON.parse(logged);
    assert.equal(parsed.event, 'duplicate_skipped');
    assert.equal(parsed.filename, 'spring-promo.mp4');
    assert.equal(parsed.existingAdId, 'existing-ad-id');
  } finally {
    console.log = originalLog;
  }
});
