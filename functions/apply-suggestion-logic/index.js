'use strict';

const complianceFlagsRepo = require('../shared/complianceFlagsRepo');
const complianceRulesRepo = require('../shared/complianceRulesRepo');

function computeVerdict(rule, confidence) {
  if (!rule) return 'IGNORED';
  if (confidence >= Number(rule.min_confidence_reject)) return 'REJECT';
  if (confidence >= Number(rule.min_confidence_review)) return 'NEEDS_REVIEW';
  return 'IGNORED';
}

// v3 status redesign: talentFlagged (from detect-talent, now run before this
// step) floors an otherwise-clean result at NEEDS_REVIEW - a lapsed/terminated
// contracted talent detection is a real compliance risk even when every
// content flag is clean. It never downgrades an existing REJECTED though -
// REJECT still wins regardless.
function computeOverallStatus(verdicts, talentFlagged) {
  if (verdicts.includes('REJECT')) return 'REJECTED';
  if (verdicts.includes('NEEDS_REVIEW') || talentFlagged) return 'NEEDS_REVIEW';
  return 'APPROVED'; // SPEC.md 3.2: no flags (or all IGNORED), no talent flag -> APPROVED by default
}

// SPEC.md 3.1 step 7 / 3.2: per-flag computed_verdict from compliance_rules
// thresholds, then worst-flag-wins for the overall status. original_status and
// status on the ads row are written by PersistFinal (step 8), not here.
exports.handler = async (event) => {
  const [flags, rules] = await Promise.all([
    complianceFlagsRepo.listByAdId(event.adId),
    complianceRulesRepo.listEnabled(),
  ]);

  const rulesByCategory = Object.fromEntries(rules.map((r) => [r.category_label, r]));

  const verdicts = await Promise.all(
    flags.map(async (flag) => {
      const verdict = computeVerdict(rulesByCategory[flag.category_label], Number(flag.confidence));
      await complianceFlagsRepo.updateComputedVerdict(flag.id, verdict);
      return verdict;
    })
  );

  return { ...event, computedStatus: computeOverallStatus(verdicts, Boolean(event.talentFlagged)) };
};

module.exports.computeVerdict = computeVerdict;
module.exports.computeOverallStatus = computeOverallStatus;
