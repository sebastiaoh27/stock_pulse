import os
import json
import sqlite3
import threading
import time
import logging
import httpx
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import yfinance as yf
import anthropic
from apscheduler.schedulers.background import BackgroundScheduler
import pandas as pd
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "stockpulse.db")
FRONTEND_BUILD = os.path.join(BASE_DIR, "..", "frontend", "build")

app = Flask(__name__, static_folder=FRONTEND_BUILD, static_url_path="")
CORS(app)

# ─── Database ────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS stocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT UNIQUE NOT NULL,
            name TEXT,
            added_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            prompt_text TEXT NOT NULL,
            output_schema TEXT NOT NULL,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_type TEXT NOT NULL,
            started_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT,
            status TEXT DEFAULT 'running',
            stocks_processed INTEGER DEFAULT 0,
            error_message TEXT
        );

        CREATE TABLE IF NOT EXISTS run_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            stock_symbol TEXT NOT NULL,
            prompt_id INTEGER NOT NULL,
            prompt_name TEXT NOT NULL,
            stock_data TEXT NOT NULL,
            structured_output TEXT NOT NULL,
            raw_response TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (run_id) REFERENCES runs(id),
            FOREIGN KEY (prompt_id) REFERENCES prompts(id)
        );

        CREATE TABLE IF NOT EXISTS stock_cache (
            symbol TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            fetched_at TEXT DEFAULT (datetime('now'))
        );
    """)
    conn.commit()

    # Insert default prompts if empty
    c.execute("SELECT COUNT(*) FROM prompts")
    if c.fetchone()[0] == 0:
        default_prompts = [
            (
                "Daily Market Summary",
                "Quick snapshot of stock health and sentiment",
                """Analyze the provided stock data and return a structured assessment. 
                Focus on: current price momentum, volume trends, and a brief trading signal.
                Be concise and data-driven.""",
                json.dumps({
                    "type": "object",
                    "properties": {
                        "signal": {"type": "string", "enum": ["BUY", "HOLD", "SELL", "WATCH"], "description": "Trading signal"},
                        "confidence": {"type": "number", "description": "Confidence 0-100"},
                        "price_trend": {"type": "string", "enum": ["BULLISH", "BEARISH", "NEUTRAL"], "description": "Price trend"},
                        "momentum_score": {"type": "number", "description": "Momentum score -100 to 100"},
                        "key_insight": {"type": "string", "description": "One key insight in 1-2 sentences"},
                        "risk_level": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH"], "description": "Risk level"}
                    },
                    "required": ["signal", "confidence", "price_trend", "momentum_score", "key_insight", "risk_level"]
                })
            ),
            (
                "Fundamental Health Check",
                "Evaluate P/E, market cap, and fundamental metrics",
                """Analyze the fundamental health of this stock based on the provided data.
                Evaluate valuation metrics, company size, and overall fundamental strength.
                Return structured output with specific scores.""",
                json.dumps({
                    "type": "object",
                    "properties": {
                        "valuation": {"type": "string", "enum": ["UNDERVALUED", "FAIR", "OVERVALUED"], "description": "Valuation assessment"},
                        "fundamental_score": {"type": "number", "description": "Overall fundamental score 0-100"},
                        "pe_assessment": {"type": "string", "description": "P/E ratio assessment in 1 sentence"},
                        "growth_outlook": {"type": "string", "enum": ["STRONG", "MODERATE", "WEAK", "NEGATIVE"]},
                        "dividend_quality": {"type": "string", "enum": ["EXCELLENT", "GOOD", "FAIR", "NONE"]},
                        "summary": {"type": "string", "description": "2-3 sentence fundamental summary"}
                    },
                    "required": ["valuation", "fundamental_score", "pe_assessment", "growth_outlook", "dividend_quality", "summary"]
                })
            ),
            (
                "Technical Volatility Analysis",
                "Analyze price volatility and technical indicators",
                """Perform a technical volatility analysis on this stock.
                Look at 52-week range position, recent price change, and beta to assess volatility profile.
                Return structured analysis.""",
                json.dumps({
                    "type": "object",
                    "properties": {
                        "volatility_level": {"type": "string", "enum": ["VERY_LOW", "LOW", "MODERATE", "HIGH", "EXTREME"]},
                        "volatility_score": {"type": "number", "description": "Volatility score 0-100"},
                        "week52_position": {"type": "string", "enum": ["NEAR_LOW", "LOWER_HALF", "MIDDLE", "UPPER_HALF", "NEAR_HIGH"]},
                        "trend_strength": {"type": "number", "description": "Trend strength 0-100"},
                        "entry_risk": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]},
                        "technical_notes": {"type": "string", "description": "Key technical observation in 1-2 sentences"}
                    },
                    "required": ["volatility_level", "volatility_score", "week52_position", "trend_strength", "entry_risk", "technical_notes"]
                })
            )
        ]
        c.executemany(
            "INSERT INTO prompts (name, description, prompt_text, output_schema) VALUES (?, ?, ?, ?)",
            default_prompts
        )
        conn.commit()

    conn.close()
    logger.info("Database initialized")

# ─── Yahoo Finance ─────────────────────────────────────────────────────────────

def fetch_stock_data(symbol: str) -> dict:
    """Fetch stock data from Yahoo Finance with caching (5min cache)."""
    conn = get_db()
    c = conn.cursor()

    # Check cache
    c.execute("SELECT data, fetched_at FROM stock_cache WHERE symbol = ?", (symbol,))
    row = c.fetchone()
    if row:
        fetched_at = datetime.fromisoformat(row["fetched_at"])
        if datetime.now() - fetched_at < timedelta(minutes=5):
            conn.close()
            return json.loads(row["data"])

    # Fetch fresh data
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        hist = ticker.history(period="1mo")

        price_changes = []
        if not hist.empty and len(hist) > 1:
            closes = hist["Close"].tolist()
            price_changes = [round(((closes[i] - closes[i-1]) / closes[i-1]) * 100, 2) for i in range(1, len(closes))]

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
            "fetched_at": datetime.now().isoformat()
        }

        # Update cache
        c.execute(
            "INSERT OR REPLACE INTO stock_cache (symbol, data, fetched_at) VALUES (?, ?, datetime('now'))",
            (symbol, json.dumps(data))
        )
        # Update stock name if changed
        c.execute("UPDATE stocks SET name = ? WHERE symbol = ?", (data["name"], symbol))
        conn.commit()
        conn.close()
        return data

    except Exception as e:
        conn.close()
        logger.error(f"Error fetching {symbol}: {e}")
        raise ValueError(f"Could not fetch data for {symbol}: {str(e)}")

# ─── Claude AI Analysis ───────────────────────────────────────────────────────

def _make_anthropic_client() -> anthropic.Anthropic:
    """Build Anthropic client with optional HTTP proxy and explicit timeout."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is not set")

    # Support HTTP(S) proxy via env vars — useful if the machine sits behind a
    # corporate proxy.  Set HTTPS_PROXY=http://proxy.company.com:8080 in .env
    proxy_url = (
        os.environ.get("ANTHROPIC_PROXY")
        or os.environ.get("HTTPS_PROXY")
        or os.environ.get("https_proxy")
        or os.environ.get("HTTP_PROXY")
        or os.environ.get("http_proxy")
    )

    timeout = httpx.Timeout(
        connect=10.0,   # seconds to establish connection
        read=60.0,      # seconds to wait for a response chunk
        write=10.0,
        pool=5.0,
    )

    if proxy_url:
        logger.info(f"Using proxy for Anthropic: {proxy_url}")
        http_client = httpx.Client(proxy=proxy_url, timeout=timeout)
    else:
        http_client = httpx.Client(timeout=timeout)

    return anthropic.Anthropic(api_key=api_key, http_client=http_client)


