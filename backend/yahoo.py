"""Yahoo Finance data fetching with caching and search."""

import json
import logging
from datetime import datetime, timedelta

import yfinance as yf

from config import CACHE_TTL_MINUTES
from db import get_db

logger = logging.getLogger(__name__)


def fetch_stock_data(symbol: str) -> dict:
    """Fetch stock data from Yahoo Finance with caching."""
    with get_db() as conn:
        c = conn.cursor()

        # Check cache
        c.execute("SELECT data, fetched_at FROM stock_cache WHERE symbol = ?", (symbol,))
        row = c.fetchone()
        if row:
            fetched_at = datetime.fromisoformat(row["fetched_at"])
            if datetime.now() - fetched_at < timedelta(minutes=CACHE_TTL_MINUTES):
                return json.loads(row["data"])

    # Fetch fresh data outside DB connection to avoid holding it during network I/O
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        hist = ticker.history(period="1mo")

        price_changes = []
        if not hist.empty and len(hist) > 1:
            closes = hist["Close"].tolist()
            price_changes = [
                round(((closes[i] - closes[i - 1]) / closes[i - 1]) * 100, 2)
                for i in range(1, len(closes))
            ]

        data = {
            "symbol": symbol,
            "name": info.get("longName", info.get("shortName", symbol)),
            "current_price": info.get("currentPrice") or info.get("regularMarketPrice"),
            "previous_close": info.get("previousClose"),
            "open": info.get("open"),
            "day_high": info.get("dayHigh"),
            "day_low": info.get("dayLow"),
            "volume": info.get("volume"),
            "avg_volume": info.get("averageVolume"),
            "market_cap": info.get("marketCap"),
            "pe_ratio": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "eps": info.get("trailingEps"),
            "dividend_yield": info.get("dividendYield"),
            "beta": info.get("beta"),
            "week52_high": info.get("fiftyTwoWeekHigh"),
            "week52_low": info.get("fiftyTwoWeekLow"),
            "fifty_day_avg": info.get("fiftyDayAverage"),
            "two_hundred_day_avg": info.get("twoHundredDayAverage"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "change_percent": info.get("regularMarketChangePercent"),
            "price_changes_30d": price_changes[-20:] if price_changes else [],
            "fetched_at": datetime.now().isoformat(),
        }

        # Update cache and stock name in a single short transaction
        with get_db() as conn:
            c = conn.cursor()
            c.execute(
                "INSERT OR REPLACE INTO stock_cache (symbol, data, fetched_at) VALUES (?, ?, datetime('now'))",
                (symbol, json.dumps(data)),
            )
            c.execute("UPDATE stocks SET name = ? WHERE symbol = ?", (data["name"], symbol))
            conn.commit()

        return data

    except Exception as e:
        logger.error(f"Error fetching {symbol}: {e}")
        raise ValueError(f"Could not fetch data for {symbol}: {str(e)}")


def search_stocks(query: str) -> list[dict]:
    """Search for stocks by ticker or company name. Returns [{symbol, name, exchange}]."""
    if not query or len(query) < 1:
        return []
    try:
        search = yf.Search(query)
        results = []
        for quote in getattr(search, "quotes", [])[:10]:
            results.append({
                "symbol": quote.get("symbol", ""),
                "name": quote.get("longname") or quote.get("shortname", ""),
                "exchange": quote.get("exchange", ""),
            })
        return results
    except Exception as e:
        logger.warning(f"Stock search failed for '{query}': {e}")
        # Fallback: try treating the query as a direct symbol
        try:
            ticker = yf.Ticker(query.upper())
            info = ticker.info
            if info.get("symbol"):
                return [{
                    "symbol": info["symbol"],
                    "name": info.get("longName", info.get("shortName", "")),
                    "exchange": info.get("exchange", ""),
                }]
        except Exception:
            pass
        return []
