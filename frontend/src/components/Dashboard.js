import React, { useState, useEffect } from 'react';
import { api } from '../App';

function signalColor(signal) {
  if (!signal) return 'badge-gray';
  const map = { BUY: 'badge-green', SELL: 'badge-red', HOLD: 'badge-yellow', WATCH: 'badge-blue' };
  return map[signal] || 'badge-gray';
}

function trendColor(trend) {
  const map = { BULLISH: 'change-pos', BEARISH: 'change-neg', NEUTRAL: 'change-neutral' };
  return map[trend] || 'change-neutral';
}

function riskColor(risk) {
  const map = { LOW: 'badge-green', MEDIUM: 'badge-yellow', HIGH: 'badge-red', VERY_HIGH: 'badge-red' };
  return map[risk] || 'badge-gray';
}

function fmt(n, decimals = 2) {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return typeof n === 'number' ? n.toFixed(decimals) : n;
}

function MiniSparkline({ changes }) {
  if (!changes || changes.length === 0) return <span className="text-muted">—</span>;
  const max = Math.max(...changes.map(Math.abs), 0.01);
  return (
    <div className="sparkline-wrap">
      {changes.slice(-12).map((c, i) => (
        <div
          key={i}
          className="spark-bar"
          style={{
            height: `${Math.max(10, (Math.abs(c) / max) * 100)}%`,
            background: c >= 0 ? 'var(--green)' : 'var(--red)',
            opacity: 0.6 + (i / changes.length) * 0.4,
          }}
        />
      ))}
    </div>
  );
}

function ConfidenceBar({ value }) {
  if (value == null) return null;
  const color = value >= 70 ? 'var(--green)' : value >= 50 ? 'var(--yellow)' : 'var(--red)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1, height: 4, background: 'var(--bg4)', borderRadius: 2, overflow: 'hidden'
      }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.6s' }} />
      </div>
      <span className="mono text-sm" style={{ color }}>{value}%</span>
    </div>
  );
}

