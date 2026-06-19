"""
fundamentals.py

Pulls fundamental data (P/E ratio, market cap, sector, etc.) for a single ticker.

NOTE ON "FINVIZ API":
Finviz does not offer an official public API. The finvizfinance package
(https://pypi.org/project/finvizfinance/) scrapes finviz.com directly, and
Finviz actively blocks this with anti-bot protection (confirmed live: requests
return HTTP 403 Forbidden as of testing). This is a known, recurring issue in
the finvizfinance GitHub repo with no reliable fix short of a paid proxy or
a Finviz Elite login (https://github.com/mariostoev/finviz/issues/45).

So this module tries finvizfinance FIRST (to show the real attempt), and
falls back to yfinance (already in your stack via screener data) if Finviz
blocks the request or the ticker isn't found. yfinance is the reliable path.
"""

import yfinance as yf

try:
    from finvizfinance.quote import finvizfinance
    FINVIZ_AVAILABLE = True
except ImportError:
    FINVIZ_AVAILABLE = False


def _get_fundamentals_finviz(ticker):
    """
    Attempt to pull fundamentals from Finviz via finvizfinance.
    Returns a dict on success, or None if blocked / unavailable / missing data.
    """
    if not FINVIZ_AVAILABLE:
        return None

    try:
        stock = finvizfinance(ticker)
        data = stock.ticker_fundament()  # returns a dict of Finviz's snapshot table

        pe = data.get('P/E')
        if pe in (None, '-', ''):
            pe = None
        else:
            pe = float(pe)

        return {
            'ticker': ticker,
            'pe_ratio': pe,
            'forward_pe': None,  # Finviz snapshot doesn't separate forward P/E cleanly
            'market_cap': data.get('Market Cap'),
            'sector': data.get('Sector'),
            'industry': data.get('Industry'),
            'price': data.get('Price'),
            'company_name': data.get('Company'),
            'source': 'finviz'
        }
    except Exception:
        # Covers 403s, network errors, missing ticker, parsing issues -- anything.
        # We don't care WHY it failed here, just that we need the fallback.
        return None


def _get_fundamentals_yfinance(ticker):
    """
    Fallback: pull fundamentals from yfinance.
    Returns a dict, or None if the ticker can't be found.
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info

        if not info or info.get('regularMarketPrice') is None and info.get('currentPrice') is None:
            return None

        return {
            'ticker': ticker,
            'pe_ratio': info.get('trailingPE'),
            'forward_pe': info.get('forwardPE'),
            'market_cap': info.get('marketCap'),
            'sector': info.get('sector'),
            'industry': info.get('industry'),
            'price': info.get('currentPrice') or info.get('regularMarketPrice'),
            'company_name': info.get('shortName') or info.get('longName'),
            'source': 'yfinance'
        }
    except Exception:
        return None


def get_fundamentals(ticker):
    """
    Main entry point. Tries Finviz first, falls back to yfinance.
    Returns a dict of fundamentals, or None if both sources fail.
    """
    ticker = ticker.upper().strip()

    result = _get_fundamentals_finviz(ticker)
    if result is not None:
        return result

    return _get_fundamentals_yfinance(ticker)


if __name__ == '__main__':
    test_tickers = ['AAPL', 'TSLA', 'NVDA']
    for t in test_tickers:
        data = get_fundamentals(t)
        print(t, '->', data)