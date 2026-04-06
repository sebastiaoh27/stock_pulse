import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../App';

const signalClass = s => ({ BUY: 'badge-green', SELL: 'badge-red', HOLD: 'badge-amber', WATCH: 'badge-blue' }[s] || 'badge-gray');
const trendClass = t => ({ BULLISH: 'pos', BEARISH: 'neg', NEUTRAL: 'muted' }[t] || 'muted');
const riskClass = r => ({ LOW: 'badge-green', MEDIUM: 'badge-amber', HIGH: 'badge-red', VERY_HIGH: 'badge-red' }[r] || 'badge-gray');

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(2)}`;
}

function Sparkline({ changes }) {
  if (!changes?.length) return <span className="muted" style={{ fontSize: 11 }}>—</span>;
  const vals = changes.slice(-12);
  const max = Math.max(...vals.map(Math.abs), 0.01);
  return (
    <div className="spark">
      {vals.map((c, i) => (
        <div key={i} className="spark-bar" style={{
          height: `${Math.max(12, (Math.abs(c) / max) * 100)}%`,
          background: c >= 0 ? 'var(--green)' : 'var(--red)',
          opacity: 0.5 + (i / vals.length) * 0.5
        }} />
      ))}
    </div>
  );
}

function ConfBar({ value, color }) {
  if (value == null) return null;
  const c = color || (value >= 70 ? 'var(--green)' : value >= 50 ? 'var(--amber)' : 'var(--red)');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="prog"><div className="prog-fill" style={{ width: `${Math.abs(value)}%`, background: c }} /></div>
      <span className="mono" style={{ fontSize: 11, color: c }}>{Math.round(value)}</span>
    </div>
  );
}

// ── Modular cell renderer — handles any field from any prompt schema ──────────
function renderCell(k, v) {
  if (v == null) return <td key={k}><span style={{ color: 'var(--text3)' }}>—</span></td>;

  // Text insight fields
  if (['key_insight', 'summary', 'technical_notes', 'pe_assessment', 'rationale', 'analysis',
    'notes', 'insight', 'recommendation', 'outlook', 'assessment'].some(w => k.includes(w))) {
    return (
      <td key={k}>
        <span style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, display: 'block', maxWidth: 240 }}>
          {String(v).slice(0, 180)}{String(v).length > 180 ? '…' : ''}
        </span>
      </td>
    );
  }

  // Known enum fields → badges
  if (k === 'signal') return <td key={k}><span className={`badge ${signalClass(v)}`}>{v}</span></td>;
  if (k === 'price_trend') return <td key={k}><span className={trendClass(v)} style={{ fontSize: 12, fontWeight: 500 }}>{v}</span></td>;
  if (['risk_level', 'entry_risk'].includes(k)) return <td key={k}><span className={`badge ${riskClass(v)}`}>{v}</span></td>;
  if (k === 'valuation') {
    const vc = { UNDERVALUED: 'badge-green', FAIR: 'badge-amber', OVERVALUED: 'badge-red' }[v] || 'badge-gray';
    return <td key={k}><span className={`badge ${vc}`}>{v}</span></td>;
  }
  if (k === 'growth_outlook') {
    const gc = { STRONG: 'badge-green', MODERATE: 'badge-blue', WEAK: 'badge-amber', NEGATIVE: 'badge-red' }[v] || 'badge-gray';
    return <td key={k}><span className={`badge ${gc}`}>{v}</span></td>;
  }
  if (k === 'dividend_quality') {
    const dc = { EXCELLENT: 'badge-green', GOOD: 'badge-green', FAIR: 'badge-amber', NONE: 'badge-gray' }[v] || 'badge-gray';
    return <td key={k}><span className={`badge ${dc}`}>{v}</span></td>;
  }
  if (k === 'volatility_level') {
    const vlc = { VERY_LOW: 'badge-green', LOW: 'badge-green', MODERATE: 'badge-blue', HIGH: 'badge-amber', EXTREME: 'badge-red' }[v] || 'badge-gray';
    return <td key={k}><span className={`badge ${vlc}`}>{String(v).replace(/_/g, ' ')}</span></td>;
  }
  if (k === 'week52_position') {
    const wc = { NEAR_LOW: 'badge-red', LOWER_HALF: 'badge-amber', MIDDLE: 'badge-blue', UPPER_HALF: 'badge-green', NEAR_HIGH: 'badge-green' }[v] || 'badge-gray';
    return <td key={k}><span className={`badge ${wc}`}>{String(v).replace(/_/g, ' ')}</span></td>;
  }

  // Score/progress bar fields (0–100)
  if (['confidence', 'fundamental_score', 'volatility_score', 'trend_strength',
    'score', 'quality', 'rating', 'strength', 'health'].some(w => k.includes(w))) {
    if (typeof v === 'number') return <td key={k}><ConfBar value={v} /></td>;
  }

  // Momentum (can be negative)
  if (k === 'momentum_score' || k === 'momentum') {
    return <td key={k}><ConfBar value={typeof v === 'number' ? Math.abs(v) : 0} color={v >= 0 ? 'var(--green)' : 'var(--red)'} /></td>;
  }

  // Generic enum detection — any string that's all-caps → badge
  if (typeof v === 'string' && /^[A-Z_]+$/.test(v) && v.length <= 20) {
    const isPos = ['BULLISH', 'STRONG', 'EXCELLENT', 'GOOD', 'LOW', 'VERY_LOW', 'BUY'].includes(v);
    const isNeg = ['BEARISH', 'WEAK', 'NEGATIVE', 'POOR', 'HIGH', 'VERY_HIGH', 'EXTREME', 'SELL'].includes(v);
    const cls = isPos ? 'badge-green' : isNeg ? 'badge-red' : 'badge-gray';
    return <td key={k}><span className={`badge ${cls}`}>{v.replace(/_/g, ' ')}</span></td>;
  }

  // Number
  if (typeof v === 'number') {
    return <td key={k} className="mono" style={{ fontSize: 11, color: 'var(--text2)' }}>{v.toFixed(1)}</td>;
  }

  // Boolean
  if (typeof v === 'boolean') {
    return <td key={k}><span className={`badge ${v ? 'badge-green' : 'badge-red'}`}>{v ? 'YES' : 'NO'}</span></td>;
  }

  // Fallback string
  return <td key={k} className="mono" style={{ fontSize: 11, color: 'var(--text2)' }}>{String(v).slice(0, 60)}</td>;
}

// ── Price strip with live refresh ─────────────────────────────────────────────
function PriceStrip({ stocks, prices }) {
  if (!stocks.length) return null;
  return (
    <div className="price-strip">
      {stocks.slice(0, 8).map(s => {
        const d = prices[s.symbol];
        const ch = d?.change_percent;
        return (
          <div key={s.symbol} className="price-item">
            <div className="price-sym">{s.symbol}</div>
            <div className={`price-val ${ch > 0 ? 'pos' : ch < 0 ? 'neg' : ''}`}>
              {d === undefined ? '…' : d?.current_price ? `$${d.current_price.toFixed(2)}` : '—'}
            </div>
            {ch != null && (
              <div style={{ fontSize: 10, color: ch >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {ch >= 0 ? '+' : ''}{ch.toFixed(2)}%
              </div>
            )}
            <Sparkline changes={d?.price_changes_30d} />
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard({ stocks, triggerRun, runStatus }) {
  const [latestRun, setLatestRun] = useState(null);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [activePrompt, setActivePrompt] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const pollRef = useRef(null);

  const loadLatestRun = useCallback(async () => {
    try {
      const data = await api('/runs/latest');
      setLatestRun(data);
      setLastRefreshed(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  const loadPrices = useCallback(async () => {
    if (!stocks.length) return;
    const toLoad = stocks.slice(0, 8);
    await Promise.allSettled(
      toLoad.map(async s => {
        try {
          const d = await api(`/stocks/${s.symbol}/data`);
          setPrices(p => ({ ...p, [s.symbol]: d }));
        } catch (_) {
          setPrices(p => ({ ...p, [s.symbol]: null }));
        }
      })
    );
  }, [stocks]);

  useEffect(() => {
    loadLatestRun();
    loadPrices();
  }, [loadLatestRun, loadPrices]);

  // Poll for new run results when a run is in progress
  useEffect(() => {
    if (runStatus === 'running') {
      pollRef.current = setInterval(() => {
        loadLatestRun();
      }, 5000);
    } else {
      clearInterval(pollRef.current);
      if (runStatus === 'completed') {
        // Refresh immediately after completion
        loadLatestRun();
        loadPrices();
      }
    }
    return () => clearInterval(pollRef.current);
  }, [runStatus, loadLatestRun, loadPrices]);

  // Reset active prompt tab when run data changes
  useEffect(() => {
    setActivePrompt(null);
  }, [latestRun?.run?.id]);

  const byPrompt = {};
  if (latestRun?.results) {
    for (const r of latestRun.results) {
      if (!byPrompt[r.prompt_name]) byPrompt[r.prompt_name] = [];
      byPrompt[r.prompt_name].push(r);
    }
  }
  const promptNames = Object.keys(byPrompt);
  const active = activePrompt || promptNames[0];
  const activeResults = byPrompt[active] || [];
  const outputKeys = activeResults[0] ? Object.keys(activeResults[0].structured_output) : [];

  const run = latestRun?.run;
  const buys = activeResults.filter(r => r.structured_output?.signal === 'BUY').length;

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1>Dashboard</h1>
            <p className="sub">
              {run
                ? `Last run ${timeAgo(run.completed_at)} · ${latestRun.results.length} analyses${run.total_cost ? ` · $${run.total_cost.toFixed(4)}` : ''}`
                : 'No runs yet'
              }
              {lastRefreshed && (
                <span style={{ marginLeft: 8, color: 'var(--text3)', fontSize: 11 }}>
                  · refreshed {lastRefreshed.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <button className="btn btn-sm" onClick={() => { loadLatestRun(); loadPrices(); }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="stat-grid">
          {[
            { label: 'Tracked', val: stocks.length },
            { label: 'Analyses', val: latestRun?.results?.length ?? 0 },
            { label: 'BUY signals', val: buys },
            {
              label: runStatus === 'running' ? '⚡ Running' : run ? '✓ Done' : 'Status',
              val: run?.total_cost ? `$${run.total_cost.toFixed(4)}` : '—'
            },
          ].map(({ label, val }) => (
            <div key={label} className="stat-card">
              <div className="stat-val">{val}</div>
              <div className="stat-lbl">{label}</div>
            </div>
          ))}
        </div>

        <PriceStrip stocks={stocks} prices={prices} />

        {loading ? (
          <div className="card">
            <div className="empty">
              <span className="spinner" style={{ width: 20, height: 20, borderTopColor: 'var(--green)', borderColor: 'var(--bg4)' }} />
            </div>
          </div>
        ) : !latestRun || !latestRun.results.length ? (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">⬡</div>
              <div className="empty-title">No results yet</div>
              <div className="empty-desc">Add stocks and prompts, then click Run Analysis to generate AI insights.</div>
            </div>
          </div>
        ) : (
          <div className="tbl-wrap">
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, background: 'var(--bg3)'
            }}>
              <span className="card-title" style={{ marginBottom: 0 }}>Latest Run</span>
              <div className="tabs" style={{ border: 'none', marginBottom: 0, flex: 1 }}>
                {promptNames.map(n => (
                  <button
                    key={n}
                    className={`tab ${active === n ? 'active' : ''}`}
                    onClick={() => setActivePrompt(n)}
                    style={{ padding: '4px 10px' }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {run?.total_cost > 0 && <span className="cost-chip">💰 ${run.total_cost.toFixed(4)}</span>}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Price</th>
                    <th>Chg%</th>
                    <th>30D</th>
                    {outputKeys.map(k => <th key={k}>{k.replace(/_/g, ' ')}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {activeResults.map(r => {
                    const live = prices[r.stock_symbol];
                    const price = live?.current_price ?? r.stock_data?.current_price;
                    const ch = live?.change_percent ?? r.stock_data?.change_percent;
                    const sparkData = live?.price_changes_30d ?? r.stock_data?.price_changes_30d;
                    return (
                      <tr key={r.id}>
                        <td>
                          <span className="mono" style={{ fontWeight: 600 }}>{r.stock_symbol}</span>
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                            {(live?.name ?? r.stock_data?.name)?.slice(0, 18)}
                          </div>
                        </td>
                        <td className="mono">{price ? `$${price.toFixed(2)}` : '—'}</td>
                        <td>
                          <span className={`mono ${ch >= 0 ? 'pos' : ch < 0 ? 'neg' : 'muted'}`} style={{ fontSize: 12 }}>
                            {ch != null ? `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%` : '—'}
                          </span>
                        </td>
                        <td><Sparkline changes={sparkData} /></td>
                        {outputKeys.map(k => renderCell(k, r.structured_output[k]))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
