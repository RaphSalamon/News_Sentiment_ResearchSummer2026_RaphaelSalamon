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
from finviz_auth import pull_screener

app = Flask(__name__)
CORS(app)


@app.route('/')
def home():
    return 'StockBuddy API is running'


@app.route('/api/screener', methods=['POST'])
def screener():
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
        ticker       = stock.get('ticker')
        company_name = stock.get('company_name')
        if not ticker or not company_name:
            results.append({"ticker": ticker, "error": "Each stock needs both 'ticker' and 'company_name'."})
            continue
        ticker = ticker.upper().strip()
        headlines = search_ticker(ticker, company_name)
        if not headlines:
            results.append({"ticker": ticker, "company_name": company_name, "error": "No recent headlines found."})
            continue
        headlines = filter_relevant_headlines(headlines)
        score        = float(analyze_headlines(headlines))
        label        = classify_sentiment(score).strip()
        fundamentals = get_fundamentals(ticker)
        result = {
            "ticker": ticker, "company_name": company_name,
            "score": round(score, 4), "label": label,
            "headline_count": len(headlines), "fundamentals": fundamentals
        }
        results.append(result)
        save_results(ticker, {"score": score, "label": label})
    return jsonify({"results": results})


@app.route('/api/chat', methods=['POST'])
def chat_route():
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({"error": "Request body must include a 'message'."}), 400
    user_message = data['message']
    client_id    = data.get('client_id')
    try:
        history = get_chat_history(client_id) if client_id else data.get('history', [])
        reply   = chatbot_chat(user_message, conversation_history=history)
        if client_id:
            updated = history + [
                {"role": "user",      "content": user_message},
                {"role": "assistant", "content": reply},
            ]
            save_chat_history(client_id, updated)
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/chat/history/<client_id>', methods=['GET'])
def chat_history_route(client_id):
    try:
        return jsonify({"history": get_chat_history(client_id)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/top50', methods=['GET'])
def top50_route():
    try:
        results = build_top50(limit=50)
        save_top50_results(results)
        return jsonify({"results": results, "count": len(results)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/watchlist', methods=['POST'])
def watchlist_route():
    data = request.get_json()
    if not data or 'stocks' not in data:
        return jsonify({"error": "Request body must include a 'stocks' list."}), 400
    stocks = data['stocks']
    if not isinstance(stocks, list) or len(stocks) == 0:
        return jsonify({"error": "'stocks' must be a non-empty list."}), 400
    try:
        return jsonify({"results": get_watchlist_data(stocks)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/auto-analyze', methods=['POST'])
def auto_analyze_route():
    """
    Machine-based automated scanner:
      1. Logs into Finviz Elite with credentials from .env
      2. Pulls a live ticker list from the screener based on user-selected filters
      3. Runs the full watchlist pipeline (sentiment + price + volume) on all tickers
      4. Returns enriched results ready for the 3D chart

    Expected JSON body:
    {
        "cap_tier":       "Large",       // market cap tier (or "All")
        "sector":         "Technology",  // sector filter (or "All")
        "limit":          30,            // how many stocks to scan (max 100)
        "min_avg_volume": 500000         // minimum average daily volume
    }

    This is the automated path -- no manual stock entry required.
    The frontend scanner panel calls this and renders results directly in the 3D chart.
    """
    data = request.get_json() or {}

    cap_tier       = data.get("cap_tier",       "All")
    sector         = data.get("sector",         "All")
    limit          = min(int(data.get("limit",  30)), 100)
    min_avg_volume = int(data.get("min_avg_volume", 200_000))

    try:
        # Step 1: Pull tickers from Finviz Elite screener
        tickers = pull_screener(
            cap_tier=cap_tier,
            sector=sector,
            min_avg_volume=min_avg_volume,
            limit=limit,
        )

        if not tickers:
            return jsonify({
                "results": [],
                "message": "Finviz screener returned no tickers for these filters.",
                "finviz_ticker_count": 0
            })

        # Step 2: Run full watchlist analysis on all tickers
        # (sentiment + 10-day price/volume history + market cap + signal score)
        results = get_watchlist_data(tickers)

        return jsonify({
            "results": results,
            "finviz_ticker_count": len(tickers),
            "analyzed_count": len([r for r in results if not r.get("error")])
        })

    except ConnectionError as e:
        # Finviz login or screener export failed — return a clear user-facing message
        return jsonify({
            "error": str(e),
            "hint": "Check that FINVIZ_EMAIL and FINVIZ_PASSWORD are set correctly in your .env file."
        }), 503

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)