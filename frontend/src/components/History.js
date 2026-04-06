import React, { useState, useEffect } from 'react';
import { api } from '../App';
import { useSettings } from '../App';

const statusBadge = s => ({ completed: 'badge-green', failed: 'badge-red', running: 'badge-amber', cancelled: 'badge-gray' }[s] || 'badge-gray');
const typeBadge = t => ({ manual: 'badge-blue', scheduled: 'badge-purple', retroactive: 'badge-amber' }[t] || 'badge-gray');

function JsonViewer({ data }) {
  const lines = JSON.stringify(data, null, 2).split('\n');
  return (
    <div className="json-block">
      {lines.map((line, i) => {
        const ci = line.indexOf(':');
        if (ci > 0 && line.trim().startsWith('"')) {
          const key = line.substring(0, ci + 1), val = line.substring(ci + 1);
          return <div key={i}><span className="jk">{key}</span><span className={val.trim().startsWith('"') ? 'js' : !isNaN(parseFloat(val.trim())) ? 'jn' : ''}>{val}</span></div>;
        }
        return <div key={i}>{line}</div>;
      })}
    </div>
  );
}

function RunDetail({ runId, onClose }) {
  const [run, setRun] = useState(null);
  const [sym, setSym] = useState(null);

  useEffect(() => {
    api(`/runs/${runId}`).then(d => {
      setRun(d);
      setSym([...new Set(d.results.map(r => r.stock_symbol))][0]);
    });
  }, [runId]);

  if (!run) return (
    <div className="modal-overlay">
      <div className="modal" style={{ textAlign: 'center', padding: 40 }}>
        <span className="spinner" style={{ width: 24, height: 24, borderTopColor: 'var(--green)', borderColor: 'var(--bg4)' }} />
      </div>
    </div>
  );

  const syms = [...new Set(run.results.map(r => r.stock_symbol))];
  const symResults = run.results.filter(r => r.stock_symbol === sym);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 800, maxHeight: '88vh' }}>
        <div className="modal-hdr">
          <div>
            <div className="modal-title">Run #{String(runId).slice(-8)}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {new Date(run.run.started_at).toLocaleString()} · {run.results.length} results
              {run.run.total_cost > 0 && <span className="cost-chip" style={{ marginLeft: 8 }}>💰 ${run.run.total_cost.toFixed(4)}</span>}
              {run.run.model && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{run.run.model.split('-').slice(1, 3).join(' ')}</span>}
            </div>
          </div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="tabs" style={{ marginBottom: 16 }}>
          {syms.map(s => <button key={s} className={`tab ${sym === s ? 'active' : ''}`} onClick={() => setSym(s)}>{s}</button>)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {symResults.map(r => (
            <div key={r.id} className="card" style={{ padding: '14px 16px' }}>
              <div className="card-header">
                <span style={{ fontWeight: 600, fontSize: 14 }}>{r.prompt_name}</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {r.cost > 0 && <span className="cost-chip">💰 ${r.cost.toFixed(5)}</span>}
                  {r.input_tokens > 0 && <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{r.input_tokens}+{r.output_tokens}tok</span>}
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(r.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
              <div className="grid-2" style={{ gap: 12 }}>
                <div>
                  <div className="form-label" style={{ marginBottom: 6 }}>Output</div>
                  <JsonViewer data={r.structured_output} />
                </div>
                <div>
                  <div className="form-label" style={{ marginBottom: 6 }}>Stock data</div>
                  <JsonViewer data={{
                    price: r.stock_data.current_price,
                    change_pct: r.stock_data.change_percent?.toFixed(2),
                    market_cap: r.stock_data.market_cap,
                    pe_ratio: r.stock_data.pe_ratio,
                    volume: r.stock_data.volume,
                    w52_high: r.stock_data.week52_high,
                    w52_low: r.stock_data.week52_low
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

function RetroactiveModal({ onClose, stocks, prompts, showNotification }) {
  const { model } = useSettings();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [estimate, setEstimate] = useState(null);
  const [starting, setStarting] = useState(false);

  const recalc = async () => {
    if (!fromDate || !toDate) return;
    try {
      const from = new Date(fromDate), to = new Date(toDate);
      let days = 0;
      const cur = new Date(from);
      while (cur <= to) { if (cur.getDay() !== 0 && cur.getDay() !== 6) days++; cur.setDate(cur.getDate() + 1); }
      const e = await api('/runs/estimate', { method: 'POST', body: { stock_count: stocks.length, prompt_count: prompts.filter(p => p.active).length, model } });
      setEstimate({ ...e, days, total_cost: parseFloat((e.estimated_cost * days).toFixed(4)), total_secs: e.estimated_seconds * days });
    } catch (_) {}
  };

  const start = async () => {
    setStarting(true);
    try {
      const r = await api('/runs/retroactive', { method: 'POST', body: { from_date: fromDate, to_date: toDate, model } });
      showNotification(`${r.days} retroactive runs queued · ~$${r.total_estimated_cost}`, 'info');
      onClose();
    } catch (e) { showNotification(e.message, 'error'); }
    setStarting(false);
  };

  const fmtTime = (s) => s >= 3600 ? `~${(s / 3600).toFixed(1)}h` : s >= 60 ? `~${Math.ceil(s / 60)}m` : `~${s}s`;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-hdr">
          <div className="modal-title">Retroactive Analysis</div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            Run analysis for all tracked stocks across a date range. Max 30 trading days per range.
          </div>
          <div className="grid-2" style={{ gap: 10 }}>
            <div className="form-row">
              <label className="form-label">From date</label>
              <input type="date" className="form-input" value={fromDate} onChange={e => setFromDate(e.target.value)} onBlur={recalc} />
            </div>
            <div className="form-row">
              <label className="form-label">To date</label>
              <input type="date" className="form-input" value={toDate} onChange={e => setToDate(e.target.value)} onBlur={recalc} />
            </div>
          </div>
          {estimate && (
            <div className="estimate-box">
              <div className="form-label" style={{ marginBottom: 6 }}>Estimate ({estimate.days} trading days)</div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: 11, color: 'var(--text3)' }}>Total cost</div><div className="mono" style={{ color: 'var(--purple)', fontSize: 15, fontWeight: 600 }}>${estimate.total_cost}</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--text3)' }}>Tokens</div><div className="mono" style={{ fontSize: 13 }}>{(estimate.estimated_tokens * estimate.days).toLocaleString()}</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--text3)' }}>Est. time</div><div className="mono" style={{ fontSize: 13 }}>{fmtTime(estimate.total_secs)}</div></div>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={start} disabled={starting || !fromDate || !toDate}>
            {starting ? <><span className="spinner" />Starting…</> : `Start ${estimate?.days || '?'} runs`}
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtEta(secs) {
  if (secs == null || secs < 0) return null;
  if (secs < 60) return `~${secs}s left`;
  return `~${Math.ceil(secs / 60)}m left`;
}

export default function History({ stocks, prompts, showNotification }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [retroModal, setRetroModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRuns(await api('/runs')); } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const cancelRun = async (id) => {
    try {
      await api(`/runs/${id}/cancel`, { method: 'POST' });
      load();
      showNotification('Run cancelled', 'info');
    } catch (e) {
      showNotification('Failed to cancel', 'error');
    }
  };

  useEffect(() => {
    let poll;
    if (runs.some(r => r.status === 'running')) {
      poll = setInterval(() => {
        api('/runs').then(setRuns).catch(() => {});
      }, 2000);
    }
    return () => clearInterval(poll);
  }, [runs]);

  const dur = r => {
    if (!r.completed_at) return '—';
    const ms = new Date(r.completed_at) - new Date(r.started_at);
    return ms > 60000 ? `${(ms / 60000).toFixed(1)}m` : `${(ms / 1000).toFixed(0)}s`;
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Run History</h1>
        <p className="sub">All analysis runs with token usage and costs</p>
      </div>
      <div className="page-body">
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setRetroModal(true)}>⏮ Retroactive Run</button>
          <button className="btn" onClick={load}>↻ Refresh</button>
        </div>

        <div className="tbl-wrap">
          {loading ? (
            <div className="empty"><span className="spinner" style={{ width: 20, height: 20, borderTopColor: 'var(--green)', borderColor: 'var(--bg4)' }} /></div>
          ) : !runs.length ? (
            <div className="empty">
              <div className="empty-icon">◫</div>
              <div className="empty-title">No runs yet</div>
              <div className="empty-desc">Click Run Analysis in the sidebar to start.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Type</th><th>Status</th><th>Started</th><th>Dur.</th>
                    <th>Stocks</th><th>Cost</th><th>Tokens</th><th>Model</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => (
                    <tr key={run.id}>
                      <td><span className={`badge ${typeBadge(run.run_type)}`}>{run.run_type}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {run.status === 'running' && (
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', animation: 'ping 1.2s infinite', display: 'inline-block' }} />
                          )}
                          <span className={`badge ${statusBadge(run.status)}`}>{run.status}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text2)' }}>{new Date(run.started_at).toLocaleString()}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{dur(run)}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{run.stocks_processed || '—'}</td>
                      <td>
                        {run.total_cost > 0
                          ? <span className="cost-chip">💰 ${run.total_cost.toFixed(4)}</span>
                          : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                      </td>
                      <td className="mono" style={{ fontSize: 11, color: 'var(--text2)' }}>
                        {run.total_input_tokens > 0 ? `${run.total_input_tokens}+${run.total_output_tokens}` : '—'}
                      </td>
                      <td style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                        {run.model ? run.model.split('-').slice(1, 3).join(' ') : '—'}
                      </td>
                      <td>
                        {run.status === 'completed' && (
                          <button className="btn btn-xs btn-primary" onClick={() => setSelected(run.id)}>View</button>
                        )}
                        {run.status === 'running' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
                            {/* Progress bar with ETA */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{
                                flex: 1, height: 6, background: 'var(--bg4)',
                                borderRadius: 3, overflow: 'hidden'
                              }}>
                                <div style={{
                                  height: '100%',
                                  width: `${run.progress_percent || 0}%`,
                                  background: 'linear-gradient(90deg, var(--blue), var(--green))',
                                  borderRadius: 3,
                                  transition: 'width 0.5s ease'
                                }} />
                              </div>
                              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text2)', minWidth: 28 }}>
                                {run.progress_percent || 0}%
                              </span>
                            </div>
                            {/* ETA */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                                {fmtEta(run.eta_seconds) || 'Estimating…'}
                              </span>
                              <button
                                className="btn btn-xs btn-danger"
                                style={{ padding: '1px 6px', fontSize: 10 }}
                                onClick={() => cancelRun(run.id)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {selected && <RunDetail runId={selected} onClose={() => setSelected(null)} />}
      {retroModal && <RetroactiveModal onClose={() => setRetroModal(false)} stocks={stocks} prompts={prompts} showNotification={showNotification} />}
    </div>
  );
}
