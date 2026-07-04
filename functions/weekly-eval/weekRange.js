'use strict';

function toDateString(d) {
  return d.toISOString().slice(0, 10);
}

// SPEC.md section 8.1: computes the most recently completed Mon-Sun week
// relative to referenceDate (the EventBridge-scheduled invocation time).
function getPreviousWeekRange(referenceDate = new Date()) {
  const currentWeekStart = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  );
  const day = currentWeekStart.getUTCDay(); // 0 = Sun .. 6 = Sat
  const diffToMonday = (day + 6) % 7;
  currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - diffToMonday);

  const weekStart = new Date(currentWeekStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);

  const weekEnd = new Date(currentWeekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() - 1);

  return { weekStart: toDateString(weekStart), weekEnd: toDateString(weekEnd) };
}

module.exports = { getPreviousWeekRange };
