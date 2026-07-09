'use strict';

const adsRepo = require('../../shared/adsRepo');
const publishRecordsRepo = require('../../shared/publishRecordsRepo');
const { ok, notFound, badRequest, parseJsonBody } = require('../http');

const VALID_PLATFORMS = new Set(['meta', 'tiktok', 'youtube', 'google_ads']);

// POST /ads/{id}/publish (FR-14): tracking-only log of "marked as sent to
// [platform]" - no external API call for the tracking record itself. UI only
// shows this action when status = APPROVED; enforced here too as defense in
// depth.
//
// v3 status redesign: reverted to pure FR-14 bookkeeping - platform
// compliance now runs automatically (see run-platform-compliance/index.js
// and pipeline.asl.json's PlatformComplianceChoice), independently of this
// manual "mark as sent" action, so this no longer triggers or waits on it.
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
  if (ad.status !== 'APPROVED') return badRequest('Ad must be APPROVED to record a publish action');

  const record = await publishRecordsRepo.insert({
    adId: id,
    platform: body.platform,
    markedBy: user.identity,
    notes: body.notes,
  });

  return ok({ record });
};
