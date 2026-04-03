import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../App';

const signalClass = s => ({ BUY:'badge-green', SELL:'badge-red', HOLD:'badge-amber', WATCH:'badge-blue' }[s] || 'badge-gray');
const trendClass  = t => ({ BULLISH:'pos', BEARISH:'neg', NEUTRAL:'muted' }[t] || 'muted');
const riskClass   = r => ({ LOW:'badge-green', MEDIUM:'badge-amber', HIGH:'badge-red', VERY_HIGH:'badge-red' }[r] || 'badge-gray');

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n/1e12).toFixed(1)}T`;
  if (n >= 1e9)  return `$${(n/1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `$${(n/1e6).toFixed(1)}M`;
  return `$${n.toFixed(2)}`;
}

function Sparkline({ changes }) {
  if (!changes?.length) return <span className="muted" style={{fontSize:11}}>—</span>;
  const vals = changes.slice(-12);
  const max = Math.max(...vals.map(Math.abs), 0.01);
  return (
    <div className="spark">
      
      {vals.map((c, i) => (
        <div key={i} className="spark-bar" style={{ height: `${Math.max(12, (Math.abs(c)/max)*100)}%`, background: c >= 0 ? 'var(--green)' : 'var(--red)', opacity: 0.5 + (i/vals.length)*0.5 }} />
      ))}
    </div>
  );
}

function ConfBar({ value, color }) {
  if (value == null) return null;
  const c = color || (value >= 70 ? 'var(--green)' : value >= 50 ? 'var(--amber)' : 'var(--red)');
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div className="prog"><div className="prog-fill" style={{ width:`${Math.abs(value)}%`, background:c }} /></div>
      <span className="mono" style={{ fontSize:11, color:c }}>{Math.round(value)}</span>
    </div>
  );
}

function renderCell(k, v) {
  if (['key_insight','summary','technical_notes','pe_assessment','rationale'].includes(k))
    return <td key={k}><span style={{fontSize:11,color:'var(--text2)',lineHeight:1.5,display:'block',maxWidth:260}}>{v}</span></td>;
  if (k === 'signal') return <td key={k}><span className={`badge ${signalClass(v)}`}>{v}</span></td>;
  if (k === 'price_trend') return <td key={k}><span className={trendClass(v)} style={{fontSize:12,fontWeight:500}}>{v}</span></td>;
  if (['risk_level','entry_risk'].includes(k)) return <td key={k}><span className={`badge ${riskClass(v)}`}>{v}</span></td>;
  if (k === 'valuation') return <td key={k}><span className={`badge ${{UNDERVALUED:'badge-green',FAIR:'badge-amber',OVERVALUED:'badge-red'}[v]||'badge-gray'}`}>{v}</span></td>;
  if (k === 'growth_outlook') return <td key={k}><span className={`badge ${{STRONG:'badge-green',MODERATE:'badge-blue',WEAK:'badge-amber',NEGATIVE:'badge-red'}[v]||'badge-gray'}`}>{v}</span></td>;
  if (k === 'dividend_quality') return <td key={k}><span className={`badge ${{EXCELLENT:'badge-green',GOOD:'badge-green',FAIR:'badge-amber',NONE:'badge-gray'}[v]||'badge-gray'}`}>{v}</span></td>;
  if (k === 'volatility_level') return <td key={k}><span className={`badge ${{VERY_LOW:'badge-green',LOW:'badge-green',MODERATE:'badge-blue',HIGH:'badge-amber',EXTREME:'badge-red'}[v]||'badge-gray'}`}>{v?.replace('_',' ')}</span></td>;
  if (k === 'week52_position') return <td key={k}><span className={`badge ${{NEAR_LOW:'badge-red',LOWER_HALF:'badge-amber',MIDDLE:'badge-blue',UPPER_HALF:'badge-green',NEAR_HIGH:'badge-green'}[v]||'badge-gray'}`}>{v?.replace(/_/g,' ')}</span></td>;
  if (['confidence','fundamental_score','volatility_score','trend_strength'].includes(k)) return <td key={k}><ConfBar value={v} /></td>;
  if (k === 'momentum_score') return <td key={k}><ConfBar value={Math.abs(v)} color={v >= 0 ? 'var(--green)' : 'var(--red)'} /></td>;
  return <td key={k} className="mono" style={{fontSize:11,color:'var(--text2)'}}>{typeof v === 'number' ? v.toFixed(1) : String(v)}</td>;
}

