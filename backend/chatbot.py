"""
chatbot.py

A Groq (Llama 3.3) -backed chatbot with tool-calling into your real data
pipeline. The model is equipped to give genuine financial insights by
synthesizing sentiment scores, P/E ratios, dividends, analyst ratings,
price trends, and growth metrics -- always with a clear disclaimer.

Tools:
  - get_sentiment_score(ticker, company_name): FinBERT pipeline
  - get_fundamentals_data(ticker): full fundamentals from yfinance
  - get_comprehensive_analysis(ticker, company_name): both combined,
    for when the user wants a real synthesized take on a stock
  - explain_finbert(): static explainer about the scoring model
"""

import os
import json
from typing import Any, cast
from groq import Groq
from dotenv import load_dotenv

from rss_fetcher import search_ticker
from classifier import classify_sentiment, analyze_headlines
from preprocessor import filter_relevant_headlines
from fundamentals import get_fundamentals

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if GROQ_API_KEY is None:
    raise ValueError("no Groq API key -- set GROQ_API_KEY in .env")

client = Groq(api_key=GROQ_API_KEY)
MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """You are a financial analyst assistant for a stock sentiment research tool.
You have access to real, live data including news sentiment scores, P/E ratios, dividends,
analyst ratings, price trends, EPS, beta, 52-week ranges, and growth metrics.

Your role is to give users genuine, data-driven financial insights -- not just explain
what terms mean, but actually synthesize the data into a real opinion. When you have
enough data, tell users what the numbers suggest, what the risks look like, and what
the overall picture is.

RULES:
- NEVER make up numbers. Always call the appropriate tool to get real data.
- Give a genuine opinion based on what the data shows. Don't just repeat the numbers
  back -- interpret them. If a P/E is high relative to growth, say so. If sentiment
  is negative but analyst ratings are strong, flag that divergence.
- Always end any analysis or recommendation with this exact disclaimer:
  "⚠️ Disclaimer: This is not financial advice. Always do your own research and
  consult a licensed financial advisor before making investment decisions."
- Be specific. "The P/E of 28 is reasonable for a tech company growing revenue at 15%"
  is more useful than "the P/E ratio is 28."
- If data for a field is missing (returns None), skip that field rather than
  guessing or saying "N/A" repeatedly.
- For the 30-day price trend, interpret 'uptrend', 'downtrend', or 'flat' in
  plain English.
- For analyst recommendations, note the score context:
  1.0-1.5 = Strong Buy, 1.5-2.5 = Buy, 2.5-3.5 = Hold, 3.5-4.5 = Underperform, 4.5-5.0 = Sell
- Dividend yield: anything above 3% is generally considered income-friendly.
  Anything above 6% warrants a question about sustainability.
- Beta interpretation: below 1 = less volatile than the market,
  above 1 = more volatile, above 1.5 = significantly more volatile.
"""

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_sentiment_score",
            "description": (
                "Get the current FinBERT news sentiment score and BUY/HOLD/AVOID "
                "verdict for a stock ticker based on recent headlines."
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
                "Get comprehensive fundamental data for a stock: P/E ratio, forward P/E, "
                "PEG ratio, EPS, dividends, beta, 52-week range, analyst ratings and price "
                "targets, revenue/earnings growth, profit margins, debt-to-equity, free "
                "cashflow, and 30-day price trend."
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
            "name": "get_comprehensive_analysis",
            "description": (
                "Get BOTH sentiment AND full fundamentals for a stock in one call, "
                "for a complete synthesized analysis. Use this when the user wants "
                "a full picture or asks whether a stock is worth investing in."
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
    headlines = filter_relevant_headlines(headlines)
    score = analyze_headlines(headlines)
    label = classify_sentiment(score).strip()
    return {
        "ticker": ticker,
        "sentiment_score": round(float(score), 4),
        "verdict": label,
        "headline_count": len(headlines),
        "note": (
            "Score > +0.15 = BUY, < -0.15 = AVOID, in between = HOLD. "
            "Based on recent news headlines only."
        )
    }


def get_fundamentals_data(ticker):
    data = get_fundamentals(ticker)
    if data is None:
        return {"error": f"No fundamentals data found for {ticker}."}
    return data


def get_comprehensive_analysis(ticker, company_name):
    """Runs both tools and returns a combined dict the model can synthesize."""
    sentiment = get_sentiment_score(ticker, company_name)
    fundamentals = get_fundamentals_data(ticker)

    return {
        "ticker": ticker,
        "company_name": company_name,
        "sentiment": sentiment,
        "fundamentals": fundamentals,
        "analysis_note": (
            "Synthesize both the sentiment score and the fundamental data into "
            "a clear, honest assessment. Note any divergences (e.g. positive "
            "fundamentals but negative sentiment, or strong growth but high P/E). "
            "End with the disclaimer."
        )
    }


def explain_finbert():
    return {
        "explanation": (
            "This app uses FinBERT (ProsusAI/finbert), a BERT model fine-tuned on "
            "financial text. For each headline, it outputs positive, negative, and "
            "neutral probabilities. The compound score is positive minus negative, "
            "averaged across all relevant, de-duplicated headlines for the ticker. "
            "Score above +0.15 = BUY, below -0.15 = AVOID, in between = HOLD. "
            "This reflects short-term news tone, not deep fundamental analysis."
        )
    }


AVAILABLE_FUNCTIONS = {
    "get_sentiment_score": get_sentiment_score,
    "get_fundamentals_data": get_fundamentals_data,
    "get_comprehensive_analysis": get_comprehensive_analysis,
    "explain_finbert": explain_finbert,
}


def chat(user_message, conversation_history=None):
    """
    Main entry point. Sends a user message plus prior history,
    returns the assistant's reply as a string.
    """
    if conversation_history is None:
        conversation_history = []

    messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(conversation_history)
    messages.append({"role": "user", "content": user_message})

    response = client.chat.completions.create(
        model=MODEL,
        messages=cast(Any, messages),
        tools=cast(Any, TOOLS),
        tool_choice="auto",
        temperature=0.3,
        max_completion_tokens=1500,
    )

    response_message = response.choices[0].message
    tool_calls = response_message.tool_calls

    if not tool_calls:
        return response_message.content

    # Rebuild as plain dicts -- SDK objects aren't JSON-serializable, which
    # breaks the second API call. This was a real bug, now fixed.
    messages.append({
        "role": "assistant",
        "content": response_message.content,
        "tool_calls": [
            {
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                },
            }
            for tc in tool_calls
        ],
    })

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

    final_response = client.chat.completions.create(
        model=MODEL,
        messages=cast(Any, messages),
        temperature=0.3,
        max_completion_tokens=1500,
    )

    return final_response.choices[0].message.content


if __name__ == "__main__":
    print(chat("Give me a full analysis on Tesla -- sentiment, fundamentals, the works."))
    print("---")
    print(chat("Is Apple's dividend worth caring about?"))
    print("---")
    print(chat("How risky is NVDA compared to the broader market?"))