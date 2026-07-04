'use strict';

const adsRepo = require('../shared/adsRepo');

// SPEC.md 3.1 step 8: writes the ad-level status decision (setting
// original_status the first time, per section 3.2) and the status_history entry.
exports.handler = async (event) => {
  const ad = await adsRepo.setComputedStatus({ id: event.adId, newStatus: event.computedStatus });
  return { ...event, status: ad.status, originalStatus: ad.original_status };
};
