'use strict';

const { getAuthUser, notFound, serverError } = require('./http');
const usersRepo = require('../shared/usersRepo');

const listAds = require('./routes/listAds');
const searchAds = require('./routes/searchAds');
const exportAds = require('./routes/exportAds');
const getAdDetail = require('./routes/getAdDetail');
const { makeTransitionHandler } = require('./routes/transitionStatus');
const reprocessAd = require('./routes/reprocessAd');
const addComment = require('./routes/addComment');
const publishAd = require('./routes/publishAd');
const createUploadUrl = require('./routes/createUploadUrl');
const weeklyEval = require('./routes/weeklyEval');

// SPEC.md section 6, one entry per route. API Gateway HTTP API resolves the
// literal-segment routes (/ads/search, /ads/export, /ads/upload-url) ahead of
// the parameterized /ads/{id} ones, so there's no ambiguity to handle here.
const ROUTES = {
  'GET /ads': listAds,
  'GET /ads/search': searchAds,
  'GET /ads/export': exportAds,
  'GET /ads/{id}': getAdDetail,
  'POST /ads/{id}/approve': makeTransitionHandler('PUBLISHED'),
  'POST /ads/{id}/reject': makeTransitionHandler('REJECTED'),
  'POST /ads/{id}/sendback': makeTransitionHandler('SENT_BACK'),
  'POST /ads/{id}/reprocess': reprocessAd,
  'POST /ads/{id}/comments': addComment,
  'POST /ads/{id}/publish': publishAd,
  'POST /ads/upload-url': createUploadUrl,
  'GET /eval/weekly': weeklyEval,
};

// Single Lambda behind API Gateway HTTP API's Cognito JWT authorizer, dispatched
// by routeKey - one Lambda per route would just multiply IAM/Terraform
// boilerplate for an API this size.
exports.handler = async (event) => {
  const handler = ROUTES[event.routeKey];
  if (!handler) return notFound(`No route for ${event.routeKey}`);

  const user = getAuthUser(event);
  if (user.sub) {
    usersRepo.upsertFromClaims(user).catch((err) => console.error('Failed to upsert user', err.message));
  }

  try {
    return await handler(event, user);
  } catch (err) {
    console.error(JSON.stringify({ event: 'api_handler_error', routeKey: event.routeKey, message: err.message }));
    return serverError();
  }
};
