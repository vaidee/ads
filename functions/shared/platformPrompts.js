'use strict';

// SPEC_v2 V2-2: on-demand, per-platform supplementary Analyze call, triggered
// only when a reviewer clicks "Publish to [Platform]" on an already-PUBLISHED
// ad - not run upfront for every platform on every video (would multiply
// Analyze minutes, conflicting with NFR-1). Each variant re-asks the same core
// A-E categories for consistency of output shape, plus platform-specific
// additions, so every variant returns the same {platform_verdict,
// platform_flags} shape regardless of platform. platform_flags is stored as
// JSONB on publish_records (not normalized into compliance_flags), so its
// category values are free-form per-platform labels, not the fixed A-E set.
//
// NOTE (same caveat as pegasusPrompt.js's core prompt): good-faith compliance
// guidance based on each platform's publicly documented ad policies at the
// time this was written, not legal advice or a substitute for the platform's
// own review process.
const CORE_CATEGORIES_REMINDER = `Also re-check for the same universal categories the core review already covers, and include any you find in platform_flags using these category values: adult_content, brand_safety, alcohol, dangerous_harmful, copyright.

A - ADULT CONTENT: nudity, sexual content, sexually suggestive content, adult themes.
B - BRAND SAFETY: inflammatory/demeaning content, hateful content/symbols, harmful or dangerous acts, shocking/graphic content, profanity.
C - ALCOHOL: depiction or promotion of alcoholic beverages, alcohol branding or consumption.
D - DANGEROUS/HARMFUL: violence, drugs/dangerous substances (excluding alcohol), firearms/weapons, health misinformation.
E - COPYRIGHT (best-effort, informational only): recognizable copyrighted music, third-party video/image content, third-party brand logos.`;

const RESPONSE_FORMAT = `Return ONLY valid JSON (no markdown fences, no preamble, no explanation text outside the JSON structure), in exactly this shape:

{
  "platform_verdict": "Needs Review",
  "platform_flags": [
    {
      "timestamp": "00:42",
      "category": "before_after_claims",
      "description": "Two sentences max: what was observed, and why it violates this platform's policy.",
      "confidence": 0.7
    }
  ]
}

platform_verdict must be exactly one of: "Suitable", "Needs Review", "Not Suitable". If no issues are found, return an empty array for platform_flags. Do not omit either field.`;

const META_PROMPT = `Analyze this beauty product video ad for Meta (Facebook/Instagram) ad policy compliance.

Check specifically for:
- BEFORE/AFTER TRANSFORMATION CLAIMS: unrealistic or unsubstantiated before/after results, implied guaranteed outcomes, misleading visual comparisons (lighting/angle/filter tricks exaggerating a transformation) - use category "before_after_claims"
- TESTIMONIAL SUBSTANTIATION: endorsements or testimonials presented without clear disclosure that they reflect one person's experience, or specific outcome claims made by a testimonial without supporting evidence - use category "testimonial_substantiation"

${CORE_CATEGORIES_REMINDER}

${RESPONSE_FORMAT}
`;

const TIKTOK_PROMPT = `Analyze this beauty product video ad for TikTok ad policy compliance.

Check specifically for:
- MISLEADING CLAIMS / CHALLENGE FRAMING: exaggerated efficacy claims, framing product use as a "challenge" in a way that could encourage risky imitation or misrepresent typical results - use category "misleading_claims"
- BRANDED CONTENT DISCLOSURE: paid partnership or branded content that isn't clearly and prominently disclosed as such - use category "branded_content_disclosure"

${CORE_CATEGORIES_REMINDER}

${RESPONSE_FORMAT}
`;

const GOOGLE_ADS_PROMPT = `Analyze this beauty product video ad for Google Ads policy compliance.

Check specifically for:
- DESTINATION/LANDING PAGE POLICY ALIGNMENT: claims or offers in the ad (discounts, guarantees, specific results) that a typical landing page would need to substantiate but that read as unverifiable or bait-and-switch as presented in the ad itself - use category "landing_page_policy"

${CORE_CATEGORIES_REMINDER}

${RESPONSE_FORMAT}
`;

// YouTube: SPEC_v2 says its ad content framework is already covered by the
// core categories (no platform-specific additions needed) - so this variant
// is just the shared category re-check with no extra section, still using
// the platform response shape (not the core prompt's shape, which has
// different fields/JSON structure this route doesn't need).
const YOUTUBE_PROMPT = `Analyze this beauty product video ad for YouTube ad policy compliance.

${CORE_CATEGORIES_REMINDER}

${RESPONSE_FORMAT}
`;

const PLATFORM_PROMPTS = {
  meta: META_PROMPT,
  tiktok: TIKTOK_PROMPT,
  youtube: YOUTUBE_PROMPT,
  google_ads: GOOGLE_ADS_PROMPT,
};

module.exports = { PLATFORM_PROMPTS };
