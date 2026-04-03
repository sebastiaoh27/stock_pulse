import React, { useState, useEffect } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../App';

const COLORS = { BUY:'#00c896', SELL:'#f04f5e', HOLD:'#f5a623', WATCH:'#3d8ef0', BULLISH:'#00c896', BEARISH:'#f04f5e', NEUTRAL:'#7a8fa6', LOW:'#00c896', MEDIUM:'#f5a623', HIGH:'#f04f5e', UNDERVALUED:'#00c896', FAIR:'#f5a623', OVERVALUED:'#f04f5e' };
const PIE_COLORS = ['#00c896','#3d8ef0','#f04f5e','#f5a623','#8b5cf6','#f06050'];

const Tip = ({ active, payload, label }) => active && payload?.length ? (
  <div style={{background:'var(--bg3)',border:'1px solid var(--border2)',padding:'8px 12px',borderRadius:8,fontSize:12}}>
    {label && <div style={{color:'var(--text2)',marginBottom:4}}>{label}</div>}
    {payload.map((p, i) => <div key={i} style={{color:p.color||p.fill||'var(--text)'}}>{p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</strong></div>)}
  </div>
) : null;

function DonutChart({ data, title }) {
  if (!data?.length) return <div className="card"><div className="card-title">{title}</div><div className="empty" style={{padding:24}}><span style={{color:'var(--text3)',fontSize:12}}>No data yet</span></div></div>;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={44} outerRadius={68} dataKey="value" paddingAngle={2}>
            {data.map((e, i) => <Cell key={i} fill={COLORS[e.name] || PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip content={<Tip />} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,justifyContent:'center',marginTop:4}}>
        {data.map((d, i) => (
          <div key={i} style={{display:'flex',alignItems:'center',gap:5,fontSize:11}}>
            <div style={{width:8,height:8,borderRadius:2,background:COLORS[d.name]||PIE_COLORS[i%PIE_COLORS.length]}} />
            <span style={{color:'var(--text2)'}}>{d.name}</span>
            <span style={{fontFamily:'var(--mono)',color:'var(--text)'}}>{d.value} <span style={{color:'var(--text3)'}}>({Math.round(d.value/total*100)}%)</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChartCard({ data, title }) {
  if (!data?.length) return <div className="card"><div className="card-title">{title}</div><div className="empty" style={{padding:24}}><span style={{color:'var(--text3)',fontSize:12}}>No data yet</span></div></div>;
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{top:0,right:0,bottom:16,left:-16}}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="symbol" tick={{fill:'var(--text2)',fontSize:11,fontFamily:'var(--mono)'}} />
          <YAxis tick={{fill:'var(--text3)',fontSize:10}} domain={[0,100]} />
          <Tooltip content={<Tip />} />
          <Bar dataKey="value" radius={[3,3,0,0]}>
            {data.map((e, i) => <Cell key={i} fill={e.value>=70?'var(--green)':e.value>=50?'var(--amber)':'var(--red)'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CostByPromptChart({ data }) {
  if (!Object.keys(data||{}).length) return null;
  const d = Object.entries(data).map(([name, cost]) => ({ name: name.split(' ')[0], cost }));
  return (
    <div className="card">
      <div className="card-title">Cost by Prompt ($)</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={d} margin={{top:0,right:0,bottom:20,left:-16}}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" tick={{fill:'var(--text2)',fontSize:11}} />
          <YAxis tick={{fill:'var(--text3)',fontSize:10}} />
          <Tooltip content={<Tip />} />
          <Bar dataKey="cost" radius={[3,3,0,0]} fill="var(--purple)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LatestSignals({ latest }) {
  const entries = Object.entries(latest || {});
  if (!entries.length) return null;
  const sc = { BUY:'badge-green', SELL:'badge-red', HOLD:'badge-amber', WATCH:'badge-blue' };
  return (
    <div className="tbl-wrap">
      <div style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',background:'var(--bg3)'}}><span className="card-title" style={{marginBottom:0}}>Latest Signals</span></div>
      <table>
        <thead><tr><th>Symbol</th><th>Signal</th><th>Confidence</th><th>Date</th></tr></thead>
        <tbody>
          {entries.map(([sym, d]) => (
            <tr key={sym}>
              <td className="mono" style={{fontWeight:700}}>{sym}</td>
              <td><span className={`badge ${sc[d.signal]||'badge-gray'}`}>{d.signal||'—'}</span></td>
              <td>
                {d.confidence != null ? (
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div className="prog" style={{maxWidth:80}}><div className="prog-fill" style={{width:`${d.confidence}%`,background:d.confidence>=70?'var(--green)':d.confidence>=50?'var(--amber)':'var(--red)'}} /></div>
                    <span className="mono" style={{fontSize:11}}>{d.confidence}%</span>
                  </div>
                ) : '—'}
              </td>
              <td style={{fontSize:11,color:'var(--text3)'}}>{d.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Statistics() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  const load = async () => { setLoading(true); try { setStats(await api('/statistics')); } catch (_) {} setLoading(false); };

  if (loading) return <div className="page"><div className="page-header"><h1>Analytics</h1></div><div className="page-body"><div className="empty"><span className="spinner" style={{width:20,height:20,borderTopColor:'var(--green)',borderColor:'var(--bg4)'}} /></div></div></div>;

  const sigData = Object.entries(stats?.signal_distribution||{}).map(([name,value])=>({name,value}));
  const trendData = Object.entries(stats?.trend_distribution||{}).map(([name,value])=>({name,value}));
  const riskData = Object.entries(stats?.risk_distribution||{}).map(([name,value])=>({name,value}));
  const valData = Object.entries(stats?.valuation_distribution||{}).map(([name,value])=>({name,value}));
  const confData = Object.entries(stats?.avg_confidence_by_stock||{}).map(([symbol,value])=>({symbol,value}));
  const fundData = Object.entries(stats?.avg_fundamental_by_stock||{}).map(([symbol,value])=>({symbol,value}));

  return (
    <div className="page">
      <div className="page-header">
        <h1>Analytics</h1>
        <p className="sub">Statistics derived from all stored structured outputs</p>
      </div>
      <div className="page-body">
        <div style={{display:'flex',justifyContent:'flex-end'}}><button className="btn" onClick={load}>↻ Refresh</button></div>

        <div className="stat-grid">
      <div className="stat-card" style={{ gridColumn: '1 / -1' }}><div className="stat-lbl">Token Budget</div><div className="stat-val">{((stats?.total_input_tokens || 0) + (stats?.total_output_tokens || 0)).toLocaleString()} / 5,000,000</div></div>

          {[
            { label: 'Total Analyses', val: stats?.total_analyses ?? 0 },
            { label: 'Total Cost', val: stats?.total_cost > 0 ? `$${stats.total_cost.toFixed(4)}` : '$0' },
            { label: 'Total Tokens', val: stats?.total_tokens > 0 ? (stats.total_tokens/1000).toFixed(0)+'K' : '0' },
            { label: 'Stocks Tracked', val: stats?.total_stocks_tracked ?? 0 },
          ].map(({ label, val }) => (
            <div key={label} className="stat-card"><div className="stat-val">{val}</div><div className="stat-lbl">{label}</div></div>
          ))}
        </div>

        <LatestSignals latest={stats?.latest_signals} />

        <div className="grid-2">
          <DonutChart data={sigData} title="Signal Distribution" />
          <DonutChart data={trendData} title="Price Trend" />
        </div>
        <div className="grid-2">
          <DonutChart data={riskData} title="Risk Level" />
          <DonutChart data={valData} title="Valuation" />
        </div>

        {stats?.cost_by_prompt && <CostByPromptChart data={stats.cost_by_prompt} />}

        {stats?.signal_over_time?.length > 1 && (
          <div className="card">
            <div className="card-title">Signals Over Time</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={stats.signal_over_time} margin={{top:0,right:0,bottom:20,left:-16}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{fill:'var(--text3)',fontSize:10}} />
                <YAxis tick={{fill:'var(--text3)',fontSize:10}} />
                <Tooltip content={<Tip />} />
                <Legend wrapperStyle={{fontSize:11,color:'var(--text2)'}} />
                {['BUY','HOLD','SELL','WATCH'].map(s => <Line key={s} type="monotone" dataKey={s} stroke={COLORS[s]} strokeWidth={2} dot={{r:3}} connectNulls />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="grid-2">
          <BarChartCard data={confData} title="Avg Confidence by Stock" />
          <BarChartCard data={fundData} title="Avg Fundamental Score" />
        </div>

        {!stats?.total_analyses && (
          <div className="card"><div className="empty"><div className="empty-icon">◬</div><div className="empty-title">No data yet</div><div className="empty-desc">Run analyses to see charts and statistics here.</div></div></div>
        )}
      </div>
    </div>
  );
}
