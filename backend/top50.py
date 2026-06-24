"""
top50.py

Builds a SHORTLIST of stocks (not literally "top 50" anymore) that clear
two bars:
  1. 7-day price change >= +3% (checked FIRST, cheap, via yfinance --
     before doing any RSS fetching or FinBERT inference)
  2. News sentiment qualifies as a full BUY (> +0.15), after headlines are
     de-duplicated and filtered down to financially-relevant ones

Checking price FIRST means tickers that don't clear the price bar never
touch the expensive part of the pipeline (RSS fetch + FinBERT) at all --
this is the real speed win, on top of the batched FinBERT calls.

Capped at 15 results max (best scores win if more qualify). Some days
this may return fewer than that, or even zero -- that's a real reflection
of market conditions, not a bug.
"""

import csv
import io
import requests
import yfinance as yf
from classifier import classify_sentiment, analyze_headlines
from preprocessor import filter_relevant_headlines
from rss_fetcher import search_ticker

try:
    from finvizfinance.screener.overview import Overview
    FINVIZ_AVAILABLE = True
except ImportError:
    FINVIZ_AVAILABLE = False


# Community-maintained, regularly-updated S&P 500 constituent list, hosted
# as a plain CSV on GitHub. This is the second independent universe source --
# unlike Finviz, it's not a scrape target, so it isn't subject to anti-bot
# blocking. It doesn't carry live market cap data though, so it's not
# "ranked by size" the way the Finviz result is.
SP500_CSV_URL = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv"

# Fallback universe if BOTH live sources fail. Not the full S&P 500 (that's 500
# yfinance calls just to build the candidate list) -- a representative
# large-cap slice across sectors. Expand this anytime.
FALLBACK_UNIVERSE = {
    'AAPL': 'Apple', 'MSFT': 'Microsoft', 'GOOGL': 'Alphabet', 'AMZN': 'Amazon',
    'NVDA': 'NVIDIA', 'META': 'Meta', 'TSLA': 'Tesla', 'BRK-B': 'Berkshire Hathaway',
    'JPM': 'JPMorgan', 'V': 'Visa', 'UNH': 'UnitedHealth', 'JNJ': 'Johnson & Johnson',
    'WMT': 'Walmart', 'XOM': 'Exxon Mobil', 'MA': 'Mastercard', 'PG': 'Procter & Gamble',
    'HD': 'Home Depot', 'CVX': 'Chevron', 'MRK': 'Merck', 'ABBV': 'AbbVie',
    'KO': 'Coca-Cola', 'PEP': 'PepsiCo', 'BAC': 'Bank of America', 'COST': 'Costco',
    'AVGO': 'Broadcom', 'TMO': 'Thermo Fisher', 'MCD': 'McDonald\'s', 'CSCO': 'Cisco',
    'ACN': 'Accenture', 'ABT': 'Abbott', 'DHR': 'Danaher', 'ADBE': 'Adobe',
    'NKE': 'Nike', 'LIN': 'Linde', 'CRM': 'Salesforce', 'TXN': 'Texas Instruments',
    'NEE': 'NextEra Energy', 'DIS': 'Disney', 'PM': 'Philip Morris', 'WFC': 'Wells Fargo',
    'INTC': 'Intel', 'AMD': 'AMD', 'IBM': 'IBM', 'GE': 'General Electric',
    'CAT': 'Caterpillar', 'GS': 'Goldman Sachs', 'BA': 'Boeing', 'SBUX': 'Starbucks',
    'PYPL': 'PayPal', 'NFLX': 'Netflix', 'ORCL': 'Oracle', 'QCOM': 'Qualcomm',
}


def _get_universe_finviz(limit=50):
    """
    Try to pull a large-cap ticker universe live from the Finviz screener.
    Returns a dict {ticker: company_name} on success, or None on failure
    (this is the expected path right now -- Finviz returns 403 to scrapers).
    """
    if not FINVIZ_AVAILABLE:
        return None

    try:
        foverview = Overview()
        foverview.set_filter(filters_dict={'Market Cap.': '+Large (over $10bln)'})
        df = foverview.screener_view(order='Market Cap.', limit=limit, verbose=0)

        if df is None or df.empty:
            return None

        universe = {}
        for _, row in df.iterrows():
            universe[row['Ticker']] = row.get('Company', row['Ticker'])
        return universe
    except Exception as e:
        print(f"Finviz universe fetch failed, falling back: {e}")
        return None


