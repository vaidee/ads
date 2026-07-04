import { useState, useCallback } from 'react';
import { api } from '../api';

const HARD_MAX_SECONDS = 5 * 60;
const SOFT_WARNING_SECONDS = 2 * 60;

function readDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => reject(new Error('Could not read video metadata'));
    video.src = URL.createObjectURL(file);
  });
}

export default function Upload() {
  const [items, setItems] = useState([]); // { file, state, reason }
  const [dragging, setDragging] = useState(false);

  const processFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList);
    const newItems = files.map((file) => ({ file, state: 'uploading', reason: null, warning: null }));
    setItems((prev) => [...prev, ...newItems]);

    for (const item of newItems) {
      await uploadOne(item.file);
    }
  }, []);

  async function uploadOne(file) {
    const setState = (state, reason) =>
      setItems((prev) => prev.map((it) => (it.file === file ? { ...it, state, reason } : it)));
    const setWarning = (warning) =>
      setItems((prev) => prev.map((it) => (it.file === file ? { ...it, warning } : it)));

    let duration;
    try {
      duration = await readDuration(file);
    } catch (err) {
      setState('rejected', err.message);
      return;
    }

    // FR-2: hard block over 5 minutes, soft warning 2-5 minutes, no warning under 2 min.
    if (duration > HARD_MAX_SECONDS) {
      setState('rejected', 'Exceeds the 5 minute hard maximum');
      return;
    }
    if (duration > SOFT_WARNING_SECONDS) {
      setWarning('Recommended under 2 minutes');
    }

    let uploadInfo;
    try {
      // FR-3 (duplicate filename) and the server-side half of FR-2 both happen
      // here - there's no separate "check" endpoint, so requesting the
      // pre-signed URL doubles as the validation call.
      uploadInfo = await api.createUploadUrl(file.name, Math.round(duration));
    } catch (err) {
      setState('rejected', err.message);
      return;
    }

    try {
      const res = await fetch(uploadInfo.uploadUrl, {
        method: 'PUT',
        headers: uploadInfo.requiredHeaders,
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed with status ${res.status}`);
      setState('queued for processing', null);
    } catch (err) {
      setState('rejected', err.message);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    processFiles(e.dataTransfer.files);
  }

  return (
    <div>
      <div
        className={`upload-dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <p>Drag and drop video ads here, or</p>
        <input type="file" accept="video/*" multiple onChange={(e) => processFiles(e.target.files)} />
        <p className="muted">Recommended under 2 minutes. Hard maximum 5 minutes.</p>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h4>Uploads</h4>
        {items.length === 0 && <p className="muted">No files yet.</p>}
        {items.map((item, i) => (
          <div key={i} className="upload-item">
            <span>
              {item.file.name}
              {item.warning && <span className="muted"> ({item.warning})</span>}
            </span>
            <span className={`upload-state ${item.state === 'rejected' ? 'rejected' : ''}`}>
              {item.state}
              {item.reason ? `: ${item.reason}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
