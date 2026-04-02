import React, { useState, useEffect } from 'react';
import { api } from '../App';

function statusBadge(status) {
  const map = {
    completed: 'badge-green',
    failed: 'badge-red',
    running: 'badge-yellow',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>;
}

function typeBadge(type) {
  const map = { manual: 'badge-blue', scheduled: 'badge-purple' };
  return <span className={`badge ${map[type] || 'badge-gray'}`}>{type}</span>;
}

function JsonViewer({ data }) {
  const lines = JSON.stringify(data, null, 2).split('\n');
  return (
    <div className="json-viewer">
      {lines.map((line, i) => {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0 && line.trim().startsWith('"')) {
          const key = line.substring(0, colonIdx + 1);
          const val = line.substring(colonIdx + 1);
          return (
            <div key={i}>
              <span className="json-key">{key}</span>
              <span className={
                val.trim().startsWith('"') ? 'json-str' :
                val.trim() === 'true' || val.trim() === 'false' ? 'json-bool' :
                !isNaN(parseFloat(val.trim())) ? 'json-num' : ''
              }>{val}</span>
            </div>
          );
        }
        return <div key={i}>{line}</div>;
      })}
    </div>
  );
}

function RunDetail({ runId, onClose }) {
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSymbol, setActiveSymbol] = useState(null);

  useEffect(() => {
    api(`/runs/${runId}`).then(data => {
      setRun(data);
      const symbols = [...new Set(data.results.map(r => r.stock_symbol))];
      setActiveSymbol(symbols[0]);
      setLoading(false);
    });
  }, [runId]);

  if (loading) return (
    <div className="modal-overlay">
      <div className="modal" style={{ textAlign: 'center' }}>
        <span className="spinner" style={{ width: 24, height: 24 }} />
      </div>
    </div>
  );

  const symbols = [...new Set(run.results.map(r => r.stock_symbol))];
  const symbolResults = run.results.filter(r => r.stock_symbol === activeSymbol);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 820, maxHeight: '88vh' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Run #{runId} Details</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
              {new Date(run.run.started_at).toLocaleString()} · {run.results.length} results
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Symbol tabs */}
        <div className="tabs">
          {symbols.map(sym => (
            <button
              key={sym}
              className={`tab ${activeSymbol === sym ? 'active' : ''}`}
              onClick={() => setActiveSymbol(sym)}
            >
              {sym}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {symbolResults.map(r => (
            <div key={r.id} className="card">
              <div className="card-header">
                <span style={{ fontWeight: 600 }}>{r.prompt_name}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(r.created_at).toLocaleTimeString()}</span>
              </div>
              <div className="grid-2" style={{ gap: 12 }}>
                <div>
                  <div className="form-label" style={{ marginBottom: 6 }}>Structured Output</div>
                  <JsonViewer data={r.structured_output} />
                </div>
                <div>
                  <div className="form-label" style={{ marginBottom: 6 }}>Stock Data at Time of Run</div>
                  <JsonViewer data={{
                    price: r.stock_data.current_price,
                    change_pct: r.stock_data.change_percent,
                    market_cap: r.stock_data.market_cap,
                    pe_ratio: r.stock_data.pe_ratio,
                    volume: r.stock_data.volume,
                    week52_high: r.stock_data.week52_high,
                    week52_low: r.stock_data.week52_low,
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function History({ showNotification }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState(null);

  useEffect(() => { loadRuns(); }, []);

  const loadRuns = async () => {
    setLoading(true);
    try {
      const data = await api('/runs');
      setRuns(data);
    } catch (e) {}
    setLoading(false);
  };

  const duration = (run) => {
    if (!run.completed_at) return '—';
    const ms = new Date(run.completed_at) - new Date(run.started_at);
    return ms > 60000 ? `${(ms / 60000).toFixed(1)}m` : `${(ms / 1000).toFixed(0)}s`;
  };

  return (
    <div>
      <div className="page-header">
        <h1>Run History</h1>
        <p className="subtitle">View all past analysis runs and drill into their results</p>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn" onClick={loadRuns}>↻ Refresh</button>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div className="empty-state"><span className="spinner" /></div>
          ) : runs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">◫</div>
              <div className="empty-title">No runs yet</div>
              <div className="empty-desc">Run analyses from the sidebar to see them here.</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Stocks</th>
                  <th>Results</th>
                  <th>Error</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => (
                  <tr key={run.id}>
                    <td className="mono" style={{ color: 'var(--text3)' }}>#{run.id}</td>
                    <td>{typeBadge(run.run_type)}</td>
                    <td>{statusBadge(run.status)}</td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>
                      {new Date(run.started_at).toLocaleString()}
                    </td>
                    <td className="mono">{duration(run)}</td>
                    <td className="mono">{run.stocks_processed}</td>
                    <td className="mono text-muted">—</td>
                    <td>
                      {run.error_message && (
                        <span style={{ fontSize: 11, color: 'var(--red)' }}>
                          {run.error_message.substring(0, 40)}…
                        </span>
                      )}
                    </td>
                    <td>
                      {run.status === 'completed' && (
                        <button
                          className="btn btn-xs btn-primary"
                          onClick={() => setSelectedRun(run.id)}
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedRun && (
        <RunDetail runId={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </div>
  );
}
