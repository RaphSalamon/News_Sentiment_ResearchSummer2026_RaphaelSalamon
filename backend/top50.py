"""
top50.py

Builds a "Top 50 by sentiment" list:
  1. Get a candidate universe of large-cap tickers (tries Finviz screener first)
  2. Run YOUR existing pipeline on each: rss_fetcher -> classifier (analyze_headlines)
  3. Sort by sentiment score, return the top 50

WARNING: this runs FinBERT inference across every ticker's headlines, live,
on every request. For 50+ stocks this can take several minutes. There is no
caching here on purpose per current design -- /api/top50 will be slow.
If that turns out to be too slow in practice, db.py already has
save_top50_results()/get_cached_top50() ready to wire in later.
"""

import yfinance as yf
from classifier import classify_sentiment, analyze_headlines
from rss_fetcher import search_ticker

try:
    from finvizfinance.screener.overview import Overview
    FINVIZ_AVAILABLE = True
except ImportError:
    FINVIZ_AVAILABLE = False


# Fallback universe if Finviz blocks us. Not the full S&P 500 (that's 500
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


def get_universe(limit=50):
    """
    Returns {ticker: company_name} candidate list, Finviz first, fallback second.
    """
    universe = _get_universe_finviz(limit=limit)
    if universe:
        return universe

    print("Using fallback hardcoded universe (Finviz unavailable).")
    return FALLBACK_UNIVERSE


def get_price_change_7d(ticker):
    """
    7-day price change %, using yfinance (matches your existing stack).
    Returns None if data isn't available.
    """
    try:
        hist = yf.Ticker(ticker).history(period='7d')
        if hist.empty or len(hist) < 2:
            return None
        start_price = hist['Close'].iloc[0]
        end_price = hist['Close'].iloc[-1]
        return round(((end_price - start_price) / start_price) * 100, 2)
    except Exception:
        return None


def build_top50(limit=50):
    """
    Runs the full pipeline across the universe and returns the top N stocks
    by sentiment score, sorted descending (most BUY-leaning first).
    """
    universe = get_universe(limit=limit)

    results = []
    for ticker, company_name in universe.items():
        try:
            headlines = search_ticker(ticker, company_name)
            if not headlines:
                # No news found for this ticker right now -- skip rather than
                # let analyze_headlines choke on an empty list (np.mean([]) -> nan)
                continue

            score = float(analyze_headlines(headlines))  # cast off numpy float64 -- jsonify can choke on it
            label = classify_sentiment(score)
            price_change_7d = get_price_change_7d(ticker)

            results.append({
                'ticker': ticker,
                'company_name': company_name,
                'score': round(score, 4),
                'label': label.strip(),  # classify_sentiment returns " HOLD" with a leading space
                'price_change_7d': price_change_7d,
                'headline_count': len(headlines)
            })
        except Exception as e:
            print(f"Skipping {ticker} due to error: {e}")
            continue

    results.sort(key=lambda r: r['score'], reverse=True)
    return results[:limit]


if __name__ == '__main__':
    top = build_top50(limit=50)
    for i, stock in enumerate(top, start=1):
        print(f"{i}. {stock['ticker']:6s} {stock['label']:6s} "
              f"score={stock['score']:.4f}  7d={stock['price_change_7d']}")