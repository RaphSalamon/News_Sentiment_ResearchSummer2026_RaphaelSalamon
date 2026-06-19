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


# Separate collection just for top-50 snapshots, so it doesn't mix with
# the per-ticker history in sentiment_collection above.
top50_collection = db["top50_snapshots"]


def save_top50_results(results_list):
    """
    Save (overwrite) the latest top-50 snapshot.
    Uses upsert with a fixed _id so we always have exactly ONE current
    snapshot document instead of a new one piling up every run.
    """
    document = {
        "_id": "latest_top50",
        "results": results_list
    }
    top50_collection.replace_one({"_id": "latest_top50"}, document, upsert=True)
    print(f"Saved top 50 snapshot ({len(results_list)} stocks)")


def get_cached_top50():
    """
    Returns the most recent top-50 snapshot, or None if one hasn't been saved yet.
    """
    doc = top50_collection.find_one({"_id": "latest_top50"})
    if doc is None:
        return None
    return doc.get("results", [])