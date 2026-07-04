'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { getPreviousWeekRange } = require('../functions/weekly-eval/weekRange');

test('a Monday reference date resolves to the just-completed Mon-Sun week', () => {
  // 2026-07-06 is a Monday.
  const { weekStart, weekEnd } = getPreviousWeekRange(new Date('2026-07-06T06:00:00Z'));
  assert.equal(weekStart, '2026-06-29'); // Monday
  assert.equal(weekEnd, '2026-07-05'); // Sunday
});

test('a mid-week reference date still resolves to the previous full week', () => {
  // 2026-07-08 is a Wednesday.
  const { weekStart, weekEnd } = getPreviousWeekRange(new Date('2026-07-08T12:00:00Z'));
  assert.equal(weekStart, '2026-06-29');
  assert.equal(weekEnd, '2026-07-05');
});

test('a Sunday reference date treats the week as not yet rolled over', () => {
  // 2026-07-05 is a Sunday - still within the week starting 2026-06-29.
  const { weekStart, weekEnd } = getPreviousWeekRange(new Date('2026-07-05T23:00:00Z'));
  assert.equal(weekStart, '2026-06-22');
  assert.equal(weekEnd, '2026-06-28');
});
