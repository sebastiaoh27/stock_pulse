import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import Dashboard from './components/Dashboard';
import Stocks from './components/Stocks';
import Prompts from './components/Prompts';
import History from './components/History';
import Statistics from './components/Statistics';
import Suggestions from './components/Suggestions';
import './App.css';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : (process.env.REACT_APP_API_URL || 'http://localhost:5000');

export const api = async (path, options = {}) => {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
};

export const SettingsContext = createContext({ model: 'claude-sonnet-4-20250514', setModel: () => {} });
export const useSettings = () => useContext(SettingsContext);

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
  { id: 'stocks', label: 'Watchlist', icon: '◈' },
  { id: 'prompts', label: 'Prompts', icon: '◉' },
  { id: 'history', label: 'History', icon: '◫' },
  { id: 'statistics', label: 'Analytics', icon: '◬' },
  { id: 'suggestions', label: 'AI Advisor', icon: '✦' },
];

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', desc: 'Fast · $0.80/M' },
  { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4', desc: 'Balanced · $3/M' },
  { id: 'claude-opus-4-5', label: 'Opus 4.5', desc: 'Best · $15/M' },
];

function fmtEta(secs) {
  if (secs == null || secs < 0) return '';
  if (secs === 0) return 'almost done';
  if (secs < 60) return `~${secs}s left`;
  return `~${Math.ceil(secs / 60)}m left`;
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [stocks, setStocks] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [runStatus, setRunStatus] = useState(null);
  const [latestRun, setLatestRun] = useState(null);
  const [notification, setNotification] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const notify = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4500);
  }, []);

  const loadStocks = useCallback(async () => {
    try { setStocks(await api('/stocks')); } catch (_) {}
  }, []);

  const loadPrompts = useCallback(async () => {
    try { setPrompts(await api('/prompts')); } catch (_) {}
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await api('/settings');
      if (s?.model) setModel(s.model);
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadStocks();
    loadPrompts();
    loadSettings();
    // Check if there's an already-running run on page load
    api('/runs').then(runs => {
      if (runs[0]?.status === 'running') {
        setRunStatus('running');
        setLatestRun(runs[0]);
      }
    }).catch(() => {});
  }, [loadStocks, loadPrompts, loadSettings]);

  // Poll for run progress when running
  useEffect(() => {
    if (runStatus !== 'running') return;
    const poll = setInterval(async () => {
      try {
        const runs = await api('/runs');
        const latest = runs[0];
        if (latest) setLatestRun(latest);
        if (latest && latest.status !== 'running') {
          setRunStatus(latest.status);
          clearInterval(poll);
          if (latest.status === 'completed') {
            const cost = latest.total_cost ? ` · $${latest.total_cost.toFixed(4)}` : '';
            notify(`Run complete — ${latest.stocks_processed} stocks${cost}`);
          } else if (latest.status === 'cancelled') {
            notify('Run was cancelled', 'info');
          } else {
            notify('Run failed — check History for details', 'error');
          }
        }
      } catch (_) {}
    }, 2000);
    return () => clearInterval(poll);
  }, [runStatus, notify]);

  const changeModel = useCallback(async (m) => {
    setModel(m);
    try { await api('/settings', { method: 'PUT', body: { model: m } }); } catch (_) {}
  }, []);

  const triggerRun = useCallback(async (opts = {}) => {
    setRunStatus('running');
    try {
      await api('/runs', { method: 'POST', body: { model, ...opts } });
      notify('Analysis started — results will appear when complete', 'info');
    } catch (e) {
      setRunStatus('failed');
      notify(e.message, 'error');
    }
  }, [model, notify]);

  const cancelCurrentRun = useCallback(async () => {
    if (!latestRun?.id) return;
    try {
      await api(`/runs/${latestRun.id}/cancel`, { method: 'POST' });
      notify('Cancelling run…', 'info');
    } catch (e) {
      notify(e.message, 'error');
    }
  }, [latestRun, notify]);

  const pages = { dashboard: Dashboard, stocks: Stocks, prompts: Prompts, history: History, statistics: Statistics, suggestions: Suggestions };
  const PageComponent = pages[page] || Dashboard;
  const activeNav = NAV.find(n => n.id === page);

  const progress = latestRun?.progress_percent || 0;
  const eta = latestRun?.eta_seconds;

  return (
    <SettingsContext.Provider value={{ model, setModel: changeModel, models: MODELS }}>
      <div className="app">
        {/* ── Desktop sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark">SP</div>
            <div className="logo-text">
              <span className="logo-title">StockPulse</span>
              <span className="logo-sub">AI Analytics</span>
            </div>
          </div>

          <nav className="sidebar-nav">
            {NAV.map(({ id, label, icon }) => (
              <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}>
                <span className="nav-icon">{icon}</span>
                <span className="nav-label">{label}</span>
                {id === 'dashboard' && runStatus === 'running' && <span className="nav-ping" />}
              </button>
            ))}
          </nav>

          <div className="sidebar-model">
            <div className="model-label">Model</div>
            <select className="model-select" value={model} onChange={e => changeModel(e.target.value)}>
              {MODELS.map(m => <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>)}
            </select>
          </div>

          <div className="sidebar-footer">
            <button
              className={`run-btn ${runStatus === 'running' ? 'running' : ''}`}
              onClick={() => triggerRun()}
              disabled={runStatus === 'running'}
            >
              {runStatus === 'running' ? <><span className="spinner" />Analyzing…</> : <>↻ Run Analysis</>}
            </button>
            <div className="sidebar-meta">{stocks.length} stocks · {prompts.filter(p => p.active).length} prompts</div>
          </div>
        </aside>

        {/* ── Mobile header ── */}
        <header className="mobile-header">
          <button className="mobile-menu-btn" onClick={() => setMobileNavOpen(o => !o)}>
            <span /><span /><span />
          </button>
          <div className="mobile-title">
            <span className="logo-mark-sm">SP</span>
            {activeNav?.label}
          </div>
          <button
            className={`mobile-run-btn ${runStatus === 'running' ? 'running' : ''}`}
            onClick={() => triggerRun()}
            disabled={runStatus === 'running'}
          >
            {runStatus === 'running' ? <span className="spinner-sm" /> : '↻'}
          </button>
        </header>

        {/* ── Mobile nav drawer ── */}
        {mobileNavOpen && (
          <div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)}>
            <nav className="mobile-nav-drawer" onClick={e => e.stopPropagation()}>
              <div className="mobile-nav-logo">
                <div className="logo-mark">SP</div>
                <div className="logo-text"><span className="logo-title">StockPulse</span><span className="logo-sub">AI Analytics</span></div>
              </div>
              {NAV.map(({ id, label, icon }) => (
                <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setMobileNavOpen(false); }}>
                  <span className="nav-icon">{icon}</span>
                  <span className="nav-label">{label}</span>
                </button>
              ))}
              <div className="mobile-nav-model">
                <div className="model-label">Model</div>
                <select className="model-select" value={model} onChange={e => changeModel(e.target.value)}>
                  {MODELS.map(m => <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>)}
                </select>
              </div>
              <div className="sidebar-meta" style={{ padding: '12px 16px' }}>{stocks.length} stocks · {prompts.filter(p => p.active).length} prompts</div>
            </nav>
          </div>
        )}

        {/* ── Main content ── */}
        <main className="main-content">
          {notification && (
            <div className={`notification ${notification.type}`} onClick={() => setNotification(null)}>
              {notification.msg}
            </div>
          )}

          {/* Global run progress banner */}
          {runStatus === 'running' && (
            <div style={{
              margin: '0 0 0 0',
              padding: '10px 20px',
              background: 'var(--bg2)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <span className="spinner-sm" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                    Analyzing… {progress > 0 ? `${progress}%` : ''}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {fmtEta(eta)}
                  </span>
                </div>
                <div style={{ height: 4, background: 'var(--bg4)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: progress > 0 ? `${progress}%` : '30%',
                    background: 'linear-gradient(90deg, var(--blue), var(--green))',
                    borderRadius: 2,
                    transition: 'width 0.5s ease',
                    animation: progress === 0 ? 'indeterminate 1.5s ease infinite' : 'none',
                  }} />
                </div>
              </div>
              <button
                className="btn btn-xs btn-danger"
                onClick={cancelCurrentRun}
                style={{ flexShrink: 0 }}
              >
                Cancel
              </button>
            </div>
          )}

          <PageComponent
            stocks={stocks}
            prompts={prompts}
            model={model}
            onStocksChange={loadStocks}
            onPromptsChange={loadPrompts}
            triggerRun={triggerRun}
            runStatus={runStatus}
            showNotification={notify}
          />
        </main>

        {/* ── Mobile bottom nav ── */}
        <nav className="mobile-bottom-nav">
          {NAV.map(({ id, label, icon }) => (
            <button key={id} className={`bottom-nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}>
              <span className="bottom-nav-icon">{icon}</span>
              <span className="bottom-nav-label">{label}</span>
              {id === 'dashboard' && runStatus === 'running' && <span className="nav-ping bottom" />}
            </button>
          ))}
        </nav>
      </div>
    </SettingsContext.Provider>
  );
}
