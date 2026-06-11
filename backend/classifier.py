import numpy as np
from preprocessor import preprocess_text
from sentiment_model import finbert_model



def classify_sentiment(score): # takes the sentiment score as a input
    if score >0.15:
        return "BUY" # BUY WHEN SCORE IS ABOVE 0.5
    elif(score<-0.15):
        return "AVOID" # AVOID IF ITS BELOW -0.5
    else:
        return " HOLD" # HOLD IF ITS IN BETWEEN
    
def analyze_headlines(headlines):
    scores=[] # scores list
    for headline in headlines:
        scores.append(finbert_model(preprocess_text(headline['title'])))# loop thru each headline, preprocess the text and store it in the model
    return np.mean(scores) # return the average of scores



    






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