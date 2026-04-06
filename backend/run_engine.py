"""Run execution engine with progress tracking, cancellation, and batch mode."""

import json
import logging
import threading
import time
from datetime import datetime

from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

from ai import AnthropicService
from config import DEFAULT_MODEL, MODEL_PRICING, BATCH_DISCOUNT
from db import get_db
from technicals import compute_technicals
from yahoo import fetch_stock_data

logger = logging.getLogger(__name__)

# In-memory state for active runs
_active_runs: dict[int, dict] = {}
_run_lock = threading.Lock()


def get_active_run_info(run_id: int) -> dict | None:
    return _active_runs.get(run_id)


def get_all_active_runs() -> dict:
    return dict(_active_runs)


def cancel_run(run_id: int) -> bool:
    info = _active_runs.get(run_id)
    if info:
        info["cancelled"] = True
        return True
    return False


def _get_avg_seconds_per_pair() -> float:
    """Get historical average seconds per stock-prompt pair."""
    try:
        with get_db() as conn:
            c = conn.cursor()
            c.execute("""
                SELECT r.id,
                       (julianday(r.completed_at) - julianday(r.started_at)) * 86400 as duration_secs,
                       r.stocks_processed,
                       COUNT(rr.id) as total_results
                FROM runs r
                JOIN run_results rr ON rr.run_id = r.id
                WHERE r.status = 'completed' AND r.stocks_processed > 0
                  AND r.run_type = 'manual'
                GROUP BY r.id
                ORDER BY r.completed_at DESC
                LIMIT 5
            """)
            rows = c.fetchall()
            if not rows:
                return 4.0
            rates = []
            for row in rows:
                dur = row[1] or 0
                n_results = row[3] or 1
                if dur > 0 and n_results > 0:
                    rates.append(dur / n_results)
            return sum(rates) / len(rates) if rates else 4.0
    except Exception:
        return 4.0


def execute_run(
    run_type: str = "manual",
    specific_stocks: list | None = None,
    specific_prompts: list | None = None,
    model: str | None = None,
    use_batch: bool = False,
) -> int:
    """Execute a full analysis run. Returns run_id."""
    model = model or DEFAULT_MODEL

    with _run_lock:
        # Prevent concurrent runs
        if any(info.get("status") == "running" for info in _active_runs.values()):
            raise RuntimeError("A run is already in progress")

    # Create run record
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO runs (run_type, status, model) VALUES (?, 'running', ?)",
            (run_type, model),
        )
        run_id = c.lastrowid
        conn.commit()

    _active_runs[run_id] = {
        "status": "running",
        "cancelled": False,
        "progress_percent": 0,
        "eta_seconds": None,
        "started_at": time.time(),
    }

    try:
        stocks, prompts = _load_stocks_and_prompts(specific_stocks, specific_prompts)
        if not stocks or not prompts:
            _finish_run(run_id, "completed", 0)
            return run_id

        if use_batch:
            _execute_batch(run_id, stocks, prompts, model)
        else:
            _execute_sync(run_id, stocks, prompts, model)

    except Exception as e:
        _finish_run(run_id, "failed", 0, str(e))
        logger.error(f"Run {run_id} failed: {e}")

    return run_id


def _load_stocks_and_prompts(specific_stocks, specific_prompts):
    with get_db() as conn:
        c = conn.cursor()
        if specific_stocks:
            placeholders = ",".join("?" * len(specific_stocks))
            c.execute(f"SELECT * FROM stocks WHERE symbol IN ({placeholders})", specific_stocks)
        else:
            c.execute("SELECT * FROM stocks")
        stocks = [dict(r) for r in c.fetchall()]

        if specific_prompts:
            placeholders = ",".join("?" * len(specific_prompts))
            c.execute(f"SELECT * FROM prompts WHERE id IN ({placeholders}) AND active=1", specific_prompts)
        else:
            c.execute("SELECT * FROM prompts WHERE active=1")
        prompts = [dict(r) for r in c.fetchall()]

    return stocks, prompts