def check_anthropic_connectivity() -> dict:
    """Quick connectivity check — returns {ok, error, proxy}."""
    try:
        client = _make_anthropic_client()
        # Cheapest possible call: 1-token response
        client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=5,
            messages=[{"role": "user", "content": "hi"}],
        )
        proxy = (os.environ.get("ANTHROPIC_PROXY")
                 or os.environ.get("HTTPS_PROXY")
                 or os.environ.get("https_proxy"))
        return {"ok": True, "proxy": proxy or None}
    except anthropic.APIConnectionError as e:
        return {"ok": False, "error": f"Connection error: {e}",
                "hint": "Cannot reach api.anthropic.com. Check your internet connection or set HTTPS_PROXY in .env"}
    except anthropic.AuthenticationError:
        return {"ok": False, "error": "Invalid API key",
                "hint": "Check ANTHROPIC_API_KEY in .env — it should start with sk-ant-"}
    except Exception as e:
        return {"ok": False, "error": str(e), "hint": "Unexpected error"}


def run_ai_analysis(stock_data: dict, prompt_text: str, output_schema: dict) -> tuple[dict, str]:
    """Run Claude analysis on stock data."""
    client = _make_anthropic_client()

    schema_str = json.dumps(output_schema, indent=2)
    stock_str = json.dumps({k: v for k, v in stock_data.items() if k != "price_changes_30d"}, indent=2)

    system_prompt = f"""You are a professional stock analyst. You will analyze stock data and return ONLY valid JSON matching this exact schema:

{schema_str}

Rules:
- Return ONLY the JSON object, no markdown, no explanation
- All required fields must be present
- Use the exact field names and types from the schema
- Be precise and data-driven"""

    user_message = f"""Analyze this stock and return structured JSON:

{stock_str}

Additional context:
{prompt_text}"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}]
        )
    except anthropic.APIConnectionError as e:
        raise ConnectionError(
            f"Cannot reach Anthropic API. "
            f"Check your internet connection or set HTTPS_PROXY in .env. "
            f"Details: {e}"
        )
    except anthropic.AuthenticationError:
        raise ValueError("Anthropic API key is invalid. Check ANTHROPIC_API_KEY in .env")
    except anthropic.RateLimitError:
        raise ValueError("Anthropic rate limit hit — wait a minute and retry")

    raw_text = response.content[0].text.strip()

    # Parse JSON — handle markdown fences
    try:
        clean = raw_text
        if "```" in clean:
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        result = json.loads(clean.strip())
        return result, raw_text
    except json.JSONDecodeError:
        raise ValueError(f"AI returned invalid JSON: {raw_text[:200]}")

# ─── Run Execution ────────────────────────────────────────────────────────────

def execute_run(run_type: str = "manual", specific_stocks: list = None, specific_prompts: list = None):
    """Execute a full analysis run."""
    conn = get_db()
    c = conn.cursor()

    # Create run record
    c.execute("INSERT INTO runs (run_type, status) VALUES (?, 'running')", (run_type,))
    run_id = c.lastrowid
    conn.commit()

    try:
        # Get stocks
        if specific_stocks:
            placeholders = ",".join("?" * len(specific_stocks))
            c.execute(f"SELECT * FROM stocks WHERE symbol IN ({placeholders})", specific_stocks)
        else:
            c.execute("SELECT * FROM stocks")
        stocks = [dict(r) for r in c.fetchall()]

        # Get prompts
        if specific_prompts:
            placeholders = ",".join("?" * len(specific_prompts))
            c.execute(f"SELECT * FROM prompts WHERE id IN ({placeholders}) AND active=1", specific_prompts)
        else:
            c.execute("SELECT * FROM prompts WHERE active=1")
        prompts = [dict(r) for r in c.fetchall()]

        if not stocks or not prompts:
            c.execute("UPDATE runs SET status='completed', completed_at=datetime('now'), stocks_processed=0 WHERE id=?", (run_id,))
            conn.commit()
            conn.close()
            return run_id

        processed = 0
        for stock in stocks:
            try:
                stock_data = fetch_stock_data(stock["symbol"])
                for prompt in prompts:
                    try:
                        schema = json.loads(prompt["output_schema"])
                        result, raw = run_ai_analysis(stock_data, prompt["prompt_text"], schema)
                        c.execute("""
                            INSERT INTO run_results 
                            (run_id, stock_symbol, prompt_id, prompt_name, stock_data, structured_output, raw_response)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (
                            run_id, stock["symbol"], prompt["id"], prompt["name"],
                            json.dumps(stock_data), json.dumps(result), raw
                        ))
                        conn.commit()
                        logger.info(f"✓ {stock['symbol']} / {prompt['name']}")
                    except Exception as e:
                        logger.error(f"✗ {stock['symbol']} / {prompt['name']}: {e}")
                processed += 1
            except Exception as e:
                logger.error(f"✗ {stock['symbol']}: {e}")

        c.execute(
            "UPDATE runs SET status='completed', completed_at=datetime('now'), stocks_processed=? WHERE id=?",
            (processed, run_id)
        )
        conn.commit()

    except Exception as e:
        c.execute(
            "UPDATE runs SET status='failed', completed_at=datetime('now'), error_message=? WHERE id=?",
            (str(e), run_id)
        )
        conn.commit()
        logger.error(f"Run {run_id} failed: {e}")

    conn.close()
    return run_id

