'use strict';

const adsRepo = require('../../shared/adsRepo');
const { startReprocessExecution } = require('../../shared/stepFunctions');
const { ok, notFound } = require('../http');

// POST /ads/{id}/reprocess (FR-15): re-runs the pipeline on the same S3 file.
// adsRepo.prepareReprocess clears prior flags and increments retry_count; this
// then starts the state machine directly with source = 'reprocess', bypassing
// TriggerIngest's duplicate check and reusing the existing ad_id.
module.exports = async (event) => {
  const { id } = event.pathParameters;
  const ad = await adsRepo.prepareReprocess(id);
  if (!ad) return notFound('Ad not found');

  await startReprocessExecution({ adId: ad.id, s3Bucket: ad.s3_bucket, s3Key: ad.s3_key, filename: ad.filename });
  return ok({ ad });
};
