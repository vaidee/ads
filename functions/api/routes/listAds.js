'use strict';

const adsRepo = require('../../shared/adsRepo');
const { ok } = require('../http');

// GET /ads (SPEC.md section 6): filters + offset pagination.
module.exports = async (event) => {
  const qs = event.queryStringParameters || {};
  const result = await adsRepo.list({
    status: qs.status,
    productCategory: qs.product_category,
    dateFrom: qs.date_from,
    dateTo: qs.date_to,
    sort: qs.sort,
    page: qs.page,
    limit: qs.limit,
  });
  return ok(result);
};
