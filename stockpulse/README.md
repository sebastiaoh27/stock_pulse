# StockPulse — AI Stock Analytics

A full-stack app that tracks stocks, runs AI-powered analyses using Claude, and stores structured results for statistical review.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Recharts |
| Backend | Python 3 + Flask |
| Database | SQLite (auto-created) |
| Stock Data | Yahoo Finance (yfinance) |
| AI Analysis | Anthropic Claude (claude-sonnet-4-20250514) |
| Scheduler | APScheduler (daily 08:00 Amsterdam time) |

---

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 16+
- An [Anthropic API key](https://console.anthropic.com/)

### macOS / Linux

```bash
git clone <repo> stockpulse
cd stockpulse
chmod +x start.sh
./start.sh
```

The script will:
1. Ask for your Anthropic API key (saved to `.env`)
2. Create a Python virtualenv and install dependencies
3. Build the React frontend
4. Start the server at **http://localhost:5000**

### Windows

```
start.bat
```

---

## Features

### Dashboard
- Live price strip with 30-day sparklines for all tracked stocks
- Latest AI analysis results displayed in a table per prompt
- Switch between prompt views with tabs
- Confidence bars, signal badges, trend indicators

### Watchlist
- Add any stock by ticker symbol (AAPL, ASML, NVDA, etc.)
- Live price data including P/E, market cap, 52-week range, volume ratio
- Quick-add buttons for popular stocks
- Per-stock refresh

### Prompts
Three built-in prompts (all customizable):

1. **Daily Market Summary** — Signal (BUY/HOLD/SELL/WATCH), confidence, trend, momentum, risk
2. **Fundamental Health Check** — Valuation, P/E assessment, growth outlook, dividend quality
3. **Technical Volatility Analysis** — Volatility level/score, 52-week position, trend strength

Create your own prompts with:
- Custom prompt text (instructions to Claude)
- JSON Schema for structured output (define exactly what fields you want)
- Enable/disable without deleting

### Run History
- Every run (manual or scheduled) is stored
- Drill into any run to see per-stock, per-prompt structured outputs
- Side-by-side JSON viewer of AI output vs. stock data at time of run

### Analytics
- Signal distribution (donut charts)
- Price trend, risk, and valuation distributions
- Signal timeline over multiple days
- Average confidence/fundamental/volatility scores per stock
- Latest signals summary table

### Scheduled Runs
- Automatic daily analysis at 08:00 Amsterdam time (Europe/Amsterdam)
- Results stored alongside manual runs, tagged as `scheduled`

---

## Prompt & Schema Guide

When creating a custom prompt, the **Output Schema** defines what JSON Claude should return for each stock. Example:

```json
{
  "type": "object",
  "properties": {
    "signal": {
      "type": "string",
      "enum": ["BUY", "HOLD", "SELL"],
      "description": "Trading signal"
    },
    "score": {
      "type": "number",
      "description": "Overall score 0-100"
    },
    "rationale": {
      "type": "string",
      "description": "One sentence rationale"
    }
  },
  "required": ["signal", "score", "rationale"]
}
```

**Tips:**
- Use `enum` for categorical values — they render as colored badges
- Use `number` for 0-100 scores — they render as progress bars
- Use `string` for free-text fields — they render as compact text
- All `required` fields are always present in stored results

---

## Dev Mode (hot reload)

```bash
chmod +x dev.sh
./dev.sh
```

Runs Flask on :5000 and React dev server on :3000 simultaneously.

---

## File Structure

```
stockpulse/
├── backend/
│   ├── app.py          # Flask API + scheduler + DB
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── App.css
│   │   └── components/
│   │       ├── Dashboard.js
│   │       ├── Stocks.js
│   │       ├── Prompts.js
│   │       ├── History.js
│   │       └── Statistics.js
│   ├── public/index.html
│   └── package.json
├── start.sh            # macOS/Linux one-click start
├── start.bat           # Windows one-click start
├── dev.sh              # Dev mode with hot reload
└── README.md
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stocks` | List tracked stocks |
| POST | `/api/stocks` | Add stock `{symbol}` |
| DELETE | `/api/stocks/:symbol` | Remove stock |
| GET | `/api/stocks/:symbol/data` | Fetch live Yahoo Finance data |
| GET | `/api/prompts` | List prompts |
| POST | `/api/prompts` | Create prompt |
| PUT | `/api/prompts/:id` | Update prompt |
| DELETE | `/api/prompts/:id` | Delete prompt |
| POST | `/api/runs` | Trigger manual run |
| GET | `/api/runs` | List all runs |
| GET | `/api/runs/:id` | Run details + results |
| GET | `/api/runs/latest` | Latest completed run |
| GET | `/api/statistics` | Aggregate statistics |
| GET | `/api/statistics/stock/:symbol` | Per-stock history |

---

## Notes

- Stock data is cached for 5 minutes to avoid rate limits
- The SQLite database (`stockpulse.db`) is created automatically in `backend/`
- All AI results are stored permanently — the database will grow over time
- If Claude returns invalid JSON, the run continues with other stocks/prompts and logs the error
