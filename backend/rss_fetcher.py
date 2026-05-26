import feedparser

def search_ticker( ticker):
    urls=  [f'https://finance.yahoo.com/rss/headline?s={ticker}', #yahoo_url
            'https://cnbc.com/id/100003114/device/rss/rss.html',#cnbc_url
            'https://feeds.reuters.com/reuters/businessNews',# reuters url
            'https://feeds.marketwatch.com/marketwatch/topstories',#marketwatch url
            'https://www.prnewswire.com/rss/news-releases-list.rss',#PRNEWSWIRE url
            'https://feeds.apnews.com/apnews/business',#associated_press_url
            ]
    
    headlines=[] #result array

    ticker_lower=ticker.lower() #each url is lowercased
    for url in urls: # loop thru each url
        feed=feedparser.parse(url) # parsing each url 
        for entry in feed.entries: #loops through each entry, adds title, link and published date 
            title=entry.title.lower() # lowercase each title
            summary=entry.get('summary','').lower() # get a summary
            if ticker_lower in title or ticker_lower in summary: # if we see the ticker in the summary or title, we add it
                headlines.append({
                    'title': entry.title,
                    'link': entry.link,
                    'published': entry.get('published','N/A')
                })

    return headlines # return the headlines



if __name__ == '__main__':
    results = search_ticker('AAPL')
    for headline in results:
        print(headline['title'])
        print(headline['link'])
        print(headline['published'])
        print('---')