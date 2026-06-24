import { useState, useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { sendChatMessage } from '../api/client'

const WELCOME_MESSAGE = {
  role: 'assistant',
  content:
    "Hi! I can explain sentiment scores, P/E ratios, or what's behind a stock's rating. What would you like to know?",
}

export default function ChatPage() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const userMessage = { role: 'user', content: text }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      // Send everything before the new message as history; the backend
      // appends the new user message itself.
      const history = messages
        .filter((m) => m !== WELCOME_MESSAGE)
        .map((m) => ({ role: m.role, content: m.content }))

      const data = await sendChatMessage(text, history)
      setMessages([...updatedMessages, { role: 'assistant', content: data.reply }])
    } catch {
      setError('Could not reach the assistant. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="chat">
      <div className="chat__window">
        {messages.map((m, i) => (
          <div key={i} className={`chat__bubble chat__bubble--${m.role}`}>
            {m.content}
          </div>
        ))}

        {loading && (
          <div className="chat__bubble chat__bubble--assistant chat__bubble--loading">
            <Loader2 size={14} className="spin" />
            Thinking...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && <p className="chat__error">{error}</p>}

      <form className="chat__form" onSubmit={handleSend}>
        <input
          className="chat__input"
          placeholder="Ask about any stock or sentiment term..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className="chat__send"
          disabled={loading || !input.trim()}
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </form>

      <p className="chat__disclaimer-note">
        This assistant pulls real sentiment and fundamentals data — not financial advice.
      </p>
    </section>
  )
}