export default function Dashboard({ stocks, triggerRun, runStatus }) {
  const [latestRun, setLatestRun] = useState(null);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [activePrompt, setActivePrompt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLatestRun(await api('/runs/latest')); } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!stocks.length) return;
    stocks.slice(0, 6).forEach(async s => {
      try { setPrices(p => ({ ...p, [s.symbol]: null }));
            const d = await api(`/stocks/${s.symbol}/data`);
            setPrices(p => ({ ...p, [s.symbol]: d }));
      } catch (_) {}
    });
  }, [stocks]);

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
  const buys = activeResults.filter(r => r.structured_output.signal === 'BUY').length;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="sub">
          {run ? `${new Date(run.completed_at).toLocaleString()} · ${latestRun.results.length} analyses${run.total_cost ? ` · $${run.total_cost.toFixed(4)}` : ''}` : 'No runs yet'}
        </p>
      </div>

      <div className="page-body">
        <div className="stat-grid">
          {[
            { label: 'Tracked', val: stocks.length },
            { label: 'Analyses', val: latestRun?.results?.length ?? 0 },
            { label: 'BUY signals', val: buys },
            { label: runStatus === 'running' ? '⚡ Running' : run ? '✓ Done' : 'Status', val: run?.total_cost ? `$${run.total_cost.toFixed(4)}` : '—' },
          ].map(({ label, val }) => (
            <div key={label} className="stat-card">
              <div className="stat-val">{val}</div>
              <div className="stat-lbl">{label}</div>
            </div>
          ))}
        </div>

        {/* Price strip */}
        {Object.keys(prices).length > 0 && (
          <div className="price-strip">
            {stocks.slice(0,6).map(s => {
              const d = prices[s.symbol];
              const ch = d?.change_percent;
              return (
                <div key={s.symbol} className="price-item">
                  <div className="price-sym">{s.symbol}</div>
                  <div className={`price-val ${ch > 0 ? 'pos' : ch < 0 ? 'neg' : ''}`}>
                    {d?.current_price ? `$${d.current_price.toFixed(2)}` : '…'}
                  </div>
                  {ch != null && <div style={{fontSize:10, color: ch >= 0 ? 'var(--green)' : 'var(--red)'}}>{ch >= 0 ? '+' : ''}{ch.toFixed(2)}%</div>}
                  <Sparkline changes={d?.price_changes_30d} />
                </div>
              );
            })}
          </div>
        )}

        {/* Results table */}
        {loading ? (
          <div className="card"><div className="empty"><span className="spinner" style={{width:20,height:20,borderTopColor:'var(--green)',borderColor:'var(--bg4)'}} /></div></div>
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
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', flexWrap:'wrap', gap:12, background:'var(--bg3)' }}>
              <span className="card-title" style={{marginBottom:0}}>Latest Run</span>
              <div className="tabs" style={{border:'none',marginBottom:0,flex:1}}>
                {promptNames.map(n => <button key={n} className={`tab ${active===n?'active':''}`} onClick={() => setActivePrompt(n)} style={{padding:'4px 10px'}}>{n}</button>)}
              </div>
              {run?.total_cost > 0 && <span className="cost-chip">💰 ${run.total_cost.toFixed(4)}</span>}
            </div>
            <div style={{overflowX:'auto'}}>
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th><th>Price</th><th>Chg%</th><th>30D</th>
                    {outputKeys.map(k => <th key={k}>{k.replace(/_/g,' ')}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {activeResults.map(r => {
                    const d = prices[r.stock_symbol];
                    const ch = d?.change_percent ?? r.stock_data?.change_percent;
                    return (
                      <tr key={r.id}>
                        <td><span className="mono" style={{fontWeight:600}}>{r.stock_symbol}</span><div style={{fontSize:10,color:'var(--text3)'}}>{r.stock_data?.name?.slice(0,18)}</div></td>
                        <td className="mono">${(d?.current_price ?? r.stock_data?.current_price)?.toFixed(2) ?? '—'}</td>
                        <td className={ch >= 0 ? 'pos' : 'neg'}><span className="mono" style={{fontSize:12}}>{ch != null ? `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%` : '—'}</span></td>
                        <td><Sparkline changes={d?.price_changes_30d ?? r.stock_data?.price_changes_30d} /></td>
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
