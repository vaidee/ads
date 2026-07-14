import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';

// SPEC.md section 8.1: weekly_eval_metrics has one 'overall' row per week
// (category_label = null) plus one row per compliance category - group them
// back together here for display. Fetches a generous row limit since the
// API's `limit` counts rows, not weeks (each week is ~1 overall + N category
// rows), so a small limit could cut a week's category breakdown off midway.
const ROW_LIMIT = 200;

function groupByWeek(metrics) {
  const weeks = new Map();
  for (const row of metrics) {
    const key = row.week_start;
    if (!weeks.has(key)) weeks.set(key, { weekStart: row.week_start, weekEnd: row.week_end, overall: null, categories: [] });
    const week = weeks.get(key);
    if (row.category_label) {
      week.categories.push(row);
    } else {
      week.overall = row;
    }
  }
  return [...weeks.values()].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

function formatRate(rate) {
  return rate === null || rate === undefined ? '-' : `${(Number(rate) * 100).toFixed(1)}%`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString();
}

export default function WeeklyEval() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await api.weeklyEval(ROW_LIMIT);
      setMetrics(result.metrics);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!metrics) return <p className="muted">Loading...</p>;

  const weeks = groupByWeek(metrics);

  return (
    <div>
      <h2>Weekly evaluation</h2>
      <p className="muted">
        Passive calibration signal (SPEC.md 8.1) - how often a human review action (approve/reject/send back)
        overrode the system's own computed status, overall and per compliance category. No TwelveLabs cost - pure
        aggregation of review activity already collected.
      </p>

      {weeks.length === 0 && <p className="muted">No weekly evaluation data yet.</p>}

      {weeks.map((week) => (
        <div key={week.weekStart} className="panel" style={{ marginTop: '1rem' }}>
          <h4>
            {formatDate(week.weekStart)} - {formatDate(week.weekEnd)}
          </h4>
          {week.overall ? (
            <p>
              Overall: {week.overall.total_reviewed} reviewed, {week.overall.total_overridden} overridden (
              {formatRate(week.overall.override_rate)})
            </p>
          ) : (
            <p className="muted">No overall row for this week.</p>
          )}

          {week.categories.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Reviewed</th>
                  <th>Overridden</th>
                  <th>Override rate</th>
                </tr>
              </thead>
              <tbody>
                {week.categories.map((c) => (
                  <tr key={c.id}>
                    <td>{c.category_label}</td>
                    <td>{c.total_reviewed}</td>
                    <td>{c.total_overridden}</td>
                    <td>{formatRate(c.override_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
