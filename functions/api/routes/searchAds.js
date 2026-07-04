'use strict';

const adsRepo = require('../../shared/adsRepo');
const twelveLabs = require('../../shared/twelveLabs');
const { ok, badRequest } = require('../http');

// GET /ads/search (FR-12): structured search tried first, TwelveLabs semantic
// search as a fallback on zero results. Kept as separate, non-combinable result
// sets rather than merged/ranked together.
module.exports = async (event) => {
  const q = (event.queryStringParameters || {}).q;
  if (!q || !q.trim()) return badRequest('q is required');
  const query = q.trim();

  const structuredResults = await adsRepo.searchByFilename(query);
  if (structuredResults.length > 0) {
    return ok({ mode: 'structured', results: structuredResults });
  }

  const hits = await twelveLabs.semanticSearch(process.env.TL_INDEX_ID, query);
  const ads = await adsRepo.findByTlVideoIds(hits.map((h) => h.videoId));
  const scoreByVideoId = Object.fromEntries(hits.map((h) => [h.videoId, h.score]));
  const results = ads
    .map((ad) => ({ ...ad, semantic_score: scoreByVideoId[ad.tl_video_id] }))
    .sort((a, b) => b.semantic_score - a.semantic_score);

  return ok({ mode: 'semantic', results });
};
