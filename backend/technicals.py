"""Pure-math technical indicators — zero LLM cost."""

import math


def week52_position(price: float, low: float, high: float) -> float | None:
    """Position within 52-week range as 0-100 percentage."""
    if price is None or low is None or high is None:
        return None
    spread = high - low
    if spread <= 0:
        return 50.0
    return round(((price - low) / spread) * 100, 1)


def week52_label(position: float | None) -> str:
    if position is None:
        return "UNKNOWN"
    if position < 15:
        return "NEAR_LOW"
    if position < 40:
        return "LOWER_HALF"
    if position < 60:
        return "MIDDLE"
    if position < 85:
        return "UPPER_HALF"
    return "NEAR_HIGH"


def volume_ratio(volume: int | None, avg_volume: int | None) -> float | None:
    if not volume or not avg_volume:
        return None
    return round(volume / avg_volume, 2)


def price_momentum(closes: list[float]) -> float | None:
    """Momentum as slope of linear regression over recent closes, scaled to -100..100."""
    if not closes or len(closes) < 3:
        return None
    n = len(closes)
    x_mean = (n - 1) / 2.0
    y_mean = sum(closes) / n
    num = sum((i - x_mean) * (c - y_mean) for i, c in enumerate(closes))
    den = sum((i - x_mean) ** 2 for i in range(n))
    if den == 0:
        return 0.0
    slope = num / den
    # Normalize: slope as daily % change, scale to -100..100
    pct_slope = (slope / y_mean) * 100 if y_mean else 0
    return round(max(-100, min(100, pct_slope * 10)), 1)


def trend_direction(fifty_day_avg: float | None, two_hundred_day_avg: float | None) -> str:
    """Golden/death cross simplified."""
    if fifty_day_avg is None or two_hundred_day_avg is None:
        return "NEUTRAL"
    if fifty_day_avg > two_hundred_day_avg * 1.02:
        return "BULLISH"
    if fifty_day_avg < two_hundred_day_avg * 0.98:
        return "BEARISH"
    return "NEUTRAL"


def annualized_volatility(daily_returns: list[float]) -> float | None:
    """Annualized volatility from daily returns (std dev * sqrt(252))."""
    if not daily_returns or len(daily_returns) < 5:
        return None
    n = len(daily_returns)
    mean = sum(daily_returns) / n
    variance = sum((r - mean) ** 2 for r in daily_returns) / (n - 1)
    return round(math.sqrt(variance) * math.sqrt(252) * 100, 1)


def volatility_label(vol: float | None) -> str:
    if vol is None:
        return "MODERATE"
    if vol < 10:
        return "VERY_LOW"
    if vol < 20:
        return "LOW"
    if vol < 35:
        return "MODERATE"
    if vol < 55:
        return "HIGH"
    return "EXTREME"


def compute_technicals(stock_data: dict) -> dict:
    """Compute all technical indicators from stock data. No LLM needed."""
    price = stock_data.get("current_price")
    low52 = stock_data.get("week52_low")
    high52 = stock_data.get("week52_high")
    vol = stock_data.get("volume")
    avg_vol = stock_data.get("avg_volume")
    fifty_ma = stock_data.get("fifty_day_avg")
    two_hundred_ma = stock_data.get("two_hundred_day_avg")
    price_changes = stock_data.get("price_changes_30d", [])

    pos = week52_position(price, low52, high52)

    # Convert percentage changes to decimal returns for volatility calc
    daily_returns = [p / 100 for p in price_changes] if price_changes else []

    return {
        "week52_position_pct": pos,
        "week52_label": week52_label(pos),
        "volume_ratio": volume_ratio(vol, avg_vol),
        "momentum_score": price_momentum(
            # Reconstruct approximate closes from price changes
            _reconstruct_closes(price, price_changes)
        ),
        "trend_direction": trend_direction(fifty_ma, two_hundred_ma),
        "annualized_volatility": annualized_volatility(daily_returns),
        "volatility_label": volatility_label(annualized_volatility(daily_returns)),
    }


def _reconstruct_closes(current_price: float | None, pct_changes: list[float]) -> list[float]:
    """Reconstruct approximate close prices from current price + daily pct changes."""
    if not current_price or not pct_changes:
        return []
    closes = [current_price]
    price = current_price
    for pct in reversed(pct_changes):
        price = price / (1 + pct / 100)
        closes.insert(0, price)
    return closes
