import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../App';

const SUGGESTED = ['AAPL','MSFT','GOOGL','NVDA','AMZN','META','TSLA','ASML','ADBE','NFLX','BRK-B','JPM','V','UNH','LLY'];

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n/1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n/1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n/1e6).toFixed(2)}M`;
  return `$${n.toFixed(2)}`;
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
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f+1, results.length-1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f-1, -1)); }
    if (e.key === 'Enter') { e.preventDefault(); if (focused >= 0) select(results[focused].symbol); else if (query.trim()) select(query.trim().toUpperCase()); }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="autocomplete-wrap">
      <div style={{ display:'flex', gap:8 }}>
        <input
          ref={inputRef}
          className="form-input"
          placeholder="Search ticker or company name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{ flex:1 }}
          autoComplete="off"
        />
        <button className="btn btn-primary" onClick={() => query.trim() && select(query.trim().toUpperCase())} disabled={loading || !query.trim()}>
          {loading ? <span className="spinner" /> : '+'}
          {loading ? 'Adding…' : 'Add'}
        </button>
      </div>
      {open && results.length > 0 && (
        <div className="autocomplete-list">
          {results.map((r, i) => (
            <div key={r.symbol} className={`autocomplete-item ${focused===i?'focused':''}`} onMouseDown={() => select(r.symbol)}>
              <span className="ac-sym">{r.symbol}</span>
              <span className="ac-name">{r.name}</span>
              <span className="ac-exch">{r.exchange}</span>
            </div>
          ))}
        </div>
      )}
      {searching && <div style={{position:'absolute',right:96,top:10,pointerEvents:'none'}}><span className="spinner" style={{width:12,height:12,borderTopColor:'var(--green)',borderColor:'var(--bg4)'}} /></div>}
    </div>
  );
}

export default function Stocks({ stocks, onStocksChange, showNotification }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({});
  const [refreshing, setRefreshing] = useState(null);

  useEffect(() => {
    if (stocks.length) stocks.forEach(async s => {
      try { const d = await api(`/stocks/${s.symbol}/data`); setData(p => ({ ...p, [s.symbol]: d })); } catch (_) {}
    });
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
    try { await api(`/stocks/${sym}`, { method: 'DELETE' }); onStocksChange(); showNotification(`Removed ${sym}`); }
    catch (e) { showNotification(e.message, 'error'); }
  };

  const refresh = async (sym) => {
    setRefreshing(sym);
    try { const d = await api(`/stocks/${sym}/data`); setData(p => ({ ...p, [sym]: d })); }
    catch (e) { showNotification(e.message, 'error'); }
    setRefreshing(null);
  };

  const existing = new Set(stocks.map(s => s.symbol));
  const suggestions = SUGGESTED.filter(s => !existing.has(s)).slice(0, 8);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Watchlist</h1>
        <p className="sub">Manage the stocks you want to analyze</p>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="card-title">Add Stock</div>
          <StockAutocomplete onAdd={addStock} existing={existing} loading={loading} />
          {suggestions.length > 0 && (
            <div style={{ marginTop:12, display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--text3)', marginRight:4 }}>Suggestions:</span>
              {suggestions.map(s => (
                <button key={s} className="btn btn-xs" onClick={() => addStock(s)}>{s}</button>
              ))}
            </div>
          )}
        </div>

        <div className="tbl-wrap">
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg3)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span className="card-title" style={{marginBottom:0}}>{stocks.length} stocks</span>
          </div>
          {!stocks.length ? (
            <div className="empty">
              <div className="empty-icon">◈</div>
              <div className="empty-title">No stocks yet</div>
              <div className="empty-desc">Search for a ticker or company name above to add stocks to your watchlist.</div>
            </div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th style={{display:'none'}} className="hide-sm">Name</th>
                    <th>Price</th><th>Chg%</th><th>Mkt Cap</th>
                    <th className="hide-mobile">P/E</th>
                    <th className="hide-mobile">52W Pos</th>
                    <th className="hide-mobile">Vol/Avg</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map(stock => {
                    const d = data[stock.symbol];
                    const ch = d?.change_percent;
                    const pos52 = d?.current_price && d?.week52_high && d?.week52_low
                      ? ((d.current_price - d.week52_low) / (d.week52_high - d.week52_low) * 100).toFixed(0) : null;
                    const volR = d?.volume && d?.avg_volume ? (d.volume / d.avg_volume).toFixed(2) : null;
                    return (
                      <tr key={stock.symbol}>
                        <td>
                          <div className="mono" style={{fontWeight:700}}>{stock.symbol}</div>
                          <div style={{fontSize:10,color:'var(--text3)'}}>{d?.name?.slice(0,16) || stock.name?.slice(0,16)}</div>
                        </td>
                        <td className="mono">{d?.current_price ? `$${d.current_price.toFixed(2)}` : '—'}</td>
                        <td>
                          <span className={`mono ${ch >= 0 ? 'pos' : ch < 0 ? 'neg' : 'muted'}`} style={{fontSize:12}}>
                            {ch != null ? `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%` : '—'}
                          </span>
                        </td>
                        <td className="mono" style={{fontSize:12,color:'var(--text2)'}}>{d ? fmt(d.market_cap) : '—'}</td>
                        <td className="mono hide-mobile" style={{fontSize:12,color:'var(--text2)'}}>{d?.pe_ratio ? d.pe_ratio.toFixed(1) : '—'}</td>
                        <td className="hide-mobile">
                          {pos52 ? (
                            <div style={{display:'flex',flexDirection:'column',gap:3}}>
                              <div style={{fontSize:10,color:'var(--text3)'}}>{pos52}%</div>
                              <div style={{height:3,width:64,background:'var(--bg4)',borderRadius:2}}>
                                <div style={{height:'100%',width:`${pos52}%`,background:'var(--green)',borderRadius:2}} />
                              </div>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="mono hide-mobile" style={{fontSize:12,color: parseFloat(volR) > 1.5 ? 'var(--amber)' : 'var(--text2)'}}>{volR ? `${volR}×` : '—'}</td>
                        <td>
                          <div style={{display:'flex',gap:4}}>
                            <button className="btn btn-xs" onClick={() => refresh(stock.symbol)} disabled={refreshing===stock.symbol} title="Refresh">
                              {refreshing===stock.symbol ? <span className="spinner" style={{width:10,height:10,borderTopColor:'var(--green)',borderColor:'var(--bg4)'}} /> : '↻'}
                            </button>
                            <button className="btn btn-xs btn-danger" onClick={() => removeStock(stock.symbol)} title="Remove">×</button>
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
    </div>
  );
}
