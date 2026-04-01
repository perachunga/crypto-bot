import { useState, useEffect, useRef } from 'react'
import { T } from '../theme.js'

// Símbolo WS → label corto
const LABELS = {
  BTCUSDT:  'BTC/USDT',
  ETHUSDT:  'ETH/USDT',
  SOLUSDT:  'SOL/USDT',
  BNBUSDT:  'BNB/USDT',
}

function TickCell({ symbol, tick, book }) {
  const [flash, setFlash] = useState(null)   // 'up' | 'down' | null
  const prevPrice = useRef(null)
  const price     = tick?.price ?? 0
  const bid       = book?.bid   ?? 0
  const ask       = book?.ask   ?? 0
  const spread    = ask > 0 && bid > 0 ? (ask - bid).toFixed(2) : '-'

  useEffect(() => {
    if (!price || prevPrice.current === null) {
      prevPrice.current = price
      return
    }
    const dir = price > prevPrice.current ? 'up' : price < prevPrice.current ? 'down' : null
    prevPrice.current = price
    if (dir) {
      setFlash(dir)
      const t = setTimeout(() => setFlash(null), 180)
      return () => clearTimeout(t)
    }
  }, [price])

  const priceColor = flash === 'up' ? T.green : flash === 'down' ? T.red : T.white
  const arrow      = flash === 'up' ? '▲' : flash === 'down' ? '▼' : '■'
  const arrowColor = flash === 'up' ? T.green : flash === 'down' ? T.red : T.border2

  if (!price) return null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '0 16px', borderRight: `1px solid #1a1a1a`, minWidth: '160px',
      background: flash ? (flash === 'up' ? 'rgba(0,255,65,0.04)' : 'rgba(255,51,51,0.04)') : 'transparent',
      transition: 'background 0.18s',
    }}>
      {/* Label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '9px', color: T.orange, letterSpacing: '1px', fontFamily: T.font }}>{LABELS[symbol] || symbol}</span>
        <span style={{ fontSize: '11px', color: arrowColor, fontFamily: T.font }}>{arrow}</span>
      </div>
      {/* Price */}
      <span style={{
        fontSize: '20px', fontWeight: '900', fontFamily: T.font,
        color: priceColor, letterSpacing: '0.5px', lineHeight: 1.1,
        transition: 'color 0.15s',
      }}>
        {price > 1000
          ? price.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
          : price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      {/* Bid / Ask / Spread */}
      <div style={{ display: 'flex', gap: '6px', fontSize: '9px', fontFamily: T.font, marginTop: '1px' }}>
        <span style={{ color: T.green }}>B:{bid > 1000 ? bid.toFixed(1) : bid.toFixed(2)}</span>
        <span style={{ color: T.red }}>A:{ask > 1000 ? ask.toFixed(1) : ask.toFixed(2)}</span>
        <span style={{ color: T.gray }}>SPR:{spread}</span>
      </div>
    </div>
  )
}

export default function TickerBar({ wsMessage }) {
  // { BTCUSDT: {price, qty, ts}, ... }
  const [ticks, setTicks]  = useState({})
  const [books, setBooks]  = useState({})

  useEffect(() => {
    if (!wsMessage) return

    if (wsMessage.type === 'tick') {
      const { symbol, price, qty, is_buyer_maker, timestamp } = wsMessage.data
      setTicks(prev => ({ ...prev, [symbol]: { price, qty, is_buyer_maker, timestamp } }))
    }

    if (wsMessage.type === 'book') {
      const { symbol, bid, ask } = wsMessage.data
      setBooks(prev => ({ ...prev, [symbol]: { bid, ask } }))
    }
  }, [wsMessage])

  const symbols = Object.keys(ticks).length > 0 ? Object.keys(ticks) : ['BTCUSDT', 'ETHUSDT']

  return (
    <div style={{
      height: '56px',
      background: '#050505',
      borderBottom: `1px solid ${T.border2}`,
      display: 'flex', alignItems: 'stretch', flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Label izquierda */}
      <div style={{
        background: T.bg1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 12px', borderRight: `1px solid ${T.border2}`,
        minWidth: '70px',
      }}>
        <span style={{ fontSize: '9px', color: T.orange, fontFamily: T.font, fontWeight: '900', letterSpacing: '1px', writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
          LIVE MKT
        </span>
      </div>

      {/* Tickers */}
      {symbols.map(sym => (
        <TickCell key={sym} symbol={sym} tick={ticks[sym]} book={books[sym]} />
      ))}
    </div>
  )
}
