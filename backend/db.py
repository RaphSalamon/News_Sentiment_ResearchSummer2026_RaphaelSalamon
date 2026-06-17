import os
from pymongo import MongoClient
from dotenv import load_dotenv
import certifi

# Load variables from .env file into the environment
load_dotenv()

# Grab the MongoDB connection string from environment variables
MONGO_URI = os.getenv("MONGO_URI")

# Fail early with a clear message if the URI is missing
if MONGO_URI is None:
    raise ValueError("no Mongo URI")

# Open a connection to MongoDB Atlas using the URI with certifi SSL certs
client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())

# Select the 'news_sentiment' database (created automatically if it doesn't exist)
db = client["news_sentiment"]

# Select the 'sentiment_results' collection (like a table in SQL)
sentiment_collection = db["sentiment_results"]


def save_results(ticker, results):
    """
    Save screener results for a ticker to MongoDB.
    results: list of dicts from screener.py
    """
    # Build a document (just a Python dict) to insert
    document = {
        "ticker": ticker,
        "results": results
    }

    # Insert the document into the collection
    sentiment_collection.insert_one(document)

    print(f"Saved result for {ticker}: {results}")