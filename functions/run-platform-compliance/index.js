'use strict';

const adsRepo = require('../shared/adsRepo');
const platformComplianceRepo = require('../shared/platformComplianceRepo');
const s3 = require('../shared/s3');
const twelveLabs = require('../shared/twelveLabs');
const { PLATFORM_PROMPTS } = require('../shared/platformPrompts');
const { parsePlatformResponse } = require('./parsePlatformResponse');

const PLATFORMS = Object.keys(PLATFORM_PROMPTS);

// v3 status redesign: runs automatically (Step Functions Task, gated on the
// pipeline's own status reaching APPROVED) or via an async invoke from the
// Approve CTA - both call sites only ever need to pass adId, since this now
// always checks every platform rather than one at a time on a button click.
// Each platform is isolated in its own try/catch so one platform's failure
// (TwelveLabs hiccup, malformed response) can't block the other three from
// completing - on failure that platform gets an explicit 'Error' verdict
// persisted rather than being silently left missing.
async function runOne(ad, videoUrl, platform) {
  try {
    const rawResponseText = await twelveLabs.analyzeVideo(videoUrl, PLATFORM_PROMPTS[platform]);
    const { platformVerdict, platformFlags } = parsePlatformResponse(rawResponseText);
    await platformComplianceRepo.upsert({ adId: ad.id, platform, platformVerdict, platformFlags });
  } catch (err) {
    console.error(
      JSON.stringify({ event: 'platform_compliance_error', adId: ad.id, platform, message: err.message })
    );
    await platformComplianceRepo.upsert({ adId: ad.id, platform, platformVerdict: 'Error', platformFlags: [] });
  }
}

exports.handler = async (event) => {
  const { adId } = event;

  const ad = await adsRepo.findById(adId);
  if (!ad) throw new Error(`Ad not found: ${adId}`);

  const videoUrl = await s3.getPresignedGetUrl(ad.s3_bucket, ad.s3_key);
  await Promise.all(PLATFORMS.map((platform) => runOne(ad, videoUrl, platform)));

  return { ...event };
};
