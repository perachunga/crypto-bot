import { useEffect, useState } from 'react'
import { T, pnlColor } from '../theme.js'

const MAX = 40

export default function SignalFeed({ wsMessage }) {
  const [events, setEvents] = useState([])

  useEffect(() => {
    if (!wsMessage) return
    if (wsMessage.type === 'signal' || wsMessage.type === 'trade') {
      setEvents(prev => [{
        ...wsMessage.data,
        _type: wsMessage.type,
        _id: Date.now() + Math.random(),
        _ts: new Date().toLocaleTimeString('en-US', { hour12: false }),
      }, ...prev].slice(0, MAX))
    }
  }, [wsMessage])

  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border2}`, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: T.orange, color: '#000', padding: '3px 10px', fontSize: '10px', fontWeight: '900', fontFamily: T.font, letterSpacing: '1px' }}>
        SIGNAL / TRADE FEED
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '2px 0' }}>
        {events.length === 0 && (
          <div style={{ color: T.gray, textAlign: 'center', padding: '16px', fontSize: '11px', fontFamily: T.font }}>
            WAITING FOR SIGNALS...
          </div>
        )}
        {events.map(ev => (
          <div key={ev._id} style={{
            padding: '3px 10px',
            borderBottom: '1px solid #0d0d0d',
            display: 'flex', gap: '8px', alignItems: 'center',
            background: ev._type === 'trade' ? '#0a0800' : 'transparent',
            fontSize: '11px', fontFamily: T.font,
          }}>
            <span style={{ color: T.gray, minWidth: '52px', fontSize: '10px' }}>{ev._ts}</span>
            <span style={{
              fontSize: '9px', padding: '1px 5px', fontWeight: '900',
              background: ev._type === 'trade' ? T.yellow : T.border2,
              color: ev._type === 'trade' ? '#000' : T.gray,
            }}>
              {ev._type === 'trade' ? 'CLOSE' : 'SIG'}
            </span>
            <span style={{ color: T.orange, minWidth: '80px' }}>{ev.strategy || ev.strategy_name}</span>
            <span style={{ color: T.white, minWidth: '70px' }}>
              {(ev.symbol || '').replace(':USDT', '').replace('/', '')}
            </span>
            {ev._type === 'signal' && (
              <>
                <span style={{ color: ev.side === 'long' ? T.green : T.red, fontWeight: '700', minWidth: '55px' }}>
                  {ev.side === 'long' ? '▲ LONG' : '▼ SHORT'}
                </span>
                <span style={{ color: T.yellow }}>${Number(ev.price || 0).toFixed(2)}</span>
                <span style={{ color: T.gray, fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.reason}
                </span>
              </>
            )}
            {ev._type === 'trade' && (
              <>
                <span style={{ color: pnlColor(ev.pnl), fontWeight: '700', minWidth: '70px' }}>
                  {ev.pnl >= 0 ? '+' : ''}${Math.abs(ev.pnl).toFixed(2)}
                </span>
                <span style={{ color: pnlColor(ev.pnl_pct), fontSize: '10px', minWidth: '50px' }}>
                  {ev.pnl_pct >= 0 ? '+' : ''}{ev.pnl_pct?.toFixed(2)}%
                </span>
                <span style={{ color: T.gray, fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.reason_exit}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
