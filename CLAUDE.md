# CLAUDE.md - StockPulse

## What This Is

Full-stack stock analytics app: track stocks via Yahoo Finance, run AI analysis
(Claude) with user-defined prompts + JSON schemas, store structured results,
visualize trends. Optimized for token efficiency via batch API, pre-computed
technicals, and prompt caching.

## Stack

- **Backend:** Python 3 / Flask / SQLite / yfinance / Anthropic SDK / APScheduler / Pydantic v2
- **Frontend:** React 18 / Recharts
- **AI:** Claude via Anthropic API — sync mode (manual runs) + batch mode (scheduled, 50% savings)
- **DB:** SQLite at `backend/stockpulse.db` (auto-created, WAL mode)

## File Layout

```
backend/
  app.py              # App factory (~35 lines)
  config.py           # Constants, model pricing, env vars
  db.py               # Context-managed connections, init, migrations
  models.py           # Pydantic v2 input validation
  yahoo.py            # Yahoo Finance fetch + stock search
  technicals.py       # Pure-math indicators (zero LLM cost)
  ai.py               # AnthropicService singleton (sync + batch + caching)
  run_engine.py       # Run execution, progress tracking, cancel
  scheduler.py        # APScheduler with error handling
  routes/
    __init__.py       # Blueprint registration
    health.py         # /api/health
    stocks.py         # CRUD + search
    prompts.py        # CRUD with validation
    runs.py           # Trigger, cancel, estimate, retroactive
    statistics.py     # SQL-aggregated stats
    settings.py       # Model selection persistence
    suggestions.py    # AI prompt improvement advisor
  app.py.bak          # Original monolith (backup)
frontend/
  src/components/     # Dashboard, Stocks, Prompts, History, Statistics, Suggestions
```

## Key Patterns

- **DB connections:** Always `with get_db() as conn:` — never bare connections
- **Input validation:** Pydantic models in `models.py` for all POST/PUT payloads
- **AI singleton:** `AnthropicService()` reuses one httpx.Client for the process
- **Token savings:** Pre-compute technicals in Python, use prompt caching, batch API for non-urgent runs
- **Progress tracking:** In-memory `_active_runs` dict merged into `/api/runs` response
- **Run guard:** Only one run at a time (threading.Lock)

## Cost Optimization

1. **technicals.py** — 52W position, momentum, volatility, MA crossover computed WITHOUT LLM
2. **Batch API** — Scheduled/retroactive runs use `messages.batches` (50% cheaper)
3. **Prompt caching** — `cache_control: ephemeral` on system message for intra-batch hits
4. **NotebookLM pipeline** — Research via Yahoo Finance URLs → NotebookLM summarize → Obsidian store → inject as pre-computed context

## Development

```bash
./dev.sh          # Flask :5000 + React :3000 hot reload
./start.sh        # Production build
```

## Rules

1. **Never commit `.env`** — contains API key
2. **Preserve API contract** — see `.claude/rules/api-contract.md`
3. **Use context managers for DB** — see `.claude/rules/backend-architecture.md`
4. **No circular imports** — follow the dependency graph in architecture rules
5. **LLM for interpretation only** — compute math/indicators locally first
6. **Track costs** — every AI call must return and store token usage + cost

## Token Efficiency (for Claude Code working on this codebase)

- Modules are small and focused — read only what you're modifying
- `app.py` is just wiring — rarely needs reading
- `config.py` has all constants — check there before searching
- `.claude/rules/` has the full API contract and architecture — use instead of reading frontend
