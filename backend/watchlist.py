"""
watchlist.py

Fetches and scores a user-defined watchlist of stocks.

Speed/freshness fix: the pipeline now detects whether the market is currently
open and uses the best available data source accordingly:

  DURING MARKET HOURS (9:30am-4:00pm ET, Mon-Fri):
    - Price:        yfinance fast_info.last_price  (near-real-time)
    - Volume:       today's intraday volume from 1-minute bars
    - Rel. volume:  projected full-day volume / 10-day average

  AFTER HOURS / WEEKENDS:
    - Price:        most recent daily close
    - Volume:       last completed session volume
    - Rel. volume:  last session / 10-day average

This means during market hours you get today's live data, and after hours
you get the most recent complete session. No more stale yesterday-data.
"""

import yfinance as yf
import numpy as np
from datetime import datetime, timezone, timedelta

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
    "Mega":  (200e9,  float("inf")),
    "Large": (10e9,   200e9),
    "Mid":   (2e9,    10e9),
    "Small": (300e6,  2e9),
    "Micro": (50e6,   300e6),
    "Nano":  (0,      50e6),
}


def is_market_open():
    """Returns True if NYSE is currently open (9:30am-4:00pm ET, Mon-Fri)."""
    utc_now = datetime.now(timezone.utc)
    try:
        from zoneinfo import ZoneInfo
        et_now = utc_now.astimezone(ZoneInfo("America/New_York"))
    except ImportError:
        et_now = utc_now + timedelta(hours=-4)

    if et_now.weekday() >= 5:
        return False
    h, m = et_now.hour, et_now.minute
    after_open   = (h == 9 and m >= 30) or h >= 10
    before_close = h < 16
    return after_open and before_close


def classify_market_cap(market_cap_usd):
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
    s = max(-1.0, min(1.0, float(sentiment_score or 0)))
    p = max(-1.0, min(1.0, float(price_change or 0) / 15.0))
    v = min(float(relative_volume or 1.0), 2.5) / 2.5

    direction       = s * 0.5 + p * 0.5
    agreement_bonus = s * p * 0.2
    vol_factor      = 0.8 + v * 0.4

    raw   = (direction + agreement_bonus) * vol_factor
    score = (raw + 1.44) / 2.88 * 100
    return round(max(0, min(100, score)))


