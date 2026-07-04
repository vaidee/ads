'use strict';

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function ok(body) {
  return json(200, body);
}
function badRequest(message) {
  return json(400, { error: message });
}
function notFound(message = 'Not found') {
  return json(404, { error: message });
}
function serverError(message = 'Internal server error') {
  return json(500, { error: message });
}

function parseJsonBody(event) {
  if (!event.body) return {};
  return JSON.parse(event.body);
}

// API Gateway HTTP API + Cognito JWT authorizer: claims land in
// requestContext.authorizer.jwt.claims (payload format 2.0).
function getAuthUser(event) {
  const claims = (event.requestContext.authorizer && event.requestContext.authorizer.jwt.claims) || {};
  const identity = claims.email || claims['cognito:username'] || claims.sub;
  return { sub: claims.sub, email: claims.email, identity };
}

module.exports = { ok, badRequest, notFound, serverError, parseJsonBody, getAuthUser };
