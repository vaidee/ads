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

  const { ad, playbackUrl, flags, comments, statusHistory, publishRecords } = data;

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
            System status: <StatusBadge status={ad.status} />
          </p>

          <div className="actions-row">
            <button disabled={busy} onClick={() => runAction(() => api.approve(id))}>
              Approve
            </button>
            <button disabled={busy} onClick={() => runAction(() => api.reject(id))}>
              Reject
            </button>
            <button disabled={busy} onClick={() => runAction(() => api.sendback(id))}>
              Send back
            </button>
          </div>

          {ad.status === 'PUBLISHED' && (
            <div>
              <h4>Publish to ad account</h4>
              <div className="actions-row">
                {PLATFORMS.map((p) => (
                  <button key={p} disabled={busy} onClick={() => runAction(() => api.publish(id, p))}>
                    {p}
                  </button>
                ))}
              </div>
              {publishRecords.length > 0 && (
                <p className="muted">
                  Last marked: {publishRecords[0].platform} by {publishRecords[0].marked_by} on{' '}
                  {new Date(publishRecords[0].marked_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>

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

function markerColor(verdict) {
  if (verdict === 'REJECT') return '#d33c3c';
  if (verdict === 'NEEDS_REVIEW') return '#d98c00';
  return '#8a8a94';
}
