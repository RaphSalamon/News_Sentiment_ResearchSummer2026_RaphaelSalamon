# Stock Sentiment Analysis — News Sentiment Web App

Summer 2026 volunteer research project completed through Penn State University Park 
under Professor Kaamran Raahemifar. A full-stack news sentiment analysis web 
application that analyzes financial news headlines to generate Buy, Hold, or Avoid 
investment recommendations for stocks.

## Features

- **Stock Search** — search any ticker and get a Buy / Hold / Avoid recommendation 
  driven by real-time news sentiment
- **Market Overview** — ranked list of top 50 S&P 500 stocks by sentiment score, 
  with current price and 7-day price change
- **AI Chatbot** — ask questions about any stock's sentiment powered by Groq (Llama 3)
- **Simple / Advanced UI** — beginner-friendly plain English mode alongside a 
  detailed data view for experienced users
- **Disclaimer** — all recommendations include a research disclaimer; this app does 
  not constitute financial advice

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Axios, Recharts — hosted on Vercel |
| Backend | Python, Flask — hosted on Railway |
| Sentiment Model | FinBERT (ProsusAI/finbert) via HuggingFace |
| News Data | Yahoo Finance RSS, Reuters RSS, MarketWatch RSS |
| Stock Data | yfinance |
| Database | PostgreSQL via Supabase |
| Chatbot | Groq API (Llama 3) |
| Version Control | GitHub |

## Pipeline

## Project Status

🚧 In development — Summer 2026

## Author

Raphael Salamon — Penn State University, Computer Science Class of 2028
