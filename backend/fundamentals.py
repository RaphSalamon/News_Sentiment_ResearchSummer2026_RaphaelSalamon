"""
fundamentals.py

Pulls comprehensive fundamental data for a single ticker via yfinance,
covering P/E ratio, dividends, EPS, beta, 52-week range, analyst ratings,
growth metrics, and a simple price trend calculation.

NOTE ON FINVIZ:
Finviz doesn't offer an official public API. The finvizfinance package
scrapes finviz.com and is actively blocked with HTTP 403 by anti-bot
protection. This module uses yfinance as the primary and only source --
it's already in the stack, free, and returns all the data we need.
"""

import yfinance as yf
from datetime import datetime


def _safe(val, default=None):
    """Return val if it's not None/NaN, otherwise default."""
    if val is None:
        return default
    try:
        import math
        if isinstance(val, float) and math.isnan(val):
            return default
    except Exception:
        pass
    return val


def _format_large_number(n):
    """Format big numbers as readable strings (e.g. 3.1T, 285B, 4.2M)."""
    if n is None:
        return None
    try:
        n = float(n)
        if n >= 1e12:
            return f"${n / 1e12:.2f}T"
        if n >= 1e9:
            return f"${n / 1e9:.2f}B"
        if n >= 1e6:
            return f"${n / 1e6:.2f}M"
        return f"${n:,.0f}"
    except Exception:
        return None


def _analyst_label(mean):
    """
    Convert the numeric recommendationMean to a human-readable label.
    yfinance scale: 1.0 = Strong Buy, 2.0 = Buy, 3.0 = Hold,
                    4.0 = Underperform, 5.0 = Sell
    """
    if mean is None:
        return None
    if mean <= 1.5:
        return "Strong Buy"
    if mean <= 2.5:
        return "Buy"
    if mean <= 3.5:
        return "Hold"
    if mean <= 4.5:
        return "Underperform"
    return "Sell"


def _get_price_trend(ticker):
    """
    Simple price trend using 30-day history. Returns:
      - trend: 'uptrend', 'downtrend', or 'flat'
      - pct_change_30d: percentage move over the last 30 days
    Returns (None, None) if data isn't available.
    """
    try:
        hist = yf.Ticker(ticker).history(period="1mo")
        if hist.empty or len(hist) < 5:
            return None, None
        start = hist["Close"].iloc[0]
        end = hist["Close"].iloc[-1]
        pct = round(((end - start) / start) * 100, 2)
        if pct >= 3:
            trend = "uptrend"
        elif pct <= -3:
            trend = "downtrend"
        else:
            trend = "flat"
        return trend, pct
    except Exception:
        return None, None


def get_fundamentals(ticker):
    """
    Main entry point. Pulls comprehensive fundamental data from yfinance.
    Returns a dict, or None if the ticker can't be found.

    Fields returned:
    - Basic: ticker, company_name, sector, industry, price, market_cap
    - Valuation: pe_ratio, forward_pe, peg_ratio, price_to_book, ev_to_ebitda
    - Earnings: trailing_eps, forward_eps, earnings_growth, revenue_growth
    - Dividends: dividend_yield, dividend_rate, payout_ratio, ex_dividend_date
    - Risk: beta, fifty_two_week_high, fifty_two_week_low, fifty_two_week_change
    - Analysts: recommendation, recommendation_score, target_price, analyst_count
    - Health: profit_margin, return_on_equity, debt_to_equity, free_cashflow
    - Trend: price_trend, price_change_30d
    """
    ticker = ticker.upper().strip()

    try:
        stock = yf.Ticker(ticker)
        info = stock.info

        if not info or (
            info.get("currentPrice") is None
            and info.get("regularMarketPrice") is None
        ):
            return None

        price = _safe(info.get("currentPrice") or info.get("regularMarketPrice"))
        rec_mean = _safe(info.get("recommendationMean"))
        trend, pct_30d = _get_price_trend(ticker)

        dividend_yield = _safe(info.get("dividendYield"))
        if dividend_yield is not None:
            dividend_yield = round(dividend_yield * 100, 2)

        return {
            "ticker": ticker,
            "company_name": _safe(info.get("shortName") or info.get("longName")),
            "sector": _safe(info.get("sector")),
            "industry": _safe(info.get("industry")),
            "price": price,
            "market_cap": _format_large_number(info.get("marketCap")),
            "pe_ratio": _safe(info.get("trailingPE")),
            "forward_pe": _safe(info.get("forwardPE")),
            "peg_ratio": _safe(info.get("pegRatio")),
            "price_to_book": _safe(info.get("priceToBook")),
            "ev_to_ebitda": _safe(info.get("enterpriseToEbitda")),
            "trailing_eps": _safe(info.get("trailingEps")),
            "forward_eps": _safe(info.get("forwardEps")),
            "earnings_growth": _safe(info.get("earningsGrowth")),
            "revenue_growth": _safe(info.get("revenueGrowth")),
            "dividend_yield_pct": dividend_yield,
            "dividend_rate": _safe(info.get("dividendRate")),
            "payout_ratio": _safe(info.get("payoutRatio")),
            "ex_dividend_date": _safe(info.get("exDividendDate")),
            "beta": _safe(info.get("beta")),
            "fifty_two_week_high": _safe(info.get("fiftyTwoWeekHigh")),
            "fifty_two_week_low": _safe(info.get("fiftyTwoWeekLow")),
            "fifty_two_week_change": _safe(info.get("52WeekChange")),
            "recommendation": _analyst_label(rec_mean),
            "recommendation_score": rec_mean,
            "target_price": _safe(info.get("targetMeanPrice")),
            "target_high": _safe(info.get("targetHighPrice")),
            "target_low": _safe(info.get("targetLowPrice")),
            "analyst_count": _safe(info.get("numberOfAnalystOpinions")),
            "profit_margin": _safe(info.get("profitMargins")),
            "return_on_equity": _safe(info.get("returnOnEquity")),
            "debt_to_equity": _safe(info.get("debtToEquity")),
            "free_cashflow": _format_large_number(info.get("freeCashflow")),
            "total_revenue": _format_large_number(info.get("totalRevenue")),
            "price_trend": trend,
            "price_change_30d": pct_30d,
            "source": "yfinance",
        }

    except Exception as e:
        print(f"fundamentals fetch failed for {ticker}: {e}")
        return None


if __name__ == "__main__":
    for t in ["AAPL", "TSLA", "NVDA"]:
        data = get_fundamentals(t)
        if data:
            print(f"\n=== {t} ===")
            for k, v in data.items():
                if v is not None:
                    print(f"  {k}: {v}")
        else:
            print(f"\n{t}: no data returned")