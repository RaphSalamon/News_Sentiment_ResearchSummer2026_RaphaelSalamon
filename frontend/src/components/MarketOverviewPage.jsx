import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Loader2, TriangleAlert, Plus, X, Zap } from 'lucide-react'
import { fetchTop50, fetchWatchlistData, autoAnalyze } from '../api/client'
import WatchlistChart3D from './WatchlistChart3D'

const CAP_TIERS = [
  { id: 'All',   label: 'All',   desc: null },
  { id: 'Mega',  label: 'Mega',  desc: '$200B+' },
  { id: 'Large', label: 'Large', desc: '$10B–$200B' },
  { id: 'Mid',   label: 'Mid',   desc: '$2B–$10B' },
  { id: 'Small', label: 'Small', desc: '$300M–$2B' },
  { id: 'Micro', label: 'Micro', desc: '$50M–$300M' },
  { id: 'Nano',  label: 'Nano',  desc: '<$50M' },
]

const SECTORS = [
  'All', 'Technology', 'Healthcare', 'Financial',
  'Consumer Cyclical', 'Consumer Defensive', 'Energy',
  'Industrials', 'Basic Materials', 'Real Estate',
  'Utilities', 'Communication Services',
]

const MIN_VOLUME_OPTIONS = [
  { label: '100K+',  value: 100_000 },
  { label: '200K+',  value: 200_000 },
  { label: '500K+',  value: 500_000 },
  { label: '1M+',    value: 1_000_000 },
]

function SignalBadge({ label }) {
  const l = label?.toUpperCase()
  return (
    <span className={
      l === 'BUY' ? 'badge badge--buy' :
      l === 'HOLD' ? 'badge badge--hold' :
      'badge badge--avoid'
    }>{l}</span>
  )
}

function ScoreMeter({ score }) {
  const color = score >= 65 ? 'var(--color-buy)' : score <= 35 ? 'var(--color-avoid)' : 'var(--color-hold)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 80, height: 7, background: 'var(--color-border)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color }}>{score}</span>
    </div>
  )
}

function ThresholdSlider({ label, min, max, step, value, onChange, format }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ fontWeight: 600, color: '#475569' }}>{label}</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563EB' }}>
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#2563EB' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8' }}>
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  )
}

