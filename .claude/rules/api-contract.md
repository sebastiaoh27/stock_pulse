# API Contract

All endpoints are under `/api/`. Frontend expects JSON responses.

## Stocks
- `GET /api/stocks` → `[{id, symbol, name, added_at}]`
- `POST /api/stocks` body: `{symbol}` → `{symbol, name, data}`
- `DELETE /api/stocks/:symbol` → `{deleted}`
- `GET /api/stocks/:symbol/data` → stock data object
- `GET /api/stocks/search?q=` → `[{symbol, name, exchange}]`

## Prompts
- `GET /api/prompts` → `[{id, name, description, prompt_text, output_schema, active}]`
- `POST /api/prompts` body: `{name, prompt_text, output_schema, description?}` → prompt object
- `PUT /api/prompts/:id` body: `{name, prompt_text, output_schema, active?}` → `{updated}`
- `DELETE /api/prompts/:id` → `{deleted}`

## Runs
- `GET /api/runs` → `[{id, run_type, status, started_at, completed_at, stocks_processed, model, progress_percent, total_cost, total_input_tokens, total_output_tokens}]`
- `POST /api/runs` body: `{stocks?, prompts?, model?, batch?}` → `{status, message}`
- `GET /api/runs/latest` → `{run, results}` or `null`
- `GET /api/runs/:id` → `{run, results}`
- `POST /api/runs/:id/cancel` → `{cancelled}` or 404
- `POST /api/runs/estimate` body: `{stock_count, prompt_count, model?}` → `{estimated_cost, estimated_tokens, estimated_seconds, confidence}`
- `POST /api/runs/retroactive` body: `{from_date, to_date, model?}` → `{days, total_estimated_cost, status}`

## Settings
- `GET /api/settings` → `{model}`
- `PUT /api/settings` body: `{model}` → `{model}`

## Suggestions
- `POST /api/suggestions` body: `{model?}` → `{suggestions: [{name, type, target_prompt, description, rationale, prompt_text, output_schema, pros, cons}], cost}`

## Statistics
- `GET /api/statistics` → signal/trend/risk/valuation distributions, averages, timeline
- `GET /api/statistics/stock/:symbol` → per-stock history

## Health
- `GET /api/health` → `{status, time, api_key_set, proxy}`
- `GET /api/health/anthropic` → `{ok, error?, hint?}`

## Run Results Fields
Each run_result includes: `input_tokens`, `output_tokens`, `cost` (float).
Each run includes: `model`, `progress_percent`, `total_cost`, `total_input_tokens`, `total_output_tokens`.
