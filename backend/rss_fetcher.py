import feedparser
import re

def search_ticker( ticker,company_name):
    urls=  [f'https://finance.yahoo.com/rss/headline?s={ticker}', #yahoo_url
            'https://cnbc.com/id/100003114/device/rss/rss.html',#cnbc_url
            'https://feeds.reuters.com/reuters/businessNews',# reuters url
            'https://feeds.marketwatch.com/marketwatch/topstories',#marketwatch url
            'https://www.prnewswire.com/rss/news-releases-list.rss',#PRNEWSWIRE url
            'https://feeds.apnews.com/apnews/business',#associated_press_url
            ]
    
    headlines=[] #headlines array

    ticker_lower=ticker.lower() # ticker is lowercased
    company_name_lower=company_name.lower() #company_name
    for url in urls: # loop thru each url
        try:
            feed=feedparser.parse(url) # parsing each url 
            for entry in feed.entries: #loops through each entry, adds title, link and published date 
                title=entry.title.lower() # lowercase each title
                summary=entry.get('summary','').lower() # get a summary
                 
                if re.search(rf'\b{ticker_lower}\b',title) or re.search(rf'\b{ticker_lower}\b',summary) or re.search(rf'\b{company_name_lower}\b',summary) or re.search(rf'\b{company_name_lower}\b',title):
                    # we check if the ticker or the company's name appears explicitly in the title or summary
                     # appending the title, link and published info to the headlines array
                    headlines.append({
                        'title': entry.title,
                        'link': entry.link,
                        'published': entry.get('published','N/A')
                    })

        except:
            continue

    return headlines # return the headlines



if __name__ == '__main__':
    test_stocks = {
    'AAPL': 'Apple',
    'TSLA': 'Tesla',
    'JPM': 'JPMorgan'
}
    results=[]
    for ticker, company_name in test_stocks.items():
            results.extend(search_ticker(ticker,company_name))
    # results = search_ticker('JPM','JPMorgan')
    for headline in results:
        print(headline['title'])
        print(headline['link'])
        print(headline['published'])
        print('---')