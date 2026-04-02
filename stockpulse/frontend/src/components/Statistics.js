import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { api } from '../App';

const COLORS = {
  BUY: '#00d4aa',
  SELL: '#ff4757',
  HOLD: '#ffbb33',
  WATCH: '#0090ff',
  BULLISH: '#00d4aa',
  BEARISH: '#ff4757',
  NEUTRAL: '#8899aa',
  LOW: '#00d4aa',
  MEDIUM: '#ffbb33',
  HIGH: '#ff4757',
  UNDERVALUED: '#00d4aa',
  FAIR: '#ffbb33',
  OVERVALUED: '#ff4757',
};

const PIE_COLORS = ['#00d4aa', '#0090ff', '#ff4757', '#ffbb33', '#7c3aed', '#ff6b35', '#8899aa'];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg3)', border: '1px solid var(--border2)',
        padding: '10px 14px', borderRadius: 8, fontSize: 12
      }}>
        {label && <div style={{ color: 'var(--text2)', marginBottom: 6 }}>{label}</div>}
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color || p.fill || 'var(--text)', marginBottom: 2 }}>
            {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

function DonutChart({ data, title }) {
  if (!data || data.length === 0) return <EmptyChart title={title} />;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>{title}</div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={78}
            dataKey="value" nameKey="name" paddingAngle={2}>
            {data.map((entry, i) => (
              <Cell key={i} fill={COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, justifyContent: 'center' }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <div style={{
              width: 8, height: 8, borderRadius: 2,
              background: COLORS[d.name] || PIE_COLORS[i % PIE_COLORS.length]
            }} />
            <span style={{ color: 'var(--text2)' }}>{d.name}</span>
            <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>
              {d.value} <span style={{ color: 'var(--text3)' }}>({Math.round(d.value / total * 100)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart({ title }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="empty-state" style={{ padding: 32 }}>
        <div style={{ color: 'var(--text3)', fontSize: 12 }}>No data yet — run analyses to see charts</div>
      </div>
    </div>
  );
}

function ScoreBarChart({ data, title, colorKey }) {
  if (!data || data.length === 0) return <EmptyChart title={title} />;
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>{title}</div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 20, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="symbol" tick={{ fill: 'var(--text2)', fontSize: 11, fontFamily: 'var(--mono)' }} />
          <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} domain={[0, 100]} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.value >= 70 ? 'var(--green)' : entry.value >= 50 ? 'var(--yellow)' : 'var(--red)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SignalTimeline({ data }) {
  if (!data || data.length === 0) return <EmptyChart title="Signal Distribution Over Time" />;
  const signals = ['BUY', 'HOLD', 'SELL', 'WATCH'];
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>Signal Distribution Over Time</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 0, right: 0, bottom: 20, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fill: 'var(--text3)', fontSize: 10 }} />
          <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text2)' }} />
          {signals.map(s => (
            <Line
              key={s} type="monotone" dataKey={s}
              stroke={COLORS[s]} strokeWidth={2}
              dot={{ r: 3, fill: COLORS[s] }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LatestSignalsTable({ latest }) {
  const entries = Object.entries(latest || {});
  if (!entries.length) return null;

  const signalClass = { BUY: 'badge-green', SELL: 'badge-red', HOLD: 'badge-yellow', WATCH: 'badge-blue' };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <span className="card-title">Latest Signals (Daily Summary)</span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Signal</th>
            <th>Confidence</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([sym, d]) => (
            <tr key={sym}>
              <td className="mono" style={{ fontWeight: 700 }}>{sym}</td>
              <td><span className={`badge ${signalClass[d.signal] || 'badge-gray'}`}>{d.signal || '—'}</span></td>
              <td>
                {d.confidence != null ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 80, height: 4, background: 'var(--bg4)', borderRadius: 2 }}>
                      <div style={{
                        width: `${d.confidence}%`, height: '100%',
                        background: d.confidence >= 70 ? 'var(--green)' : d.confidence >= 50 ? 'var(--yellow)' : 'var(--red)',
                        borderRadius: 2
                      }} />
                    </div>
                    <span className="mono text-sm">{d.confidence}%</span>
                  </div>
                ) : '—'}
              </td>
              <td style={{ color: 'var(--text3)', fontSize: 12 }}>{d.date}</td>
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

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await api('/statistics');
      setStats(data);
    } catch (e) {}
    setLoading(false);
  };

  if (loading) return (
    <div>
      <div className="page-header"><h1>Analytics</h1></div>
      <div className="page-body"><div className="empty-state"><span className="spinner" /></div></div>
    </div>
  );

  const signalData = stats ? Object.entries(stats.signal_distribution).map(([name, value]) => ({ name, value })) : [];
  const trendData = stats ? Object.entries(stats.trend_distribution).map(([name, value]) => ({ name, value })) : [];
  const riskData = stats ? Object.entries(stats.risk_distribution).map(([name, value]) => ({ name, value })) : [];
  const valData = stats ? Object.entries(stats.valuation_distribution).map(([name, value]) => ({ name, value })) : [];

  const confData = stats ? Object.entries(stats.avg_confidence_by_stock).map(([symbol, value]) => ({ symbol, value })) : [];
  const fundData = stats ? Object.entries(stats.avg_fundamental_by_stock).map(([symbol, value]) => ({ symbol, value })) : [];
  const volData = stats ? Object.entries(stats.avg_volatility_by_stock).map(([symbol, value]) => ({ symbol, value })) : [];

  return (
    <div>
      <div className="page-header">
        <h1>Analytics</h1>
        <p className="subtitle">Statistical insights derived from all stored analysis results</p>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn" onClick={loadStats}>↻ Refresh</button>
        </div>

        {/* Summary stats */}
        <div className="grid-4 mb-16">
          {[
            { label: 'Total Analyses', value: stats?.total_analyses ?? 0 },
            { label: 'Manual Runs', value: stats?.run_counts?.manual ?? 0 },
            { label: 'Scheduled Runs', value: stats?.run_counts?.scheduled ?? 0 },
            { label: 'Stocks Analyzed', value: stats?.total_stocks_tracked ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="card card-sm">
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={{ fontSize: 22 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Latest signals table */}
        <div className="mb-16">
          <LatestSignalsTable latest={stats?.latest_signals} />
        </div>

        {/* Distribution donut charts */}
        <div className="grid-2 mb-16">
          <DonutChart data={signalData} title="Signal Distribution" />
          <DonutChart data={trendData} title="Price Trend Distribution" />
        </div>
        <div className="grid-2 mb-16">
          <DonutChart data={riskData} title="Risk Level Distribution" />
          <DonutChart data={valData} title="Valuation Distribution" />
        </div>

        {/* Signal timeline */}
        {stats?.signal_over_time?.length > 0 && (
          <div className="mb-16">
            <SignalTimeline data={stats.signal_over_time} />
          </div>
        )}

        {/* Per-stock scores */}
        <div className="grid-2 mb-16">
          <ScoreBarChart data={confData} title="Avg AI Confidence by Stock" />
          <ScoreBarChart data={fundData} title="Avg Fundamental Score by Stock" />
        </div>
        {volData.length > 0 && (
          <div className="mb-16">
            <ScoreBarChart data={volData} title="Avg Volatility Score by Stock" />
          </div>
        )}

        {(!stats || stats.total_analyses === 0) && (
          <div className="card">
            <div className="empty-state">
              <div className="empty-icon">◬</div>
              <div className="empty-title">No data to analyze yet</div>
              <div className="empty-desc">
                Run analyses on your stocks to start building statistical insights.
                Charts will populate as you run more analyses over time.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
