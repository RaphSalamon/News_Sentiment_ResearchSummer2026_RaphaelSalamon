import { useState } from 'react'
import { Search, MessageCircle, LineChart } from 'lucide-react'
import ScreenerPage from './components/ScreenerPage'
import ChatPage from './components/ChatPage'
import MarketOverviewPage from './components/MarketOverviewPage'

const TABS = [
  { id: 'screener', label: 'Search',  icon: Search },
  { id: 'chat',     label: 'AI Chat', icon: MessageCircle },
  { id: 'market',   label: 'Market',  icon: LineChart },
]

function MarketStatus() {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const h = et.getHours(), m = et.getMinutes(), day = et.getDay()
  const open = day >= 1 && day <= 5 && (h > 9 || (h === 9 && m >= 30)) && h < 16
  return (
    <div className="app-nav__status">
      <span className="app-nav__status-dot" style={{ background: open ? 'var(--buy)' : 'var(--ink-muted)', boxShadow: open ? '0 0 6px var(--buy)' : 'none' }} />
      {open ? 'Market Open' : 'Market Closed'}
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('screener')
  const [screenerResults, setScreenerResults] = useState([])

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="app-nav__brand">
          <span className="app-nav__dot" />
          StockBuddy
        </div>

        <div className="app-nav__tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                className={`app-nav__tab${active ? ' app-nav__tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        <MarketStatus />
      </nav>

      <main className="app-main">
        {activeTab === 'screener' && <ScreenerPage onResults={setScreenerResults} />}
        {activeTab === 'chat'     && <ChatPage />}
        {activeTab === 'market'   && <MarketOverviewPage screenerResults={screenerResults} />}
      </main>
    </div>
  )
}