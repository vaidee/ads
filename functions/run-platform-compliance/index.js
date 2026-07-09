'use strict';

const adsRepo = require('../shared/adsRepo');
const publishRecordsRepo = require('../shared/publishRecordsRepo');
const s3 = require('../shared/s3');
const twelveLabs = require('../shared/twelveLabs');
const { PLATFORM_PROMPTS } = require('../shared/platformPrompts');
const { parsePlatformResponse } = require('./parsePlatformResponse');

// SPEC_v2 V2-2: invoked asynchronously (fire-and-forget, InvocationType:
// 'Event') by POST /ads/{id}/publish - see functions/shared/lambdaInvoker.js
// for why this doesn't run in the API request itself. Unlike detect-talent
// (v2 phase 3), this DOES let errors throw/surface in its own CloudWatch
// logs: a reviewer is specifically waiting on this platform_verdict (even if
// asynchronously), so a silent failure would be confusing, whereas talent
// detection is passive background enrichment nobody's watching for.
exports.handler = async (event) => {
  const { adId, publishRecordId, platform } = event;

  const prompt = PLATFORM_PROMPTS[platform];
  if (!prompt) throw new Error(`No prompt variant for platform: ${platform}`);

  const ad = await adsRepo.findById(adId);
  if (!ad) throw new Error(`Ad not found: ${adId}`);

  const videoUrl = await s3.getPresignedGetUrl(ad.s3_bucket, ad.s3_key);
  const rawResponseText = await twelveLabs.analyzeVideo(videoUrl, prompt);
  const { platformVerdict, platformFlags } = parsePlatformResponse(rawResponseText);

  await publishRecordsRepo.updatePlatformResult({ id: publishRecordId, platformVerdict, platformFlags });
};
