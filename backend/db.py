import json
import sqlite3
import logging
from contextlib import contextmanager

from config import DB_PATH

logger = logging.getLogger(__name__)


@contextmanager
def get_db():
    """Context-managed DB connection with guaranteed cleanup."""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        yield conn
    finally:
        conn.close()


def _column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cursor.fetchall())


def _migrate(cursor):
    """Add columns the frontend expects but were never created."""
    migrations = [
        ("runs", "model", "TEXT"),
        ("runs", "progress_percent", "INTEGER DEFAULT 0"),
        ("runs", "total_cost", "REAL DEFAULT 0"),
        ("runs", "total_input_tokens", "INTEGER DEFAULT 0"),
        ("runs", "total_output_tokens", "INTEGER DEFAULT 0"),
        ("run_results", "input_tokens", "INTEGER DEFAULT 0"),
        ("run_results", "output_tokens", "INTEGER DEFAULT 0"),
        ("run_results", "cost", "REAL DEFAULT 0"),
    ]
    for table, column, col_type in migrations:
        if not _column_exists(cursor, table, column):
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
            logger.info(f"Migrated: {table}.{column}")


def init_db():
    with get_db() as conn:
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

        _migrate(c)
        conn.commit()

        # Insert default prompts if empty
        c.execute("SELECT COUNT(*) FROM prompts")
        if c.fetchone()[0] == 0:
            _seed_prompts(c)
            conn.commit()

    logger.info("Database initialized")


def _seed_prompts(cursor):
    default_prompts = [
        (
            "Daily Market Summary",
            "Quick snapshot of stock health and sentiment",
            "Analyze the provided stock data and return a structured assessment. "
            "Focus on: current price momentum, volume trends, and a brief trading signal. "
            "Be concise and data-driven.",
            json.dumps({
                "type": "object",
                "properties": {
                    "signal": {"type": "string", "enum": ["BUY", "HOLD", "SELL", "WATCH"]},
                    "confidence": {"type": "number", "description": "Confidence 0-100"},
                    "price_trend": {"type": "string", "enum": ["BULLISH", "BEARISH", "NEUTRAL"]},
                    "momentum_score": {"type": "number", "description": "Momentum score -100 to 100"},
                    "key_insight": {"type": "string", "description": "One key insight in 1-2 sentences"},
                    "risk_level": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH"]},
                },
                "required": ["signal", "confidence", "price_trend", "momentum_score", "key_insight", "risk_level"],
            }),
        ),
        (
            "Fundamental Health Check",
            "Evaluate P/E, market cap, and fundamental metrics",
            "Analyze the fundamental health of this stock based on the provided data. "
            "Evaluate valuation metrics, company size, and overall fundamental strength. "
            "Return structured output with specific scores.",
            json.dumps({
                "type": "object",
                "properties": {
                    "valuation": {"type": "string", "enum": ["UNDERVALUED", "FAIR", "OVERVALUED"]},
                    "fundamental_score": {"type": "number", "description": "Overall score 0-100"},
                    "pe_assessment": {"type": "string", "description": "P/E ratio assessment in 1 sentence"},
                    "growth_outlook": {"type": "string", "enum": ["STRONG", "MODERATE", "WEAK", "NEGATIVE"]},
                    "dividend_quality": {"type": "string", "enum": ["EXCELLENT", "GOOD", "FAIR", "NONE"]},
                    "summary": {"type": "string", "description": "2-3 sentence summary"},
                },
                "required": ["valuation", "fundamental_score", "pe_assessment", "growth_outlook", "dividend_quality", "summary"],
            }),
        ),
        (
            "Technical Volatility Analysis",
            "Analyze price volatility and technical indicators",
            "Perform a technical volatility analysis on this stock. "
            "Look at 52-week range position, recent price change, and beta to assess volatility profile. "
            "Return structured analysis.",
            json.dumps({
                "type": "object",
                "properties": {
                    "volatility_level": {"type": "string", "enum": ["VERY_LOW", "LOW", "MODERATE", "HIGH", "EXTREME"]},
                    "volatility_score": {"type": "number", "description": "Volatility score 0-100"},
                    "week52_position": {"type": "string", "enum": ["NEAR_LOW", "LOWER_HALF", "MIDDLE", "UPPER_HALF", "NEAR_HIGH"]},
                    "trend_strength": {"type": "number", "description": "Trend strength 0-100"},
                    "entry_risk": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]},
                    "technical_notes": {"type": "string", "description": "Key observation in 1-2 sentences"},
                },
                "required": ["volatility_level", "volatility_score", "week52_position", "trend_strength", "entry_risk", "technical_notes"],
            }),
        ),
    ]
    cursor.executemany(
        "INSERT INTO prompts (name, description, prompt_text, output_schema) VALUES (?, ?, ?, ?)",
        default_prompts,
    )
