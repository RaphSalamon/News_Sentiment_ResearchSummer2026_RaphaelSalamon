import { useState } from 'react'
import { RefreshCw, Loader2, TriangleAlert } from 'lucide-react'
import { fetchTop50 } from '../api/client'

function SignalBadge({ label }) {
  const l = label?.toUpperCase()
  const cls =
    l === 'BUY'   ? 'badge badge--buy'   :
    l === 'HOLD'  ? 'badge badge--hold'  :
                    'badge badge--avoid'
  return <span className={cls}>{l}</span>
}

export default function MarketOverviewPage() {
  const [results, setResults]           = useState(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [advanced, setAdvanced]         = useState(false)

  async function handleRefresh() {
    setLoading(true); setError(null)
    try {
      const data = await fetchTop50()
      setResults(data.results)
      setLastRefreshed(new Date())
    } catch {
      setError('Could not load market data. This can take a few minutes — make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  const hasResults    = results !== null && results.length > 0
  const hasZeroResults = results !== null && results.length === 0

  return (
    <section className="market">
      <div className="market__controls">
        <div>
          <h2 className="market__title">Market Overview</h2>
          <p className="market__sub">
            {lastRefreshed
              ? `Shortlist · stocks with 3%+ 7-day gain and BUY sentiment · Last refreshed: ${lastRefreshed.toLocaleString()}`
              : 'Stocks with 3%+ 7-day gain and BUY sentiment score'}
          </p>
        </div>
        <div className="market__right">
          <div className="toggle-advanced">
            <button
              type="button"
              className={`toggle-advanced__opt${!advanced ? ' toggle-advanced__opt--on' : ''}`}
              onClick={() => setAdvanced(false)}
            >
              Simple
            </button>
            <button
              type="button"
              className={`toggle-advanced__opt${advanced ? ' toggle-advanced__opt--on' : ''}`}
              onClick={() => setAdvanced(true)}
            >
              Advanced
            </button>
          </div>
          <button
            type="button"
            className="btn-refresh"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            {loading ? 'Refreshing…' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {loading && (
        <p className="market__loading-note">
          Checking price momentum first, then running FinBERT sentiment — this takes a few minutes.
        </p>
      )}

      {error   && <p className="market__error">{error}</p>}

      {hasResults && (
        <>
          <div className="market__table-wrap">
            <table className="market__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ticker</th>
                  <th>Company</th>
                  <th>Price</th>
                  <th>7-Day Change</th>
                  {advanced && <th>Trend (30d)</th>}
                  <th>Sentiment Score</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
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
                    {advanced && (
                      <td className="market__trend">
                        {r.price_change_30d != null
                          ? `${r.price_change_30d >= 0 ? '📈' : '📉'} ${r.price_change_30d > 0 ? '+' : ''}${r.price_change_30d}% (30d)`
                          : '—'}
                      </td>
                    )}
                    <td>
                      <span style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
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
            Showing {results.length} stock{results.length !== 1 ? 's' : ''} · Click Refresh to reload latest sentiment data
          </p>
        </>
      )}

      {hasZeroResults && (
        <p className="market__empty">
          No stocks cleared both filters today (7-day gain ≥ 3% AND full BUY sentiment).
          That's a real market-conditions outcome — try again later.
        </p>
      )}

      {results === null && !loading && !error && (
        <p className="market__empty">Click "Refresh Data" to load the latest shortlist.</p>
      )}

      <div className="disclaimer" style={{ marginTop: 20 }}>
        <TriangleAlert size={16} />
        <p>
          Rankings reflect recent price momentum and news sentiment only and do not
          constitute financial advice. Always do your own research before making
          investment decisions.
        </p>
      </div>
    </section>
  )
}