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

export default function App() {
  const [activeTab, setActiveTab] = useState('screener')

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="app-nav__brand">
          Stock<span>Buddy</span>
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
      </nav>

      <main className={`app-main${activeTab === 'market' ? ' app-main--wide' : ''}`}>
        {activeTab === 'screener' && <ScreenerPage />}
        {activeTab === 'chat'     && <ChatPage />}
        {activeTab === 'market'   && <MarketOverviewPage />}
      </main>
    </div>
  )
}