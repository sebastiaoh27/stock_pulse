import React, { useState, useEffect, useRef } from 'react';
import { api } from '../App';

const SUGGESTED = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN', 'META', 'TSLA', 'ASML', 'ADBE', 'NFLX', 'BRK-B', 'JPM', 'V', 'UNH', 'LLY'];

function fmtMoney(n) {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(2)}`;
}

function fmtVol(n) {
  if (n == null) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

function Sparkline({ changes }) {
  if (!changes?.length) return <span style={{ color: 'var(--text3)', fontSize: 10 }}>—</span>;
  const vals = changes.slice(-16);
  const max = Math.max(...vals.map(Math.abs), 0.01);
  return (
    <div className="spark" style={{ height: 24 }}>
      {vals.map((c, i) => (
        <div key={i} className="spark-bar" style={{
          height: `${Math.max(10, (Math.abs(c) / max) * 100)}%`,
          background: c >= 0 ? 'var(--green)' : 'var(--red)',
          opacity: 0.4 + (i / vals.length) * 0.6
        }} />
      ))}
    </div>
  );
}

function Week52Bar({ current, low, high }) {
  if (!current || !low || !high || high === low) return <span style={{ color: 'var(--text3)' }}>—</span>;
  const pct = Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
        <span>${low.toFixed(0)}</span>
        <span>${high.toFixed(0)}</span>
      </div>
      <div style={{ height: 4, background: 'var(--bg4)', borderRadius: 2, position: 'relative' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--blue), var(--green))', borderRadius: 2 }} />
        <div style={{
          position: 'absolute', top: -2, left: `${pct}%`, transform: 'translateX(-50%)',
          width: 8, height: 8, borderRadius: '50%', background: 'var(--text)',
          border: '2px solid var(--bg2)', marginTop: -2
        }} />
      </div>
      <div style={{ textAlign: 'center', fontSize: 9, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{Math.round(pct)}%</div>
    </div>
  );
}

function StockDetailPanel({ stock, data, onClose }) {
  if (!data) return null;
  const ch = data.change_percent;
  const divYield = data.dividend_yield ? `${(data.dividend_yield * 100).toFixed(2)}%` : 'None';

  const stats = [
    ['Open', data.open ? `$${data.open.toFixed(2)}` : '—'],
    ['Day High', data.day_high ? `$${data.day_high.toFixed(2)}` : '—'],
    ['Day Low', data.day_low ? `$${data.day_low.toFixed(2)}` : '—'],
    ['Prev Close', data.previous_close ? `$${data.previous_close.toFixed(2)}` : '—'],
    ['Volume', fmtVol(data.volume)],
    ['Avg Volume', fmtVol(data.avg_volume)],
    ['Market Cap', fmtMoney(data.market_cap)],
    ['P/E (TTM)', data.pe_ratio ? data.pe_ratio.toFixed(1) : '—'],
    ['P/E (Fwd)', data.forward_pe ? data.forward_pe.toFixed(1) : '—'],
    ['EPS', data.eps ? `$${data.eps.toFixed(2)}` : '—'],
    ['Dividend', divYield],
    ['Beta', data.beta ? data.beta.toFixed(2) : '—'],
    ['50D MA', data.fifty_day_avg ? `$${data.fifty_day_avg.toFixed(2)}` : '—'],
    ['200D MA', data.two_hundred_day_avg ? `$${data.two_hundred_day_avg.toFixed(2)}` : '—'],
    ['Sector', data.sector || '—'],
    ['Industry', data.industry || '—'],
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-hdr">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="modal-title">{stock.symbol}</span>
              <span style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--mono)' }}>
                {data.current_price ? `$${data.current_price.toFixed(2)}` : '—'}
              </span>
              {ch != null && (
                <span className={`badge ${ch >= 0 ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 12 }}>
                  {ch >= 0 ? '+' : ''}{ch.toFixed(2)}%
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
              {data.name} · {data.sector || data.industry || ''}
            </div>
          </div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>30-Day Price Change</div>
          <Sparkline changes={data.price_changes_30d} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>52-Week Range</div>
          <Week52Bar current={data.current_price} low={data.week52_low} high={data.week52_high} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {stats.map(([label, val]) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '7px 10px', background: 'var(--bg)', borderRadius: 6,
              border: '1px solid var(--border)'
            }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{label}</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{val}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text3)', textAlign: 'right' }}>
          Data from Yahoo Finance · {data.fetched_at ? new Date(data.fetched_at).toLocaleTimeString() : ''}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function StockAutocomplete({ onAdd, existing, loading }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(-1);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api(`/stocks/search?q=${encodeURIComponent(query)}`);
        setResults(res);
        setOpen(res.length > 0);
        setFocused(-1);
      } catch (_) {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const select = async (sym) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    await onAdd(sym);
  };

  const onKey = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(f => Math.max(f - 1, -1)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (focused >= 0) select(results[focused].symbol);
      else if (query.trim()) select(query.trim().toUpperCase());
    }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="autocomplete-wrap">
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          className="form-input"
          placeholder="Search ticker or company name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{ flex: 1 }}
          autoComplete="off"
        />
        <button
          className="btn btn-primary"
          onClick={() => query.trim() && select(query.trim().toUpperCase())}
          disabled={loading || !query.trim()}
        >
          {loading ? <span className="spinner" /> : '+'}
          {loading ? 'Adding…' : 'Add'}
        </button>
      </div>
      {open && results.length > 0 && (
        <div className="autocomplete-list">
          {results.map((r, i) => (
            <div
              key={r.symbol}
              className={`autocomplete-item ${focused === i ? 'focused' : ''}`}
              onMouseDown={() => select(r.symbol)}
            >
              <span className="ac-sym">{r.symbol}</span>
              <span className="ac-name">{r.name}</span>
              <span className="ac-exch">{r.exchange}</span>
            </div>
          ))}
        </div>
      )}
      {searching && (
        <div style={{ position: 'absolute', right: 100, top: 10, pointerEvents: 'none' }}>
          <span className="spinner" style={{ width: 12, height: 12, borderTopColor: 'var(--green)', borderColor: 'var(--bg4)' }} />
        </div>
      )}
    </div>
  );
}

