import nltk
import re
from nltk.corpus import stopwords
from rss_fetcher import search_ticker

nltk.download('stopwords')
nltk.download('punkt')

def preprocess_text(text): #function used to process the text and make it neat for tokenizing
    clean_text= text.lower() #text in lowercase
    clean_text=re.sub(r'https?://\S+', '', clean_text) # removing links
    clean_text=re.sub(r'[^a-zA-Z0-9\s]', '', clean_text) # removing special chars and unwanted puntcuation
    clean_text=" ".join(clean_text.split()) # stripping whitespace 
    
    tokens = clean_text.split()

    # load default english stopwords
    stop_words = set(stopwords.words('english'))

    # these are negation and sentiment-critical words that NLTK would normally remove
    # removing them would flip or destroy the sentiment meaning
    # example: "not good" → "good" would completely change the score
    negation_words = {
        'no', 'not', 'nor', 'never', 'neither',
        'without', 'against', 'down', 'below',
        'loss', 'losses', 'decline', 'drop',
        'under', 'off', 'less', 'few'
    }

    # remove the negation words from the stopword list
    # so they are KEPT in the cleaned text
    stop_words = stop_words - negation_words
    filtered = [word for word in tokens if word not in stop_words]

    result= " ".join(filtered)

    return result # returning the filtered words 


# Keywords that typically signal a headline is substantively about company
# performance/business news, as opposed to a generic or tangential mention
# (e.g. "Apple CEO spotted at charity gala" vs "Apple beats earnings estimates").
FINANCIAL_RELEVANCE_KEYWORDS = {
    'earnings', 'revenue', 'profit', 'profits', 'loss', 'losses', 'guidance',
    'forecast', 'outlook', 'upgrade', 'downgrade', 'analyst', 'rating',
    'price target', 'beat', 'beats', 'miss', 'misses', 'dividend', 'buyback',
    'merger', 'acquisition', 'acquire', 'acquires', 'ipo', 'bankruptcy',
    'lawsuit', 'investigation', 'recall', 'fda', 'approval', 'layoffs',
    'restructuring', 'shares', 'stock', 'stocks', 'shareholders',
    'quarter', 'quarterly', 'sales', 'growth', 'decline', 'surge', 'plunge',
    'soar', 'tumble', 'rally', 'selloff', 'sec', 'regulatory', 'antitrust',
    'resigns', 'resignation', 'steps down', 'fired', 'departure', 'ousted',
    'succession',
}


def is_relevant_headline(title):
    """
    Quick relevance check: does this headline contain at least one keyword
    that typically signals real financial/business news?
    """
    lowered = title.lower()
    return any(keyword in lowered for keyword in FINANCIAL_RELEVANCE_KEYWORDS)


def filter_relevant_headlines(headlines):
    """
    Cuts down the headline list BEFORE it reaches FinBERT, two ways:
      1. De-duplicates near-identical headlines (wire stories often appear
         almost word-for-word across multiple RSS feeds)
      2. Drops headlines with no financially-relevant keyword (cuts generic
         noise that doesn't carry real sentiment signal)

    This makes the model's job easier (less noisy input -> a more
    meaningful average score) and faster (smaller batch per ticker).

    Falls back to the deduped-but-unfiltered list if keyword filtering
    would eliminate everything -- better to analyze noisy headlines than
    end up with zero signal for a ticker that genuinely has news today.
    """
    if not headlines:
        return []

    # Step 1: de-duplicate near-identical headlines across sources
    seen = set()
    deduped = []
    for h in headlines:
        normalized = re.sub(r'[^a-z0-9\s]', '', h['title'].lower()).strip()
        if normalized not in seen:
            seen.add(normalized)
            deduped.append(h)

    # Step 2: keep only headlines that look financially relevant
    relevant = [h for h in deduped if is_relevant_headline(h['title'])]

    return relevant if relevant else deduped


if __name__ == '__main__':
    test = "Apple reports no growth and profits are not looking good with declining revenue"
    print("original: " + test)
    print("cleaned:  " + preprocess_text(test))

    test_headlines = [
        {'title': 'Apple beats earnings estimates with record iPhone sales'},
        {'title': 'Apple Beats Earnings Estimates With Record iPhone Sales'},  # near-dupe
        {'title': 'Apple CEO seen at local restaurant over weekend'},  # not relevant
    ]
    filtered = filter_relevant_headlines(test_headlines)
    print(f"\n{len(test_headlines)} headlines in, {len(filtered)} out after dedup + relevance filter:")
    for h in filtered:
        print(' -', h['title'])

        #LOOK AT HOW SENTIMENT MAY BE IMPACTED