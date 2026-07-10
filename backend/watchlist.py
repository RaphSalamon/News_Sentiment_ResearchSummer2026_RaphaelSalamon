"""
watchlist.py

Fetches and scores a user-defined list of stocks for the watchlist feature.
For each ticker, pulls:
  - Sentiment score (RSS + FinBERT pipeline, same as screener)
  - 7-day price change % (yfinance)
  - Relative volume: current 30-day avg vs prior 30-day avg (yfinance)

Then assigns each stock to one of four quadrants and a 0-100 signal score.

Quadrant logic:
  Q1 (positive sentiment, positive price): Confirmed Momentum
  Q2 (positive sentiment, negative price): Sentiment Leading  -- potential opportunity
  Q3 (negative sentiment, negative price): Confirmed Weakness -- avoid
  Q4 (negative sentiment, positive price): Price Leading      -- caution

Signal score (0-100):
  High score = sentiment and price agree + volume confirms
  Mid score  = divergence between sentiment and price
  Low score  = both negative + high volume (conviction in the bad direction)
"""

import yfinance as yf
import numpy as np
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
        "description": "Positive news but price lagging. Potential opportunity — price may catch up.",
    },
    "Q3": {
        "name": "Confirmed Weakness",
        "color": "#DC2626",
        "description": "Both sentiment and price negative. Avoid until conditions change.",
    },
    "Q4": {
        "name": "Price Leading",
        "color": "#D97706",
        "description": "Price running ahead of news sentiment. Exercise caution.",
    },
}


def get_quadrant_key(sentiment_score, price_change_7d):
    s = float(sentiment_score or 0)
    p = float(price_change_7d or 0)
    if s >= 0 and p >= 0:
        return "Q1"
    if s >= 0 and p < 0:
        return "Q2"
    if s < 0 and p < 0:
        return "Q3"
    return "Q4"  # s < 0, p >= 0


def get_price_volume_data(ticker):
    """
    Pulls 30-day price + volume history from a SINGLE yfinance call and returns:
      - current_price: most recent close
      - price_change_7d: 7-day percentage change
      - relative_volume: last session's volume / 30-day average volume
        (>1 = above average activity, <1 = below average)
    Returns (None, None, None) on failure.
    """
    try:
        hist = yf.Ticker(ticker).history(period="30d")
        if hist.empty or len(hist) < 5:
            return None, None, None

        # Price data
        current_price = round(float(hist["Close"].iloc[-1]), 2)

        # 7-day change -- use last 7 rows (trading days)
        if len(hist) >= 7:
            start_7d = hist["Close"].iloc[-7]
        else:
            start_7d = hist["Close"].iloc[0]
        price_change_7d = round(
            ((hist["Close"].iloc[-1] - start_7d) / start_7d) * 100, 2
        )

        # Relative volume: most recent session vs 30-day average
        avg_volume = hist["Volume"].mean()
        current_volume = hist["Volume"].iloc[-1]
        relative_volume = (
            round(float(current_volume / avg_volume), 2)
            if avg_volume > 0
            else 1.0
        )

        return current_price, price_change_7d, relative_volume

    except Exception as e:
        print(f"Price/volume fetch failed for {ticker}: {e}")
        return None, None, None


def calculate_signal_score(sentiment_score, price_change_7d, relative_volume):
    """
    0-100 composite signal score.

    - Sentiment and price direction agreement amplifies the score
    - Volume conviction boosts high-scoring stocks and reduces noise in low-volume ones
    - 50 = neutral / fully divergent; higher = stronger aligned bullish; lower = stronger aligned bearish
    """
    s = max(-1.0, min(1.0, float(sentiment_score or 0)))
    # Cap price change at ±15% → ±1 for normalization
    p = max(-1.0, min(1.0, float(price_change_7d or 0) / 15.0))
    # Cap relative volume at 2.5x average
    v = min(float(relative_volume or 1.0), 2.5) / 2.5

    # Directional average: how bullish/bearish the combined picture is
    direction = s * 0.5 + p * 0.5

    # Agreement bonus: s and p pointing same direction adds up to +0.2
    # s and p opposing: up to -0.2
    agreement_bonus = s * p * 0.2

    # Volume conviction: 0.8 (low volume) to 1.2 (high volume)
    vol_factor = 0.8 + v * 0.4

    raw = (direction + agreement_bonus) * vol_factor  # approx -1.2 to +1.44
    # Map to 0-100 (raw domain roughly -1.44 to +1.44)
    score = (raw + 1.44) / 2.88 * 100
    return round(max(0, min(100, score)))


def get_watchlist_data(stocks):
    """
    Main entry point. stocks: list of {"ticker": ..., "company_name": ...}
    Returns list of enriched dicts, sorted by signal_score descending.
    """
    results = []

    for stock in stocks:
        ticker = stock.get("ticker", "").upper().strip()
        company_name = stock.get("company_name", ticker)

        if not ticker:
            continue

        try:
            # 1. Get sentiment (RSS + FinBERT)
            headlines = search_ticker(ticker, company_name)
            if headlines:
                headlines = filter_relevant_headlines(headlines)
                sentiment_score = float(analyze_headlines(headlines))
            else:
                sentiment_score = 0.0
            label = classify_sentiment(sentiment_score).strip()

            # 2. Get price + volume (single yfinance call)
            current_price, price_change_7d, relative_volume = get_price_volume_data(ticker)

            # 3. Quadrant + signal score
            quadrant_key = get_quadrant_key(sentiment_score, price_change_7d)
            quadrant_info = QUADRANTS[quadrant_key]
            signal_score = calculate_signal_score(
                sentiment_score, price_change_7d, relative_volume
            )

            results.append({
                "ticker": ticker,
                "company_name": company_name,
                "sentiment_score": round(sentiment_score, 4),
                "label": label,
                "current_price": current_price,
                "price_change_7d": price_change_7d,
                "relative_volume": relative_volume,
                "quadrant": quadrant_key,
                "quadrant_name": quadrant_info["name"],
                "quadrant_color": quadrant_info["color"],
                "quadrant_description": quadrant_info["description"],
                "signal_score": signal_score,
            })

        except Exception as e:
            print(f"Watchlist error for {ticker}: {e}")
            results.append({
                "ticker": ticker,
                "company_name": company_name,
                "error": str(e),
            })

    results.sort(key=lambda r: r.get("signal_score", -1), reverse=True)
    return results


if __name__ == "__main__":
    test = [
        {"ticker": "AAPL", "company_name": "Apple"},
        {"ticker": "TSLA", "company_name": "Tesla"},
        {"ticker": "NVDA", "company_name": "NVIDIA"},
    ]
    for r in get_watchlist_data(test):
        print(
            f"{r['ticker']:6s} Q={r.get('quadrant','?')} "
            f"sentiment={r.get('sentiment_score','?')} "
            f"price7d={r.get('price_change_7d','?')}% "
            f"vol={r.get('relative_volume','?')}x "
            f"score={r.get('signal_score','?')}"
        )
