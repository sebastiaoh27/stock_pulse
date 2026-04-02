import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import Stocks from './components/Stocks';
import Prompts from './components/Prompts';
import History from './components/History';
import Statistics from './components/Statistics';
import './App.css';

// Production (Netlify): /api/* is rewritten to /.netlify/functions/api via netlify.toml
// Local dev: point at Flask on :5000
const API = process.env.NODE_ENV === 'production' ? '' : (process.env.REACT_APP_API_URL || 'http://localhost:5000');

export const api = async (path, options = {}) => {
  const res = await fetch(`${API}/api${path}`, {
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

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
  { id: 'stocks', label: 'Watchlist', icon: '◈' },
  { id: 'prompts', label: 'Prompts', icon: '◉' },
  { id: 'history', label: 'Run History', icon: '◫' },
  { id: 'statistics', label: 'Analytics', icon: '◬' },
];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [runStatus, setRunStatus] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [notification, setNotification] = useState(null);

  const showNotification = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const loadStocks = useCallback(async () => {
    try {
      const data = await api('/stocks');
      setStocks(data);
    } catch (e) { /* silent */ }
  }, []);

  const loadPrompts = useCallback(async () => {
    try {
      const data = await api('/prompts');
      setPrompts(data);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    loadStocks();
    loadPrompts();
  }, [loadStocks, loadPrompts]);

  const triggerRun = useCallback(async () => {
    setRunStatus('running');
    try {
      await api('/runs', { method: 'POST', body: {} });
      showNotification('Analysis run started — results will appear when complete', 'info');
      // Poll for completion
      const poll = setInterval(async () => {
        const runs = await api('/runs');
        const latest = runs[0];
        if (latest && latest.status !== 'running') {
          setRunStatus(latest.status);
          clearInterval(poll);
          if (latest.status === 'completed') {
            showNotification(`Run completed — ${latest.stocks_processed} stocks analyzed`);
          }
        }
      }, 3000);
    } catch (e) {
      setRunStatus('failed');
      showNotification(e.message, 'error');
    }
  }, [showNotification]);

  const pages = { dashboard: Dashboard, stocks: Stocks, prompts: Prompts, history: History, statistics: Statistics };
  const PageComponent = pages[page];

  return (
    <div className="app">
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
            <button
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              onClick={() => setPage(id)}
            >
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
              {id === 'dashboard' && runStatus === 'running' && (
                <span className="nav-badge running">●</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className={`run-btn ${runStatus === 'running' ? 'running' : ''}`}
            onClick={triggerRun}
            disabled={runStatus === 'running'}
          >
            {runStatus === 'running' ? (
              <><span className="spinner" /> Analyzing…</>
            ) : (
              <><span>↻</span> Run Analysis</>
            )}
          </button>
          <div className="sidebar-meta">
            <span>{stocks.length} stocks · {prompts.filter(p => p.active).length} prompts</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        {notification && (
          <div className={`notification ${notification.type}`}>
            {notification.msg}
          </div>
        )}
        <PageComponent
          stocks={stocks}
          prompts={prompts}
          onStocksChange={loadStocks}
          onPromptsChange={loadPrompts}
          triggerRun={triggerRun}
          runStatus={runStatus}
          showNotification={showNotification}
        />
      </main>
    </div>
  );
}
