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



if __name__ == '__main__':
    test = "Apple reports no growth and profits are not looking good with declining revenue"
    print("original: " + test)
    print("cleaned:  " + preprocess_text(test))

        #LOOK AT HOW SENTIMENT MAY BE IMPACTED 