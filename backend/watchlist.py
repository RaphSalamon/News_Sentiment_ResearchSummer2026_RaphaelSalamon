"""
watchlist.py

Fetches and scores a user-defined watchlist of stocks.

For each ticker, pulls:
  - Sentiment score (RSS + FinBERT pipeline, same as screener)
  - 10-day historical price trajectory + relative volume per day
    (professor's formula: each day's volume / prior-10-day average volume)
  - Current price, relative volume, market cap tier

Then assigns each stock to one of four quadrants and a 0-100 signal score.

Quadrant logic (X=sentiment, Y=price change):
  Q1 (positive sentiment, positive price): Confirmed Momentum
  Q2 (positive sentiment, negative price): Sentiment Leading -- potential opportunity
  Q3 (negative sentiment, negative price): Confirmed Weakness -- avoid
  Q4 (negative sentiment, positive price): Price Leading     -- caution
"""

import numpy as np
import yfinance as yf

from rss_fetcher import search_ticker
from classifier import classify_sentiment, analyze_headlines
from preprocessor import filter_relevant_headlines


QUADRANTS = {
    "Q1": {
        "name": "Confirmed Momentum",
        "color": "#16A34A",
        "description": "Sentiment and price both positive. Strongest alignment signal.",
    },
    "Q2": {
        "name": "Sentiment Leading",
        "color": "#2563EB",
        "description": "Positive news but price lagging. Potential opportunity.",
    },
    "Q3": {
        "name": "Confirmed Weakness",
        "color": "#DC2626",
        "description": "Both sentiment and price negative. Avoid.",
    },
    "Q4": {
        "name": "Price Leading",
        "color": "#D97706",
        "description": "Price running ahead of news sentiment. Exercise caution.",
    },
}

MARKET_CAP_TIERS = {
    "Mega":  (200e9,  float("inf")),   # $200B+
    "Large": (10e9,   200e9),          # $10B-$200B
    "Mid":   (2e9,    10e9),           # $2B-$10B
    "Small": (300e6,  2e9),            # $300M-$2B
    "Micro": (50e6,   300e6),          # $50M-$300M
    "Nano":  (0,      50e6),           # <$50M
}


def classify_market_cap(market_cap_usd):
    """Returns the tier label for a given market cap in USD."""
    if market_cap_usd is None:
        return "Unknown"
    for tier, (low, high) in MARKET_CAP_TIERS.items():
        if low <= market_cap_usd < high:
            return tier
    return "Unknown"


def get_quadrant_key(sentiment_score, price_change):
    s = float(sentiment_score or 0)
    p = float(price_change or 0)
    if s >= 0 and p >= 0:
        return "Q1"
    if s >= 0 and p < 0:
        return "Q2"
    if s < 0 and p < 0:
        return "Q3"
    return "Q4"


def calculate_signal_score(sentiment_score, price_change, relative_volume):
    """
    0-100 composite signal score.
    Sentiment+price agreement amplified by volume conviction.
    """
    s = max(-1.0, min(1.0, float(sentiment_score or 0)))
    p = max(-1.0, min(1.0, float(price_change or 0) / 15.0))
    v = min(float(relative_volume or 1.0), 2.5) / 2.5

    direction      = s * 0.5 + p * 0.5
    agreement_bonus = s * p * 0.2
    vol_factor     = 0.8 + v * 0.4

    raw = (direction + agreement_bonus) * vol_factor
    score = (raw + 1.44) / 2.88 * 100
    return round(max(0, min(100, score)))


