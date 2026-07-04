'use strict';

const crypto = require('node:crypto');
const adsRepo = require('../../shared/adsRepo');
const s3 = require('../../shared/s3');
const { ok, badRequest, parseJsonBody } = require('../http');

const HARD_MAX_DURATION_SECONDS = 5 * 60;

// POST /ads/upload-url (FR-2, FR-3): server-side duplicate + 5-minute hard cap
// check, then a pre-signed S3 PUT URL. Duration/source are baked into the S3
// object's metadata so TriggerIngest (step 1) can recover them from the S3
// event alone - the browser must send back the exact x-amz-meta-* headers below.
module.exports = async (event) => {
  let body;
  try {
    body = parseJsonBody(event);
  } catch {
    return badRequest('Invalid JSON body');
  }

  const filename = body.filename;
  const durationSeconds = body.duration_seconds;

  if (!filename || !filename.trim()) return badRequest('filename is required');
  if (typeof durationSeconds !== 'number' || durationSeconds <= 0) {
    return badRequest('duration_seconds must be a positive number');
  }
  if (durationSeconds > HARD_MAX_DURATION_SECONDS) {
    return badRequest(`duration_seconds exceeds the ${HARD_MAX_DURATION_SECONDS}s hard maximum`);
  }

  const existing = await adsRepo.findByFilename(filename);
  if (existing) return badRequest('An ad with this filename already exists');

  const bucket = process.env.INGEST_BUCKET_NAME;
  const key = `manual-uploads/${crypto.randomUUID()}-${filename}`;
  const contentType = body.content_type || 'video/mp4';
  const roundedDuration = String(Math.round(durationSeconds));

  const uploadUrl = await s3.getPresignedPutUrl(bucket, key, {
    contentType,
    metadata: { source: 'manual_upload', 'duration-seconds': roundedDuration },
  });

  return ok({
    uploadUrl,
    bucket,
    key,
    contentType,
    requiredHeaders: {
      'Content-Type': contentType,
      'x-amz-meta-source': 'manual_upload',
      'x-amz-meta-duration-seconds': roundedDuration,
    },
  });
};
