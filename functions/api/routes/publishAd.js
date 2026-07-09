'use strict';

const adsRepo = require('../../shared/adsRepo');
const publishRecordsRepo = require('../../shared/publishRecordsRepo');
const lambdaInvoker = require('../../shared/lambdaInvoker');
const { ok, notFound, badRequest, parseJsonBody } = require('../http');

const VALID_PLATFORMS = new Set(['meta', 'tiktok', 'youtube', 'google_ads']);

// POST /ads/{id}/publish (FR-14): tracking-only log of "marked as sent to
// [platform]" - no external API call for the tracking record itself. UI only
// shows this action when status = PUBLISHED; enforced here too as defense in
// depth.
//
// SPEC_v2 V2-2: also fires the platform-specific supplementary Analyze call,
// asynchronously - the response here still returns immediately with
// platform_verdict/platform_flags null; they fill in once
// run-platform-compliance's invocation completes (see lambdaInvoker.js for why).
module.exports = async (event, user) => {
  const { id } = event.pathParameters;
  let body;
  try {
    body = parseJsonBody(event);
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (!VALID_PLATFORMS.has(body.platform)) {
    return badRequest(`platform must be one of: ${[...VALID_PLATFORMS].join(', ')}`);
  }

  const ad = await adsRepo.findById(id);
  if (!ad) return notFound('Ad not found');
  if (ad.status !== 'PUBLISHED') return badRequest('Ad must be PUBLISHED to record a publish action');

  const record = await publishRecordsRepo.insert({
    adId: id,
    platform: body.platform,
    markedBy: user.identity,
    notes: body.notes,
  });

  await lambdaInvoker.invokeAsync(process.env.RUN_PLATFORM_COMPLIANCE_FUNCTION_NAME, {
    adId: id,
    publishRecordId: record.id,
    platform: body.platform,
  });

  return ok({ record });
};
