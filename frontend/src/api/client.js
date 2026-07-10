import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000'
const client = axios.create({ baseURL: API_BASE_URL })

const CLIENT_ID_KEY = 'stockbuddy_client_id'

export function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY)
  if (!id) {
    id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(CLIENT_ID_KEY, id)
  }
  return id
}

export async function screenStocks(stocks) {
  const response = await client.post('/api/screener', { stocks })
  return response.data
}

export async function sendChatMessage(message, clientId) {
  const response = await client.post('/api/chat', { message, client_id: clientId })
  return response.data
}

export async function fetchChatHistory(clientId) {
  const response = await client.get(`/api/chat/history/${clientId}`)
  return response.data.history
}

export async function fetchTop50() {
  const response = await client.get('/api/top50', { timeout: 360000 })
  return response.data
}

/**
 * stocks: [{ ticker: 'AAPL', company_name: 'Apple' }, ...]
 * Returns enriched watchlist data with quadrant + signal score per ticker.
 */
export async function fetchWatchlistData(stocks) {
  const response = await client.post('/api/watchlist', { stocks }, { timeout: 120000 })
  return response.data
}