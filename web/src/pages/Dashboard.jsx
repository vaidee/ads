import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';

const STATUSES = ['PROCESSING', 'APPROVED', 'NEEDS_REVIEW', 'REJECTED', 'SENT_BACK', 'ERROR'];
const PRODUCT_CATEGORIES = ['skincare', 'makeup', 'haircare', 'fragrance', 'tools_devices', 'other'];

export default function Dashboard() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: '', product_category: '', date_from: '', date_to: '' });
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState(null); // null | 'structured' | 'semantic'
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const limit = 25;

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listAds({ ...filters, page, limit });
      setRows(result.rows);
      setTotal(result.total);
      setSearchMode(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) {
      loadList();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // FR-12: structured search first, semantic search as a fallback - the
      // two are kept as separate, non-combinable result sets.
      const result = await api.searchAds(query.trim());
      setRows(result.results);
      setTotal(result.results.length);
      setSearchMode(result.mode);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateFilter(key, value) {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  }

  async function handleExport() {
    try {
      await api.exportCsv(filters);
    } catch (err) {
      setError(err.message);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="dashboard-layout">
      <aside className="panel filters-pane">
        <h3>Filters</h3>
        <label htmlFor="status">Status</label>
        <select id="status" value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label htmlFor="product_category">Product category</label>
        <select
          id="product_category"
          value={filters.product_category}
          onChange={(e) => updateFilter('product_category', e.target.value)}
        >
          <option value="">All</option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label htmlFor="date_from">From</label>
        <input
          id="date_from"
          type="date"
          value={filters.date_from}
          onChange={(e) => updateFilter('date_from', e.target.value)}
        />

        <label htmlFor="date_to">To</label>
        <input
          id="date_to"
          type="date"
          value={filters.date_to}
          onChange={(e) => updateFilter('date_to', e.target.value)}
        />
      </aside>

      <section>
        <form className="search-row" onSubmit={handleSearch}>
          <input
            placeholder="Search by filename, or describe what you're looking for..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit">Search</button>
          <button type="button" onClick={handleExport}>
            Export CSV
          </button>
        </form>

        {error && <div className="error-banner">{error}</div>}
        {searchMode && <p className="muted">Showing {searchMode} search results for &ldquo;{query}&rdquo;.</p>}

        <div className="panel">
          {loading ? (
            <p className="muted">Loading...</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Status</th>
                  <th>Product category</th>
                  <th>AI verdict</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((ad) => (
                  <tr key={ad.id} className="clickable" onClick={() => navigate(`/ads/${ad.id}`)}>
                    <td>{ad.filename}</td>
                    <td>
                      <StatusBadge status={ad.status} />
                    </td>
                    <td>{ad.product_category || '-'}</td>
                    <td>{ad.ai_suitability_verdict || '-'}</td>
                    <td>{ad.updated_at ? new Date(ad.updated_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No ads match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {!searchMode && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span className="muted">
                Page {page} of {totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
