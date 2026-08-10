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
  const mod = l === 'BUY' ? '' : l === 'HOLD' ? ' verdict-box--hold' : ' verdict-box--avoid'
  const fmt = typeof score === 'number' ? `${score >= 0 ? '+' : ''}${score.toFixed(4)}` : score
  const bar = scoreToBarWidth(score)
  const descs = {
    BUY:   'Positive news sentiment detected across recent headlines.',
    HOLD:  'Mixed or neutral sentiment in recent coverage.',
    AVOID: 'Negative news sentiment detected across recent headlines.',
  }
  return (
    <div className={`verdict-box${mod}`}>
      <div className="verdict-box__left">
        <div className="v-tag">Sentiment Verdict</div>
        <div className="v-word">{l}</div>
        <div className="v-desc">{descs[l] ?? ''}</div>
      </div>
      <div className="verdict-box__right">
        <div className="v-score-label">Score</div>
        <div className="v-score">{fmt}</div>
        <div className="v-bar-wrap">
          <div className="v-bar-track">
            <div className="v-bar-fill" style={{ width: `${bar}%` }} />
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
    data.dividend_yield_pct != null && { label: 'Div',   value: `${data.dividend_yield_pct}%` },
    data.beta              && { label: 'Beta',       value: data.beta?.toFixed(2) },
    data.market_cap        && { label: 'Mkt Cap',    value: data.market_cap },
    data.recommendation    && { label: 'Analysts',   value: data.recommendation },
    data.target_price      && { label: 'Target',     value: `$${data.target_price}` },
    data.price_trend       && { label: 'Trend 30d',  value: data.price_trend === 'uptrend' ? '▲ Up' : data.price_trend === 'downtrend' ? '▼ Down' : '→ Flat' },
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

export default function ScreenerPage({ onResults }) {
  const [stocks, setStocks]         = useState([])
  const [tickerInput, setTicker]    = useState('')
  const [companyInput, setCompany]  = useState('')
  const [results, setResults]       = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)

  const canAdd = stocks.length < MAX_STOCKS

  function handleAdd() {
    const ticker  = tickerInput.trim().toUpperCase()
    const company = companyInput.trim()
    if (!ticker || !company) return
    if (stocks.some((s) => s.ticker === ticker)) { setTicker(''); setCompany(''); return }
    setStocks((prev) => [...prev, { ticker, companyName: company }])
    setTicker(''); setCompany('')
  }

  function handleKeyDown(e) { if (e.key === 'Enter') handleAdd() }

  async function handleSearch() {
    if (!stocks.length) return
    setLoading(true); setError(null); setResults(null)
    try {
      const data = await screenStocks(stocks.map((s) => ({ ticker: s.ticker, company_name: s.companyName })))
      setResults(data.results)
      if (onResults) onResults(data.results.filter((r) => !r.error).map((r) => ({ ticker: r.ticker, company_name: r.company_name })))
    } catch {
      setError('Could not reach the backend. Make sure app.py is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-hero">
        <div className="page-hero__eyebrow">Sentiment Analysis</div>
        <h1 className="page-hero__title">Analyze up to 5 stocks</h1>
        <p className="page-hero__sub">FinBERT news sentiment · Fundamentals · Real-time price data</p>
      </div>

      <div className="screener">
        <div className="screener__body">
          <div className="screener__row">
            <div className="screener__input-group">
              <input
                className="screener__input"
                placeholder="Ticker — e.g. AAPL"
                value={tickerInput}
                onChange={(e) => setTicker(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={6}
              />
              <input
                className="screener__input"
                placeholder="Company name — e.g. Apple"
                value={companyInput}
                onChange={(e) => setCompany(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <button type="button" className="btn-plus" onClick={handleAdd} disabled={!canAdd} title={canAdd ? 'Add stock' : 'Max 5 stocks'}>
              <Plus size={18} />
            </button>
            <button type="button" className="btn-search" onClick={handleSearch} disabled={!stocks.length || loading}>
              {loading ? <><Loader2 size={15} className="spin" /> Analyzing…</> : 'Analyze →'}
            </button>
          </div>

          {stocks.length > 0 && (
            <div className="screener__chips">
              {stocks.map((s) => (
                <span className="chip" key={s.ticker}>
                  <span className="chip__ticker">{s.ticker}</span>
                  <span className="chip__name">{s.companyName}</span>
                  <button type="button" className="chip__remove" onClick={() => setStocks((prev) => prev.filter((x) => x.ticker !== s.ticker))}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && <p className="screener__error">{error}</p>}
        </div>

        {results && (
          <>
            <hr className="screener__divider" style={{ margin: '0' }} />
            <ul className="results" style={{ border: 'none', borderRadius: 0 }}>
              {results.map((r) => (
                <li className="result-card" key={r.ticker}>
                  <div className="result-card__header">
                    <div className="result-card__identity">
                      <span className="result-card__ticker">{r.ticker}</span>
                      <span className="result-card__company">{r.company_name}</span>
                    </div>
                    {r.fundamentals?.price && (
                      <span className="result-card__price">${r.fundamentals.price}</span>
                    )}
                  </div>
                  {r.error
                    ? <p style={{ padding: '0 24px 16px', color: 'var(--ink-muted)', fontStyle: 'italic', fontSize: 13 }}>{r.error}</p>
                    : (
                      <>
                        <VerdictBox label={r.label} score={r.score} />
                        <FundamentalsPills data={r.fundamentals} />
                      </>
                    )
                  }
                </li>
              ))}
            </ul>
          </>
        )}

        <div style={{ padding: '0 24px 20px', marginTop: results ? 0 : 8 }}>
          <div className="disclaimer">
            <TriangleAlert size={15} />
            <p>
              Recommendations reflect recent news sentiment only. This is <u>not financial advice</u> — always consult a licensed advisor before making investment decisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}