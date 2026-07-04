'use strict';

// SPEC.md section 4 (AI prompt categories) <-> section 5 (compliance_flags.category_label)
const CATEGORY_LABELS = {
  A: 'adult_content',
  B: 'brand_safety',
  C: 'alcohol',
  D: 'dangerous_harmful',
  E: 'copyright',
};

const PRODUCT_CATEGORIES = ['skincare', 'makeup', 'haircare', 'fragrance', 'tools_devices', 'other'];

module.exports = { CATEGORY_LABELS, PRODUCT_CATEGORIES };
