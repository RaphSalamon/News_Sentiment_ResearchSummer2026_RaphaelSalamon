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

    #filtering the tokens from the stopwords
    stop_words = set(stopwords.words('english'))
    filtered = [word for word in tokens if word not in stop_words]

    result= " ".join(filtered)

    return result # returning the filtered words 



if __name__ == '__main__':
    headlines=search_ticker('AAPL', 'Apple')
    for headline in headlines:
        print("old title: " + headline['title'] + "\n")
        print("new title: " +preprocess_text(headline['title']) + "\n")