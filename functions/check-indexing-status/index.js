'use strict';

const adsRepo = require('../shared/adsRepo');
const twelveLabs = require('../shared/twelveLabs');

// SPEC.md 3.1 step 4: one status check per Wait/Choice loop iteration.
exports.handler = async (event) => {
  const { outcome, videoId } = await twelveLabs.getTaskStatus(event.tlTaskId);

  if (outcome !== 'failed') {
    await adsRepo.updateIndexingProgress({ id: event.adId, tlTaskStatus: 'indexing', tlVideoId: videoId });
  }

  return {
    ...event,
    tlTaskStatus: outcome, // 'ready' | 'failed' | 'processing' - read by IndexingStatusChoice
    tlVideoId: videoId || event.tlVideoId || null,
    pollCount: (event.pollCount || 0) + 1,
  };
};
