import { useEffect, useState } from 'react'
import { T, pnlColor } from '../theme.js'
import { API_BASE } from '../config.js'

const COL = { padding: '3px 8px', textAlign: 'right', fontSize: '11px', fontFamily: T.font, borderBottom: '1px solid #0d0d0d', whiteSpace: 'nowrap' }
const COL_L = { ...COL, textAlign: 'left' }
const TH = { ...COL, color: T.orange, fontSize: '9px', letterSpacing: '1px', padding: '4px 8px', borderBottom: `1px solid ${T.border2}` }
const TH_L = { ...TH, textAlign: 'left' }

export default function TradeLog({ refreshKey }) {
  const [trades, setTrades] = useState([])
  const [filter, setFilter] = useState('ALL')
  const [strategies, setStrategies] = useState([])

  useEffect(() => {
    fetch(`${API_BASE}/api/trades?limit=150`)
      .then(r => r.json())
      .then(data => {
        setTrades(data)
        setStrategies([...new Set(data.map(t => t.strategy_name))])
      })
      .catch(() => {})
  }, [refreshKey])

  const filtered = filter === 'ALL' ? trades : trades.filter(t => t.strategy_name === filter)

  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border2}`, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        background: T.orange, color: '#000', padding: '3px 10px',
        fontSize: '10px', fontWeight: '900', fontFamily: T.font, letterSpacing: '1px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>TRADE HISTORY</span>
        <div style={{ display: 'flex', gap: '2px' }}>
          {['ALL', ...strategies].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '1px 8px', fontSize: '9px', fontFamily: T.font,
              background: filter === s ? '#000' : 'transparent',
              color: filter === s ? T.orange : '#000',
              border: 'none', cursor: 'pointer', fontWeight: '900',
            }}>{s}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: T.bg2 }}>
            <tr>
              <th style={TH_L}>TIME</th>
              <th style={TH_L}>STRATEGY</th>
              <th style={TH_L}>SYMBOL</th>
              <th style={TH_L}>SIDE</th>
              <th style={TH}>ENTRY</th>
              <th style={TH}>EXIT</th>
              <th style={TH}>SIZE</th>
              <th style={TH}>PNL</th>
              <th style={TH}>PNL%</th>
              <th style={TH_L}>REASON</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ ...COL_L, color: T.gray, textAlign: 'center', padding: '16px' }}>NO TRADES YET</td></tr>
            )}
            {filtered.map((t, i) => (
              <tr key={t.id} style={{ background: i % 2 === 0 ? 'transparent' : '#050505' }}>
                <td style={{ ...COL_L, color: T.gray, fontSize: '10px' }}>{t.closed_at?.slice(11, 19) || '-'}</td>
                <td style={{ ...COL_L, color: T.orange }}>{t.strategy_name}</td>
                <td style={{ ...COL_L, color: T.white }}>{t.symbol?.replace(':USDT', '').replace('/', '')}</td>
                <td style={{ ...COL_L, color: t.side === 'long' ? T.green : T.red, fontWeight: '700' }}>
                  {t.side === 'long' ? '▲ L' : '▼ S'}
                </td>
                <td style={COL}>{Number(t.entry_price).toFixed(2)}</td>
                <td style={COL}>{Number(t.exit_price).toFixed(2)}</td>
                <td style={{ ...COL, color: T.gray }}>${t.size?.toFixed(0)}</td>
                <td style={{ ...COL, color: pnlColor(t.pnl), fontWeight: '700' }}>{t.pnl >= 0 ? '+' : ''}${Math.abs(t.pnl).toFixed(2)}</td>
                <td style={{ ...COL, color: pnlColor(t.pnl_pct) }}>{t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct?.toFixed(2)}%</td>
                <td style={{ ...COL_L, color: T.gray, fontSize: '10px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.reason_exit || t.reason_entry || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
