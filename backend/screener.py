from classifier import classify_sentiment, analyze_headlines
from rss_fetcher import search_ticker
from db import save_results

test_stocks = {
    'AAPL': 'Apple',
    'TSLA': 'Tesla',
    'JPM': 'JPMorgan',
    'NKE': 'Nike',
    'NVDA': 'NVIDIA',
    'GOOGL': 'Alphabet',
    'MSFT': 'Microsoft',
}




if __name__ == '__main__':
    for ticker, company_name in test_stocks.items():
        score = analyze_headlines(search_ticker(ticker, company_name))
        label = classify_sentiment(score)
        result = {"score": score, "label": label}
        save_results(ticker,result)
        print(f"{ticker}  {label}  Score: {score:.4f}")