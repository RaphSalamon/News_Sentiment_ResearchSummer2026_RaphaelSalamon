import { useState } from 'react'
import { Plus, X, Loader2, TriangleAlert } from 'lucide-react'
import { screenStocks } from '../api/client'

const MAX_STOCKS = 5

function scoreToBarWidth(score) {
  const clamped = Math.max(-1, Math.min(1, score))
  return Math.round(((clamped + 1) / 2) * 100)
}

function VerdictBox({ label, score }) {
  const l = label?.toUpperCase()
  const modifier =
    l === 'BUY' ? '' : l === 'HOLD' ? ' verdict-box--hold' : ' verdict-box--avoid'
  const displayScore = typeof score === 'number'
    ? `${score >= 0 ? '+' : ''}${score.toFixed(4)}`
    : score
  const barWidth = scoreToBarWidth(score)

  const descriptions = {
    BUY:   'Positive news sentiment detected across recent headlines.',
    HOLD:  'Mixed or neutral sentiment detected in recent coverage.',
    AVOID: 'Negative news sentiment detected across recent headlines.',
  }

  return (
    <div className={`verdict-box${modifier}`}>
      <div className="verdict-box__left">
        <div className="v-tag">Sentiment Verdict</div>
        <div className="v-word">{l}</div>
        <div className="v-desc">{descriptions[l] ?? ''}</div>
      </div>
      <div className="verdict-box__right">
        <div className="v-score-label">Sentiment Score</div>
        <div className="v-score">{displayScore}</div>
        <div className="v-bar-wrap">
          <div className="v-bar-track">
            <div className="v-bar-fill" style={{ width: `${barWidth}%` }} />
          </div>
          <div className="v-bar-labels"><span>AVOID</span><span>BUY</span></div>
        </div>
      </div>
    </div>
  )
}

function FundamentalsPills({ data }) {
  if (!data) return null
  const items = [
    data.price             && { label: 'Price',     value: `$${data.price}` },
    data.pe_ratio          && { label: 'P/E',        value: data.pe_ratio?.toFixed(1) },
    data.forward_pe        && { label: 'Fwd P/E',    value: data.forward_pe?.toFixed(1) },
    data.dividend_yield_pct != null && { label: 'Div Yield', value: `${data.dividend_yield_pct}%` },
    data.beta              && { label: 'Beta',       value: data.beta?.toFixed(2) },
    data.market_cap        && { label: 'Mkt Cap',    value: data.market_cap },
    data.recommendation    && { label: 'Analysts',   value: data.recommendation },
    data.target_price      && { label: 'Target',     value: `$${data.target_price}` },
    data.price_trend       && { label: '30d Trend',  value: data.price_trend === 'uptrend' ? '📈 Up' : data.price_trend === 'downtrend' ? '📉 Down' : '➡️ Flat' },
  ].filter(Boolean)

  if (!items.length) return null

  return (
    <div className="result-card__fundamentals">
      {items.map((item) => (
        <span className="fund-pill" key={item.label}>
          <strong>{item.label}:</strong> {item.value}
        </span>
      ))}
    </div>
  )
}

// onResults: optional callback to share results upward to App.jsx
// so MarketOverviewPage can auto-populate the watchlist
export default function ScreenerPage({ onResults }) {
  const [stocks, setStocks] = useState([])
  const [tickerInput, setTickerInput]   = useState('')
  const [companyInput, setCompanyInput] = useState('')
  const [results, setResults]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  const canAdd = stocks.length < MAX_STOCKS

  function handleAddStock() {
    const ticker  = tickerInput.trim().toUpperCase()
    const company = companyInput.trim()
    if (!ticker || !company) return
    if (stocks.some((s) => s.ticker === ticker)) {
      setTickerInput(''); setCompanyInput(''); return
    }
    setStocks((prev) => [...prev, { ticker, companyName: company }])
    setTickerInput(''); setCompanyInput('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleAddStock()
  }

  function handleRemove(ticker) {
    setStocks((prev) => prev.filter((s) => s.ticker !== ticker))
  }

  async function handleSearch() {
    if (!stocks.length) return
    setLoading(true); setError(null); setResults(null)
    try {
      const payload = stocks.map((s) => ({ ticker: s.ticker, company_name: s.companyName }))
      const data = await screenStocks(payload)
      setResults(data.results)
      // Share results upward so Market Overview can auto-populate the watchlist
      if (onResults) {
        onResults(
          data.results
            .filter((r) => !r.error)
            .map((r) => ({ ticker: r.ticker, company_name: r.company_name }))
        )
      }
    } catch {
      setError('Could not reach the sentiment service. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="screener">
      <div className="screener__label">Sentiment Analysis</div>
      <div className="screener__title">Analyze up to 5 stocks</div>

      <div className="screener__row">
        <div className="screener__input-group">
          <input
            className="screener__input"
            placeholder="Ticker — e.g. AAPL"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={6}
          />
          <input
            className="screener__input"
            placeholder="Company name — e.g. Apple"
            value={companyInput}
            onChange={(e) => setCompanyInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          type="button"
          className="btn-plus"
          onClick={handleAddStock}
          disabled={!canAdd}
          aria-label="Add stock"
          title={canAdd ? 'Add stock' : 'Maximum 5 stocks'}
        >
          <Plus size={20} />
        </button>
        <button
          type="button"
          className="btn-search"
          onClick={handleSearch}
          disabled={!stocks.length || loading}
        >
          {loading ? <><Loader2 size={16} className="spin" /> Analyzing…</> : 'Analyze →'}
        </button>
      </div>

      {stocks.length > 0 && (
        <div className="screener__chips">
          {stocks.map((s) => (
            <span className="chip" key={s.ticker}>
              <span className="chip__ticker">{s.ticker}</span>
              <span className="chip__name">{s.companyName}</span>
              <button
                type="button"
                className="chip__remove"
                onClick={() => handleRemove(s.ticker)}
                aria-label={`Remove ${s.ticker}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <p className="screener__error">{error}</p>}

      {results && (
        <>
          <hr className="screener__divider" />
          <ul className="results">
            {results.map((r) => (
              <li className="result-card" key={r.ticker}>
                <div className="result-card__header">
                  <div className="result-card__identity">
                    <span className="result-card__ticker">{r.ticker}</span>
                    <span className="result-card__company">{r.company_name}</span>
                  </div>
                  {r.fundamentals?.price && (
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15 }}>
                      ${r.fundamentals.price}
                    </span>
                  )}
                </div>
                {r.error ? (
                  <p style={{ padding: '0 18px 16px', color: 'var(--color-ink-soft)', fontStyle: 'italic' }}>
                    {r.error}
                  </p>
                ) : (
                  <>
                    <VerdictBox label={r.label} score={r.score} />
                    <FundamentalsPills data={r.fundamentals} />
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="disclaimer" style={{ marginTop: results ? 20 : 24 }}>
        <TriangleAlert size={16} />
        <p>
          These recommendations reflect recent news sentiment only, not deep financial
          analysis. This is <u>not financial advice</u> — always do your own research and
          consult a licensed advisor before making investment decisions.
        </p>
      </div>
    </section>
  )
}