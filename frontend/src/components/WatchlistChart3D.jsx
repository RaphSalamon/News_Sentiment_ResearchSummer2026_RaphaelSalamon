/**
 * WatchlistChart3D.jsx
 *
 * 3D scatter chart: X=Sentiment, Y=Price Change (10d), Z=Relative Volume
 * Quadrant tabs above the chart let the user filter to one quadrant at a time.
 * Data passed in is already threshold-filtered by MarketOverviewPage.
 * Bubble size = relative volume (bigger = more trading activity vs 10-day avg).
 * Click the 📷 camera icon in the chart toolbar to download as PNG.
 */

import { useState } from 'react'
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

const QUADRANT_TABS = [
  { id: 'all', label: 'All Stocks',           color: '#475569' },
  { id: 'Q1',  label: '🟢 Momentum',          color: '#16A34A' },
  { id: 'Q2',  label: '🔵 Opportunity',        color: '#2563EB' },
  { id: 'Q4',  label: '🟡 Caution',           color: '#D97706' },
  { id: 'Q3',  label: '🔴 Avoid',             color: '#DC2626' },
]

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function WatchlistChart3D({ data }) {
  const [activeTab, setActiveTab] = useState('all')

  if (!data?.length) return null

  // Apply quadrant tab filter
  const visible = activeTab === 'all'
    ? data
    : data.filter((r) => r.quadrant === activeTab)

  if (!visible.length) {
    return (
      <p style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8' }}>
        No stocks in this quadrant match your current threshold filters.
      </p>
    )
  }

  const traces = []

  // Historical trails
  visible.forEach((stock) => {
    if (!stock.history?.length) return
    const color = QUADRANT_COLORS[stock.quadrant] || '#94A3B8'
    traces.push({
      type: 'scatter3d',
      mode: 'lines+markers',
      name: `${stock.ticker} trail`,
      x: stock.history.map(() => stock.sentiment_score),
      y: stock.history.map((h) => h.cumulative_price_change_pct),
      z: stock.history.map((h) => h.relative_volume),
      marker: { size: 3, color, opacity: 0.22 },
      line: { color: hexToRgba(color, 0.28), width: 2 },
      text: stock.history.map((h) =>
        `<b>${stock.ticker}</b> — ${h.date}<br>` +
        `Cumulative: ${h.cumulative_price_change_pct >= 0 ? '+' : ''}${h.cumulative_price_change_pct}%<br>` +
        `Rel. Volume: ${h.relative_volume}x`
      ),
      hovertemplate: '%{text}<extra></extra>',
      showlegend: false,
    })
  })

  // Current positions grouped by quadrant
  const byQuadrant = { Q1: [], Q2: [], Q3: [], Q4: [] }
  visible.forEach((s) => { if (s.quadrant) byQuadrant[s.quadrant].push(s) })

  Object.entries(byQuadrant).forEach(([key, stocks]) => {
    if (!stocks.length) return
    traces.push({
      type: 'scatter3d',
      mode: 'markers+text',
      name: QUADRANT_NAMES[key],
      x: stocks.map((s) => s.sentiment_score),
      y: stocks.map((s) => s.price_change_7d),
      z: stocks.map((s) => s.relative_volume),
      marker: {
        size: stocks.map((s) => Math.max(10, Math.min(38, (s.relative_volume || 1) * 13))),
        color: QUADRANT_COLORS[key],
        opacity: 0.92,
        line: { color: '#fff', width: 1.5 },
      },
      text: stocks.map((s) => s.ticker),
      textposition: 'top center',
      textfont: { size: 11, color: '#1E293B', family: 'JetBrains Mono, monospace' },
      customdata: stocks.map((s) =>
        `<b>${s.ticker}</b> (${s.company_name})<br>` +
        `Cap Tier: <b>${s.market_cap_tier}</b><br>` +
        `Sentiment: <b>${s.sentiment_score >= 0 ? '+' : ''}${s.sentiment_score}</b><br>` +
        `10d Price: <b>${s.price_change_7d >= 0 ? '+' : ''}${s.price_change_7d}%</b><br>` +
        `Rel. Volume: <b>${s.relative_volume}x avg</b><br>` +
        `Quadrant: <b>${s.quadrant_name}</b><br>` +
        `Signal Score: <b>${s.signal_score}/100</b>`
      ),
      hovertemplate: '%{customdata}<extra></extra>',
    })
  })

  const layout = {
    title: {
      text: 'StockBuddy — Sentiment × 10d Price Change × Relative Volume',
      font: { size: 14, color: '#1E293B', family: 'Inter, system-ui, sans-serif' },
    },
    scene: {
      xaxis: {
        title: { text: 'Sentiment Score', font: { size: 11, color: '#475569' } },
        range: [-1, 1], zeroline: true, zerolinecolor: '#94A3B8',
        zerolinewidth: 2, gridcolor: '#E2E8F0', backgroundcolor: '#F8FAFC',
      },
      yaxis: {
        title: { text: 'Price Change 10d (%)', font: { size: 11, color: '#475569' } },
        zeroline: true, zerolinecolor: '#94A3B8',
        zerolinewidth: 2, gridcolor: '#E2E8F0', backgroundcolor: '#F8FAFC',
      },
      zaxis: {
        title: { text: 'Relative Volume (×avg)', font: { size: 11, color: '#475569' } },
        gridcolor: '#E2E8F0', backgroundcolor: '#F8FAFC',
      },
      bgcolor: '#F8FAFC',
      camera: { eye: { x: 1.6, y: 1.6, z: 1.1 }, up: { x: 0, y: 0, z: 1 } },
    },
    paper_bgcolor: '#FFFFFF',
    margin: { l: 0, r: 0, t: 50, b: 0 },
    legend: {
      x: 0.01, y: 0.99,
      bgcolor: 'rgba(255,255,255,0.9)',
      bordercolor: '#E2E8F0', borderwidth: 1,
      font: { size: 11, color: '#334155' },
    },
    height: 520,
  }

  const config = {
    displayModeBar: true,
    toImageButtonOptions: {
      format: 'png',
      filename: 'stockbuddy_3d_quadrant_analysis',
      height: 1000, width: 1600, scale: 2,
    },
    modeBarButtonsToRemove: ['sendDataToCloud'],
    responsive: true,
    displaylogo: false,
  }

  const tabCounts = {
    all: data.length,
    Q1:  data.filter((r) => r.quadrant === 'Q1').length,
    Q2:  data.filter((r) => r.quadrant === 'Q2').length,
    Q4:  data.filter((r) => r.quadrant === 'Q4').length,
    Q3:  data.filter((r) => r.quadrant === 'Q3').length,
  }

  return (
    <div>
      {/* Quadrant tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {QUADRANT_TABS.map((tab) => {
          const isActive = activeTab === tab.id
          const count = tabCounts[tab.id] ?? 0
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              disabled={count === 0 && !isActive}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: isActive ? `2px solid ${tab.color}` : '1px solid #CBD5E1',
                background: isActive ? tab.color : '#F8FAFC',
                color: isActive ? '#fff' : '#334155',
                fontWeight: 600, fontSize: 12,
                cursor: count === 0 && !isActive ? 'default' : 'pointer',
                opacity: count === 0 && !isActive ? 0.35 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {tab.label}
              <span style={{
                background: isActive ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
                borderRadius: 999, padding: '1px 7px', fontSize: 11,
                color: isActive ? '#fff' : '#64748B',
              }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <Plot
        data={traces}
        layout={layout}
        config={config}
        style={{ width: '100%' }}
        useResizeHandler
      />

      <p style={{ textAlign: 'center', fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
        Trail = 10-day historical movement · Bubble size = relative volume ·
        Click <strong>📷</strong> in toolbar to download PNG
      </p>
    </div>
  )
}