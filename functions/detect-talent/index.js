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
// Every branch below logs (info, not error) exactly why it stopped - the
// no-op paths and "searched but found nothing" are all silent to the
// pipeline by design (see the handler's own no-throw comment), which made
// them indistinguishable from each other and from an actual successful
// no-detections run when debugging live. These logs are the only way to
// tell which one actually happened.
exports.handler = async (event) => {
  try {
    const ad = await adsRepo.findById(event.adId);
    // client_id stays null until a client is assigned by hand (no upload-flow
    // UI for this yet, per SPEC_v2's explicitly deferred multi-tenant thread) -
    // a no-op here is the correct behavior for every ad until then.
    if (!ad || !ad.client_id || !ad.tl_video_id) {
      console.log(
        JSON.stringify({
          event: 'detect_talent_skipped',
          reason: 'no_client_or_video',
          adId: event.adId,
          clientId: ad ? ad.client_id : null,
          tlVideoId: ad ? ad.tl_video_id : null,
        })
      );
      return { ...event };
    }

    const talentRefs = await talentReferencesRepo.listActiveByClientId(ad.client_id);
    if (!talentRefs.length) {
      console.log(
        JSON.stringify({ event: 'detect_talent_skipped', reason: 'no_active_talent_references', adId: event.adId, clientId: ad.client_id })
      );
      return { ...event };
    }

    const now = new Date();
    const detections = [];

    for (const talentRef of talentRefs) {
      const hits = await twelveLabs.searchEntity(process.env.TL_INDEX_ID, talentRef.tl_entity_id);
      console.log(
        JSON.stringify({
          event: 'detect_talent_search_result',
          adId: event.adId,
          // Entity Search is index-wide (every video in the index containing
          // this entity, not just this ad's) - adTlVideoId is what
          // hits[].videoId actually needs to equal for a match; logged
          // alongside the hits so that comparison doesn't require a separate
          // DB lookup.
          adTlVideoId: ad.tl_video_id,
          talentReferenceId: talentRef.id,
          tlEntityId: talentRef.tl_entity_id,
          hitCount: hits.length,
          // capped and logged in full - this is a beta, unverified API, so
          // seeing the actual hit shape matters more than log tidiness here.
          hits: hits.slice(0, 5),
        })
      );

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
      console.log(JSON.stringify({ event: 'detect_talent_persisted', adId: event.adId, count: detections.length }));
    } else {
      console.log(
        JSON.stringify({ event: 'detect_talent_no_matches', adId: event.adId, talentReferencesChecked: talentRefs.length })
      );
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'detect_talent_error', adId: event.adId, message: err.message }));
  }

  return { ...event };
};

module.exports.computeContractStatus = computeContractStatus;