export default function Stocks({ stocks, onStocksChange, showNotification }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({});
  const [refreshing, setRefreshing] = useState(null);
  const [detailStock, setDetailStock] = useState(null);
  const [loadingAll, setLoadingAll] = useState(false);

  // Load all stock data on mount and when stocks change
  useEffect(() => {
    if (!stocks.length) return;
    const load = async () => {
      setLoadingAll(true);
      await Promise.allSettled(
        stocks.map(async s => {
          try {
            const d = await api(`/stocks/${s.symbol}/data`);
            setData(p => ({ ...p, [s.symbol]: d }));
          } catch (_) {}
        })
      );
      setLoadingAll(false);
    };
    load();
  }, [stocks]);

  const addStock = async (symbol) => {
    setLoading(true);
    try {
      const result = await api('/stocks', { method: 'POST', body: { symbol } });
      onStocksChange();
      showNotification(`Added ${result.name || symbol}`);
    } catch (e) { showNotification(e.message, 'error'); }
    setLoading(false);
  };

  const removeStock = async (sym) => {
    try {
      await api(`/stocks/${sym}`, { method: 'DELETE' });
      onStocksChange();
      setData(d => { const next = { ...d }; delete next[sym]; return next; });
      showNotification(`Removed ${sym}`);
    } catch (e) { showNotification(e.message, 'error'); }
  };

  const refresh = async (sym) => {
    setRefreshing(sym);
    try {
      const d = await api(`/stocks/${sym}/data`);
      setData(p => ({ ...p, [sym]: d }));
    } catch (e) { showNotification(e.message, 'error'); }
    setRefreshing(null);
  };

  const existing = new Set(stocks.map(s => s.symbol));
  const suggestions = SUGGESTED.filter(s => !existing.has(s)).slice(0, 8);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Watchlist</h1>
        <p className="sub">Manage the stocks you want to analyze — click any row for full stats</p>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="card-title">Add Stock</div>
          <StockAutocomplete onAdd={addStock} existing={existing} loading={loading} />
          {suggestions.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text3)', marginRight: 4 }}>Suggestions:</span>
              {suggestions.map(s => (
                <button key={s} className="btn btn-xs" onClick={() => addStock(s)}>{s}</button>
              ))}
            </div>
          )}
        </div>

        <div className="tbl-wrap">
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span className="card-title" style={{ marginBottom: 0 }}>
              {stocks.length} stocks
              {loadingAll && <span className="spinner-sm" style={{ marginLeft: 8 }} />}
            </span>
          </div>

          {!stocks.length ? (
            <div className="empty">
              <div className="empty-icon">◈</div>
              <div className="empty-title">No stocks yet</div>
              <div className="empty-desc">Search for a ticker or company name above to add stocks to your watchlist.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Price</th>
                    <th>Change</th>
                    <th>Mkt Cap</th>
                    <th>P/E</th>
                    <th className="hide-mobile">EPS</th>
                    <th className="hide-mobile">Beta</th>
                    <th className="hide-mobile">52W Range</th>
                    <th className="hide-mobile">Vol / Avg</th>
                    <th className="hide-mobile">30D</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map(stock => {
                    const d = data[stock.symbol];
                    const ch = d?.change_percent;
                    const volR = d?.volume && d?.avg_volume ? (d.volume / d.avg_volume).toFixed(2) : null;
                    const volColor = parseFloat(volR) > 2 ? 'var(--red)' : parseFloat(volR) > 1.5 ? 'var(--amber)' : 'var(--text2)';

                    return (
                      <tr
                        key={stock.symbol}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setDetailStock(stock)}
                      >
                        <td>
                          <div className="mono" style={{ fontWeight: 700 }}>{stock.symbol}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d?.name || stock.name}
                          </div>
                        </td>
                        <td className="mono" style={{ fontWeight: 500 }}>
                          {d?.current_price ? `$${d.current_price.toFixed(2)}` : <span style={{ color: 'var(--text3)' }}>—</span>}
                        </td>
                        <td>
                          {ch != null ? (
                            <div>
                              <span className={`mono ${ch >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 12, fontWeight: 500 }}>
                                {ch >= 0 ? '+' : ''}{ch.toFixed(2)}%
                              </span>
                              {d?.current_price && d?.previous_close && (
                                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                                  {ch >= 0 ? '+' : ''}${(d.current_price - d.previous_close).toFixed(2)}
                                </div>
                              )}
                            </div>
                          ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                        </td>
                        <td className="mono" style={{ fontSize: 12, color: 'var(--text2)' }}>
                          {d ? fmtMoney(d.market_cap) : '—'}
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {d?.pe_ratio ? (
                            <span style={{ color: d.pe_ratio > 50 ? 'var(--red)' : d.pe_ratio > 25 ? 'var(--amber)' : 'var(--green)' }}>
                              {d.pe_ratio.toFixed(1)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="mono hide-mobile" style={{ fontSize: 12, color: 'var(--text2)' }}>
                          {d?.eps ? `$${d.eps.toFixed(2)}` : '—'}
                        </td>
                        <td className="mono hide-mobile" style={{ fontSize: 12, color: 'var(--text2)' }}>
                          {d?.beta ? d.beta.toFixed(2) : '—'}
                        </td>
                        <td className="hide-mobile">
                          <Week52Bar current={d?.current_price} low={d?.week52_low} high={d?.week52_high} />
                        </td>
                        <td className="mono hide-mobile" style={{ fontSize: 12, color: volColor }}>
                          {volR ? (
                            <div>
                              <div>{volR}×</div>
                              <div style={{ fontSize: 9, color: 'var(--text3)' }}>{fmtVol(d?.volume)}</div>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="hide-mobile">
                          <Sparkline changes={d?.price_changes_30d} />
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn-xs"
                              onClick={() => refresh(stock.symbol)}
                              disabled={refreshing === stock.symbol}
                              title="Refresh"
                            >
                              {refreshing === stock.symbol
                                ? <span className="spinner" style={{ width: 10, height: 10, borderTopColor: 'var(--green)', borderColor: 'var(--bg4)' }} />
                                : '↻'
                              }
                            </button>
                            <button
                              className="btn btn-xs btn-danger"
                              onClick={() => removeStock(stock.symbol)}
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {detailStock && (
        <StockDetailPanel
          stock={detailStock}
          data={data[detailStock.symbol]}
          onClose={() => setDetailStock(null)}
        />
      )}
    </div>
  );
}
