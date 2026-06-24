import { useState } from 'react'
import { RefreshCw, Loader2, TriangleAlert } from 'lucide-react'
import StockBadge from './StockBadge'
import { fetchTop50 } from '../api/client'

export default function MarketOverviewPage() {
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  async function handleRefresh() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchTop50()
      setResults(data.results)
      setLastRefreshed(new Date())
    } catch {
      setError(
        'Could not load market data. This can take a few minutes — try again, and make sure the backend is running.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="market">
      <div className="market__header">
        <div>
          <h2 className="market__title">Market Overview</h2>
          <p className="market__sub">
            {lastRefreshed
              ? `Last refreshed: ${lastRefreshed.toLocaleString()}`
              : 'Top stocks ranked by recent news sentiment'}
          </p>
        </div>
        <button
          type="button"
          className="market__refresh"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {loading ? 'Refreshing...' : 'Refresh data'}
        </button>
      </div>

      {loading && (
        <p className="market__loading-note">
          Running sentiment analysis across the market — this can take a few minutes.
        </p>
      )}

      {error && <p className="market__error">{error}</p>}

      {results && (
        <div className="market__table-wrap">
          <table className="market__table">
            <thead>
              <tr>
                <th>#</th>
                <th>Ticker</th>
                <th>Company</th>
                <th>7-Day Change</th>
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.ticker}>
                  <td className="market__rank">{i + 1}</td>
                  <td className="market__ticker">{r.ticker}</td>
                  <td className="market__company">{r.company_name}</td>
                  <td>
                    {r.price_change_7d == null ? (
                      '—'
                    ) : (
                      <span
                        className={
                          r.price_change_7d >= 0
                            ? 'market__change-up'
                            : 'market__change-down'
                        }
                      >
                        {r.price_change_7d >= 0 ? '▲' : '▼'}{' '}
                        {Math.abs(r.price_change_7d)}%
                      </span>
                    )}
                  </td>
                  <td>
                    <StockBadge label={r.label} score={r.score} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!results && !loading && !error && (
        <p className="market__empty">Click "Refresh data" to load the latest rankings.</p>
      )}

      <div className="disclaimer">
        <TriangleAlert size={16} aria-hidden="true" />
        <p>
          Rankings are based on news sentiment only and do not constitute
          financial advice. Always do your own research before making
          investment decisions.
        </p>
      </div>
    </section>
  )
}
