import { useState, useRef, useEffect } from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'
import { sendChatMessage, fetchChatHistory, getClientId } from '../api/client'

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: "Hi! I'm StockBuddy's AI. Ask me about any stock — sentiment scores, P/E ratios, dividends, analyst ratings, or what's behind a recommendation.",
}

export default function ChatPage() {
  const [clientId] = useState(() => getClientId())
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const saved = await fetchChatHistory(clientId)
        if (active && saved?.length) setMessages(saved)
      } catch { /* silent -- starting fresh is fine */ }
    }
    load()
    return () => { active = false }
  }, [clientId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const data = await sendChatMessage(text, clientId)
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setError('Could not reach the assistant. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="chat-container">
        {/* Header */}
        <div className="chat-header">
          <span className="chat-header__dot" />
          <span className="chat-header__name">StockBuddy AI</span>
          <span className="chat-header__model">Llama 3.3 · FinBERT · yfinance</span>
        </div>

        {/* Messages */}
        <div className="chat__window">
          {messages.map((m, i) => (
            <div key={i} className={`chat__bubble chat__bubble--${m.role}`}>
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="chat__bubble chat__bubble--assistant chat__bubble--loading">
              <Loader2 size={14} className="spin" />
              Analyzing…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="chat__error">{error}</p>}

        {/* Input */}
        <form className="chat__form" onSubmit={handleSend}>
          <input
            className="chat__input"
            placeholder="Ask about any stock — e.g. 'What risks does Tesla face?'"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="chat__send" disabled={loading || !input.trim()}>
            Send ↑
          </button>
        </form>

        <p className="chat__disclaimer-note">
          Conversations saved on this device only.
        </p>
      </div>

      {/* Prominent disclaimer matching wireframe */}
      <div className="disclaimer">
        <TriangleAlert size={16} />
        <p>
          <strong>⚠️ Important Disclaimer:</strong> StockBuddy AI provides analysis
          based on news sentiment only. This is <u>NOT financial advice</u>. Do not make
          investment decisions solely based on this tool. Always consult a licensed
          financial advisor and conduct your own independent research.
        </p>
      </div>
    </div>
  )
}