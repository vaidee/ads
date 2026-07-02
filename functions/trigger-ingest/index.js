'use strict';

const s3 = require('../shared/s3');
const adsRepo = require('../shared/adsRepo');
const { normalizeIngestEvent } = require('./normalizeIngestEvent');

// SPEC.md section 3.1, step 1: receive S3 event, generate a pre-signed URL
// reference, and look up the filename in `ads` so the IsDuplicate choice state
// (step 2) can branch on the result.
exports.handler = async (event) => {
  const ctx = normalizeIngestEvent(event);

  let source = ctx.source;
  if (!source) {
    const head = await s3.headObject(ctx.s3Bucket, ctx.s3Key);
    source = (head.Metadata && head.Metadata.source) || 'auto';
  }

  // Reprocess reuses the known ad_id and must bypass the duplicate check entirely.
  const existingAd = ctx.source === 'reprocess' ? null : await adsRepo.findByFilename(ctx.filename);
  const presignedUrl = await s3.getPresignedGetUrl(ctx.s3Bucket, ctx.s3Key);

  return {
    filename: ctx.filename,
    s3Bucket: ctx.s3Bucket,
    s3Key: ctx.s3Key,
    source,
    adId: ctx.existingAdId || (existingAd ? existingAd.id : null),
    isDuplicate: Boolean(existingAd),
    presignedUrl,
  };
};