export default function MarketOverviewPage({ screenerResults = [] }) {
  const [mode, setMode] = useState('simple')

  // Simple mode
  const [marketResults, setMarketResults] = useState(null)
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketError, setMarketError]     = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  // Advanced mode — scanner config
  const [scanCapTier, setScanCapTier]     = useState('Large')
  const [scanSector, setScanSector]       = useState('All')
  const [scanLimit, setScanLimit]         = useState(20)
  const [scanMinVol, setScanMinVol]       = useState(200_000)

  // Advanced mode — results
  const [watchlistData, setWatchlistData]         = useState(null)
  const [watchlistLoading, setWatchlistLoading]   = useState(false)
  const [watchlistError, setWatchlistError]       = useState(null)
  const [scanSource, setScanSource]               = useState(null) // 'auto' | 'manual'
  const [finvizCount, setFinvizCount]             = useState(null)

  // Advanced mode — manual watchlist
  const [watchlistStocks, setWatchlistStocks] = useState([])
  const [addTicker, setAddTicker]   = useState('')
  const [addCompany, setAddCompany] = useState('')

  // Threshold sliders (client-side real-time filtering — no re-fetch)
  const [minSentiment,   setMinSentiment]   = useState(-1.0)
  const [minPriceChange, setMinPriceChange] = useState(-20)
  const [minRelVolume,   setMinRelVolume]   = useState(0)
  const [filterCapTier,  setFilterCapTier]  = useState('All')

  // Auto-populate watchlist from screener results
  useEffect(() => {
    if (!screenerResults.length) return
    setWatchlistStocks((prev) => {
      const existing = new Set(prev.map((s) => s.ticker))
      return [...prev, ...screenerResults.filter((r) => !existing.has(r.ticker))]
    })
  }, [screenerResults])

  // ── Client-side threshold filtering ─────────────────────────────────────
  // This runs instantly whenever sliders move — no re-fetch needed
  const filteredData = useMemo(() => {
    if (!watchlistData) return []
    return watchlistData.filter((r) => {
      if (r.error) return false
      if (r.sentiment_score   < minSentiment)   return false
      if (r.price_change_7d   < minPriceChange) return false
      if (r.relative_volume   < minRelVolume)   return false
      if (filterCapTier !== 'All' && r.market_cap_tier !== filterCapTier) return false
      return true
    })
  }, [watchlistData, minSentiment, minPriceChange, minRelVolume, filterCapTier])

  // Simple mode refresh
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

  // Auto-scan from Finviz Elite
  async function handleAutoScan() {
    setWatchlistLoading(true); setWatchlistError(null); setWatchlistData(null); setScanSource('auto')
    try {
      const data = await autoAnalyze({
        cap_tier:       scanCapTier,
        sector:         scanSector,
        limit:          scanLimit,
        min_avg_volume: scanMinVol,
      })
      setWatchlistData(data.results)
      setFinvizCount(data.finviz_ticker_count)
      // Reset thresholds on new scan so user sees full results
      setMinSentiment(-1.0); setMinPriceChange(-20); setMinRelVolume(0); setFilterCapTier('All')
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Auto-scan failed.'
      setWatchlistError(msg)
    } finally {
      setWatchlistLoading(false)
    }
  }

  // Manual watchlist analyze
  async function handleManualAnalyze() {
    if (!watchlistStocks.length) return
    setWatchlistLoading(true); setWatchlistError(null); setWatchlistData(null); setScanSource('manual')
    try {
      const data = await fetchWatchlistData(watchlistStocks)
      setWatchlistData(data.results)
      setFinvizCount(null)
      setMinSentiment(-1.0); setMinPriceChange(-20); setMinRelVolume(0); setFilterCapTier('All')
    } catch {
      setWatchlistError('Could not fetch watchlist data. Make sure the backend is running.')
    } finally {
      setWatchlistLoading(false)
    }
  }

  function handleAddToWatchlist() {
    const ticker  = addTicker.trim().toUpperCase()
    const company = addCompany.trim()
    if (!ticker || !company) return
    if (watchlistStocks.some((s) => s.ticker === ticker)) { setAddTicker(''); setAddCompany(''); return }
    setWatchlistStocks((prev) => [...prev, { ticker, company_name: company }])
    setAddTicker(''); setAddCompany('')
  }

  function handleRemove(ticker) {
    setWatchlistStocks((prev) => prev.filter((s) => s.ticker !== ticker))
  }

  const hasMarket = marketResults !== null && marketResults.length > 0
  const noMarket  = marketResults !== null && marketResults.length === 0

  return (
    <section className="market">
      {/* Header + mode toggle */}
      <div className="market__controls">
        <div>
          <h2 className="market__title">Market Overview</h2>
          <p className="market__sub">
            {mode === 'simple'
              ? lastRefreshed
                ? `Shortlist · ${lastRefreshed.toLocaleString()}`
                : 'Stocks with 3%+ 7-day gain and BUY sentiment'
              : 'Automated scanner — Finviz Elite + FinBERT + 3D analysis'}
          </p>
        </div>
        <div className="market__right">
          <div className="toggle-advanced">
            <button type="button"
              className={`toggle-advanced__opt${mode === 'simple' ? ' toggle-advanced__opt--on' : ''}`}
              onClick={() => setMode('simple')}>Simple</button>
            <button type="button"
              className={`toggle-advanced__opt${mode === 'advanced' ? ' toggle-advanced__opt--on' : ''}`}
              onClick={() => setMode('advanced')}>Advanced</button>
          </div>
          {mode === 'simple' && (
            <button type="button" className="btn-refresh" onClick={handleMarketRefresh} disabled={marketLoading}>
              {marketLoading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
              {marketLoading ? 'Refreshing…' : 'Refresh Data'}
            </button>
          )}
        </div>
      </div>

      {/* ── SIMPLE MODE ── */}
      {mode === 'simple' && (
        <>
          {marketLoading && <p className="market__loading-note">Checking price momentum then running FinBERT — a few minutes.</p>}
          {marketError   && <p className="market__error">{marketError}</p>}
          {hasMarket && (
            <div className="market__table-wrap">
              <table className="market__table">
                <thead><tr><th>#</th><th>Ticker</th><th>Company</th><th>Price</th><th>7-Day</th><th>Score</th><th>Signal</th></tr></thead>
                <tbody>
                  {marketResults.map((r, i) => (
                    <tr key={r.ticker}>
                      <td className="market__rank">{i + 1}</td>
                      <td className="market__ticker">{r.ticker}</td>
                      <td className="market__company">{r.company_name}</td>
                      <td className="market__price">{r.current_price != null ? `$${r.current_price.toFixed(2)}` : '—'}</td>
                      <td>{r.price_change_7d == null ? '—' : (
                        <span className={r.price_change_7d >= 0 ? 'market__change-up' : 'market__change-down'}>
                          {r.price_change_7d >= 0 ? '▲' : '▼'} {Math.abs(r.price_change_7d)}%
                        </span>
                      )}</td>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: r.score >= 0.15 ? 'var(--color-buy)' : r.score <= -0.15 ? 'var(--color-avoid)' : 'var(--color-hold)' }}>{r.score >= 0 ? '+' : ''}{r.score.toFixed(2)}</span></td>
                      <td><SignalBadge label={r.label} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {noMarket && <p className="market__empty">No stocks cleared both filters today. Try again later.</p>}
          {marketResults === null && !marketLoading && !marketError && <p className="market__empty">Click "Refresh Data" to load the latest shortlist.</p>}
        </>
      )}

      {/* ── ADVANCED MODE ── */}
      {mode === 'advanced' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── AUTO SCANNER (Finviz Elite) ── */}
          <div style={{ background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)', borderRadius: 14, padding: 24, color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <Zap size={18} color="#60A5FA" />
              <span style={{ fontWeight: 700, fontSize: 14, color: '#60A5FA', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                Auto Scanner — Finviz Elite
              </span>
              <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>
                Pulls live tickers from Finviz, then runs FinBERT + price + volume analysis
              </span>
            </div>

            {/* Market cap */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Market Cap</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CAP_TIERS.map((tier) => (
                  <button key={tier.id} type="button" onClick={() => setScanCapTier(tier.id)}
                    style={{
                      padding: '5px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                      background: scanCapTier === tier.id ? '#2563EB' : '#334155',
                      color: scanCapTier === tier.id ? '#fff' : '#94A3B8',
                      fontWeight: 600, fontSize: 12,
                    }}>
                    {tier.label}
                    {tier.desc && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>{tier.desc}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Sector */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Sector</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SECTORS.map((s) => (
                  <button key={s} type="button" onClick={() => setScanSector(s)}
                    style={{
                      padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                      background: scanSector === s ? '#2563EB' : '#334155',
                      color: scanSector === s ? '#fff' : '#94A3B8',
                      fontWeight: 600, fontSize: 12,
                    }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Limit + Min Volume */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 18 }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Stocks to scan: <span style={{ color: '#60A5FA' }}>{scanLimit}</span>
                </p>
                <input type="range" min={5} max={100} step={5} value={scanLimit}
                  onChange={(e) => setScanLimit(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#2563EB' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginTop: 3 }}>
                  <span>5</span><span>100</span>
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 180 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Min Avg Volume</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {MIN_VOLUME_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setScanMinVol(opt.value)}
                      style={{
                        padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                        background: scanMinVol === opt.value ? '#2563EB' : '#334155',
                        color: scanMinVol === opt.value ? '#fff' : '#94A3B8',
                        fontWeight: 600, fontSize: 12,
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button type="button" onClick={handleAutoScan} disabled={watchlistLoading}
              style={{
                background: watchlistLoading ? '#334155' : '#2563EB',
                color: '#fff', border: 'none', borderRadius: 10,
                padding: '12px 28px', fontWeight: 700, fontSize: 14,
                cursor: watchlistLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
              {watchlistLoading && scanSource === 'auto'
                ? <><Loader2 size={16} className="spin" /> Scanning Finviz + Running FinBERT…</>
                : <><Zap size={16} /> Auto-Scan from Finviz</>}
            </button>
          </div>

          {/* ── MANUAL WATCHLIST ── */}
          <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Manual Watchlist
              {screenerResults.length > 0 && (
                <span style={{ color: 'var(--color-blue)', fontWeight: 500, textTransform: 'none', marginLeft: 8 }}>
                  · {screenerResults.length} auto-added from Search
                </span>
              )}
            </p>
            {watchlistStocks.length > 0 && (
              <div className="screener__chips" style={{ marginBottom: 12 }}>
                {watchlistStocks.map((s) => (
                  <span className="chip" key={s.ticker}>
                    <span className="chip__ticker">{s.ticker}</span>
                    <span className="chip__name">{s.company_name}</span>
                    <button type="button" className="chip__remove" onClick={() => handleRemove(s.ticker)}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="screener__input" style={{ flex: '1 1 100px', minWidth: 80 }}
                placeholder="Ticker" value={addTicker}
                onChange={(e) => setAddTicker(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddToWatchlist()} maxLength={6} />
              <input className="screener__input" style={{ flex: '2 1 160px' }}
                placeholder="Company name" value={addCompany}
                onChange={(e) => setAddCompany(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddToWatchlist()} />
              <button type="button" className="btn-plus" onClick={handleAddToWatchlist} title="Add"><Plus size={18} /></button>
              <button type="button" className="btn-search"
                onClick={handleManualAnalyze}
                disabled={!watchlistStocks.length || watchlistLoading}>
                {watchlistLoading && scanSource === 'manual'
                  ? <><Loader2 size={15} className="spin" /> Analyzing…</>
                  : 'Analyze →'}
              </button>
            </div>
          </div>

          {watchlistError && <p className="market__error">⚠️ {watchlistError}</p>}

          {/* Loading state */}
          {watchlistLoading && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748B' }}>
              <Loader2 size={28} className="spin" style={{ marginBottom: 10 }} />
              <p style={{ fontWeight: 600, margin: '0 0 6px' }}>
                {scanSource === 'auto'
                  ? `Pulling ${scanLimit} stocks from Finviz Elite, then running FinBERT sentiment analysis…`
                  : 'Running FinBERT sentiment analysis on your watchlist…'}
              </p>
              <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>This typically takes 1-3 minutes depending on the number of stocks.</p>
            </div>
          )}

          {/* Results */}
          {watchlistData && !watchlistLoading && (
            <>
              {/* Status bar */}
              <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, padding: '10px 16px', fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: '#0369A1' }}>
                  {scanSource === 'auto'
                    ? `✓ Finviz returned ${finvizCount} tickers · `
                    : '✓ Manual watchlist · '}
                  {filteredData.length} of {watchlistData.filter(r => !r.error).length} stocks shown
                  {(minSentiment > -1 || minPriceChange > -20 || minRelVolume > 0 || filterCapTier !== 'All') && ' (filtered)'}
                </span>
              </div>

              {/* ── Threshold Sliders ── */}
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 16 }}>
                  Threshold Filters — <span style={{ color: '#2563EB', fontWeight: 500, textTransform: 'none' }}>adjusts chart in real-time, no re-scan needed</span>
                </p>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  <ThresholdSlider
                    label="Min Sentiment Score" min={-1} max={1} step={0.05}
                    value={minSentiment} onChange={setMinSentiment}
                    format={(v) => v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)}
                  />
                  <ThresholdSlider
                    label="Min Price Change (10d)" min={-20} max={20} step={0.5}
                    value={minPriceChange} onChange={setMinPriceChange}
                    format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                  />
                  <ThresholdSlider
                    label="Min Relative Volume" min={0} max={3} step={0.1}
                    value={minRelVolume} onChange={setMinRelVolume}
                    format={(v) => `${v.toFixed(1)}x`}
                  />
                </div>

                {/* Cap tier filter (client-side, on top of auto-scan results) */}
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Filter by Cap Tier</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {CAP_TIERS.map((tier) => {
                      const count = tier.id === 'All'
                        ? watchlistData.filter(r => !r.error).length
                        : watchlistData.filter(r => !r.error && r.market_cap_tier === tier.id).length
                      const isActive = filterCapTier === tier.id
                      return (
                        <button key={tier.id} type="button" onClick={() => setFilterCapTier(tier.id)}
                          disabled={count === 0 && !isActive}
                          style={{
                            padding: '5px 12px', borderRadius: 999, cursor: count === 0 && !isActive ? 'default' : 'pointer',
                            border: isActive ? '2px solid var(--color-blue)' : '1px solid var(--color-border-mid)',
                            background: isActive ? 'var(--color-blue)' : 'var(--color-surface-2)',
                            color: isActive ? '#fff' : 'var(--color-ink-mid)',
                            fontWeight: 600, fontSize: 12,
                            opacity: count === 0 && !isActive ? 0.35 : 1,
                          }}>
                          {tier.label}
                          <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.8 }}>({count})</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* ── 3D Chart ── */}
              {filteredData.length > 0
                ? <WatchlistChart3D data={filteredData} />
                : <p className="market__empty">No stocks match the current threshold filters. Adjust the sliders above.</p>
              }

              {/* Quadrant legend */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { key: 'Q1', color: '#16A34A', name: 'Confirmed Momentum', desc: 'Both positive — strongest signal' },
                  { key: 'Q2', color: '#2563EB', name: 'Sentiment Leading',  desc: 'News positive, price lagging — opportunity?' },
                  { key: 'Q4', color: '#D97706', name: 'Price Leading',      desc: 'Price ahead of news — caution' },
                  { key: 'Q3', color: '#DC2626', name: 'Confirmed Weakness', desc: 'Both negative — avoid' },
                ].map((q) => (
                  <div key={q.key} style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', border: `1px solid ${q.color}33`, background: `${q.color}08` }}>
                    <div style={{ fontWeight: 700, color: q.color, fontSize: 13 }}>{q.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-ink-soft)', marginTop: 3 }}>{q.desc}</div>
                  </div>
                ))}
              </div>

              {/* Signal Rankings Table */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                  Signal Rankings ({filteredData.length} stocks)
                </p>
                <div className="market__table-wrap">
                  <table className="market__table">
                    <thead>
                      <tr><th>#</th><th>Ticker</th><th>Cap</th><th>Quadrant</th><th>Sentiment</th><th>10d Price</th><th>Rel. Vol</th><th>Score</th></tr>
                    </thead>
                    <tbody>
                      {filteredData.map((r, i) => (
                        <tr key={r.ticker}>
                          <td className="market__rank">{i + 1}</td>
                          <td>
                            <div className="market__ticker">{r.ticker}</div>
                            <div className="market__company">{r.company_name}</div>
                          </td>
                          <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--color-border)', color: 'var(--color-ink-mid)' }}>{r.market_cap_tier}</span></td>
                          <td><span style={{ fontWeight: 600, color: r.quadrant_color, fontSize: 12 }}>{r.quadrant_name}</span></td>
                          <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: r.sentiment_score >= 0.15 ? 'var(--color-buy)' : r.sentiment_score <= -0.15 ? 'var(--color-avoid)' : 'var(--color-hold)' }}>{r.sentiment_score >= 0 ? '+' : ''}{r.sentiment_score.toFixed(4)}</span></td>
                          <td>{r.price_change_7d == null ? '—' : (<span className={r.price_change_7d >= 0 ? 'market__change-up' : 'market__change-down'}>{r.price_change_7d >= 0 ? '▲' : '▼'} {Math.abs(r.price_change_7d)}%</span>)}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{r.relative_volume != null ? `${r.relative_volume}x` : '—'}</td>
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
              Click <strong>Auto-Scan from Finviz</strong> to pull a live stock list automatically,
              or manually add stocks to the watchlist above.
            </p>
          )}
        </div>
      )}

      <div className="disclaimer" style={{ marginTop: 20 }}>
        <TriangleAlert size={16} />
        <p>
          Quadrant analysis and signal scores are experimental research tools based on news sentiment
          and price data only. They do not constitute financial advice. Always do your own research
          before making investment decisions.
        </p>
      </div>
    </section>
  )
}