# ─── Scheduler ───────────────────────────────────────────────────────────────

scheduler = BackgroundScheduler()

def daily_job():
    logger.info("Running scheduled daily analysis...")
    execute_run("scheduled")

scheduler.add_job(daily_job, "cron", hour=8, minute=0, timezone="Europe/Amsterdam")
scheduler.start()

# ─── API Routes ───────────────────────────────────────────────────────────────

@app.route("/api/stocks", methods=["GET"])
def get_stocks():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM stocks ORDER BY symbol")
    stocks = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify(stocks)

@app.route("/api/stocks", methods=["POST"])
def add_stock():
    data = request.json
    symbol = data.get("symbol", "").upper().strip()
    if not symbol:
        return jsonify({"error": "Symbol required"}), 400
    try:
        stock_data = fetch_stock_data(symbol)
        conn = get_db()
        c = conn.cursor()
        c.execute(
            "INSERT OR IGNORE INTO stocks (symbol, name) VALUES (?, ?)",
            (symbol, stock_data.get("name", symbol))
        )
        conn.commit()
        conn.close()
        return jsonify({"symbol": symbol, "name": stock_data.get("name", symbol), "data": stock_data})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/stocks/<symbol>", methods=["DELETE"])
def delete_stock(symbol):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM stocks WHERE symbol = ?", (symbol.upper(),))
    conn.commit()
    conn.close()
    return jsonify({"deleted": symbol})

