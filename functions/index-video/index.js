'use strict';

const adsRepo = require('../shared/adsRepo');
const twelveLabs = require('../shared/twelveLabs');

// SPEC.md 3.1 step 3: submit the video to TwelveLabs and create (or, on
// reprocess, reset) the ads row with status = PROCESSING.
//
// On reprocess, if a prior run already indexed this video successfully
// (tl_video_id already set), skip re-submitting to TwelveLabs entirely -
// indexing minutes would be wasted re-indexing unchanged video content, and
// only the analysis/persistence steps need to re-run.
exports.handler = async (event) => {
  const indexId = process.env.TL_INDEX_ID;

  if (event.adId) {
    const existingAd = await adsRepo.findById(event.adId);
    if (existingAd && existingAd.tl_video_id) {
      const ad = await adsRepo.resetForReanalysis({ id: event.adId, tlTaskStatus: 'ready' });
      return {
        ...event,
        adId: ad.id,
        tlIndexId: ad.tl_index_id,
        tlVideoId: ad.tl_video_id,
        tlTaskStatus: 'ready',
        pollCount: 0,
      };
    }
  }

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
