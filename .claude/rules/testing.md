# Testing & Verification

## Quick Smoke Test

```bash
cd backend
pip install -r requirements.txt
python app.py
```

Server should start on http://localhost:5000 with "Database initialized" log.

## Endpoint Verification

```bash
# Health
curl http://localhost:5000/api/health

# Stocks
curl http://localhost:5000/api/stocks
curl -X POST http://localhost:5000/api/stocks -H 'Content-Type: application/json' -d '{"symbol":"AAPL"}'
curl http://localhost:5000/api/stocks/search?q=apple

# Settings
curl http://localhost:5000/api/settings
curl -X PUT http://localhost:5000/api/settings -H 'Content-Type: application/json' -d '{"model":"claude-haiku-4-5-20251001"}'

# Prompts
curl http://localhost:5000/api/prompts

# Runs
curl -X POST http://localhost:5000/api/runs -H 'Content-Type: application/json' -d '{}'
curl http://localhost:5000/api/runs
```

## Frontend Tabs Checklist

After starting the backend, open `http://localhost:5000` (or `npm start` on :3000 in dev mode):

- [ ] Dashboard — loads stocks, shows latest run
- [ ] Watchlist — search works, add/remove stocks
- [ ] Prompts — CRUD works, schema editor
- [ ] History — shows runs with progress, cancel button, retroactive modal
- [ ] Analytics — charts render from aggregated data
- [ ] AI Advisor — generate suggestions button works

## What to Check After Changes

1. No Python import errors on startup
2. All 15 API endpoints respond (not 404/500)
3. DB migrations run without errors on existing DB
4. Concurrent run guard works (second run returns error)
5. Progress polling updates during active run
