'use strict';

// Baked in as a string constant rather than read from pegasus_prompt.md at
// runtime, so the Lambda deployment package doesn't need that file copied in
// alongside the esbuild bundle. Keep this in sync with pegasus_prompt.md /
// SPEC.md section 4 if the prompt changes.
const PEGASUS_PROMPT = `Analyze this beauty product video ad and return ONLY valid JSON (no markdown fences, no preamble, no explanation text outside the JSON structure).

Check for the following compliance categories:

A - ADULT CONTENT
- Nudity or sexual content
- Sexually suggestive content
- Adult themes

B - BRAND SAFETY
- Inflammatory or demeaning content
- Hateful content or symbols targeting protected groups
- Harmful or dangerous acts
- Shocking or graphic content
- Profanity or crude language

C - ALCOHOL
- Depiction or promotion of alcoholic beverages
- Alcohol branding or consumption

D - DANGEROUS/HARMFUL
- Violence or graphic content
- Drugs or dangerous substances (excluding alcohol, covered separately in C)
- Firearms and weapons
- Health misinformation or unverified claims

E - COPYRIGHT (best-effort, informational only - not a substitute for formal copyright clearance)
- Recognizable copyrighted music
- Recognizable third-party video/image content
- Visible third-party brand logos other than the advertised product

Also classify the video's PRODUCT CATEGORY as exactly one of:
["skincare", "makeup", "haircare", "fragrance", "tools_devices", "other"]

For each compliance issue found, report:
- timestamp (mm:ss when it first appears)
- category (A, B, C, D, or E)
- description: explain BOTH what was observed AND why it violates this category -
  e.g. "Wine glass visible at 0:42 during product demo; flagged under alcohol policy as
  the beverage is prominently featured rather than incidental background detail."
  Two sentences max, but must state the reasoning, not just the observation.
- confidence (a number between 0 and 1 reflecting your certainty)

Also provide your own overall suitability verdict as one of: "Suitable", "Needs Review", "Not Suitable".
This is your independent assessment only - it is advisory and will be shown alongside a separate
rules-based verdict for comparison. It does not determine the final published status.

Additionally, describe the video's content in full - this metadata will be used for search and
display, not compliance. Return:
- summary: 2-3 sentence description of what happens in the video
- detected_objects: array of notable physical objects visible (e.g. product bottle, applicator, mirror, wine glass)
- setting: brief description of the location/scene (e.g. "bathroom vanity", "outdoor studio")
- on_screen_text: array of any text/captions that appear on screen, verbatim
- mood_tone: 1-3 words describing the overall tone (e.g. "energetic, upbeat", "calm, luxury")
- key_moments: array of {timestamp, description} for notable moments (product reveal, before/after, application steps) - this replaces separately-run chapters/highlights, generated in the same pass

Return exactly this JSON structure:

{
  "product_category": "skincare",
  "ai_suitability_verdict": "Needs Review",
  "compliance_flags": [
    {
      "timestamp": "00:42",
      "category": "C",
      "description": "Wine glass visible in background during product demo",
      "confidence": 0.65
    }
  ],
  "content_metadata": {
    "summary": "A creator demonstrates a nighttime skincare routine at a bathroom vanity, applying serum and moisturizer while narrating each step.",
    "detected_objects": ["serum bottle", "moisturizer jar", "mirror", "wine glass"],
    "setting": "bathroom vanity",
    "on_screen_text": ["STEP 1: CLEANSE", "STEP 2: SERUM"],
    "mood_tone": "calm, routine",
    "key_moments": [
      {"timestamp": "00:05", "description": "Product reveal, bottle shown to camera"},
      {"timestamp": "00:42", "description": "Wine glass visible in background"}
    ]
  }
}

If no compliance issues are found, return an empty array for compliance_flags. Do not omit any field,
including content_metadata - it is required on every response, not just flagged videos.
`;

module.exports = { PEGASUS_PROMPT };
