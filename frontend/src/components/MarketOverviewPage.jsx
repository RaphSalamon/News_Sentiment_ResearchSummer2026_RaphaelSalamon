import { useState, useEffect } from 'react'
import { RefreshCw, Loader2, TriangleAlert, Plus, X } from 'lucide-react'
import { fetchTop50, fetchWatchlistData } from '../api/client'
import WatchlistChart3D from './WatchlistChart3D'

// Market cap tiers the user can choose from
const CAP_TIERS = [
  { id: 'All',   label: 'All',   desc: null },
  { id: 'Mega',  label: 'Mega',  desc: '$200B+' },
  { id: 'Large', label: 'Large', desc: '$10B–$200B' },
  { id: 'Mid',   label: 'Mid',   desc: '$2B–$10B' },
  { id: 'Small', label: 'Small', desc: '$300M–$2B' },
  { id: 'Micro', label: 'Micro', desc: '$50M–$300M' },
  { id: 'Nano',  label: 'Nano',  desc: '<$50M' },
]

function SignalBadge({ label }) {
  const l = label?.toUpperCase()
  const cls =
    l === 'BUY'   ? 'badge badge--buy'   :
    l === 'HOLD'  ? 'badge badge--hold'  :
                    'badge badge--avoid'
  return <span className={cls}>{l}</span>
}

function ScoreMeter({ score }) {
  const color =
    score >= 65 ? 'var(--color-buy)'   :
    score <= 35 ? 'var(--color-avoid)' :
                  'var(--color-hold)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 80, height: 7, background: 'var(--color-border)',
        borderRadius: 999, overflow: 'hidden'
      }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color }}>{score}</span>
    </div>
  )
}

