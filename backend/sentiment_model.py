from preprocessor import preprocess_text #taking the preprocesser_text function from preprocessor python file
from transformers import AutoTokenizer, AutoModelForSequenceClassification # importing tokenizer and sequence classification 
tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert") # importing pretrained finbert/ProsusAI tokenizer
model = AutoModelForSequenceClassification.from_pretrained("ProsusAI/finbert") # importing pretrained finbert/ProsusAI model
import torch

def finbert_model(text):
    #function that runs the actual finbert model, to classify sentiment. takes in a cleaned headline string input called text
    encoded_input= tokenizer(text,return_tensors="pt") #tokenized the cleaned text into format FinBERT understands
    output=model(**encoded_input) # runs text thru FinBERT model
    logits= output.logits # extract raw and unormalized scores from model output
    probabilities = torch.softmax(logits,dim=-1) # converts logits into probs that add up to one
    positive = probabilities[0][0]  # positive probability (index 0)
    negative = probabilities[0][1]  # negative probability (index 1)
    neutral  = probabilities[0][2]  # neutral probability (index 2)
# formula 
    score = positive-negative
    return score.item()






if __name__ == '__main__':
    test = "Apple stock hits record high on strong earnings"
    cleaned = preprocess_text(test)
    score = finbert_model(cleaned)
    print("Score:", score)