def get_stock_data(ticker, history_days=10):
    """
    Single yfinance call that returns:
      - 10-day historical trail (one point per trading day)
        with cumulative price change vs. start of window
        and relative volume (professor's formula: day_volume / prior_10d_avg_volume)
      - Current price, current relative volume
      - Market cap raw value (for tier classification)

    Returns (history_list, current_price, current_rel_vol, market_cap_raw)
    """
    try:
        stock = yf.Ticker(ticker)

        # Pull 30 days so we have enough history for the rolling 10-day volume average
        hist = stock.history(period="30d")

        if hist.empty or len(hist) < history_days:
            return [], None, None, None

        # Use the last `history_days` trading days as our trail window
        recent = hist.tail(history_days).copy()
        reference_price = float(recent["Close"].iloc[0])

        history_points = []
        for i, (date, row) in enumerate(recent.iterrows()):
            # Rolling 10-day volume average ending the day BEFORE this row
            # (professor's formula: current_vol / avg_vol_of_past_10_days)
            end_idx = hist.index.get_loc(date)
            start_idx = max(0, end_idx - 10)
            prior_10d_avg = float(hist["Volume"].iloc[start_idx:end_idx].mean()) if end_idx > 0 else float(hist["Volume"].mean())

            rel_vol = round(float(row["Volume"]) / prior_10d_avg, 3) if prior_10d_avg > 0 else 1.0

            cumulative_pct = round(
                ((float(row["Close"]) - reference_price) / reference_price) * 100, 2
            ) if reference_price > 0 else 0.0

            history_points.append({
                "day_index": i - (history_days - 1),   # -9 to 0 for 10 days
                "date": str(date.date()),
                "close_price": round(float(row["Close"]), 2),
                "cumulative_price_change_pct": cumulative_pct,
                "relative_volume": rel_vol,
            })

        current = history_points[-1]
        current_price    = current["close_price"]
        current_rel_vol  = current["relative_volume"]

        # Market cap via fast_info (much faster than full .info call)
        market_cap_raw = None
        try:
            market_cap_raw = stock.fast_info.market_cap
        except Exception:
            pass

        return history_points, current_price, current_rel_vol, market_cap_raw

    except Exception as e:
        print(f"Stock data fetch failed for {ticker}: {e}")
        return [], None, None, None


def get_watchlist_data(stocks, history_days=10):
    """
    Main entry point. stocks: list of {"ticker": ..., "company_name": ...}
    Returns list of enriched dicts sorted by signal_score descending.
    Each dict includes a `history` list for the 3D trail visualization.
    """
    results = []

    for stock in stocks:
        ticker       = stock.get("ticker", "").upper().strip()
        company_name = stock.get("company_name", ticker)

        if not ticker:
            continue

        try:
            # 1. Sentiment (RSS + FinBERT)
            headlines = search_ticker(ticker, company_name)
            if headlines:
                headlines = filter_relevant_headlines(headlines)
                sentiment_score = float(analyze_headlines(headlines))
            else:
                sentiment_score = 0.0
            label = classify_sentiment(sentiment_score).strip()

            # 2. Historical price + volume + market cap (single yfinance call)
            history_points, current_price, current_rel_vol, market_cap_raw = \
                get_stock_data(ticker, history_days=history_days)

            # Cumulative 10-day price change = last history point's value
            price_change = history_points[-1]["cumulative_price_change_pct"] if history_points else 0.0
            relative_volume = current_rel_vol or 1.0

            # 3. Market cap tier
            market_cap_tier = classify_market_cap(market_cap_raw)

            # 4. Quadrant + signal score
            quadrant_key  = get_quadrant_key(sentiment_score, price_change)
            quadrant_info = QUADRANTS[quadrant_key]
            signal_score  = calculate_signal_score(sentiment_score, price_change, relative_volume)

            results.append({
                "ticker":               ticker,
                "company_name":         company_name,
                "sentiment_score":      round(sentiment_score, 4),
                "label":                label,
                "current_price":        current_price,
                "price_change_7d":      price_change,       # cumulative 10-day change
                "relative_volume":      relative_volume,
                "market_cap_raw":       market_cap_raw,
                "market_cap_tier":      market_cap_tier,
                "quadrant":             quadrant_key,
                "quadrant_name":        quadrant_info["name"],
                "quadrant_color":       quadrant_info["color"],
                "quadrant_description": quadrant_info["description"],
                "signal_score":         signal_score,
                "history":              history_points,     # 10-day trail for 3D chart
            })

        except Exception as e:
            print(f"Watchlist error for {ticker}: {e}")
            results.append({
                "ticker":       ticker,
                "company_name": company_name,
                "error":        str(e),
            })

    results.sort(key=lambda r: r.get("signal_score", -1), reverse=True)
    return results


if __name__ == "__main__":
    test = [
        {"ticker": "AAPL",  "company_name": "Apple"},
        {"ticker": "TSLA",  "company_name": "Tesla"},
        {"ticker": "GME",   "company_name": "GameStop"},
    ]
    for r in get_watchlist_data(test):
        print(
            f"{r['ticker']:6s}  "
            f"tier={r.get('market_cap_tier','?'):6s}  "
            f"Q={r.get('quadrant','?')}  "
            f"score={r.get('signal_score','?')}  "
            f"history_days={len(r.get('history', []))}"
        )