export default function MarketOverviewPage({ screenerResults = [] }) {
  const [mode, setMode] = useState('simple')

  // — Simple mode —
  const [marketResults, setMarketResults]   = useState(null)
  const [marketLoading, setMarketLoading]   = useState(false)
  const [marketError, setMarketError]       = useState(null)
  const [lastRefreshed, setLastRefreshed]   = useState(null)

  // — Advanced (watchlist + 3D chart) mode —
  const [watchlistStocks, setWatchlistStocks]   = useState([])
  const [watchlistData, setWatchlistData]       = useState(null)
  const [watchlistLoading, setWatchlistLoading] = useState(false)
  const [watchlistError, setWatchlistError]     = useState(null)
  const [selectedCapTier, setSelectedCapTier]   = useState('All')

  // Manual add inputs
  const [addTicker, setAddTicker]   = useState('')
  const [addCompany, setAddCompany] = useState('')

  // Auto-populate watchlist from screener results
  useEffect(() => {
    if (!screenerResults.length) return
    setWatchlistStocks((prev) => {
      const existing = new Set(prev.map((s) => s.ticker))
      const newOnes = screenerResults.filter((r) => !existing.has(r.ticker))
      return [...prev, ...newOnes]
    })
  }, [screenerResults])

  // — Simple mode —
  async function handleMarketRefresh() {
    setMarketLoading(true); setMarketError(null)
    try {
      const data = await fetchTop50()
      setMarketResults(data.results)
      setLastRefreshed(new Date())
    } catch {
      setMarketError('Could not load market data. Make sure the backend is running.')
    } finally {
      setMarketLoading(false)
    }
  }

  // — Advanced mode —
  function handleAddToWatchlist() {
    const ticker  = addTicker.trim().toUpperCase()
    const company = addCompany.trim()
    if (!ticker || !company) return
    if (watchlistStocks.some((s) => s.ticker === ticker)) {
      setAddTicker(''); setAddCompany(''); return
    }
    setWatchlistStocks((prev) => [...prev, { ticker, company_name: company }])
    setAddTicker(''); setAddCompany('')
  }

  function handleRemoveFromWatchlist(ticker) {
    setWatchlistStocks((prev) => prev.filter((s) => s.ticker !== ticker))
    setWatchlistData((prev) => prev ? prev.filter((r) => r.ticker !== ticker) : prev)
  }

  async function handleWatchlistAnalyze() {
    if (!watchlistStocks.length) return
    setWatchlistLoading(true); setWatchlistError(null)
    try {
      const data = await fetchWatchlistData(watchlistStocks)
      setWatchlistData(data.results)
    } catch {
      setWatchlistError('Could not fetch watchlist data. Make sure the backend is running.')
    } finally {
      setWatchlistLoading(false)
    }
  }

  const hasMarket  = marketResults !== null && marketResults.length > 0
  const noMarket   = marketResults !== null && marketResults.length === 0

  return (
    <section className="market">

      {/* ── Header + Simple/Advanced toggle ── */}
      <div className="market__controls">
        <div>
          <h2 className="market__title">Market Overview</h2>
          <p className="market__sub">
            {mode === 'simple'
              ? lastRefreshed
                ? `Shortlist · 3%+ 7-day gain + BUY sentiment · ${lastRefreshed.toLocaleString()}`
                : 'Stocks with 3%+ 7-day gain and BUY sentiment score'
              : 'Watchlist — 3D Sentiment × Price × Volume analysis'}
          </p>
        </div>
        <div className="market__right">
          <div className="toggle-advanced">
            <button
              type="button"
              className={`toggle-advanced__opt${mode === 'simple' ? ' toggle-advanced__opt--on' : ''}`}
              onClick={() => setMode('simple')}
            >
              Simple
            </button>
            <button
              type="button"
              className={`toggle-advanced__opt${mode === 'advanced' ? ' toggle-advanced__opt--on' : ''}`}
              onClick={() => setMode('advanced')}
            >
              Advanced
            </button>
          </div>
          {mode === 'simple' && (
            <button
              type="button"
              className="btn-refresh"
              onClick={handleMarketRefresh}
              disabled={marketLoading}
            >
              {marketLoading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
              {marketLoading ? 'Refreshing…' : 'Refresh Data'}
            </button>
          )}
        </div>
      </div>

      {/* ── SIMPLE MODE ── */}
      {mode === 'simple' && (
        <>
          {marketLoading && (
            <p className="market__loading-note">
              Checking price momentum, then running FinBERT — this takes a few minutes.
            </p>
          )}
          {marketError && <p className="market__error">{marketError}</p>}

          {hasMarket && (
            <>
              <div className="market__table-wrap">
                <table className="market__table">
                  <thead>
                    <tr>
                      <th>#</th><th>Ticker</th><th>Company</th>
                      <th>Price</th><th>7-Day Change</th>
                      <th>Score</th><th>Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketResults.map((r, i) => (
                      <tr key={r.ticker}>
                        <td className="market__rank">{i + 1}</td>
                        <td className="market__ticker">{r.ticker}</td>
                        <td className="market__company">{r.company_name}</td>
                        <td className="market__price">
                          {r.current_price != null ? `$${r.current_price.toFixed(2)}` : '—'}
                        </td>
                        <td>
                          {r.price_change_7d == null ? '—' : (
                            <span className={r.price_change_7d >= 0 ? 'market__change-up' : 'market__change-down'}>
                              {r.price_change_7d >= 0 ? '▲' : '▼'} {Math.abs(r.price_change_7d)}%
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{
                            fontFamily: 'monospace', fontWeight: 700,
                            color: r.score >= 0.15 ? 'var(--color-buy)' : r.score <= -0.15 ? 'var(--color-avoid)' : 'var(--color-hold)'
                          }}>
                            {r.score >= 0 ? '+' : ''}{r.score.toFixed(2)}
                          </span>
                        </td>
                        <td><SignalBadge label={r.label} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="market__table-footer">
                Showing {marketResults.length} stock{marketResults.length !== 1 ? 's' : ''} · Click Refresh to reload
              </p>
            </>
          )}

          {noMarket && (
            <p className="market__empty">
              No stocks cleared both filters today (7-day gain ≥ 3% AND BUY sentiment). Try again later.
            </p>
          )}

          {marketResults === null && !marketLoading && !marketError && (
            <p className="market__empty">Click "Refresh Data" to load the latest shortlist.</p>
          )}
        </>
      )}

      {/* ── ADVANCED MODE (WATCHLIST + 3D CHART) ── */}
      {mode === 'advanced' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Watchlist builder */}
          <div style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 16
          }}>
            <p style={{
              fontSize: 12, fontWeight: 700, letterSpacing: '.06em',
              textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 10
            }}>
              Watchlist
              {screenerResults.length > 0 && (
                <span style={{ color: 'var(--color-blue)', fontWeight: 500, textTransform: 'none', marginLeft: 8 }}>
                  · {screenerResults.length} stock{screenerResults.length !== 1 ? 's' : ''} auto-added from Search
                </span>
              )}
            </p>

            {watchlistStocks.length > 0 && (
              <div className="screener__chips" style={{ marginBottom: 12 }}>
                {watchlistStocks.map((s) => (
                  <span className="chip" key={s.ticker}>
                    <span className="chip__ticker">{s.ticker}</span>
                    <span className="chip__name">{s.company_name}</span>
                    <button
                      type="button"
                      className="chip__remove"
                      onClick={() => handleRemoveFromWatchlist(s.ticker)}
                      aria-label={`Remove ${s.ticker}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="screener__input"
                style={{ flex: '1 1 100px', minWidth: 80 }}
                placeholder="Ticker"
                value={addTicker}
                onChange={(e) => setAddTicker(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddToWatchlist()}
                maxLength={6}
              />
              <input
                className="screener__input"
                style={{ flex: '2 1 160px' }}
                placeholder="Company name"
                value={addCompany}
                onChange={(e) => setAddCompany(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddToWatchlist()}
              />
              <button type="button" className="btn-plus" onClick={handleAddToWatchlist} title="Add to watchlist">
                <Plus size={18} />
              </button>
              <button
                type="button"
                className="btn-search"
                onClick={handleWatchlistAnalyze}
                disabled={!watchlistStocks.length || watchlistLoading}
              >
                {watchlistLoading
                  ? <><Loader2 size={15} className="spin" /> Analyzing…</>
                  : 'Analyze →'}
              </button>
            </div>
          </div>

          {watchlistError && <p className="market__error">{watchlistError}</p>}

          {watchlistData && (
            <>
              {/* ── Market Cap Filter ── */}
              <div>
                <p style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: '.06em',
                  textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 10
                }}>
                  Filter by Market Cap
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {CAP_TIERS.map((tier) => {
                    const isActive = selectedCapTier === tier.id
                    // Count how many stocks match this tier
                    const count = tier.id === 'All'
                      ? watchlistData.filter((r) => !r.error).length
                      : watchlistData.filter((r) => !r.error && r.market_cap_tier === tier.id).length
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setSelectedCapTier(tier.id)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 999,
                          border: isActive ? '2px solid var(--color-blue)' : '1px solid var(--color-border-mid)',
                          background: isActive ? 'var(--color-blue)' : 'var(--color-surface-2)',
                          color: isActive ? '#fff' : 'var(--color-ink-mid)',
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: count === 0 && !isActive ? 'default' : 'pointer',
                          opacity: count === 0 && !isActive ? 0.4 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                        disabled={count === 0 && !isActive}
                        title={tier.desc ?? 'All market caps'}
                      >
                        {tier.label}
                        {tier.desc && (
                          <span style={{ fontSize: 10, opacity: 0.75 }}>{tier.desc}</span>
                        )}
                        <span style={{
                          background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--color-border)',
                          borderRadius: 999,
                          padding: '1px 6px',
                          fontSize: 11,
                        }}>
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── 3D Chart ── */}
              <div>
                <p style={{
                  fontSize: 13, fontWeight: 600, color: 'var(--color-ink-mid)',
                  marginBottom: 12
                }}>
                  3D Quadrant Analysis — Sentiment × Price Change × Relative Volume
                  {selectedCapTier !== 'All' && (
                    <span style={{ color: 'var(--color-blue)', marginLeft: 8 }}>
                      · {selectedCapTier} Cap
                    </span>
                  )}
                </p>
                <WatchlistChart3D data={watchlistData} selectedCapTier={selectedCapTier} />
              </div>

              {/* ── Quadrant legend ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { key: 'Q1', color: '#16A34A', name: 'Confirmed Momentum', desc: 'Both positive — strongest signal' },
                  { key: 'Q2', color: '#2563EB', name: 'Sentiment Leading',  desc: 'News positive, price lagging — opportunity?' },
                  { key: 'Q4', color: '#D97706', name: 'Price Leading',      desc: 'Price ahead of news — caution' },
                  { key: 'Q3', color: '#DC2626', name: 'Confirmed Weakness', desc: 'Both negative — avoid' },
                ].map((q) => (
                  <div key={q.key} style={{
                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    border: `1px solid ${q.color}33`, background: `${q.color}08`
                  }}>
                    <div style={{ fontWeight: 700, color: q.color, fontSize: 13 }}>{q.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-ink-soft)', marginTop: 3 }}>{q.desc}</div>
                  </div>
                ))}
              </div>

              {/* ── Signal Rankings Table ── */}
              <div>
                <p style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: '.06em',
                  textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 10
                }}>
                  Signal Rankings
                </p>
                <div className="market__table-wrap">
                  <table className="market__table">
                    <thead>
                      <tr>
                        <th>#</th><th>Ticker</th><th>Cap Tier</th><th>Quadrant</th>
                        <th>Sentiment</th><th>10d Price</th>
                        <th>Rel. Volume</th><th>Signal Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {watchlistData
                        .filter((r) => !r.error && (selectedCapTier === 'All' || r.market_cap_tier === selectedCapTier))
                        .map((r, i) => (
                          <tr key={r.ticker}>
                            <td className="market__rank">{i + 1}</td>
                            <td>
                              <div className="market__ticker">{r.ticker}</div>
                              <div className="market__company">{r.company_name}</div>
                            </td>
                            <td>
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: '2px 8px',
                                borderRadius: 999, background: 'var(--color-border)',
                                color: 'var(--color-ink-mid)'
                              }}>
                                {r.market_cap_tier}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontWeight: 600, color: r.quadrant_color, fontSize: 12 }}>
                                {r.quadrant_name}
                              </span>
                            </td>
                            <td>
                              <span style={{
                                fontFamily: 'monospace', fontWeight: 700,
                                color: r.sentiment_score >= 0.15 ? 'var(--color-buy)' :
                                       r.sentiment_score <= -0.15 ? 'var(--color-avoid)' :
                                       'var(--color-hold)'
                              }}>
                                {r.sentiment_score >= 0 ? '+' : ''}{r.sentiment_score.toFixed(4)}
                              </span>
                            </td>
                            <td>
                              {r.price_change_7d == null ? '—' : (
                                <span className={r.price_change_7d >= 0 ? 'market__change-up' : 'market__change-down'}>
                                  {r.price_change_7d >= 0 ? '▲' : '▼'} {Math.abs(r.price_change_7d)}%
                                </span>
                              )}
                            </td>
                            <td style={{ fontFamily: 'monospace', fontSize: 13 }}>
                              {r.relative_volume != null ? `${r.relative_volume}x` : '—'}
                            </td>
                            <td><ScoreMeter score={r.signal_score} /></td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {!watchlistData && !watchlistLoading && !watchlistError && (
            <p className="market__empty">
              {watchlistStocks.length
                ? 'Click "Analyze →" to run 3D quadrant analysis on your watchlist.'
                : 'Add stocks above, or search stocks first to auto-populate.'}
            </p>
          )}
        </div>
      )}

      <div className="disclaimer" style={{ marginTop: 20 }}>
        <TriangleAlert size={16} />
        <p>
          Quadrant analysis and signal scores are experimental research tools based on
          news sentiment and price data only. They do not constitute financial advice.
          Always do your own research before making investment decisions.
        </p>
      </div>
    </section>
  )
}