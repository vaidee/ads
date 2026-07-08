'use strict';

const adsRepo = require('../shared/adsRepo');
const complianceFlagsRepo = require('../shared/complianceFlagsRepo');
const { parsePegasusResponse } = require('./parsePegasusResponse');

// SPEC.md 3.1 step 6: persist raw_ai_response, product_category,
// ai_suitability_verdict, content_metadata (SPEC_v2 V2-3), and normalized
// compliance_flags rows.
exports.handler = async (event) => {
  const parsed = parsePegasusResponse(event.rawResponseText);

  await adsRepo.persistAnalysis({
    id: event.adId,
    productCategory: parsed.productCategory,
    aiSuitabilityVerdict: parsed.aiSuitabilityVerdict,
    rawAiResponse: parsed.rawParsed,
    contentMetadata: parsed.contentMetadata,
  });
  await complianceFlagsRepo.bulkInsert(event.adId, parsed.complianceFlags);
  await adsRepo.setTlTaskStatus(event.adId, 'done');

  // Drop the raw text from the execution payload - it's persisted in Postgres
  // now, no need to keep carrying it through the rest of the state machine.
  return { ...event, rawResponseText: undefined };
};
