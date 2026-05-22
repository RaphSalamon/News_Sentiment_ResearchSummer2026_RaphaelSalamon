import feedparser

def search_ticker( ticker):
    url=  f'https://finance.yahoo.com/rss/headline?s={ticker}' #the url which the rss feed pull from
    feed=feedparser.parse(url)
    headlines=[]

    for entry in feed.entries:
        headlines.append({
            'title': entry.title,
            'link': entry.link,
            'published': entry.get('published','N/A')
        })

    return headlines



if __name__ == '__main__':
    results = search_ticker('AAPL')
    for headline in results:
        print(headline['title'])
        print(headline['link'])
        print(headline['published'])
        print('---')