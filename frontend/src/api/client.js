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
