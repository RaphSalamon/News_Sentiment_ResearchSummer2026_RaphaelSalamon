/**
 * WatchlistChart3D.jsx
 *
 * True 3D scatter chart using Plotly:
 *   X axis = Sentiment Score (-1 to +1)
 *   Y axis = Price Change from 10 days ago (%)
 *   Z axis = Relative Volume (current / prior 10-day average)
 *
 * Each stock renders as:
 *   - A TRAIL of 10 semi-transparent dots connected by a line (historical movement)
 *   - A CURRENT DOT (large, opaque, colored by quadrant) at the tail of the trail
 *
 * Bubble size = relative volume (bigger bubble = more trading activity vs average)
 *
 * Built-in PNG download via Plotly's camera icon in the modebar.
 */
import Plot from 'react-plotly.js'


const QUADRANT_COLORS = {
  Q1: '#16A34A',
  Q2: '#2563EB',
  Q3: '#DC2626',
  Q4: '#D97706',
}

const QUADRANT_NAMES = {
  Q1: 'Confirmed Momentum',
  Q2: 'Sentiment Leading',
  Q3: 'Confirmed Weakness',
  Q4: 'Price Leading',
}

// Hex color → rgba string with given opacity
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function WatchlistChart3D({ data, selectedCapTier = 'All' }) {
  if (!data?.length) return null

  // Apply market cap filter
  const filtered = selectedCapTier === 'All'
    ? data.filter((r) => !r.error)
    : data.filter((r) => !r.error && r.market_cap_tier === selectedCapTier)

  if (!filtered.length) {
    return (
      <p style={{ textAlign: 'center', padding: '32px 0', color: '#94A3B8' }}>
        No stocks in your watchlist match the "{selectedCapTier}" market cap tier.
        Add relevant stocks or change the tier filter.
      </p>
    )
  }

  const traces = []

  // ── HISTORICAL TRAILS (one trace per stock) ──────────────────────────────
  filtered.forEach((stock) => {
    if (!stock.history?.length) return

    const color    = QUADRANT_COLORS[stock.quadrant] || '#94A3B8'
    const trailX   = stock.history.map(() => stock.sentiment_score)
    const trailY   = stock.history.map((h) => h.cumulative_price_change_pct)
    const trailZ   = stock.history.map((h) => h.relative_volume)
    const trailText = stock.history.map((h) =>
      `<b>${stock.ticker}</b> — ${h.date}<br>` +
      `Cumulative change: ${h.cumulative_price_change_pct >= 0 ? '+' : ''}${h.cumulative_price_change_pct}%<br>` +
      `Relative volume: ${h.relative_volume}x avg`
    )

    traces.push({
      type: 'scatter3d',
      mode: 'lines+markers',
      name: `${stock.ticker} trail`,
      x: trailX,
      y: trailY,
      z: trailZ,
      marker: {
        size: 3,
        color: color,
        opacity: 0.25,
      },
      line: {
        color: hexToRgba(color, 0.3),
        width: 3,
      },
      text: trailText,
      hovertemplate: '%{text}<extra></extra>',
      showlegend: false,
    })
  })

  // ── CURRENT POSITIONS (grouped by quadrant for legend) ───────────────────
  const byQuadrant = { Q1: [], Q2: [], Q3: [], Q4: [] }
  filtered.forEach((stock) => {
    if (stock.quadrant) byQuadrant[stock.quadrant].push(stock)
  })

  Object.entries(byQuadrant).forEach(([key, stocks]) => {
    if (!stocks.length) return

    // Scale bubble size: base 10 + relative_volume * 12, capped at 40
    const sizes = stocks.map((s) =>
      Math.max(10, Math.min(40, (s.relative_volume || 1) * 14))
    )

    const hoverText = stocks.map((s) =>
      `<b>${s.ticker}</b> (${s.company_name})<br>` +
      `Market Cap Tier: <b>${s.market_cap_tier}</b><br>` +
      `Sentiment Score: <b>${s.sentiment_score >= 0 ? '+' : ''}${s.sentiment_score}</b><br>` +
      `10-Day Price Change: <b>${s.price_change_7d >= 0 ? '+' : ''}${s.price_change_7d}%</b><br>` +
      `Relative Volume: <b>${s.relative_volume}x avg</b><br>` +
      `Quadrant: <b>${s.quadrant_name}</b><br>` +
      `Signal Score: <b>${s.signal_score}/100</b>`
    )

    traces.push({
      type: 'scatter3d',
      mode: 'markers+text',
      name: QUADRANT_NAMES[key],
      x: stocks.map((s) => s.sentiment_score),
      y: stocks.map((s) => s.price_change_7d),
      z: stocks.map((s) => s.relative_volume),
      marker: {
        size: sizes,
        color: QUADRANT_COLORS[key],
        opacity: 0.92,
        line: { color: '#ffffff', width: 1.5 },
      },
      text: stocks.map((s) => s.ticker),
      textposition: 'top center',
      textfont: { size: 11, color: '#1E293B', family: 'JetBrains Mono, monospace' },
      customdata: hoverText,
      hovertemplate: '%{customdata}<extra></extra>',
    })
  })

  // ── REFERENCE PLANES at X=0 (sentiment neutral) and Y=0 (no price change) ─
  // Thin surfaces help visually anchor the quadrant boundaries
  const xRange = [-1, 1]
  const yExtent = Math.max(
    5,
    ...filtered.flatMap((s) =>
      (s.history || []).map((h) => Math.abs(h.cumulative_price_change_pct))
    )
  ) * 1.2

  const zExtent = Math.max(
    2,
    ...filtered.map((s) => s.relative_volume || 1)
  ) * 1.1

  // Vertical plane at x=0 (sentiment = 0 divider)
  traces.push({
    type: 'surface',
    x: [[0, 0], [0, 0]],
    y: [[-yExtent, -yExtent], [yExtent, yExtent]],
    z: [[0, zExtent], [0, zExtent]],
    colorscale: [[0, 'rgba(148,163,184,0.08)'], [1, 'rgba(148,163,184,0.08)']],
    showscale: false,
    hoverinfo: 'skip',
    name: 'Sentiment neutral',
    showlegend: false,
  })

  // Horizontal plane at y=0 (price change = 0 divider)
  traces.push({
    type: 'surface',
    x: [xRange, xRange],
    y: [[0, 0], [0, 0]],
    z: [[0, 0], [zExtent, zExtent]],
    colorscale: [[0, 'rgba(148,163,184,0.08)'], [1, 'rgba(148,163,184,0.08)']],
    showscale: false,
    hoverinfo: 'skip',
    name: 'Price neutral',
    showlegend: false,
  })

  const layout = {
    title: {
      text: `StockBuddy — Sentiment × Price Change × Relative Volume (3D)`,
      font: { size: 15, color: '#1E293B', family: 'Inter, system-ui, sans-serif' },
      pad: { t: 8 },
    },
    scene: {
      xaxis: {
        title: { text: 'Sentiment Score', font: { size: 12, color: '#475569' } },
        range: [-1, 1],
        zeroline: true,
        zerolinecolor: '#94A3B8',
        zerolinewidth: 2,
        gridcolor: '#E2E8F0',
        backgroundcolor: '#F8FAFC',
      },
      yaxis: {
        title: { text: 'Price Change — 10d (%)', font: { size: 12, color: '#475569' } },
        zeroline: true,
        zerolinecolor: '#94A3B8',
        zerolinewidth: 2,
        gridcolor: '#E2E8F0',
        backgroundcolor: '#F8FAFC',
      },
      zaxis: {
        title: { text: 'Relative Volume (×avg)', font: { size: 12, color: '#475569' } },
        gridcolor: '#E2E8F0',
        backgroundcolor: '#F8FAFC',
      },
      bgcolor: '#F8FAFC',
      camera: {
        eye: { x: 1.6, y: 1.6, z: 1.1 },
        up: { x: 0, y: 0, z: 1 },
      },
    },
    paper_bgcolor: '#FFFFFF',
    margin: { l: 0, r: 0, t: 60, b: 0 },
    legend: {
      x: 0.01,
      y: 0.99,
      bgcolor: 'rgba(255,255,255,0.9)',
      bordercolor: '#E2E8F0',
      borderwidth: 1,
      font: { size: 12, color: '#334155' },
    },
    height: 560,
  }

  const config = {
    displayModeBar: true,
    // Built-in camera icon downloads a high-res PNG — this is what satisfies
    // the professor's "image, not just a graph" requirement
    toImageButtonOptions: {
      format: 'png',
      filename: 'stockbuddy_3d_sentiment_analysis',
      height: 1000,
      width: 1600,
      scale: 2,   // 2x resolution for crisp export
    },
    modeBarButtonsToRemove: ['sendDataToCloud'],
    responsive: true,
    displaylogo: false,
  }

  return (
    <div>
      <Plot
        data={traces}
        layout={layout}
        config={config}
        style={{ width: '100%' }}
        useResizeHandler
      />
      <p style={{
        textAlign: 'center', fontSize: 11, color: '#94A3B8', margin: '4px 0 0'
      }}>
        Trail = 10-day historical trajectory per stock ·
        Bubble size = relative volume ·
        Click the <strong>📷 camera icon</strong> in the chart toolbar to download as PNG
      </p>
    </div>
  )
}
