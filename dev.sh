#!/usr/bin/env bash
# Run backend + frontend in dev mode (hot reload on both sides)
set -e

echo ""
echo "StockPulse — Dev Mode"
echo "  Backend  → http://localhost:5000"
echo "  Frontend → http://localhost:3000"
echo ""

# Load .env
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "✗ ANTHROPIC_API_KEY not set. Run ./start.sh first to configure it."
  exit 1
fi

VENV_DIR="./backend/venv"
if [ ! -d "$VENV_DIR" ]; then
  echo "✗ Virtual env not found. Run ./start.sh first."
  exit 1
fi

# Kill both on Ctrl+C
trap "kill 0" EXIT

# Backend
(
  source "$VENV_DIR/bin/activate"
  cd backend
  FLASK_ENV=development python3 app.py
) &

# Frontend dev server
(
  cd frontend
  npm start
) &

wait
