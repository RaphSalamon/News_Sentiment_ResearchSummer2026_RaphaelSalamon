from preprocessor import preprocess_text #taking the preprocesser_text function from preprocessor python file
from transformers import AutoTokenizer, AutoModelForSequenceClassification # importing tokenizer and sequence classification 
tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert") # importing pretrained finbert/ProsusAI tokenizer
model = AutoModelForSequenceClassification.from_pretrained("ProsusAI/finbert") # importing pretrained finbert/ProsusAI model
import torch

def finbert_model(text):
    #function that runs the actual finbert model, to classify sentiment. takes in a cleaned headline string input called text
    encoded_input= tokenizer(text,return_tensors="pt") #tokenized the cleaned text into format FinBERT understands
    with torch.no_grad(): # we're not training, so skip building the gradient graph -- pure speed/memory win, doesn't change the output
        output=model(**encoded_input) # runs text thru FinBERT model
    logits= output.logits # extract raw and unormalized scores from model output
    probabilities = torch.softmax(logits,dim=-1) # converts logits into probs that add up to one
    positive = probabilities[0][0]  # positive probability (index 0)
    negative = probabilities[0][1]  # negative probability (index 1)
    neutral  = probabilities[0][2]  # neutral probability (index 2)
# formula 
    score = positive-negative
    return score.item()


def finbert_batch(texts):
    """
    Same math as finbert_model, but runs a whole list of headlines through
    FinBERT in ONE forward pass instead of one-at-a-time. This is the real
    speed fix for top50.py, which was previously calling finbert_model once
    per headline (50 tickers x ~10-15 headlines each = 500+ separate model
    calls). Batching lets the transformer process the whole batch as a
    single matrix operation, cutting out most of that per-call overhead.

    texts: list of cleaned headline strings
    returns: list of scores (positive - negative), same order as input.
    Returns [] for an empty input instead of crashing on an empty tensor.
    """
    if not texts:
        return []

    encoded_input = tokenizer(texts, return_tensors="pt", padding=True, truncation=True)
    with torch.no_grad():
        output = model(**encoded_input)
    probabilities = torch.softmax(output.logits, dim=-1)
    positive = probabilities[:, 0]
    negative = probabilities[:, 1]
    scores = (positive - negative).tolist()
    return scores






if __name__ == '__main__':
    test = "Apple stock hits record high on strong earnings"
    cleaned = preprocess_text(test)
    score = finbert_model(cleaned)
    print("Score:", score)