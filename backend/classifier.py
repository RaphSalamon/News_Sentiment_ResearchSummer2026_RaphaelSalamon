import numpy as np
from preprocessor import preprocess_text
from sentiment_model import finbert_batch



def classify_sentiment(score): # takes the sentiment score as a input
    if score >0.15:
        return "BUY" # BUY WHEN SCORE IS ABOVE 0.5
    elif(score<-0.15):
        return "AVOID" # AVOID IF ITS BELOW -0.5
    else:
        return " HOLD" # HOLD IF ITS IN BETWEEN
    
def analyze_headlines(headlines):
    # Same return value as before (mean sentiment score across all headlines),
    # but now runs every headline through FinBERT in ONE batched call instead
    # of looping and calling the model once per headline. Big speed win,
    # especially noticeable in top50.py where this used to mean hundreds of
    # separate model calls per refresh.
    cleaned_texts = [preprocess_text(headline['title']) for headline in headlines]
    scores = finbert_batch(cleaned_texts)
    return np.mean(scores)



    






if __name__ == '__main__':
    test_headlines = [
    "Apple stock hits record high on strong earnings",
    "Apple faces lawsuit over misleading AI claims",
    "Apple reports strong iPhone sales in Europe"
]
    score = analyze_headlines(test_headlines)
    label = classify_sentiment(score)
    print("Score:", score)
    print("Verdict:", label)   

#try to implement this idea into a screener. try to work this with real time stocks and data, TESLA, APPLE ticker, etc.
#create a reccomendation based on a screener
#try to make this a GUI