export default function Dashboard({ stocks, triggerRun, runStatus }) {
  const [latestRun, setLatestRun] = useState(null);
  const [stockPrices, setStockPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [activePromptFilter, setActivePromptFilter] = useState(null);

  useEffect(() => {
    loadLatest();
    if (stocks.length) loadPrices();
  }, [stocks]);

  const loadLatest = async () => {
    setLoading(true);
    try {
      const data = await api('/runs/latest');
      setLatestRun(data);
    } catch (e) { /* empty */ }
    setLoading(false);
  };

  const loadPrices = async () => {
    for (const s of stocks.slice(0, 8)) {
      try {
        const d = await api(`/stocks/${s.symbol}/data`);
        setStockPrices(p => ({ ...p, [s.symbol]: d }));
      } catch (_) {}
    }
  };

  // Group results by prompt
  const resultsByPrompt = {};
  const resultsByStock = {};
  if (latestRun?.results) {
    for (const r of latestRun.results) {
      if (!resultsByPrompt[r.prompt_name]) resultsByPrompt[r.prompt_name] = [];
      resultsByPrompt[r.prompt_name].push(r);
      if (!resultsByStock[r.stock_symbol]) resultsByStock[r.stock_symbol] = {};
      resultsByStock[r.stock_symbol][r.prompt_name] = r;
    }
  }

  const promptNames = Object.keys(resultsByPrompt);
  const activePrompt = activePromptFilter || promptNames[0];

  const renderOutputFields = (output) => {
    if (!output) return null;
    return Object.entries(output).map(([k, v]) => {
      if (k === 'key_insight' || k === 'summary' || k === 'technical_notes' || k === 'pe_assessment') {
        return (
          <td key={k} style={{ maxWidth: 260 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, display: 'block' }}>{v}</span>
          </td>
        );
      }
      if (k === 'signal') return <td key={k}><span className={`badge ${signalColor(v)}`}>{v}</span></td>;
      if (k === 'price_trend') return <td key={k}><span className={trendColor(v)}>{v}</span></td>;
      if (k === 'risk_level' || k === 'entry_risk') return <td key={k}><span className={`badge ${riskColor(v)}`}>{v}</span></td>;
      if (k === 'valuation') {
        const vc = { UNDERVALUED: 'badge-green', FAIR: 'badge-yellow', OVERVALUED: 'badge-red' };
        return <td key={k}><span className={`badge ${vc[v] || 'badge-gray'}`}>{v}</span></td>;
      }
      if (k === 'confidence' || k === 'fundamental_score' || k === 'volatility_score' || k === 'momentum_score' || k === 'trend_strength') {
        return <td key={k}><ConfidenceBar value={typeof v === 'number' ? Math.abs(v) : v} /></td>;
      }
      if (k === 'growth_outlook') {
        const gc = { STRONG: 'badge-green', MODERATE: 'badge-blue', WEAK: 'badge-yellow', NEGATIVE: 'badge-red' };
        return <td key={k}><span className={`badge ${gc[v] || 'badge-gray'}`}>{v}</span></td>;
      }
      if (k === 'dividend_quality') {
        const dc = { EXCELLENT: 'badge-green', GOOD: 'badge-green', FAIR: 'badge-yellow', NONE: 'badge-gray' };
        return <td key={k}><span className={`badge ${dc[v] || 'badge-gray'}`}>{v}</span></td>;
      }
      if (k === 'volatility_level') {
        const vlc = { VERY_LOW: 'badge-green', LOW: 'badge-green', MODERATE: 'badge-blue', HIGH: 'badge-yellow', EXTREME: 'badge-red' };
        return <td key={k}><span className={`badge ${vlc[v] || 'badge-gray'}`}>{v}</span></td>;
      }
      if (k === 'week52_position') {
        const wp = { NEAR_LOW: 'badge-red', LOWER_HALF: 'badge-yellow', MIDDLE: 'badge-blue', UPPER_HALF: 'badge-green', NEAR_HIGH: 'badge-green' };
        return <td key={k}><span className={`badge ${wp[v] || 'badge-gray'}`}>{v?.replace('_', ' ')}</span></td>;
      }
      return <td key={k} className="mono text-sm">{typeof v === 'number' ? v.toFixed(1) : String(v)}</td>;
    });
  };

  const activeResults = resultsByPrompt[activePrompt] || [];
  const outputKeys = activeResults.length > 0 ? Object.keys(activeResults[0].structured_output) : [];

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="subtitle">
          {latestRun
            ? `Last run ${new Date(latestRun.run.completed_at).toLocaleString()} · ${latestRun.results.length} analyses`
            : 'No runs yet — add stocks and prompts, then click Run Analysis'}
        </p>
      </div>

      <div className="page-body">
        {/* Stats row */}
        <div className="grid-4 mb-16">
          {[
            { label: 'Tracked Stocks', value: stocks.length },
            { label: 'Analyses Today', value: latestRun?.results?.length ?? 0 },
            { label: 'Signals (latest)', value: activeResults.filter(r => r.structured_output.signal === 'BUY').length + ' BUY' },
            { label: 'Run Status', value: runStatus === 'running' ? '⚡ Running' : latestRun ? '✓ Done' : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="card card-sm">
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Live price strip */}
        {Object.keys(stockPrices).length > 0 && (
          <div className="card mb-16" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: 24, overflowX: 'auto' }}>
              {Object.entries(stockPrices).map(([sym, d]) => {
                const change = d.change_percent;
                return (
                  <div key={sym} style={{ flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 }}>{sym}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 14 }}>
                        ${d.current_price?.toFixed(2) ?? '—'}
                      </span>
                      <span className={change >= 0 ? 'change-pos' : 'change-neg'} style={{ fontSize: 12 }}>
                        {change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : ''}
                      </span>
                    </div>
                    <MiniSparkline changes={d.price_changes_30d} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Results Table */}
        {loading ? (
          <div className="card"><div className="empty-state"><div className="spinner" /><span>Loading…</span></div></div>
        ) : !latestRun || latestRun.results.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-icon">◈</div>
              <div className="empty-title">No analysis results yet</div>
              <div className="empty-desc">Add stocks and prompts, then click Run Analysis to generate AI insights.</div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="card-title" style={{ marginBottom: 0 }}>Latest Analysis</span>
              <div className="tabs" style={{ borderBottom: 'none', marginBottom: 0, flex: 1 }}>
                {promptNames.map(name => (
                  <button
                    key={name}
                    className={`tab ${activePrompt === name ? 'active' : ''}`}
                    onClick={() => setActivePromptFilter(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Price</th>
                    <th>Change</th>
                    <th>Trend</th>
                    {outputKeys.map(k => (
                      <th key={k}>{k.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeResults.map(r => {
                    const price = stockPrices[r.stock_symbol];
                    const change = price?.change_percent ?? r.stock_data?.change_percent;
                    return (
                      <tr key={`${r.stock_symbol}-${r.id}`}>
                        <td>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{r.stock_symbol}</span>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{r.stock_data?.name?.substring(0, 20)}</div>
                        </td>
                        <td className="mono">${(price?.current_price ?? r.stock_data?.current_price)?.toFixed(2) ?? '—'}</td>
                        <td className={change >= 0 ? 'change-pos' : 'change-neg'}>
                          <span className="mono">{change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—'}</span>
                        </td>
                        <td>
                          <MiniSparkline changes={price?.price_changes_30d ?? r.stock_data?.price_changes_30d} />
                        </td>
                        {renderOutputFields(r.structured_output)}
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
