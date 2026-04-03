import json

from flask import Blueprint, jsonify, request

from db import get_db

bp = Blueprint("statistics", __name__, url_prefix="/api")


@bp.route("/statistics", methods=["GET"])
def get_statistics():
    with get_db() as conn:
        c = conn.cursor()

        # Signal distribution — SQL aggregation instead of loading all rows
        signal_counts = _count_field(c, "signal")
        trend_counts = _count_field(c, "price_trend")
        risk_counts = _count_field(c, "risk_level")
        valuation_counts = _count_field(c, "valuation")

        # Average scores per stock
        avg_confidence = _avg_field_by_stock(c, "confidence")
        avg_fundamental = _avg_field_by_stock(c, "fundamental_score")
        avg_volatility = _avg_field_by_stock(c, "volatility_score")

        # Signal over time (last 90 days)
        c.execute("""
            SELECT
                substr(rr.created_at, 1, 10) as date,
                json_extract(rr.structured_output, '$.signal') as signal,
                COUNT(*) as cnt
            FROM run_results rr
            JOIN runs r ON r.id = rr.run_id
            WHERE r.status = 'completed'
              AND json_extract(rr.structured_output, '$.signal') IS NOT NULL
              AND rr.created_at >= date('now', '-90 days')
            GROUP BY date, signal
            ORDER BY date
        """)
        signal_time_raw = c.fetchall()
        signal_over_time = {}
        for row in signal_time_raw:
            date = row[0]
            if date not in signal_over_time:
                signal_over_time[date] = {"date": date}
            signal_over_time[date][row[1]] = row[2]

        # Run stats
        c.execute("SELECT run_type, COUNT(*) as cnt FROM runs WHERE status='completed' GROUP BY run_type")
        run_counts = {r[0]: r[1] for r in c.fetchall()}

        c.execute("SELECT COUNT(*) FROM run_results")
        total_analyses = c.fetchone()[0]

        # Latest signals per stock
        c.execute("""
            SELECT rr.stock_symbol,
                   json_extract(rr.structured_output, '$.signal') as signal,
                   json_extract(rr.structured_output, '$.confidence') as confidence,
                   substr(rr.created_at, 1, 10) as date
            FROM run_results rr
            JOIN runs r ON r.id = rr.run_id
            WHERE r.status='completed'
              AND rr.prompt_name = 'Daily Market Summary'
              AND json_extract(rr.structured_output, '$.signal') IS NOT NULL
            ORDER BY rr.created_at DESC
        """)
        latest_signals = {}
        for r in c.fetchall():
            sym = r[0]
            if sym not in latest_signals:
                latest_signals[sym] = {"signal": r[1], "confidence": r[2], "date": r[3]}

    return jsonify({
        "signal_distribution": signal_counts,
        "trend_distribution": trend_counts,
        "risk_distribution": risk_counts,
        "valuation_distribution": valuation_counts,
        "avg_confidence_by_stock": avg_confidence,
        "avg_fundamental_by_stock": avg_fundamental,
        "avg_volatility_by_stock": avg_volatility,
        "signal_over_time": sorted(signal_over_time.values(), key=lambda x: x["date"]),
        "run_counts": run_counts,
        "total_analyses": total_analyses,
        "latest_signals": latest_signals,
        "total_stocks_tracked": len(avg_confidence),
    })


@bp.route("/statistics/stock/<symbol>", methods=["GET"])
def get_stock_statistics(symbol):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            SELECT rr.prompt_name, rr.structured_output, rr.stock_data, rr.created_at, r.run_type
            FROM run_results rr
            JOIN runs r ON r.id = rr.run_id
            WHERE r.status='completed' AND rr.stock_symbol = ?
            ORDER BY rr.created_at DESC
            LIMIT 100
        """, (symbol.upper(),))
        rows = c.fetchall()

    history = {}
    for row in rows:
        pname = row[0]
        if pname not in history:
            history[pname] = []
        history[pname].append({
            "output": json.loads(row[1]),
            "date": row[3][:10],
            "run_type": row[4],
        })

    return jsonify({"symbol": symbol, "history": history})


def _count_field(cursor, field: str) -> dict:
    cursor.execute(f"""
        SELECT json_extract(rr.structured_output, '$.{field}') as val, COUNT(*) as cnt
        FROM run_results rr
        JOIN runs r ON r.id = rr.run_id
        WHERE r.status = 'completed'
          AND json_extract(rr.structured_output, '$.{field}') IS NOT NULL
        GROUP BY val
    """)
    return {row[0]: row[1] for row in cursor.fetchall()}


def _avg_field_by_stock(cursor, field: str) -> dict:
    cursor.execute(f"""
        SELECT rr.stock_symbol,
               ROUND(AVG(CAST(json_extract(rr.structured_output, '$.{field}') AS REAL)), 1) as avg_val
        FROM run_results rr
        JOIN runs r ON r.id = rr.run_id
        WHERE r.status = 'completed'
          AND json_extract(rr.structured_output, '$.{field}') IS NOT NULL
        GROUP BY rr.stock_symbol
    """)
    return {row[0]: row[1] for row in cursor.fetchall()}
