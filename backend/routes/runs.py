import json
import threading
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from config import DEFAULT_MODEL, MODEL_PRICING
from db import get_db
from models import RunRequest, EstimateRequest, RetroactiveRequest
from run_engine import execute_run, cancel_run, get_all_active_runs

bp = Blueprint("runs", __name__, url_prefix="/api")


@bp.route("/runs", methods=["GET"])
def get_runs():
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM runs ORDER BY started_at DESC LIMIT 50")
        runs = [dict(r) for r in c.fetchall()]

    # Merge live progress for active runs
    active = get_all_active_runs()
    for run in runs:
        info = active.get(run["id"])
        if info:
            run["progress_percent"] = info.get("progress_percent", run.get("progress_percent", 0))

    return jsonify(runs)


@bp.route("/runs/latest", methods=["GET"])
def get_latest_run():
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM runs WHERE status='completed' ORDER BY completed_at DESC LIMIT 1")
        row = c.fetchone()
        if not row:
            return jsonify(None)
        run = dict(row)
        c.execute("SELECT * FROM run_results WHERE run_id=? ORDER BY stock_symbol", (run["id"],))
        results = []
        for r in c.fetchall():
            row2 = dict(r)
            row2["stock_data"] = json.loads(row2["stock_data"])
            row2["structured_output"] = json.loads(row2["structured_output"])
            results.append(row2)
    return jsonify({"run": run, "results": results})


@bp.route("/runs/estimate", methods=["POST"])
def estimate_run():
    data = request.json or {}
    try:
        req = EstimateRequest(**data)
    except ValidationError as e:
        return jsonify({"error": e.errors()[0]["msg"]}), 400

    # Look at historical averages
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT AVG(input_tokens), AVG(output_tokens) FROM run_results WHERE input_tokens > 0"
        )
        row = c.fetchone()

    avg_in = row[0] or 800  # fallback estimate
    avg_out = row[1] or 300
    total_calls = req.stock_count * req.prompt_count
    total_tokens = int((avg_in + avg_out) * total_calls)

    pricing = MODEL_PRICING.get(req.model, MODEL_PRICING[DEFAULT_MODEL])
    cost = round((avg_in * pricing["input"] + avg_out * pricing["output"]) / 1_000_000 * total_calls, 4)

    confidence = "high" if row[0] else "estimate (no historical data)"

    return jsonify({
        "estimated_cost": cost,
        "estimated_tokens": total_tokens,
        "estimated_seconds": int(total_calls * 3),  # ~3s per API call
        "confidence": confidence,
        "based_on": f"avg {int(avg_in)}+{int(avg_out)} tokens/call",
    })


@bp.route("/runs/retroactive", methods=["POST"])
def retroactive_run():
    data = request.json or {}
    try:
        req = RetroactiveRequest(**data)
    except ValidationError as e:
        return jsonify({"error": e.errors()[0]["msg"]}), 400

    from_dt = datetime.strptime(req.from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(req.to_date, "%Y-%m-%d")

    # Count trading days (weekdays), cap at 30
    days = 0
    cur = from_dt
    while cur <= to_dt and days < 30:
        if cur.weekday() < 5:
            days += 1
        cur += timedelta(days=1)

    if days == 0:
        return jsonify({"error": "No trading days in range"}), 400

    # Estimate cost
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM stocks")
        stock_count = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM prompts WHERE active=1")
        prompt_count = c.fetchone()[0]

    calls_per_day = stock_count * prompt_count
    pricing = MODEL_PRICING.get(req.model, MODEL_PRICING[DEFAULT_MODEL])
    est_cost = round(calls_per_day * days * (800 * pricing["input"] + 300 * pricing["output"]) / 1_000_000, 4)

    def run_retroactive():
        for _ in range(days):
            try:
                execute_run("retroactive", model=req.model, use_batch=True)
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Retroactive run failed: {e}")

    thread = threading.Thread(target=run_retroactive, daemon=True)
    thread.start()

    return jsonify({
        "days": days,
        "total_estimated_cost": est_cost,
        "status": "queued",
    })


@bp.route("/runs", methods=["POST"])
def trigger_run():
    data = request.json or {}
    try:
        req = RunRequest(**data)
    except ValidationError as e:
        return jsonify({"error": e.errors()[0]["msg"]}), 400

    def run_async():
        try:
            execute_run("manual", req.stocks, req.prompts, model=req.model, use_batch=req.batch)
        except RuntimeError as e:
            import logging
            logging.getLogger(__name__).warning(f"Run blocked: {e}")

    thread = threading.Thread(target=run_async, daemon=True)
    thread.start()
    return jsonify({"status": "started", "message": "Run started in background"})


@bp.route("/runs/<int:run_id>", methods=["GET"])
def get_run(run_id):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM runs WHERE id=?", (run_id,))
        row = c.fetchone()
        if not row:
            return jsonify({"error": "Run not found"}), 404
        run = dict(row)
        c.execute("SELECT * FROM run_results WHERE run_id=? ORDER BY stock_symbol", (run_id,))
        results = []
        for r in c.fetchall():
            row2 = dict(r)
            row2["stock_data"] = json.loads(row2["stock_data"])
            row2["structured_output"] = json.loads(row2["structured_output"])
            results.append(row2)
    return jsonify({"run": run, "results": results})


@bp.route("/runs/<int:run_id>/cancel", methods=["POST"])
def cancel(run_id):
    if cancel_run(run_id):
        return jsonify({"cancelled": True})
    return jsonify({"error": "Run not found or not active"}), 404
