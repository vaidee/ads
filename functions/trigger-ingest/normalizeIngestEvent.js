'use strict';

const path = require('node:path');

// TriggerIngest is invoked in one of two ways (SPEC.md section 3):
//  - an EventBridge "Object Created" notification for a PutObject into the watched
//    S3 bucket (covers both the automated drop and the UI's pre-signed-URL upload,
//    since both land in the same bucket via the same S3 event)
//  - a direct Step Functions execution input from the reprocess API Lambda, which
//    already knows the ad_id and S3 location and must bypass the duplicate check
function normalizeIngestEvent(event) {
  if (event.source === 'reprocess') {
    const { adId, s3Bucket, s3Key, filename } = event;
    if (!adId || !s3Bucket || !s3Key) {
      throw new Error('Reprocess ingest event is missing adId, s3Bucket, or s3Key');
    }
    return {
      source: 'reprocess',
      s3Bucket,
      s3Key,
      filename: filename || path.basename(s3Key),
      existingAdId: adId,
    };
  }

  const detail = event.detail;
  if (!detail || !detail.bucket || !detail.bucket.name || !detail.object || !detail.object.key) {
    throw new Error('Unrecognized TriggerIngest event shape');
  }

  return {
    source: null, // resolved from the S3 object's metadata (auto vs. manual_upload)
    s3Bucket: detail.bucket.name,
    s3Key: detail.object.key,
    filename: path.basename(detail.object.key),
    existingAdId: null,
  };
}

module.exports = { normalizeIngestEvent };
