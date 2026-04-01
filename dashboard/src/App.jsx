import { useEffect, useState, useCallback } from 'react'
import { useWebSocket }    from './hooks/useWebSocket.js'
import MetricsBar          from './components/MetricsBar.jsx'
import TickerBar           from './components/TickerBar.jsx'
import EquityCurve         from './components/EquityCurve.jsx'
import StrategyTable       from './components/StrategyTable.jsx'
import TradeLog            from './components/TradeLog.jsx'
import LivePositions       from './components/LivePositions.jsx'
import SignalFeed          from './components/SignalFeed.jsx'
import StrategiesPanel     from './components/StrategiesPanel.jsx'
import MMPanel             from './components/MMPanel.jsx'
import { T } from './theme.js'
import { API_BASE, WS_URL } from './config.js'

const REFRESH_MS = 15000
const TABS = ['OVERVIEW', 'STRATEGIES', 'MM', 'TRADES', 'POSITIONS', 'SIGNALS']

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])
  return (
    <span style={{ fontFamily: T.font, fontSize: '12px', color: T.orange, letterSpacing: '2px' }}>
      {time.toLocaleTimeString('en-US', { hour12: false })}
    </span>
  )
}

export default function App() {
  const [summary,    setSummary]    = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab,        setTab]        = useState('OVERVIEW')

  const { lastMessage, connected } = useWebSocket(WS_URL)

  const loadSummary = useCallback(() => {
    fetch(`${API_BASE}/api/summary`).then(r => r.json()).then(setSummary).catch(() => {})
  }, [])

  useEffect(() => {
    loadSummary()
    const iv = setInterval(() => { loadSummary(); setRefreshKey(k => k + 1) }, REFRESH_MS)
    return () => clearInterval(iv)
  }, [loadSummary])

  useEffect(() => {
    if (!lastMessage) return
    if (lastMessage.type === 'trade' || lastMessage.type === 'reset') {
      setTimeout(() => { loadSummary(); setRefreshKey(k => k + 1) }, 500)
    }
  }, [lastMessage, loadSummary])

  // F-keys
  useEffect(() => {
    const handler = (e) => {
      const idx = parseInt(e.key.replace('F', '')) - 1
      if (!isNaN(idx) && idx >= 0 && idx < TABS.length) {
        e.preventDefault()
        setTab(TABS[idx])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const HEADER_H  = 32
  const METRICS_H = 52
  const TICKER_H  = 56
  const FKEY_H    = 26
  const CONTENT_H = `calc(100vh - ${HEADER_H + METRICS_H + TICKER_H + FKEY_H}px)`

  return (
    <div style={{
      height: '100vh', overflow: 'hidden',
      background: T.bg, color: T.white, fontFamily: T.font,
      display: 'flex', flexDirection: 'column',
    }}>

      {/* ── HEADER ── */}
      <div style={{
        height: HEADER_H, background: T.bg1, borderBottom: `1px solid ${T.border2}`,
        display: 'flex', alignItems: 'center', padding: '0 12px',
        justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            background: T.orange, color: '#000',
            padding: '2px 10px', fontWeight: '900', fontSize: '12px', letterSpacing: '2px',
          }}>CRYPTO</span>
          <span style={{ fontSize: '10px', color: T.gray, letterSpacing: '1px' }}>
            PAPER TRADING TERMINAL
          </span>
          <span style={{ fontSize: '9px', color: T.border2 }}>|</span>
          <span style={{ fontSize: '10px', color: T.border2 }}>
            REAL MARKET DATA • SIMULATED ORDERS
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '9px', color: connected ? T.green : T.red, letterSpacing: '1px' }}>
            {connected ? '● WS LIVE' : '○ WS OFF'}
          </span>
          <Clock />
        </div>
      </div>

      {/* ── METRICS ── */}
      <div style={{ flexShrink: 0 }}>
        <MetricsBar summary={summary} connected={connected} />
      </div>

      {/* ── TICKER (precios tick-by-tick) ── */}
      <TickerBar wsMessage={lastMessage} />

      {/* ── MAIN CONTENT ── */}
      <div style={{ height: CONTENT_H, overflow: 'hidden' }}>

        {tab === 'OVERVIEW' && (
          <div style={{ display: 'grid', gridTemplateRows: '55% 22% 23%', height: '100%', gap: '1px', background: T.border2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '58% 42%', gap: '1px', background: T.border2 }}>
              <EquityCurve refreshKey={refreshKey} wsMessage={lastMessage} />
              <StrategyTable refreshKey={refreshKey} />
            </div>
            <LivePositions wsMessage={lastMessage} />
            <SignalFeed wsMessage={lastMessage} />
          </div>
        )}

        {tab === 'STRATEGIES' && (
          <div style={{ height: '100%' }}>
            <StrategiesPanel />
          </div>
        )}

        {tab === 'MM' && (
          <div style={{ height: '100%' }}>
            <MMPanel wsMessage={lastMessage} />
          </div>
        )}

        {tab === 'TRADES' && (
          <div style={{ height: '100%' }}>
            <TradeLog refreshKey={refreshKey} />
          </div>
        )}

        {tab === 'POSITIONS' && (
          <div style={{ height: '100%' }}>
            <LivePositions wsMessage={lastMessage} />
          </div>
        )}

        {tab === 'SIGNALS' && (
          <div style={{ height: '100%' }}>
            <SignalFeed wsMessage={lastMessage} />
          </div>
        )}
      </div>

      {/* ── F-KEY BAR ── */}
      <div style={{
        height: FKEY_H, background: '#0a0a0a',
        borderTop: `2px solid ${T.orange}`,
        display: 'flex', alignItems: 'stretch', flexShrink: 0,
      }}>
        {TABS.map((label, i) => (
          <button key={label} onClick={() => setTab(label)} style={{
            display: 'flex', alignItems: 'stretch', border: 'none',
            borderRight: `1px solid ${T.border2}`, cursor: 'pointer', padding: 0,
            background: tab === label ? T.orange : 'transparent',
          }}>
            <span style={{
              background: tab === label ? '#000' : T.border2,
              color: tab === label ? T.orange : T.gray,
              padding: '0 6px', fontSize: '9px', fontWeight: '900',
              fontFamily: T.font, display: 'flex', alignItems: 'center',
              minWidth: '22px', justifyContent: 'center', letterSpacing: '1px',
            }}>F{i + 1}</span>
            <span style={{
              padding: '0 10px', fontSize: '9px', fontWeight: '900',
              fontFamily: T.font, letterSpacing: '1px', display: 'flex', alignItems: 'center',
              color: tab === label ? '#000' : T.gray,
            }}>{label}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', gap: '14px' }}>
          <span style={{ fontSize: '9px', color: T.gray, fontFamily: T.font, letterSpacing: '1px' }}>PABLO NUÑEZ</span>
          <span style={{ fontSize: '9px', color: T.orange, fontFamily: T.font, letterSpacing: '2px', fontWeight: '900' }}>PAPER MODE</span>
        </div>
      </div>

    </div>
  )
}
