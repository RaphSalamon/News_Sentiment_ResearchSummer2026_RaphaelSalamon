import { Sun } from 'lucide-react'
import ScreenerPage from './components/ScreenerPage'

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__mark" aria-hidden="true">
            <Sun size={20} />
          </span>
          <span className="app-header__name">Sentiment Forecast</span>
        </div>
        <p className="app-header__tagline">
          A quick read on how the news feels about your stocks.
        </p>
      </header>
      <main className="app-main">
        <ScreenerPage />
      </main>
    </div>
  )
}
