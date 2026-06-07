from preprocessor import preprocess_text #taking the preprocesser_text function from preprocessor python file
from transformers import AutoTokenizer, AutoModelForSequenceClassification # importing tokenizer and sequence classification 
tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert") # importing pretrained finbert/ProsusAI tokenizer
model = AutoModelForSequenceClassification.from_pretrained("ProsusAI/finbert") # importing pretrained finbert/ProsusAI model
import torch

def finbert_model(text):
    #function that runs the actual finbert model, to classify sentiment. takes in a cleaned headline string input called text
    encoded_input= tokenizer(text,return_tensors="pt")
    output=model(**encoded_input)
    logits= output.logits
    probabilities = torch.softmax(logits,dim=-1)