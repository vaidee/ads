export default function StatusBadge({ status }) {
  if (!status) return null;
  return <span className={`badge badge-${status}`}>{status.replace('_', ' ')}</span>;
}
