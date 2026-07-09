import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';

const PLATFORMS = ['meta', 'tiktok', 'youtube', 'google_ads'];

export default function AdDetail() {
  const { id } = useParams();
  const videoRef = useRef(null);
  const [data, setData] = useState(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState({}); // findingId (or 'general') -> text

  const load = useCallback(async () => {
    try {
      const result = await api.getAd(id);
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <p className="muted">Loading...</p>;

  const { ad, playbackUrl, flags, comments, statusHistory, publishRecords, talentDetections, platformCompliance } =
    data;

  function seekTo(seconds) {
    if (videoRef.current) videoRef.current.currentTime = seconds;
  }

  async function runAction(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(findingId) {
    const key = findingId || 'general';
    const text = (commentDrafts[key] || '').trim();
    if (!text) return;
    await runAction(() => api.addComment(id, text, findingId));
    setCommentDrafts((d) => ({ ...d, [key]: '' }));
  }

  return (
    <div className="detail-layout">
      <div>
        <div className="video-wrap">
          <video
            ref={videoRef}
            src={playbackUrl}
            controls
            onLoadedMetadata={(e) => setDuration(e.target.duration)}
          />
          {duration > 0 && (
            <div className="scrubber">
              {flags.map((flag) => (
                <div
                  key={flag.id}
                  className="scrubber-marker"
                  title={`${flag.timestamp_display} - ${flag.category_label}`}
                  style={{
                    left: `${(flag.timestamp_seconds / duration) * 100}%`,
                    background: markerColor(flag.computed_verdict),
                  }}
                  onClick={() => seekTo(flag.timestamp_seconds)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="panel" style={{ marginTop: '1rem' }}>
          <p>
            <strong>{ad.filename}</strong>
          </p>
          <p className="muted">
            Category: {ad.product_category || 'unknown'} - Source: {ad.source} - Duration:{' '}
            {ad.duration_seconds ? `${ad.duration_seconds}s` : 'unknown'}
          </p>
          <p>
            <StatusBadge status={ad.status} />
            {ad.is_overridden && <span className="muted"> (overridden by {ad.overridden_by})</span>}
          </p>
          <button disabled={busy} onClick={() => runAction(() => api.reprocess(id))}>
            Reprocess
          </button>
        </div>

        {ad.content_metadata && (
          <div className="panel" style={{ marginTop: '1rem' }}>
            <h4>Content overview</h4>
            <p>{ad.content_metadata.summary}</p>
            <p className="muted">
              Setting: {ad.content_metadata.setting || 'unknown'} - Mood/tone: {ad.content_metadata.mood_tone || 'unknown'}
            </p>
            {ad.content_metadata.key_moments && ad.content_metadata.key_moments.length > 0 && (
              <div>
                {ad.content_metadata.key_moments.map((moment, i) => (
                  <p key={i} className="muted">
                    <span className="timestamp" onClick={() => seekTo(timestampToSeconds(moment.timestamp))}>
                      {moment.timestamp}
                    </span>{' '}
                    {moment.description}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="panel" style={{ marginTop: '1rem' }}>
          <h4>Status history</h4>
          {statusHistory.map((h) => (
            <p key={h.id} className="muted">
              {new Date(h.changed_at).toLocaleString()}: {h.old_status || 'none'} &rarr; {h.new_status} (
              {h.changed_by})
              {h.reason ? ` - ${h.reason}` : ''}
            </p>
          ))}
        </div>
      </div>

      <div>
        <div className="panel">
          <h4>Verdicts</h4>
          <p>
            AI suitability (advisory): {ad.ai_suitability_verdict || 'unavailable'}
            <br />
            Content review status: <StatusBadge status={ad.status} />
          </p>

          {/* v3 status redesign: each CTA is hidden when it matches the ad's
              current status - no point offering an action that's a no-op.
              Read the advisories above/below and pick one to override. */}
          <div className="actions-row">
            {ad.status !== 'APPROVED' && (
              <button disabled={busy} onClick={() => runAction(() => api.approve(id))}>
                Approve
              </button>
            )}
            {ad.status !== 'REJECTED' && (
              <button disabled={busy} onClick={() => runAction(() => api.reject(id))}>
                Reject
              </button>
            )}
            {ad.status !== 'SENT_BACK' && (
              <button disabled={busy} onClick={() => runAction(() => api.sendback(id))}>
                Send back
              </button>
            )}
          </div>
        </div>

        {/* v3 status redesign: platform compliance now runs automatically
            (initial pipeline run, or re-triggered by an Approve override) -
            independent per-platform advisories, shown only once content
            review itself has reached APPROVED, never blended into the
            status above. */}
        {ad.status === 'APPROVED' && (
          <div className="panel" style={{ marginTop: '1rem' }}>
            <h4>Platform compliance</h4>
            <p className="muted">Advisory per platform - never affects the content review status above.</p>
            {PLATFORMS.map((p) => {
              const result = platformCompliance.find((r) => r.platform === p);
              return (
                <div key={p} style={{ marginTop: '0.75rem' }}>
                  <p>
                    <strong>{p}</strong>: {platformStatusLabel(result && result.platform_verdict)}
                  </p>
                  {result && result.platform_flags && result.platform_flags.length > 0 && (
                    <div>
                      {result.platform_flags.map((flag, i) => (
                        <div key={i} className="finding">
                          <div className="finding-header">
                            <span className="timestamp" onClick={() => seekTo(timestampToSeconds(flag.timestamp))}>
                              {flag.timestamp}
                            </span>
                            <span className="category-badge">{flag.category}</span>
                            <span className="muted">confidence {Number(flag.confidence).toFixed(2)}</span>
                          </div>
                          <p>{flag.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {talentDetections.length > 0 && (
          <div className="panel" style={{ marginTop: '1rem' }}>
            <h4>Talent compliance</h4>
            <p className="muted">Contractual/legal risk - separate from the content-safety findings below.</p>
            {talentDetections.map((d) => (
              <div key={d.id} className="finding">
                <div className="finding-header">
                  <span className="timestamp" onClick={() => seekTo(d.timestamp_seconds)}>
                    {formatSeconds(d.timestamp_seconds)}
                  </span>
                  <strong>{d.talent_name}</strong>
                  <span className="muted">confidence {Number(d.confidence).toFixed(2)}</span>
                </div>
                <p style={{ color: d.flagged ? '#d33c3c' : undefined }}>
                  {d.flagged ? 'FLAGGED - ' : ''}
                  Contract status at detection: {d.contract_status_at_detection.replace('_', ' ')}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="panel" style={{ marginTop: '1rem' }}>
          <h4>Findings ({flags.length})</h4>
          {flags.length === 0 && <p className="muted">No compliance flags.</p>}
          {flags.map((flag) => (
            <div key={flag.id} className="finding">
              <div className="finding-header">
                <span className="timestamp" onClick={() => seekTo(flag.timestamp_seconds)}>
                  {flag.timestamp_display}
                </span>
                <span className="category-badge">{flag.category_label}</span>
                <span className="muted">confidence {Number(flag.confidence).toFixed(2)}</span>
                {flag.computed_verdict && <StatusBadge status={flag.computed_verdict} />}
              </div>
              <p>{flag.description}</p>
              <div>
                {comments
                  .filter((c) => c.finding_id === flag.id)
                  .map((c) => (
                    <p key={c.id} className="muted">
                      {c.commented_by}: {c.comment_text}
                    </p>
                  ))}
                <input
                  placeholder="Add a comment on this finding..."
                  value={commentDrafts[flag.id] || ''}
                  onChange={(e) => setCommentDrafts((d) => ({ ...d, [flag.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && submitComment(flag.id)}
                />
              </div>
            </div>
          ))}
        </div>

        {/* v3 status redesign: reverted to pure FR-14 bookkeeping - no
            verdict/flags here anymore, that's the Platform compliance panel
            above. This is just a manual "we sent this" audit log. */}
        {ad.status === 'APPROVED' && (
          <div className="panel" style={{ marginTop: '1rem' }}>
            <h4>Mark as sent to platform</h4>
            <div className="actions-row">
              {PLATFORMS.map((p) => (
                <button key={p} disabled={busy} onClick={() => runAction(() => api.publish(id, p))}>
                  {p}
                </button>
              ))}
            </div>
            {PLATFORMS.map((p) => {
              const record = publishRecords.find((r) => r.platform === p);
              if (!record) return null;
              return (
                <p key={p} className="muted" style={{ marginTop: '0.5rem' }}>
                  Last marked: {record.platform} by {record.marked_by} on{' '}
                  {new Date(record.marked_at).toLocaleString()}
                </p>
              );
            })}
          </div>
        )}

        <div className="panel" style={{ marginTop: '1rem' }}>
          <h4>General comments</h4>
          {comments
            .filter((c) => !c.finding_id)
            .map((c) => (
              <p key={c.id} className="muted">
                {c.commented_by}: {c.comment_text}
              </p>
            ))}
          <textarea
            style={{ width: '100%' }}
            rows={3}
            placeholder="Summary / action items..."
            value={commentDrafts.general || ''}
            onChange={(e) => setCommentDrafts((d) => ({ ...d, general: e.target.value }))}
          />
          <button onClick={() => submitComment(null)}>Add comment</button>
        </div>
      </div>
    </div>
  );
}

// content_metadata.key_moments timestamps are "mm:ss" strings (same format
// the AI prompt uses for compliance_flags) - convert for video.currentTime.
function timestampToSeconds(timestamp) {
  const [minutes, seconds] = (timestamp || '0:00').split(':').map(Number);
  return minutes * 60 + seconds;
}

// talent_detections only stores timestamp_seconds (an integer), unlike
// compliance_flags which also has a pre-formatted timestamp_display string.
function formatSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Maps a platform's raw AI advisory to the display label a reviewer sees -
// the platform_verdict values are shared with the core ai_suitability
// verdict shape ('Suitable' | 'Needs Review' | 'Not Suitable'), plus 'Error'
// for a platform whose Analyze call failed (see run-platform-compliance).
function platformStatusLabel(verdict) {
  if (verdict === 'Suitable') return 'Published to the platform';
  if (verdict === 'Not Suitable') return 'Rejected';
  if (verdict === 'Needs Review') return 'Needs review';
  if (verdict === 'Error') return 'Error - check logs';
  return 'pending...';
}

function markerColor(verdict) {
  if (verdict === 'REJECT') return '#d33c3c';
  if (verdict === 'NEEDS_REVIEW') return '#d98c00';
  return '#8a8a94';
}
