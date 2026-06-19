"""
chatbot.py

A Groq (Llama 3.3) -backed chatbot that can answer questions about stocks
using REAL data instead of hallucinating numbers. It does this through
tool calling: the LLM decides when it needs live data, calls one of the
Python functions below, and uses the actual result in its answer.

Tools available to the model:
  - get_sentiment_score(ticker, company_name): runs YOUR existing pipeline
    (rss_fetcher.search_ticker -> classifier.analyze_headlines/classify_sentiment)
  - get_fundamentals_data(ticker): P/E ratio, market cap, sector, etc. via fundamentals.py
  - explain_finbert(): static explainer text about what FinBERT/sentiment scoring means

This keeps the chatbot from making up P/E ratios or sentiment scores -- if it
states a number, that number came from a real function call.
"""

import os
import json
from groq import Groq
from dotenv import load_dotenv

from rss_fetcher import search_ticker
from classifier import classify_sentiment, analyze_headlines
from fundamentals import get_fundamentals

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if GROQ_API_KEY is None:
    raise ValueError("no Groq API key -- set GROQ_API_KEY in .env")

client = Groq(api_key=GROQ_API_KEY)
MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """You are a financial sentiment analysis assistant for a stock research tool.

You help users understand:
- News sentiment for specific stocks (BUY/HOLD/AVOID verdicts from FinBERT analysis of recent headlines)
- Fundamentals like P/E ratio, market cap, and sector
- General concepts like what a P/E ratio means, how FinBERT sentiment scoring works,
  and what BUY/HOLD/AVOID labels mean in this app

RULES:
- NEVER make up a sentiment score, P/E ratio, or any other number. If you need
  real data, call the appropriate tool.
- This app's verdicts (BUY/HOLD/AVOID) are based on news sentiment over a short
  window, not deep fundamental analysis. Be clear about that limitation if asked.
- You are not a licensed financial advisor. Don't tell users what to do with
  their money -- explain the data and let them decide.
- If a tool returns no data for a ticker, say so plainly rather than guessing.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_sentiment_score",
            "description": (
                "Get the current news sentiment score and BUY/HOLD/AVOID verdict "
                "for a stock ticker, based on recent headlines run through FinBERT."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "description": "Stock ticker symbol, e.g. AAPL"},
                    "company_name": {"type": "string", "description": "Company name, e.g. Apple"}
                },
                "required": ["ticker", "company_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_fundamentals_data",
            "description": (
                "Get fundamental data for a stock ticker: P/E ratio, forward P/E, "
                "market cap, sector, industry, and current price."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "description": "Stock ticker symbol, e.g. AAPL"}
                },
                "required": ["ticker"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "explain_finbert",
            "description": (
                "Get a static explanation of how this app's FinBERT sentiment "
                "scoring and BUY/HOLD/AVOID classification works."
            ),
            "parameters": {"type": "object", "properties": {}}
        }
    }
]


def get_sentiment_score(ticker, company_name):
    headlines = search_ticker(ticker, company_name)
    if not headlines:
        return {"error": f"No recent headlines found for {ticker}."}

    score = analyze_headlines(headlines)
    label = classify_sentiment(score).strip()
    return {
        "ticker": ticker,
        "score": round(score, 4),
        "label": label,
        "headline_count": len(headlines)
    }


def get_fundamentals_data(ticker):
    data = get_fundamentals(ticker)
    if data is None:
        return {"error": f"No fundamentals data found for {ticker}."}
    return data


def explain_finbert():
    return {
        "explanation": (
            "This app uses FinBERT (ProsusAI/finbert), a version of BERT fine-tuned "
            "specifically on financial text. For each headline, FinBERT outputs three "
            "probabilities: positive, negative, and neutral. The compound score is "
            "calculated as positive minus negative. Scores across all headlines for a "
            "ticker are averaged. A score above +0.15 is classified BUY, below -0.15 "
            "is classified AVOID, and anything in between is HOLD. This reflects "
            "recent news tone, not a full fundamental or technical analysis."
        )
    }


# Maps tool names the model can call to the actual Python functions above
AVAILABLE_FUNCTIONS = {
    "get_sentiment_score": get_sentiment_score,
    "get_fundamentals_data": get_fundamentals_data,
    "explain_finbert": explain_finbert,
}


def chat(user_message, conversation_history=None):
    """
    Main entry point. Send a user message (plus optional prior history),
    get back the assistant's reply as a string.

    conversation_history: list of {"role": ..., "content": ...} dicts from
    previous turns, NOT including the system prompt or this new user_message.
    """
    if conversation_history is None:
        conversation_history = []

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(conversation_history)
    messages.append({"role": "user", "content": user_message})

    # First call: let the model decide if it needs a tool
    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",
        temperature=0.3,
        max_completion_tokens=1024,
    )

    response_message = response.choices[0].message
    tool_calls = response_message.tool_calls

    if not tool_calls:
        # No tool needed -- model answered directly
        return response_message.content

    # Model wants to call one or more tools. Append its tool-call message,
    # then run each tool and append the result.
    messages.append(response_message)

    for tool_call in tool_calls:
        function_name = tool_call.function.name
        function_to_call = AVAILABLE_FUNCTIONS.get(function_name)

        if function_to_call is None:
            function_response = {"error": f"Unknown tool: {function_name}"}
        else:
            try:
                function_args = json.loads(tool_call.function.arguments)
                function_response = function_to_call(**function_args)
            except Exception as e:
                function_response = {"error": str(e)}

        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps(function_response)
        })

    # Second call: model summarizes the tool result(s) into a real answer
    final_response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.3,
        max_completion_tokens=1024,
    )

    return final_response.choices[0].message.content


if __name__ == '__main__':
    print(chat("What's the sentiment on Tesla right now?"))
    print("---")
    print(chat("What's a P/E ratio and what's Apple's right now?"))