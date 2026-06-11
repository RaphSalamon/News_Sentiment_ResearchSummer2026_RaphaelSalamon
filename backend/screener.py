from classifier import classify_sentiment, analyze_headlines
from rss_fetcher import search_ticker

test_stocks = {
    'AAPL': 'Apple',
    'TSLA': 'Tesla',
    'JPM': 'JPMorgan',
    'NKE': 'Nike',
    'NVDA': 'NVIDA',
    'GOOGL': 'Alphabet',
    'MSFT': 'Microsoft',
}




if __name__ == '__main__':
    for ticker, company_name in test_stocks.items():
        classify_sentiment(analyze_headlines(search_ticker(ticker,company_name)))
        score = analyze_headlines(search_ticker(ticker, company_name))
        label = classify_sentiment(score)
        print(f"{ticker}  {label}  Score: {score:.4f}")