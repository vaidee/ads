'use strict';

const adsRepo = require('../shared/adsRepo');
const twelveLabs = require('../shared/twelveLabs');
const { PEGASUS_PROMPT } = require('../shared/pegasusPrompt');

// SPEC.md 3.1 step 5: single combined Pegasus Analyze call (NFR-1) - do not
// split into separate compliance/category/summary calls.
exports.handler = async (event) => {
  await adsRepo.setTlTaskStatus(event.adId, 'analyzing');
  // analyzeVideo takes the video's own URL, not its (Marengo) index video_id -
  // see functions/shared/twelveLabs.js.
  const rawResponseText = await twelveLabs.analyzeVideo(event.presignedUrl, PEGASUS_PROMPT);

  return { ...event, rawResponseText };
};
