'use strict';

const adsRepo = require('../shared/adsRepo');
const talentReferencesRepo = require('../shared/talentReferencesRepo');
const talentDetectionsRepo = require('../shared/talentDetectionsRepo');
const twelveLabs = require('../shared/twelveLabs');

// SPEC_v2 V2-1: contract_status_at_detection reflects the talent reference's
// state AT THE TIME OF THIS DETECTION (not re-evaluated later), same
// "snapshot, not live" philosophy as ads.original_status.
function computeContractStatus(talentRef, now) {
  if (talentRef.status === 'terminated') return 'terminated';
  if (talentRef.contract_end && new Date(talentRef.contract_end) < now) return 'expired';
  return 'within_contract';
}

// Inserted between PersistFinal and PipelineSucceeded (tail-end of the
// pipeline) - talent/contract compliance is advisory/contractual-risk, not a
// content-safety verdict (SPEC_v2 V2-1: kept visually separate in the UI, and
// never affects the ad's actual PUBLISHED/REJECTED status). This handler
// deliberately never throws: a beta-API surprise here (Entity Search,
// Marengo 3.0, unverified against a live account) must never fail the core
// ad-review pipeline the way every other pipeline Lambda is allowed to.
exports.handler = async (event) => {
  try {
    const ad = await adsRepo.findById(event.adId);
    // client_id stays null until a client is assigned by hand (no upload-flow
    // UI for this yet, per SPEC_v2's explicitly deferred multi-tenant thread) -
    // a no-op here is the correct behavior for every ad until then.
    if (!ad || !ad.client_id || !ad.tl_video_id) return { ...event };

    const talentRefs = await talentReferencesRepo.listActiveByClientId(ad.client_id);
    if (!talentRefs.length) return { ...event };

    const now = new Date();
    const detections = [];

    for (const talentRef of talentRefs) {
      const hits = await twelveLabs.searchEntity(process.env.TL_INDEX_ID, talentRef.tl_entity_id);
      const match = hits.find((h) => h.videoId === ad.tl_video_id);
      if (!match) continue;

      const contractStatusAtDetection = computeContractStatus(talentRef, now);
      detections.push({
        talentReferenceId: talentRef.id,
        timestampSeconds: Math.round(match.start || 0),
        confidence: match.score,
        contractStatusAtDetection,
        flagged: contractStatusAtDetection !== 'within_contract',
      });
    }

    if (detections.length) {
      await talentDetectionsRepo.bulkInsert(event.adId, detections);
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'detect_talent_error', adId: event.adId, message: err.message }));
  }

  return { ...event };
};

module.exports.computeContractStatus = computeContractStatus;
