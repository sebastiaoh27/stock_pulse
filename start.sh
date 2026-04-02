#!/usr/bin/env bash
set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        StockPulse — AI Analytics         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Check prerequisites ──────────────────────────────
check_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 not found. Please install it first."; exit 1; }
}
check_cmd python3
check_cmd node
check_cmd npm

PYTHON_VER=$(python3 -c "import sys; print(sys.version_info.minor)")
if [ "$PYTHON_VER" -lt 9 ]; then
  echo "✗ Python 3.9+ required (found 3.$PYTHON_VER)"; exit 1
fi

NODE_VER=$(node -e "console.log(process.version.slice(1).split('.')[0])")
if [ "$NODE_VER" -lt 16 ]; then
  echo "✗ Node 16+ required (found $NODE_VER)"; exit 1
fi

echo "✓ Python $(python3 --version)"
echo "✓ Node $(node --version)"
echo ""

# ── API Key ──────────────────────────────────────────
if [ -z "$ANTHROPIC_API_KEY" ]; then
  if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
  fi
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Enter your Anthropic API key (or set ANTHROPIC_API_KEY env var):"
  read -s -p "  sk-ant-... > " API_KEY
  echo ""
  if [ -z "$API_KEY" ]; then
    echo "✗ API key required"; exit 1
  fi
  export ANTHROPIC_API_KEY="$API_KEY"
  echo "ANTHROPIC_API_KEY=$API_KEY" > .env
  echo "✓ API key saved to .env"
fi
echo "✓ Anthropic API key set"
echo ""

# ── Python deps ──────────────────────────────────────
echo "Installing Python dependencies..."
VENV_DIR="./backend/venv"

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
pip install -q --upgrade pip
pip install -q flask flask-cors yfinance anthropic httpx apscheduler pandas numpy

echo "✓ Python dependencies installed"
echo ""

# ── Frontend deps + build ────────────────────────────
echo "Installing frontend dependencies..."
cd frontend
npm install --silent
echo "✓ Node dependencies installed"

echo "Building React frontend..."
npm run build --silent
echo "✓ Frontend built"
cd ..

# ── Launch ───────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Starting StockPulse on :5000            ║"
echo "║  Open http://localhost:5000              ║"
echo "║                                          ║"
echo "║  If runs fail with 'Connection error':   ║"
echo "║  GET /api/health/anthropic to diagnose   ║"
echo "║  Or add HTTPS_PROXY=... to .env          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

source "$VENV_DIR/bin/activate"
cd backend
python3 app.py
