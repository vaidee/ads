'use strict';

const adsRepo = require('../../shared/adsRepo');
const { toCsv } = require('../csv');

const COLUMNS = [
  { key: 'id', label: 'id' },
  { key: 'filename', label: 'filename' },
  { key: 'status', label: 'status' },
  { key: 'product_category', label: 'product_category' },
  { key: 'ai_suitability_verdict', label: 'ai_suitability_verdict' },
  { key: 'source', label: 'source' },
  { key: 'uploaded_at', label: 'uploaded_at' },
  { key: 'updated_at', label: 'updated_at' },
];

// GET /ads/export (FR-13): CSV of the current filtered ad list, same filters as GET /ads.
module.exports = async (event) => {
  const qs = event.queryStringParameters || {};
  const rows = await adsRepo.listForExport({
    status: qs.status,
    productCategory: qs.product_category,
    dateFrom: qs.date_from,
    dateTo: qs.date_to,
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="ads-export.csv"',
    },
    body: toCsv(COLUMNS, rows),
  };
};
