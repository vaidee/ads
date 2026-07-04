'use strict';

const adsRepo = require('../../shared/adsRepo');
const { ok, notFound, parseJsonBody, badRequest } = require('../http');

// POST /ads/{id}/{approve,reject,sendback} (FR-8): all three are the same shape -
// a status transition, logged to status_history, with the override flag
// computed centrally in adsRepo.transitionStatus (FR-9).
function makeTransitionHandler(newStatus) {
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
    return ok({ ad });
  };
}

module.exports = { makeTransitionHandler };
