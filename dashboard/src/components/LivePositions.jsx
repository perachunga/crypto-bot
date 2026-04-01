import { useEffect, useState } from 'react'
import { T, pnlColor } from '../theme.js'
import { API_BASE } from '../config.js'

const COL = { padding: '3px 8px', textAlign: 'right', fontSize: '11px', fontFamily: T.font, borderBottom: '1px solid #111', whiteSpace: 'nowrap' }
const COL_L = { ...COL, textAlign: 'left' }
const TH = { ...COL, color: T.orange, fontSize: '9px', letterSpacing: '1px', padding: '4px 8px', borderBottom: `1px solid ${T.border2}` }
const TH_L = { ...TH, textAlign: 'left' }

function elapsed(openedAt) {
  if (!openedAt) return '-'
  const diff = Date.now() - new Date(openedAt.includes('Z') ? openedAt : openedAt + 'Z').getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`
}

export default function LivePositions({ wsMessage }) {
  const [positions, setPositions] = useState([])

  useEffect(() => {
    const load = () => fetch(`${API_BASE}/api/positions`).then(r => r.json()).then(setPositions).catch(() => {})
    load()
    const iv = setInterval(load, 5000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (!wsMessage || wsMessage.type !== 'prices') return
    const { unrealized_pnl } = wsMessage.data
    setPositions(prev => prev.map(p => ({ ...p, unrealized_pnl: unrealized_pnl[p.id] ?? p.unrealized_pnl ?? 0 })))
  }, [wsMessage])

  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border2}`, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: T.orange, color: '#000', padding: '3px 10px', fontSize: '10px', fontWeight: '900', fontFamily: T.font, letterSpacing: '1px', display: 'flex', justifyContent: 'space-between' }}>
        <span>OPEN POSITIONS</span>
        {positions.length > 0 && (
          <span style={{ background: '#000', color: T.orange, padding: '0 6px', fontWeight: '900' }}>{positions.length}</span>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0a0a0a' }}>
              <th style={TH_L}>STRATEGY</th>
              <th style={TH_L}>SYMBOL</th>
              <th style={TH_L}>SIDE</th>
              <th style={TH}>ENTRY</th>
              <th style={TH}>CURR</th>
              <th style={TH}>SIZE</th>
              <th style={TH}>SL</th>
              <th style={TH}>TP</th>
              <th style={TH}>uPNL</th>
              <th style={TH}>uPNL%</th>
              <th style={TH}>AGE</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 && (
              <tr><td colSpan={11} style={{ ...COL_L, color: T.gray, textAlign: 'center', padding: '16px' }}>NO OPEN POSITIONS</td></tr>
            )}
            {positions.map((pos, i) => {
              const upnl = pos.unrealized_pnl ?? 0
              const upnlPct = pos.size > 0 ? upnl / pos.size * 100 : 0
              return (
                <tr key={pos.id} style={{ background: i % 2 === 0 ? 'transparent' : '#050505' }}>
                  <td style={{ ...COL_L, color: T.orange, fontWeight: '700' }}>{pos.strategy_name}</td>
                  <td style={{ ...COL_L, color: T.white }}>{pos.symbol.replace(':USDT', '').replace('/', '')}</td>
                  <td style={{ ...COL_L, color: pos.side === 'long' ? T.green : T.red, fontWeight: '700' }}>
                    {pos.side === 'long' ? '▲ LONG' : '▼ SHORT'}
                  </td>
                  <td style={{ ...COL, color: T.white }}>{Number(pos.entry_price).toFixed(2)}</td>
                  <td style={{ ...COL, color: T.yellow }}>{pos.current_price ? Number(pos.current_price).toFixed(2) : '-'}</td>
                  <td style={{ ...COL, color: T.gray }}>${pos.size.toFixed(0)}</td>
                  <td style={{ ...COL, color: T.red, fontSize: '10px' }}>{pos.stop_loss ? Number(pos.stop_loss).toFixed(2) : '-'}</td>
                  <td style={{ ...COL, color: T.green, fontSize: '10px' }}>{pos.take_profit ? Number(pos.take_profit).toFixed(2) : '-'}</td>
                  <td style={{ ...COL, color: pnlColor(upnl), fontWeight: '700' }}>{upnl >= 0 ? '+' : ''}${Math.abs(upnl).toFixed(2)}</td>
                  <td style={{ ...COL, color: pnlColor(upnlPct) }}>{upnlPct >= 0 ? '+' : ''}{upnlPct.toFixed(2)}%</td>
                  <td style={{ ...COL, color: T.gray }}>{elapsed(pos.opened_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
