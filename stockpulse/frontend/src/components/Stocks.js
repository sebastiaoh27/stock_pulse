import React, { useState, useEffect } from 'react';
import { api } from '../App';

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(2)}`;
}

export default function Stocks({ stocks, onStocksChange, showNotification }) {
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [stockData, setStockData] = useState({});
  const [fetchingSymbol, setFetchingSymbol] = useState(null);

  useEffect(() => {
    if (stocks.length) fetchAllData();
  }, [stocks]);

  const fetchAllData = async () => {
    for (const s of stocks) {
      try {
        const d = await api(`/stocks/${s.symbol}/data`);
        setStockData(prev => ({ ...prev, [s.symbol]: d }));
      } catch (_) {}
    }
  };

  const addStock = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    setFetchingSymbol(sym);
    try {
      const result = await api('/stocks', { method: 'POST', body: { symbol: sym } });
      onStocksChange();
      setSymbol('');
      showNotification(`Added ${result.name || sym} to watchlist`);
    } catch (e) {
      showNotification(e.message, 'error');
    }
    setLoading(false);
    setFetchingSymbol(null);
  };

  const removeStock = async (sym) => {
    try {
      await api(`/stocks/${sym}`, { method: 'DELETE' });
      onStocksChange();
      showNotification(`Removed ${sym}`);
    } catch (e) {
      showNotification(e.message, 'error');
    }
  };

  const refreshStock = async (sym) => {
    setFetchingSymbol(sym);
    try {
      const d = await api(`/stocks/${sym}/data`);
      setStockData(prev => ({ ...prev, [sym]: d }));
    } catch (e) {
      showNotification(e.message, 'error');
    }
    setFetchingSymbol(null);
  };

  const popularStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'ASML', 'SAP', 'ADBE'];
  const alreadyAdded = new Set(stocks.map(s => s.symbol));

  return (
    <div>
      <div className="page-header">
        <h1>Watchlist</h1>
        <p className="subtitle">Manage the stocks you want to track and analyze</p>
      </div>

      <div className="page-body">
        {/* Add stock */}
        <div className="card mb-16">
          <div className="card-header">
            <span className="card-title">Add Stock</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              className="form-input"
              placeholder="Ticker symbol (e.g. AAPL, MSFT, ASML)"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && addStock()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={addStock} disabled={loading || !symbol.trim()}>
              {loading ? <span className="spinner" /> : '+'}
              {loading ? 'Adding…' : 'Add'}
            </button>
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'center', marginRight: 4 }}>Quick add:</span>
            {popularStocks.map(s => (
              <button
                key={s}
                className="btn btn-xs"
                style={{ opacity: alreadyAdded.has(s) ? 0.4 : 1 }}
                disabled={alreadyAdded.has(s)}
                onClick={() => { setSymbol(s); }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Stocks table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <span className="card-title">{stocks.length} stocks tracked</span>
          </div>
          {stocks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">◈</div>
              <div className="empty-title">No stocks yet</div>
              <div className="empty-desc">Add stocks using the form above to start tracking them.</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Change</th>
                  <th>Market Cap</th>
                  <th>P/E</th>
                  <th>52W Range</th>
                  <th>Vol vs Avg</th>
                  <th>Sector</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stocks.map(stock => {
                  const d = stockData[stock.symbol];
                  const isLoading = fetchingSymbol === stock.symbol;
                  const change = d?.change_percent;
                  const w52range = d?.week52_high && d?.week52_low
                    ? `$${d.week52_low?.toFixed(0)}–$${d.week52_high?.toFixed(0)}` : '—';
                  const volRatio = d?.volume && d?.avg_volume
                    ? (d.volume / d.avg_volume).toFixed(2) + 'x' : '—';
                  const pos52 = d?.current_price && d?.week52_high && d?.week52_low
                    ? ((d.current_price - d.week52_low) / (d.week52_high - d.week52_low) * 100).toFixed(0) + '%'
                    : null;

                  return (
                    <tr key={stock.symbol}>
                      <td>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14 }}>
                          {stock.symbol}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 13 }}>{isLoading ? '…' : (d?.name || stock.name || '—')}</span>
                      </td>
                      <td>
                        <span className="mono">{d?.current_price ? `$${d.current_price.toFixed(2)}` : '—'}</span>
                      </td>
                      <td>
                        <span className={`mono ${change >= 0 ? 'change-pos' : 'change-neg'}`}>
                          {change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—'}
                        </span>
                      </td>
                      <td className="mono">{d ? fmt(d.market_cap) : '—'}</td>
                      <td className="mono">{d?.pe_ratio ? d.pe_ratio.toFixed(1) : '—'}</td>
                      <td>
                        <div style={{ fontSize: 12 }}>{w52range}</div>
                        {pos52 && (
                          <div style={{ height: 3, background: 'var(--bg4)', borderRadius: 2, marginTop: 4, width: 80 }}>
                            <div style={{ height: '100%', width: pos52, background: 'var(--accent)', borderRadius: 2 }} />
                          </div>
                        )}
                      </td>
                      <td className="mono" style={{ color: parseFloat(volRatio) > 1.5 ? 'var(--yellow)' : 'var(--text2)' }}>
                        {volRatio}
                      </td>
                      <td>
                        {d?.sector ? (
                          <span className="badge badge-gray" style={{ fontSize: 10 }}>{d.sector}</span>
                        ) : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn btn-xs"
                            onClick={() => refreshStock(stock.symbol)}
                            disabled={isLoading}
                            title="Refresh data"
                          >
                            {isLoading ? <span className="spinner" style={{ width: 10, height: 10 }} /> : '↻'}
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
          )}
        </div>
      </div>
    </div>
  );
}
