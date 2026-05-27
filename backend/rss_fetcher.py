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
    
    headlines=[] #result array

    ticker_lower=ticker.lower() # ticker is lowercased
    company_name_lower=company_name.lower() #company_name
    for url in urls: # loop thru each url
        try:
            feed=feedparser.parse(url) # parsing each url 
            for entry in feed.entries: #loops through each entry, adds title, link and published date 
                title=entry.title.lower() # lowercase each title
                summary=entry.get('summary','').lower() # get a summary
                print("CHECKING:", title)
                print("SUMMARY:", summary[:100])
                print("---")
                if re.search(r'\wo')
                print(ticker_lower in title, company_name_lower in title, ticker_lower in summary, company_name_lower in summary)
                if (ticker_lower in title or company_name_lower in title) or (ticker_lower in summary or company_name_lower in summary): # if we see the ticker/company name in the summary or title, we add it
                    headlines.append({
                        'title': entry.title,
                        'link': entry.link,
                        'published': entry.get('published','N/A')
                    })
        except:
            continue

    return headlines # return the headlines



if __name__ == '__main__':
    results = search_ticker('NKE','Nike')
    for headline in results:
        print(headline['title'])
        print(headline['link'])
        print(headline['published'])
        print('---')