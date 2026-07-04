'use strict';

const weeklyEvalRepo = require('../../shared/weeklyEvalRepo');
const { ok } = require('../http');

// GET /eval/weekly (section 8.1): overall + per-category override rate history.
module.exports = async (event) => {
  const limit = Number((event.queryStringParameters || {}).limit) || 12;
  const metrics = await weeklyEvalRepo.listRecent(limit);
  return ok({ metrics });
};
