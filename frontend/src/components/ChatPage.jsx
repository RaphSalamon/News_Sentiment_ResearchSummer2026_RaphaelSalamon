import { useState, useRef, useEffect } from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'
import { sendChatMessage, fetchChatHistory, getClientId } from '../api/client'

const WELCOME = {
  role: 'assistant',
  content: "Welcome to StockBuddy AI. Ask me about any stock — sentiment scores, P/E ratios, dividends, analyst ratings, or what's driving a recommendation.",
}

export default function ChatPage() {
  const [clientId]                  = useState(() => getClientId())
  const [messages, setMessages]     = useState([WELCOME])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const bottomRef                   = useRef(null)

  useEffect(() => {
    let active = true
    fetchChatHistory(clientId).then((saved) => {
      if (active && saved?.length) setMessages(saved)
    }).catch(() => {})
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
      setError('Could not reach the assistant. Make sure app.py is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-hero">
        <div className="page-hero__eyebrow">AI Assistant</div>
        <h1 className="page-hero__title">StockBuddy AI</h1>
        <p className="page-hero__sub">Powered by Llama 3.3 · FinBERT · yfinance · Conversations saved on this device</p>
      </div>

      <div className="chat-container">
        <div className="chat-header">
          <span className="chat-header__dot" />
          <span className="chat-header__name">StockBuddy AI</span>
          <span className="chat-header__model">llama-3.3-70b · finbert · yfinance</span>
        </div>

        <div className="chat__window">
          {messages.map((m, i) => (
            <div key={i} className={`chat__bubble chat__bubble--${m.role}`}>
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="chat__bubble chat__bubble--assistant chat__bubble--loading">
              <Loader2 size={13} className="spin" />
              Analyzing…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="chat__error">{error}</p>}

        <form className="chat__form" onSubmit={handleSend}>
          <input
            className="chat__input"
            placeholder="Ask about any stock — e.g. 'What risks does NVDA face right now?'"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="chat__send" disabled={loading || !input.trim()}>
            Send ↑
          </button>
        </form>

        <p className="chat__disclaimer-note">
          Real data · Not financial advice
        </p>
      </div>

      <div className="disclaimer" style={{ marginTop: 20 }}>
        <TriangleAlert size={15} />
        <p>
          <strong style={{ color: 'var(--gold)' }}>Disclaimer:</strong> StockBuddy AI provides analysis based on news sentiment only.
          This is NOT financial advice. Always consult a licensed financial advisor before making investment decisions.
        </p>
      </div>
    </div>
  )
}