def _get_universe_sp500_github(limit=50):
    """
    Second independent universe source: pulls the current S&P 500
    constituent list from a maintained GitHub-hosted CSV. Not a scrape
    target, so it doesn't have Finviz's blocking problem. Returns the
    first `limit` tickers in the dataset's order (NOT ranked by market
    cap -- this source doesn't carry that data).
    Returns {ticker: company_name} or None on any failure.
    """
    try:
        response = requests.get(SP500_CSV_URL, timeout=10)
        response.raise_for_status()
        reader = csv.DictReader(io.StringIO(response.text))

        universe = {}
        for row in reader:
            ticker = row.get('Symbol', '').strip()
            company = row.get('Security', '').strip()
            if ticker and company:
                universe[ticker] = company
            if len(universe) >= limit:
                break

        return universe if universe else None
    except Exception as e:
        print(f"S&P 500 GitHub source fetch failed: {e}")
        return None


def get_universe(limit=50):
    """
    Returns {ticker: company_name} candidate list. Tries multiple
    independent sources in order, so a single point of failure (e.g.
    Finviz blocking scrapers) doesn't take down the whole feature:
      1. Finviz screener -- live, ranked by current market cap
      2. S&P 500 list from a maintained GitHub dataset -- live, not
         scrape-blockable, but not ranked by size
      3. Hardcoded large-cap list -- static last-resort safety net
    """
    universe = _get_universe_finviz(limit=limit)
    if universe:
        return universe

    print("Finviz universe unavailable, trying S&P 500 GitHub source...")
    universe = _get_universe_sp500_github(limit=limit)
    if universe:
        return universe

    print("Using fallback hardcoded universe (both live sources unavailable).")
    return FALLBACK_UNIVERSE


def get_price_data(ticker):
    """
    Returns (current_price, price_change_pct) from a SINGLE yfinance call,
    so adding current price doesn't double the network requests per ticker.
    current_price is the most recent close in that 7-day window (not live
    intraday data) -- close enough for this app's purposes, and avoids an
    extra API call just to get a "more live" number.
    Returns (None, None) if data isn't available.
    """
    try:
        hist = yf.Ticker(ticker).history(period='7d')
        if hist.empty or len(hist) < 2:
            return None, None
        start_price = hist['Close'].iloc[0]
        end_price = hist['Close'].iloc[-1]
        price_change_pct = round(((end_price - start_price) / start_price) * 100, 2)
        current_price = round(float(end_price), 2)
        return current_price, price_change_pct
    except Exception:
        return None, None


def build_top50(limit=50, max_results=15, min_price_change=3.0):
    """
    Two-stage filter, cheap-first:

    Stage 1 -- price filter (fast, no FinBERT): for every candidate in the
    universe, check the 7-day price change via yfinance. Anything under
    `min_price_change` is dropped immediately, before it ever reaches RSS
    fetching or sentiment analysis.

    Stage 2 -- sentiment filter (the expensive part, only run on survivors):
    fetch headlines, de-duplicate and filter them down to financially-
    relevant ones, run them through FinBERT, and require a full BUY
    classification (> +0.15).

    Returns up to `max_results` stocks, sorted by score descending.
    """
    universe = get_universe(limit=limit)

    # Stage 1: cheap price filter first -- this is what skips the expensive
    # work entirely for tickers that don't even clear the price bar.
    price_qualified = []
    for ticker, company_name in universe.items():
        current_price, price_change_7d = get_price_data(ticker)
        if price_change_7d is None or price_change_7d < min_price_change:
            continue
        price_qualified.append((ticker, company_name, current_price, price_change_7d))

    print(f"{len(price_qualified)} of {len(universe)} candidates cleared "
          f"the {min_price_change}% price filter")

    # Stage 2: sentiment filter, only on the survivors of stage 1
    results = []
    for ticker, company_name, current_price, price_change_7d in price_qualified:
        try:
            headlines = search_ticker(ticker, company_name)
            if not headlines:
                continue

            filtered_headlines = filter_relevant_headlines(headlines)

            score = float(analyze_headlines(filtered_headlines))  # cast off numpy float64
            label = classify_sentiment(score).strip()

            if label != 'BUY':
                continue

            results.append({
                'ticker': ticker,
                'company_name': company_name,
                'score': round(score, 4),
                'label': label,
                'current_price': current_price,
                'price_change_7d': price_change_7d,
                'headline_count': len(filtered_headlines)
            })
        except Exception as e:
            print(f"Skipping {ticker} due to error: {e}")
            continue

    results.sort(key=lambda r: r['score'], reverse=True)
    return results[:max_results]


if __name__ == '__main__':
    shortlist = build_top50()
    if not shortlist:
        print("No stocks cleared both filters today.")
    for i, stock in enumerate(shortlist, start=1):
        print(f"{i}. {stock['ticker']:6s} {stock['label']:6s} "
              f"score={stock['score']:.4f}  7d={stock['price_change_7d']}")