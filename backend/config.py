import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "stockpulse.db")
FRONTEND_BUILD = os.path.join(BASE_DIR, "..", "frontend", "build")
SETTINGS_PATH = os.path.join(BASE_DIR, "settings.json")

CACHE_TTL_MINUTES = 5
DEFAULT_MODEL = "claude-sonnet-4-20250514"
SCHEDULER_HOUR = 8
SCHEDULER_MINUTE = 0
SCHEDULER_TZ = "Europe/Amsterdam"

# Model pricing per million tokens (input, output)
MODEL_PRICING = {
    "claude-haiku-4-5-20251001": {"input": 1.00, "output": 5.00},
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "claude-opus-4-5": {"input": 15.00, "output": 75.00},
}

# Batch API pricing is 50% of standard
BATCH_DISCOUNT = 0.5
