"""
chatbot.py

StockBuddy AI chatbot using Groq with tool-calling.
Updated model: openai/gpt-oss-120b (llama-3.3-70b-versatile deprecated June 2026)
"""

import os
import json
import traceback
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
MODEL = "openai/gpt-oss-120b"

SYSTEM_PROMPT = """You are StockBuddy AI, a concise financial sentiment assistant.

RULES:
- Keep responses SHORT and SIMPLE. Max 5-6 bullet points or 3-4 sentences.
- Use plain English. Explain any financial term you use.
- Lead with the most important takeaway first.
- NEVER make up numbers. Call the appropriate tool to get real data.
- Always end analysis with: ⚠️ Not financial advice. Do your own research.
- Use **bold** for key numbers and terms, bullet points for lists.
- If asked a simple question, give a simple answer. Don't over-explain.
- Interpret data for the user — say what the numbers mean, not just what they are.
- For analyst recommendations: 1-1.5=Strong Buy, 1.5-2.5=Buy, 2.5-3.5=Hold, 3.5+=Sell
- For beta: <1=less volatile than market, >1=more volatile, >1.5=significantly riskier
- For dividend yield: >3% = income-friendly, >6% = question sustainability
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
            "description": "Explain how FinBERT sentiment scoring and BUY/HOLD/AVOID classification works.",
            "parameters": {"type": "object", "properties": {}}
        }
    }
]


def get_sentiment_score(ticker, company_name):
    try:
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
            "note": "Score > +0.15 = BUY, < -0.15 = AVOID, in between = HOLD."
        }
    except Exception as e:
        return {"error": f"Sentiment analysis failed: {str(e)}"}


def get_fundamentals_data(ticker):
    try:
        data = get_fundamentals(ticker)
        if data is None:
            return {"error": f"No fundamentals data found for {ticker}."}
        return data
    except Exception as e:
        return {"error": f"Fundamentals fetch failed: {str(e)}"}


def get_comprehensive_analysis(ticker, company_name):
    sentiment     = get_sentiment_score(ticker, company_name)
    fundamentals  = get_fundamentals_data(ticker)
    return {
        "ticker":        ticker,
        "company_name":  company_name,
        "sentiment":     sentiment,
        "fundamentals":  fundamentals,
        "analysis_note": (
            "Give a SHORT, PLAIN-ENGLISH summary (4-5 bullet points max). "
            "Lead with the verdict. Note any divergences. End with the disclaimer."
        )
    }


def explain_finbert():
    return {
        "explanation": (
            "FinBERT scores news headlines from -1 (very negative) to +1 (very positive). "
            "Above +0.15 = BUY, below -0.15 = AVOID, in between = HOLD. "
            "It reflects recent news tone only, not fundamental analysis."
        )
    }


AVAILABLE_FUNCTIONS = {
    "get_sentiment_score":       get_sentiment_score,
    "get_fundamentals_data":     get_fundamentals_data,
    "get_comprehensive_analysis": get_comprehensive_analysis,
    "explain_finbert":           explain_finbert,
}


def chat(user_message, conversation_history=None):
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
        temperature=0.2,
        max_completion_tokens=800,
    )

    response_message = response.choices[0].message
    tool_calls       = response_message.tool_calls

    if not tool_calls:
        return response_message.content

    messages.append({
        "role":    "assistant",
        "content": response_message.content,
        "tool_calls": [
            {
                "id":   tc.id,
                "type": "function",
                "function": {
                    "name":      tc.function.name,
                    "arguments": tc.function.arguments,
                },
            }
            for tc in tool_calls
        ],
    })

    for tool_call in tool_calls:
        function_name   = tool_call.function.name
        function_to_call = AVAILABLE_FUNCTIONS.get(function_name)

        if function_to_call is None:
            function_response = {"error": f"Unknown tool: {function_name}"}
        else:
            try:
                function_args     = json.loads(tool_call.function.arguments)
                function_response = function_to_call(**function_args)
            except Exception as e:
                function_response = {"error": str(e)}

        messages.append({
            "role":         "tool",
            "tool_call_id": tool_call.id,
            "content":      json.dumps(function_response)
        })

    final_response = client.chat.completions.create(
        model=MODEL,
        messages=cast(Any, messages),
        temperature=0.2,
        max_completion_tokens=800,
    )

    return final_response.choices[0].message.content


if __name__ == "__main__":
    print(chat("How is Apple doing?"))
    print("---")
    print(chat("Is NVDA risky?"))