def get_stock_data(ticker, history_days=10):
    """
    Fetches price, volume, and historical trail for a ticker.
    Automatically uses live intraday data during market hours,
    or the last completed daily session after hours.
    """
    try:
        stock = yf.Ticker(ticker)
        market_open_now = is_market_open()

        # Always pull 30-day daily history for the trail and volume baseline
        hist_daily = stock.history(period="30d")
        if hist_daily.empty or len(hist_daily) < history_days:
            return [], None, None, None, None

        avg_volume_10d = float(hist_daily["Volume"].tail(10).mean())

        if market_open_now:
            # Live price
            try:
                current_price = round(float(stock.fast_info.last_price), 2)
            except Exception:
                current_price = round(float(hist_daily["Close"].iloc[-1]), 2)

            # Today's intraday volume from 1-minute bars
            try:
                intraday = stock.history(period="1d", interval="1m")
                today_volume = float(intraday["Volume"].sum()) if not intraday.empty else 0.0
            except Exception:
                today_volume = float(hist_daily["Volume"].iloc[-1])

            # Project partial-day volume to a full-day estimate
            try:
                from zoneinfo import ZoneInfo
                et_now = datetime.now(timezone.utc).astimezone(ZoneInfo("America/New_York"))
            except ImportError:
                et_now = datetime.now(timezone.utc) + timedelta(hours=-4)

            mins_elapsed  = max((et_now.hour - 9) * 60 + et_now.minute - 30, 1)
            day_fraction  = min(mins_elapsed / 390, 1.0)
            proj_volume   = today_volume / day_fraction
            relative_volume = round(proj_volume / avg_volume_10d, 3) if avg_volume_10d > 0 else 1.0

            # Price change vs previous close
            prev_close      = float(hist_daily["Close"].iloc[-1])
            price_change_pct = round(((current_price - prev_close) / prev_close) * 100, 2) if prev_close > 0 else 0.0

        else:
            # After hours: last completed session
            current_price   = round(float(hist_daily["Close"].iloc[-1]), 2)
            last_volume     = float(hist_daily["Volume"].iloc[-1])
            relative_volume = round(last_volume / avg_volume_10d, 3) if avg_volume_10d > 0 else 1.0

            ref_price       = float(hist_daily["Close"].iloc[-min(10, len(hist_daily))])
            price_change_pct = round(((current_price - ref_price) / ref_price) * 100, 2) if ref_price > 0 else 0.0

        # Historical trail from daily data
        recent          = hist_daily.tail(history_days).copy()
        reference_price = float(recent["Close"].iloc[0])
        history_points  = []

        for i, (date, row) in enumerate(recent.iterrows()):
            end_idx   = hist_daily.index.get_loc(date)
            start_idx = max(0, end_idx - 10)
            prior_avg = float(hist_daily["Volume"].iloc[start_idx:end_idx].mean()) if end_idx > 0 else avg_volume_10d
            rel_vol   = round(float(row["Volume"]) / prior_avg, 3) if prior_avg > 0 else 1.0

            cumulative_pct = round(
                ((float(row["Close"]) - reference_price) / reference_price) * 100, 2
            ) if reference_price > 0 else 0.0

            history_points.append({
                "day_index":                   i - (history_days - 1),
                "date":                        str(date.date()),
                "close_price":                 round(float(row["Close"]), 2),
                "cumulative_price_change_pct": cumulative_pct,
                "relative_volume":             rel_vol,
            })

        # Market cap
        market_cap_raw = None
        try:
            market_cap_raw = stock.fast_info.market_cap
        except Exception:
            pass

        source = "live" if market_open_now else "daily_close"
        print(f"{ticker}: ${current_price} | {price_change_pct:+.2f}% | {relative_volume}x vol | [{source}]")

        return history_points, current_price, relative_volume, market_cap_raw, price_change_pct

    except Exception as e:
        print(f"Stock data fetch failed for {ticker}: {e}")
        return [], None, None, None, None


def get_watchlist_data(stocks, history_days=10):
    """
    Main entry point. stocks: list of {"ticker": ..., "company_name": ...}
    Returns enriched list sorted by signal_score descending.
    """
    results = []

    for stock in stocks:
        ticker       = stock.get("ticker", "").upper().strip()
        company_name = stock.get("company_name", ticker)
        if not ticker:
            continue

        try:
            headlines = search_ticker(ticker, company_name)
            if headlines:
                headlines = filter_relevant_headlines(headlines)
                sentiment_score = float(analyze_headlines(headlines))
            else:
                sentiment_score = 0.0
            label = classify_sentiment(sentiment_score).strip()

            history_points, current_price, relative_volume, market_cap_raw, price_change = \
                get_stock_data(ticker, history_days=history_days)

            price_change    = price_change    or 0.0
            relative_volume = relative_volume or 1.0

            market_cap_tier = classify_market_cap(market_cap_raw)
            quadrant_key    = get_quadrant_key(sentiment_score, price_change)
            quadrant_info   = QUADRANTS[quadrant_key]
            signal_score    = calculate_signal_score(sentiment_score, price_change, relative_volume)

            results.append({
                "ticker":               ticker,
                "company_name":         company_name,
                "sentiment_score":      round(sentiment_score, 4),
                "label":                label,
                "current_price":        current_price,
                "price_change_7d":      price_change,
                "relative_volume":      relative_volume,
                "market_cap_raw":       market_cap_raw,
                "market_cap_tier":      market_cap_tier,
                "quadrant":             quadrant_key,
                "quadrant_name":        quadrant_info["name"],
                "quadrant_color":       quadrant_info["color"],
                "quadrant_description": quadrant_info["description"],
                "signal_score":         signal_score,
                "history":              history_points,
                "data_source":          "live" if is_market_open() else "daily_close",
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
    print(f"Market open: {is_market_open()}")
    for r in get_watchlist_data([
        {"ticker": "AAPL", "company_name": "Apple"},
        {"ticker": "TSLA", "company_name": "Tesla"},
    ]):
        print(f"{r['ticker']}: score={r.get('signal_score')} "
              f"source={r.get('data_source')} "
              f"price=${r.get('current_price')} "
              f"change={r.get('price_change_7d', 0):+.2f}%")