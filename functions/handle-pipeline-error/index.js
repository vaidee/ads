'use strict';

const adsRepo = require('../shared/adsRepo');

// SPEC.md 3.1 step 9: every Catch in the pipeline routes here. If the failure
// happened before an ads row existed (TriggerIngest itself), there's nothing to
// persist - just log it for CloudWatch.
exports.handler = async (event) => {
  const message = (event.error && (event.error.Cause || event.error.Error)) || 'Unknown pipeline error';

  if (event.adId) {
    await adsRepo.markError({ id: event.adId, message: String(message).slice(0, 4000) });
  } else {
    console.error(JSON.stringify({ event: 'pipeline_error_no_ad_row', message, context: event }));
  }

  return { ...event, errorMessage: message };
};
