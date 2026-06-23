import { useState } from 'react'
import { Plus, X, Loader2, TriangleAlert } from 'lucide-react'
import StockBadge from './StockBadge'
import { screenStocks } from '../api/client'

const MAX_STOCKS = 5

export default function ScreenerPage() {
  const [stocks, setStocks] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [tickerInput, setTickerInput] = useState('')
  const [companyInput, setCompanyInput] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const canAddMore = stocks.length < MAX_STOCKS

  function handleAddStock(e) {
    e.preventDefault()
    const ticker = tickerInput.trim().toUpperCase()
    const companyName = companyInput.trim()
    if (!ticker || !companyName) return

    const alreadyAdded = stocks.some((s) => s.ticker === ticker)
    if (!alreadyAdded) {
      setStocks((prev) => [...prev, { ticker, companyName }])
    }

    setTickerInput('')
    setCompanyInput('')
    setShowForm(false)
  }

  function handleRemoveStock(ticker) {
    setStocks((prev) => prev.filter((s) => s.ticker !== ticker))
  }

  async function handleCheckSentiment() {
    if (stocks.length === 0) return
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const payload = stocks.map((s) => ({
        ticker: s.ticker,
        company_name: s.companyName,
      }))
      const data = await screenStocks(payload)
      setResults(data.results)
    } catch {
      setError(
        'Could not reach the sentiment service. Make sure the backend is running.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="screener">
      <div className="screener__chips">
        {stocks.map((s) => (
          <span className="chip" key={s.ticker}>
            <span className="chip__ticker">{s.ticker}</span>
            <span className="chip__name">{s.companyName}</span>
            <button
              type="button"
              className="chip__remove"
              onClick={() => handleRemoveStock(s.ticker)}
              aria-label={`Remove ${s.ticker}`}
            >
              <X size={14} />
            </button>
          </span>
        ))}

        {canAddMore && !showForm && (
          <button
            type="button"
            className="chip chip--add"
            onClick={() => setShowForm(true)}
          >
            <Plus size={16} />
            Add stock
          </button>
        )}
      </div>

      {showForm && (
        <form className="add-form" onSubmit={handleAddStock}>
          <input
            className="add-form__input"
            placeholder="Ticker, e.g. AAPL"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            maxLength={6}
            autoFocus
          />
          <input
            className="add-form__input"
            placeholder="Company name, e.g. Apple"
            value={companyInput}
            onChange={(e) => setCompanyInput(e.target.value)}
          />
          <button type="submit" className="add-form__confirm">
            Add
          </button>
          <button
            type="button"
            className="add-form__cancel"
            onClick={() => setShowForm(false)}
          >
            Cancel
          </button>
        </form>
      )}

      <button
        type="button"
        className="screener__submit"
        onClick={handleCheckSentiment}
        disabled={stocks.length === 0 || loading}
      >
        {loading ? (
          <>
            <Loader2 size={18} className="spin" />
            Reading the news...
          </>
        ) : (
          'Check sentiment'
        )}
      </button>

      {error && <p className="screener__error">{error}</p>}

      {results && (
        <ul className="results">
          {results.map((r) => (
            <li className="results__row" key={r.ticker}>
              <div className="results__identity">
                <span className="results__ticker">{r.ticker}</span>
                <span className="results__company">{r.company_name}</span>
              </div>
              {r.error ? (
                <span className="results__issue">{r.error}</span>
              ) : (
                <StockBadge label={r.label} score={r.score} />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="disclaimer">
        <TriangleAlert size={16} aria-hidden="true" />
        <p>
          These recommendations reflect recent news sentiment only, not deep
          financial analysis. This is not financial advice — always do your
          own research before making investment decisions.
        </p>
      </div>
    </section>
  )
}