def _execute_sync(run_id: int, stocks: list, prompts: list, model: str):
    """Synchronous execution — one API call at a time."""
    ai = AnthropicService()
    total_pairs = len(stocks) * len(prompts)
    processed_pairs = 0
    processed_stocks = 0
    total_cost = 0.0
    total_in = 0
    total_out = 0

    # Get historical timing for ETA
    avg_secs_per_pair = _get_avg_seconds_per_pair()
    run_start = time.time()

    for stock in stocks:
        if _active_runs.get(run_id, {}).get("cancelled"):
            _finish_run(run_id, "completed", processed_stocks, note="Cancelled by user")
            return

        try:
            stock_data = fetch_stock_data(stock["symbol"])
            tech = compute_technicals(stock_data)
            results_batch = []

            for prompt in prompts:
                if _active_runs.get(run_id, {}).get("cancelled"):
                    break
                try:
                    schema = json.loads(prompt["output_schema"])
                    result, raw, usage = ai.run_analysis(
                        stock_data, prompt["prompt_text"], schema, model=model, technicals=tech,
                    )
                    results_batch.append((
                        run_id, stock["symbol"], prompt["id"], prompt["name"],
                        json.dumps(stock_data), json.dumps(result), raw,
                        usage.get("input_tokens", 0), usage.get("output_tokens", 0),
                        usage.get("cost", 0),
                    ))
                    total_cost += usage.get("cost", 0)
                    total_in += usage.get("input_tokens", 0)
                    total_out += usage.get("output_tokens", 0)
                    logger.info(f"OK {stock['symbol']} / {prompt['name']}")
                except Exception as e:
                    logger.error(f"FAIL {stock['symbol']} / {prompt['name']}: {e}")

                processed_pairs += 1

                # Update progress and ETA
                if run_id in _active_runs:
                    pct = int(processed_pairs / total_pairs * 100)
                    elapsed = time.time() - run_start
                    remaining_pairs = total_pairs - processed_pairs

                    # Use actual elapsed to calibrate ETA
                    if processed_pairs > 0:
                        actual_secs_per_pair = elapsed / processed_pairs
                        # Blend historical and actual
                        blended = (avg_secs_per_pair * 0.3 + actual_secs_per_pair * 0.7)
                        eta = int(blended * remaining_pairs)
                    else:
                        eta = int(avg_secs_per_pair * remaining_pairs)

                    _active_runs[run_id]["progress_percent"] = pct
                    _active_runs[run_id]["eta_seconds"] = eta

            # Batch insert results per stock
            if results_batch:
                with get_db() as conn:
                    conn.executemany(
                        """INSERT INTO run_results
                           (run_id, stock_symbol, prompt_id, prompt_name, stock_data,
                            structured_output, raw_response, input_tokens, output_tokens, cost)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        results_batch,
                    )
                    conn.commit()

            processed_stocks += 1
        except Exception as e:
            logger.error(f"FAIL {stock['symbol']}: {e}")

    _finish_run(run_id, "completed", processed_stocks, cost=total_cost, in_tok=total_in, out_tok=total_out)


def _execute_batch(run_id: int, stocks: list, prompts: list, model: str):
    """Batch execution using Anthropic Message Batches API (50% cost savings)."""
    ai = AnthropicService()

    # Build batch requests
    batch_requests = []
    stock_data_cache = {}
    tech_cache = {}

    for stock in stocks:
        try:
            sd = fetch_stock_data(stock["symbol"])
            stock_data_cache[stock["symbol"]] = sd
            tech_cache[stock["symbol"]] = compute_technicals(sd)
        except Exception as e:
            logger.error(f"FAIL fetching {stock['symbol']}: {e}")
            continue

    for stock in stocks:
        if stock["symbol"] not in stock_data_cache:
            continue
        sd = stock_data_cache[stock["symbol"]]
        tech = tech_cache[stock["symbol"]]
        stock_str = json.dumps({k: v for k, v in sd.items() if k != "price_changes_30d"}, indent=2)

        for prompt in prompts:
            schema = json.loads(prompt["output_schema"])
            schema_str = json.dumps(schema, indent=2)
            tech_str = json.dumps(tech, indent=2)

            custom_id = f"{stock['symbol']}_{prompt['id']}"
            batch_requests.append(
                Request(
                    custom_id=custom_id,
                    params=MessageCreateParamsNonStreaming(
                        model=model,
                        max_tokens=1000,
                        system=[{
                            "type": "text",
                            "text": (
                                f"You are a professional stock analyst. Return ONLY valid JSON "
                                f"matching this schema:\n\n{schema_str}\n\n"
                                "Rules: Return ONLY JSON. All required fields must be present. "
                                "Use exact field names and types. Be data-driven."
                            ),
                            "cache_control": {"type": "ephemeral"},
                        }],
                        messages=[{
                            "role": "user",
                            "content": (
                                f"Analyze this stock:\n\n{stock_str}\n\n"
                                f"Context:\n{prompt['prompt_text']}\n\n"
                                f"Pre-computed technicals:\n{tech_str}"
                            ),
                        }],
                    ),
                )
            )

    if not batch_requests:
        _finish_run(run_id, "completed", 0)
        return

    # Submit batch
    batch_id = ai.submit_batch(batch_requests, model=model)

    if run_id in _active_runs:
        _active_runs[run_id]["batch_id"] = batch_id
        _active_runs[run_id]["progress_percent"] = 10

    # Poll for completion
    status = ai.poll_batch(batch_id, poll_interval=15, max_wait=7200)
    if status != "ended":
        _finish_run(run_id, "failed", 0, f"Batch {batch_id} did not complete: {status}")
        return

    if run_id in _active_runs:
        _active_runs[run_id]["progress_percent"] = 80

    # Process results
    total_cost = 0.0
    total_in = 0
    total_out = 0
    processed_stocks = set()
    prompt_map = {p["id"]: p for p in prompts}

    for result in ai.stream_batch_results(batch_id):
        if result.result.type != "succeeded":
            logger.error(f"Batch item {result.custom_id}: {result.result.type}")
            continue

        parts = result.custom_id.rsplit("_", 1)
        if len(parts) != 2:
            continue
        symbol, prompt_id_str = parts
        prompt_id = int(prompt_id_str)
        prompt = prompt_map.get(prompt_id)
        if not prompt:
            continue

        msg = result.result.message
        if not msg.content:
            continue

        raw_text = msg.content[0].text.strip()
        usage_in = msg.usage.input_tokens
        usage_out = msg.usage.output_tokens
        pricing = MODEL_PRICING.get(model, MODEL_PRICING[DEFAULT_MODEL])
        cost = round(
            (usage_in * pricing["input"] + usage_out * pricing["output"]) / 1_000_000 * BATCH_DISCOUNT,
            6,
        )

        # Parse JSON
        clean = raw_text
        if "```" in clean:
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        try:
            structured = json.loads(clean.strip())
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON from batch for {result.custom_id}: {raw_text[:100]}")
            continue

        sd = stock_data_cache.get(symbol, {})
        with get_db() as conn:
            conn.execute(
                """INSERT INTO run_results
                   (run_id, stock_symbol, prompt_id, prompt_name, stock_data,
                    structured_output, raw_response, input_tokens, output_tokens, cost)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (run_id, symbol, prompt_id, prompt["name"],
                 json.dumps(sd), json.dumps(structured), raw_text,
                 usage_in, usage_out, cost),
            )
            conn.commit()

        total_cost += cost
        total_in += usage_in
        total_out += usage_out
        processed_stocks.add(symbol)

    _finish_run(run_id, "completed", len(processed_stocks), cost=total_cost, in_tok=total_in, out_tok=total_out)


def _finish_run(run_id: int, status: str, stocks_processed: int, error: str | None = None,
                note: str | None = None, cost: float = 0, in_tok: int = 0, out_tok: int = 0):
    with get_db() as conn:
        conn.execute(
            """UPDATE runs SET status=?, completed_at=datetime('now'), stocks_processed=?,
               error_message=?, total_cost=?, total_input_tokens=?, total_output_tokens=?,
               progress_percent=100
               WHERE id=?""",
            (status, stocks_processed, error or note, cost, in_tok, out_tok, run_id),
        )
        conn.commit()

    if run_id in _active_runs:
        _active_runs[run_id]["status"] = status
        _active_runs[run_id]["progress_percent"] = 100
        _active_runs[run_id]["eta_seconds"] = 0
        # Clean up after a delay to let polling catch the final state
        def cleanup():
            import time
            time.sleep(30)
            _active_runs.pop(run_id, None)
        threading.Thread(target=cleanup, daemon=True).start()