@app.route("/api/stocks/<symbol>/data", methods=["GET"])
def get_stock_data(symbol):
    try:
        data = fetch_stock_data(symbol.upper())
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/prompts", methods=["GET"])
def get_prompts():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM prompts ORDER BY created_at")
    prompts = [dict(r) for r in c.fetchall()]
    for p in prompts:
        p["output_schema"] = json.loads(p["output_schema"])
    conn.close()
    return jsonify(prompts)

@app.route("/api/prompts", methods=["POST"])
def create_prompt():
    data = request.json
    required = ["name", "prompt_text", "output_schema"]
    for f in required:
        if f not in data:
            return jsonify({"error": f"{f} required"}), 400
    schema = data["output_schema"]
    if isinstance(schema, dict):
        schema = json.dumps(schema)
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO prompts (name, description, prompt_text, output_schema) VALUES (?, ?, ?, ?)",
        (data["name"], data.get("description", ""), data["prompt_text"], schema)
    )
    conn.commit()
    prompt_id = c.lastrowid
    c.execute("SELECT * FROM prompts WHERE id=?", (prompt_id,))
    result = dict(c.fetchone())
    result["output_schema"] = json.loads(result["output_schema"])
    conn.close()
    return jsonify(result)

@app.route("/api/prompts/<int:pid>", methods=["PUT"])
def update_prompt(pid):
    data = request.json
    conn = get_db()
    c = conn.cursor()
    schema = data.get("output_schema", {})
    if isinstance(schema, dict):
        schema = json.dumps(schema)
    c.execute(
        "UPDATE prompts SET name=?, description=?, prompt_text=?, output_schema=?, active=? WHERE id=?",
        (data["name"], data.get("description", ""), data["prompt_text"], schema, data.get("active", 1), pid)
    )
    conn.commit()
    conn.close()
    return jsonify({"updated": pid})

