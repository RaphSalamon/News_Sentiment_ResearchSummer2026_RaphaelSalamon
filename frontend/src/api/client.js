import axios from 'axios'

// Set VITE_API_URL in a .env file when deploying (e.g. your Railway URL).
// Defaults to local Flask dev server.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000'

const client = axios.create({ baseURL: API_BASE_URL })

/**
 * stocks: [{ ticker: 'AAPL', company_name: 'Apple' }, ...]
 * Matches the payload shape /api/screener expects.
 */
export async function screenStocks(stocks) {
  const response = await client.post('/api/screener', { stocks })
  return response.data
}

/**
 * message: the new user message string
 * history: prior turns as [{ role: 'user' | 'assistant', content: '...' }, ...]
 * (does NOT include the new message — the backend appends that itself)
 */
export async function sendChatMessage(message, history = []) {
  const response = await client.post('/api/chat', { message, history })
  return response.data
}

/**
 * Top 50 by sentiment. This is genuinely slow (FinBERT across ~50 tickers),
 * so give it a generous timeout instead of the client's default.
 */
export async function fetchTop50() {
  const response = await client.get('/api/top50', { timeout: 360000 }) // 6 min
  return response.data
}
