'use strict';

const adsRepo = require('../shared/adsRepo');
const twelveLabs = require('../shared/twelveLabs');

// SPEC.md 3.1 step 3: submit the video to TwelveLabs and create (or, on
// reprocess, reset) the ads row with status = PROCESSING.
exports.handler = async (event) => {
  const indexId = process.env.TL_INDEX_ID;
  const { taskId } = await twelveLabs.createIndexingTask(indexId, event.presignedUrl);

  const ad = event.adId
    ? await adsRepo.resetForReindex({ id: event.adId, tlIndexId: indexId, tlTaskStatus: 'pending' })
    : await adsRepo.insertForIndexing({
        filename: event.filename,
        s3Bucket: event.s3Bucket,
        s3Key: event.s3Key,
        source: event.source,
        durationSeconds: event.durationSeconds,
        tlIndexId: indexId,
        tlTaskStatus: 'pending',
      });

  return {
    ...event,
    adId: ad.id,
    tlIndexId: indexId,
    tlTaskId: taskId,
    tlTaskStatus: 'pending',
    pollCount: 0,
  };
};
