'use strict';

const adsRepo = require('../../shared/adsRepo');
const reviewCommentsRepo = require('../../shared/reviewCommentsRepo');
const { ok, notFound, badRequest, parseJsonBody } = require('../http');

// POST /ads/{id}/comments (FR-10): persisted independently of the AI output,
// optionally scoped to a specific finding.
module.exports = async (event, user) => {
  const { id } = event.pathParameters;
  let body;
  try {
    body = parseJsonBody(event);
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (!body.comment_text || !body.comment_text.trim()) return badRequest('comment_text is required');

  const ad = await adsRepo.findById(id);
  if (!ad) return notFound('Ad not found');

  const comment = await reviewCommentsRepo.insert({
    adId: id,
    findingId: body.finding_id || null,
    commentText: body.comment_text,
    commentedBy: user.identity,
  });
  return ok({ comment });
};
