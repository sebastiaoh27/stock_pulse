# Backend Architecture Rules

## Module Responsibilities

| Module | Responsibility | Imports from |
|--------|---------------|-------------|
| `config.py` | Constants, env vars, pricing | nothing |
| `db.py` | DB connections, init, migrations | config |
| `models.py` | Pydantic input validation | nothing |
| `technicals.py` | Pure-math indicators (NO LLM) | nothing |
| `yahoo.py` | Yahoo Finance fetch + search | config, db |
| `ai.py` | Anthropic client (singleton) | config |
| `run_engine.py` | Run execution, progress, cancel | ai, config, db, technicals, yahoo |
| `scheduler.py` | APScheduler setup | config, run_engine |
| `routes/*` | Flask blueprints (HTTP layer) | db, models, yahoo, ai, run_engine |
| `app.py` | App factory (wiring only) | config, db, routes, scheduler |

## Import Rules (no circular deps)

- `routes/` never imports from `scheduler.py`
- `run_engine.py` never imports from `routes/`
- `ai.py` never imports from `db.py` or `yahoo.py`
- `config.py` and `models.py` import from nothing

## DB Connection Pattern

Always use context manager. Never use bare `get_db()`:

```python
# CORRECT
with get_db() as conn:
    c = conn.cursor()
    c.execute(...)
    conn.commit()

# WRONG - connection leak risk
conn = get_db()
c = conn.cursor()
```

## LLM Usage Rules

- Compute what you can without an LLM (use `technicals.py`)
- Use prompt caching (`cache_control`) for shared system prompts
- Use batch API for non-urgent runs (scheduled, retroactive)
- Track token usage and cost on every API call
