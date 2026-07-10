import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend
} from 'recharts'

const QUADRANT_CONFIG = {
  Q1: { name: 'Confirmed Momentum', color: '#16A34A', fill: '#16A34A' },
  Q2: { name: 'Sentiment Leading',  color: '#2563EB', fill: '#2563EB' },
  Q3: { name: 'Confirmed Weakness', color: '#DC2626', fill: '#DC2626' },
  Q4: { name: 'Price Leading',      color: '#D97706', fill: '#D97706' },
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null

  const qConfig = QUADRANT_CONFIG[d.quadrant]

  return (
    <div style={{
      background: '#1E293B',
      border: `2px solid ${qConfig?.color ?? '#CBD5E1'}`,
      borderRadius: 10,
      padding: '10px 14px',
      color: '#fff',
      fontSize: 13,
      minWidth: 200,
    }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
        {d.ticker} <span style={{ color: '#94A3B8', fontWeight: 400 }}>{d.company_name}</span>
      </div>
      <div style={{ color: qConfig?.color, fontWeight: 600, marginBottom: 6 }}>
        {d.quadrant_name}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, color: '#CBD5E1' }}>
        <span>Sentiment score: <strong style={{ color: '#fff' }}>{d.x >= 0 ? '+' : ''}{d.x.toFixed(4)}</strong></span>
        <span>7-day price change: <strong style={{ color: '#fff' }}>{d.y >= 0 ? '+' : ''}{d.y}%</strong></span>
        {d.z !== 1 && <span>Relative volume: <strong style={{ color: '#fff' }}>{d.z}x avg</strong></span>}
        <span>Signal score: <strong style={{ color: '#fff' }}>{d.signal_score}/100</strong></span>
      </div>
    </div>
  )
}

// Quadrant annotation labels rendered as background divs
function QuadrantLabels() {
  const style = {
    position: 'absolute',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '.05em',
    textTransform: 'uppercase',
    opacity: 0.35,
    pointerEvents: 'none',
    userSelect: 'none',
  }
  return (
    <>
      <div style={{ ...style, top: '10%',  left: '55%',  color: '#16A34A' }}>Confirmed Momentum ↗</div>
      <div style={{ ...style, top: '10%',  right: '55%', color: '#2563EB', textAlign: 'right' }}>← Sentiment Leading</div>
      <div style={{ ...style, bottom: '10%', left: '55%',  color: '#D97706' }}>Price Leading ↘</div>
      <div style={{ ...style, bottom: '10%', right: '55%', color: '#DC2626', textAlign: 'right' }}>← Confirmed Weakness</div>
    </>
  )
}

export default function WatchlistChart({ data, mode3D }) {
  if (!data?.length) return null

  // Split data into 4 arrays by quadrant for individual Scatter colors
  const byQuadrant = { Q1: [], Q2: [], Q3: [], Q4: [] }
  data.forEach((r) => {
    if (r.error || r.quadrant == null) return
    const point = {
      x: r.sentiment_score,
      y: r.price_change_7d,
      z: mode3D ? (r.relative_volume ?? 1) : 1,
      ticker: r.ticker,
      company_name: r.company_name,
      quadrant: r.quadrant,
      quadrant_name: r.quadrant_name,
      signal_score: r.signal_score,
    }
    byQuadrant[r.quadrant]?.push(point)
  })

  return (
    <div style={{ position: 'relative' }}>
      {/* Quadrant background shading */}
      <div style={{
        position: 'absolute',
        top: 10, left: 60, right: 20, bottom: 50,
        display: 'grid',
        gridTemplate: '1fr 1fr / 1fr 1fr',
        borderRadius: 4,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}>
        <div style={{ background: '#2563EB08' }} /> {/* Q2 top-left */}
        <div style={{ background: '#16A34A08' }} /> {/* Q1 top-right */}
        <div style={{ background: '#DC262608' }} /> {/* Q3 bottom-left */}
        <div style={{ background: '#D9770608' }} /> {/* Q4 bottom-right */}
      </div>

      <QuadrantLabels />

      <ResponsiveContainer width="100%" height={360}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />

          <XAxis
            type="number"
            dataKey="x"
            name="Sentiment Score"
            domain={[-1, 1]}
            tickCount={9}
            tickFormatter={(v) => v.toFixed(1)}
            label={{ value: 'Sentiment Score →', position: 'insideBottom', offset: -10, fill: '#64748B', fontSize: 12 }}
          />

          <YAxis
            type="number"
            dataKey="y"
            name="7-Day Price Change %"
            tickFormatter={(v) => `${v}%`}
            label={{ value: '7-Day Price Change %', angle: -90, position: 'insideLeft', offset: 10, fill: '#64748B', fontSize: 12 }}
          />

          {mode3D && (
            <ZAxis
              type="number"
              dataKey="z"
              range={[60, 500]}
              name="Relative Volume"
            />
          )}

          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#94A3B8' }} />

          {/* Quadrant dividers */}
          <ReferenceLine x={0} stroke="#94A3B8" strokeDasharray="5 5" strokeWidth={1.5} />
          <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="5 5" strokeWidth={1.5} />

          {Object.entries(byQuadrant).map(([key, points]) => (
            points.length > 0 && (
              <Scatter
                key={key}
                name={QUADRANT_CONFIG[key].name}
                data={points}
                fill={QUADRANT_CONFIG[key].fill}
                fillOpacity={0.85}
              />
            )
          ))}

          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
            formatter={(value, entry) => (
              <span style={{ color: entry.color, fontWeight: 600 }}>{value}</span>
            )}
          />
        </ScatterChart>
      </ResponsiveContainer>

      {mode3D && (
        <p style={{ textAlign: 'center', fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
          Bubble size = relative volume (larger = more trading activity vs 30-day average)
        </p>
      )}
    </div>
  )
}
