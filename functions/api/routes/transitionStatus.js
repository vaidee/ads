'use strict';

const adsRepo = require('../../shared/adsRepo');
const lambdaInvoker = require('../../shared/lambdaInvoker');
const { ok, notFound, parseJsonBody, badRequest } = require('../http');

// POST /ads/{id}/{approve,reject,sendback} (FR-8): all three are the same shape -
// a status transition, logged to status_history, with the override flag
// computed centrally in adsRepo.transitionStatus (FR-9).
//
// v3 status redesign: the approve route additionally passes
// { triggerPlatformCompliance: true } - platform compliance runs
// automatically whenever an ad reaches APPROVED, whether the system computed
// that during the pipeline or a human reached it via this override. The CTA
// is only ever shown when the ad isn't already APPROVED (see AdDetail.jsx),
// so this can't double-fire against the pipeline's own automatic run.
function makeTransitionHandler(newStatus, { triggerPlatformCompliance = false } = {}) {
  return async (event, user) => {
    const { id } = event.pathParameters;
    let body;
    try {
      body = parseJsonBody(event);
    } catch {
      return badRequest('Invalid JSON body');
    }

    const ad = await adsRepo.transitionStatus({ id, newStatus, changedBy: user.identity, reason: body.reason });
    if (!ad) return notFound('Ad not found');

    if (triggerPlatformCompliance) {
      await lambdaInvoker.invokeAsync(process.env.RUN_PLATFORM_COMPLIANCE_FUNCTION_NAME, { adId: id });
    }

    return ok({ ad });
  };
}

module.exports = { makeTransitionHandler };