@app.route("/api/prompts/<int:pid>", methods=["DELETE"])
def delete_prompt(pid):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM prompts WHERE id=?", (pid,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": pid})

@app.route("/api/runs", methods=["POST"])
def trigger_run():
    data = request.json or {}
    stocks = data.get("stocks")
    prompts = data.get("prompts")

    def run_async():
        execute_run("manual", stocks, prompts)

    thread = threading.Thread(target=run_async)
    thread.daemon = True
    thread.start()
    return jsonify({"status": "started", "message": "Run started in background"})

@app.route("/api/runs", methods=["GET"])
def get_runs():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM runs ORDER BY started_at DESC LIMIT 50")
    runs = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify(runs)

@app.route("/api/runs/<int:run_id>", methods=["GET"])
def get_run(run_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM runs WHERE id=?", (run_id,))
    run = dict(c.fetchone() or {})
    c.execute("SELECT * FROM run_results WHERE run_id=? ORDER BY stock_symbol", (run_id,))
    results = []
    for r in c.fetchall():
        row = dict(r)
        row["stock_data"] = json.loads(row["stock_data"])
        row["structured_output"] = json.loads(row["structured_output"])
        results.append(row)
    conn.close()
    return jsonify({"run": run, "results": results})

@app.route("/api/runs/latest", methods=["GET"])
def get_latest_run():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM runs WHERE status='completed' ORDER BY completed_at DESC LIMIT 1")
    row = c.fetchone()
    if not row:
        conn.close()
        return jsonify(None)
    run = dict(row)
    c.execute("SELECT * FROM run_results WHERE run_id=? ORDER BY stock_symbol", (run["id"],))
    results = []
    for r in c.fetchall():
        row2 = dict(r)
        row2["stock_data"] = json.loads(row2["stock_data"])
        row2["structured_output"] = json.loads(row2["structured_output"])
        results.append(row2)
    conn.close()
    return jsonify({"run": run, "results": results})

@app.route("/api/statistics", methods=["GET"])
def get_statistics():
    conn = get_db()
    c = conn.cursor()

    # Get all results with their structured outputs
    c.execute("""
        SELECT rr.stock_symbol, rr.prompt_name, rr.structured_output, rr.created_at, r.run_type
        FROM run_results rr
        JOIN runs r ON r.id = rr.run_id
        WHERE r.status = 'completed'
        ORDER BY rr.created_at
    """)
    rows = [dict(r) for r in c.fetchall()]

    # Signal distribution
    signal_counts = {}
    trend_counts = {}
    risk_counts = {}
    valuation_counts = {}
    confidence_by_stock = {}
    fundamental_scores = {}
    volatility_scores = {}
    signal_over_time = {}

    for row in rows:
        out = json.loads(row["structured_output"])
        sym = row["stock_symbol"]
        date = row["created_at"][:10]

        if "signal" in out:
            s = out["signal"]
            signal_counts[s] = signal_counts.get(s, 0) + 1

        if "price_trend" in out:
            t = out["price_trend"]
            trend_counts[t] = trend_counts.get(t, 0) + 1

        if "risk_level" in out:
            r = out["risk_level"]
            risk_counts[r] = risk_counts.get(r, 0) + 1

        if "valuation" in out:
            v = out["valuation"]
            valuation_counts[v] = valuation_counts.get(v, 0) + 1

        if "confidence" in out:
            if sym not in confidence_by_stock:
                confidence_by_stock[sym] = []
            confidence_by_stock[sym].append(out["confidence"])

        if "fundamental_score" in out:
            if sym not in fundamental_scores:
                fundamental_scores[sym] = []
            fundamental_scores[sym].append(out["fundamental_score"])

        if "volatility_score" in out:
            if sym not in volatility_scores:
                volatility_scores[sym] = []
            volatility_scores[sym].append(out["volatility_score"])

        if "signal" in out:
            if date not in signal_over_time:
                signal_over_time[date] = {}
            d = signal_over_time[date]
            d[out["signal"]] = d.get(out["signal"], 0) + 1

    # Average confidence per stock
    avg_confidence = {sym: round(sum(vals)/len(vals), 1) for sym, vals in confidence_by_stock.items()}
    avg_fundamental = {sym: round(sum(vals)/len(vals), 1) for sym, vals in fundamental_scores.items()}
    avg_volatility = {sym: round(sum(vals)/len(vals), 1) for sym, vals in volatility_scores.items()}

    # Run stats
    c.execute("SELECT COUNT(*), run_type FROM runs WHERE status='completed' GROUP BY run_type")
    run_counts = {r["run_type"]: r["COUNT(*)"] for r in c.fetchall()}

    c.execute("SELECT COUNT(*) as cnt FROM run_results")
    total_analyses = c.fetchone()["cnt"]

    # Recent signals per stock
    c.execute("""
        SELECT rr.stock_symbol, rr.structured_output, rr.created_at
        FROM run_results rr
        JOIN runs r ON r.id = rr.run_id
        WHERE r.status='completed' AND rr.prompt_name = 'Daily Market Summary'
        ORDER BY rr.created_at DESC
    """)
    latest_signals = {}
    for r in c.fetchall():
        sym = r["stock_symbol"]
        if sym not in latest_signals:
            out = json.loads(r["structured_output"])
            latest_signals[sym] = {
                "signal": out.get("signal"),
                "confidence": out.get("confidence"),
                "date": r["created_at"][:10]
            }

    conn.close()
    return jsonify({
        "signal_distribution": signal_counts,
        "trend_distribution": trend_counts,
        "risk_distribution": risk_counts,
        "valuation_distribution": valuation_counts,
        "avg_confidence_by_stock": avg_confidence,
        "avg_fundamental_by_stock": avg_fundamental,
        "avg_volatility_by_stock": avg_volatility,
        "signal_over_time": [{"date": k, **v} for k, v in sorted(signal_over_time.items())],
        "run_counts": run_counts,
        "total_analyses": total_analyses,
        "latest_signals": latest_signals,
        "total_stocks_tracked": len(confidence_by_stock) or 0
    })

@app.route("/api/statistics/stock/<symbol>", methods=["GET"])
def get_stock_statistics(symbol):
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        SELECT rr.prompt_name, rr.structured_output, rr.stock_data, rr.created_at, r.run_type
        FROM run_results rr
        JOIN runs r ON r.id = rr.run_id
        WHERE r.status='completed' AND rr.stock_symbol = ?
        ORDER BY rr.created_at DESC
        LIMIT 100
    """, (symbol.upper(),))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    
    history = {}
    for row in rows:
        pname = row["prompt_name"]
        if pname not in history:
            history[pname] = []
        history[pname].append({
            "output": json.loads(row["structured_output"]),
            "date": row["created_at"][:10],
            "run_type": row["run_type"]
        })

    return jsonify({"symbol": symbol, "history": history})

@app.route("/api/health", methods=["GET"])
def health():
    proxy = (os.environ.get("ANTHROPIC_PROXY")
             or os.environ.get("HTTPS_PROXY")
             or os.environ.get("https_proxy"))
    return jsonify({
        "status": "ok",
        "time": datetime.now().isoformat(),
        "api_key_set": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "proxy": proxy or None,
    })

@app.route("/api/health/anthropic", methods=["GET"])
def health_anthropic():
    """Test Anthropic API reachability. Call this if runs are failing with Connection error."""
    result = check_anthropic_connectivity()
    status_code = 200 if result["ok"] else 503
    return jsonify(result), status_code

# Serve React
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    if path and os.path.exists(os.path.join(FRONTEND_BUILD, path)):
        return send_from_directory(FRONTEND_BUILD, path)
    return send_from_directory(FRONTEND_BUILD, "index.html")

if __name__ == "__main__":
    init_db()
    logger.info("StockPulse backend starting on http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
