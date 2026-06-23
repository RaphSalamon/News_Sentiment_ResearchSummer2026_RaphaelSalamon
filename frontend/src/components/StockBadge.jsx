import { Sun, CloudSun, CloudRain } from 'lucide-react'

const VARIANTS = {
  BUY: { icon: Sun, className: 'badge badge--buy', text: 'Buy' },
  HOLD: { icon: CloudSun, className: 'badge badge--hold', text: 'Hold' },
  AVOID: { icon: CloudRain, className: 'badge badge--avoid', text: 'Avoid' },
}

export default function StockBadge({ label, score }) {
  const variant = VARIANTS[label] ?? VARIANTS.HOLD
  const Icon = variant.icon
  const formattedScore = typeof score === 'number' ? score.toFixed(2) : score

  return (
    <div className={variant.className}>
      <Icon size={16} aria-hidden="true" />
      <span className="badge__text">{variant.text}</span>
      <span className="badge__score">
        {Number(score) > 0 ? `+${formattedScore}` : formattedScore}
      </span>
    </div>
  )
}
