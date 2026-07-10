from flask import Flask, request, jsonify
from flask_cors import CORS

from classifier import classify_sentiment, analyze_headlines
from preprocessor import filter_relevant_headlines
from rss_fetcher import search_ticker
from db import save_results, save_top50_results, save_chat_history, get_chat_history
from fundamentals import get_fundamentals
from top50 import build_top50
from chatbot import chat as chatbot_chat
from watchlist import get_watchlist_data

app = Flask(__name__)
CORS(app)


@app.route('/')
def home():
    return 'StockBuddy API is running'


@app.route('/api/screener', methods=['POST'])
def screener():
    """
    Accepts 1-5 stocks, returns sentiment score + BUY/HOLD/AVOID + fundamentals for each.

    Expected JSON body:
    {
        "stocks": [
            {"ticker": "AAPL", "company_name": "Apple"},
            {"ticker": "TSLA", "company_name": "Tesla"}
        ]
    }
    """
    data = request.get_json()

    if not data or 'stocks' not in data:
        return jsonify({"error": "Request body must include a 'stocks' list."}), 400

    stocks = data['stocks']

    if not isinstance(stocks, list) or len(stocks) == 0:
        return jsonify({"error": "'stocks' must be a non-empty list."}), 400

    if len(stocks) > 5:
        return jsonify({"error": "You can search a maximum of 5 stocks at a time."}), 400

    results = []
    for stock in stocks:
        ticker = stock.get('ticker')
        company_name = stock.get('company_name')

        if not ticker or not company_name:
            results.append({
                "ticker": ticker,
                "error": "Each stock needs both 'ticker' and 'company_name'."
            })
            continue

        ticker = ticker.upper().strip()
        headlines = search_ticker(ticker, company_name)

        if not headlines:
            results.append({
                "ticker": ticker,
                "company_name": company_name,
                "error": "No recent headlines found for this ticker."
            })
            continue

        headlines = filter_relevant_headlines(headlines)
        score = float(analyze_headlines(headlines))
        label = classify_sentiment(score).strip()
        fundamentals = get_fundamentals(ticker)

        result = {
            "ticker": ticker,
            "company_name": company_name,
            "score": round(score, 4),
            "label": label,
            "headline_count": len(headlines),
            "fundamentals": fundamentals
        }
        results.append(result)
        save_results(ticker, {"score": score, "label": label})

    return jsonify({"results": results})


@app.route('/api/chat', methods=['POST'])
def chat_route():
    """
    Chatbot endpoint. Accepts a user message and a client_id.

    Expected JSON body:
    {
        "message": "What's the sentiment on Tesla?",
        "client_id": "stable device id from the frontend"
    }
    """
    data = request.get_json()

    if not data or 'message' not in data:
        return jsonify({"error": "Request body must include a 'message'."}), 400

    user_message = data['message']
    client_id = data.get('client_id')

    try:
        if client_id:
            history = get_chat_history(client_id)
        else:
            history = data.get('history', [])

        reply = chatbot_chat(user_message, conversation_history=history)

        if client_id:
            updated_history = history + [
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": reply},
            ]
            save_chat_history(client_id, updated_history)

        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/chat/history/<client_id>', methods=['GET'])
def chat_history_route(client_id):
    """Returns saved conversation for a given client_id."""
    try:
        history = get_chat_history(client_id)
        return jsonify({"history": history})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/top50', methods=['GET'])
def top50_route():
    """
    Returns the shortlist of stocks with 3%+ 7-day gain and BUY sentiment.
    Runs live on every request -- expect a few minutes.
    """
    try:
        results = build_top50(limit=50)
        save_top50_results(results)
        return jsonify({"results": results, "count": len(results)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/watchlist', methods=['POST'])
def watchlist_route():
    """
    Fetches sentiment + price change + relative volume for a user-defined
    ticker list, assigns each stock to a quadrant, and returns a signal score.

    Expected JSON body:
    {
        "stocks": [
            {"ticker": "AAPL", "company_name": "Apple"},
            {"ticker": "TSLA", "company_name": "Tesla"}
        ]
    }
    """
    data = request.get_json()

    if not data or 'stocks' not in data:
        return jsonify({"error": "Request body must include a 'stocks' list."}), 400

    stocks = data['stocks']

    if not isinstance(stocks, list) or len(stocks) == 0:
        return jsonify({"error": "'stocks' must be a non-empty list."}), 400

    try:
        results = get_watchlist_data(stocks)
        return jsonify({"results": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)