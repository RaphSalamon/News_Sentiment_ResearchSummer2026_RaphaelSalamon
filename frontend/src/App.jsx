import { useState } from 'react'
import { Sun, Search, MessageCircle, LineChart } from 'lucide-react'
import ScreenerPage from './components/ScreenerPage'
import ChatPage from './components/ChatPage'
import MarketOverviewPage from './components/MarketOverviewPage'

const TABS = [
  { id: 'screener', label: 'Search', icon: Search },
  { id: 'chat', label: 'AI Chat', icon: MessageCircle },
  { id: 'market', label: 'Market', icon: LineChart },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('screener')

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

        <nav className="app-nav">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                className={`app-nav__tab ${isActive ? 'app-nav__tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </header>

      <main className={`app-main ${activeTab === 'market' ? 'app-main--wide' : ''}`}>
        {activeTab === 'screener' && <ScreenerPage />}
        {activeTab === 'chat' && <ChatPage />}
        {activeTab === 'market' && <MarketOverviewPage />}
      </main>
    </div>
  )
}
