import { useEffect, useState } from 'react'
import { T, pnlColor } from '../theme.js'
import { API_BASE } from '../config.js'

const COL = { padding: '3px 8px', textAlign: 'right', fontFamily: T.font, fontSize: '11px', borderBottom: `1px solid #111`, whiteSpace: 'nowrap' }
const COL_L = { ...COL, textAlign: 'left' }
const TH = { ...COL, color: T.orange, fontSize: '9px', letterSpacing: '1px', padding: '4px 8px', borderBottom: `1px solid ${T.border2}` }
const TH_L = { ...TH, textAlign: 'left' }

function Bar({ value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
      <div style={{ width: '50px', height: '3px', background: '#1a1a1a' }}>
        <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color }} />
      </div>
      <span style={{ color, minWidth: '34px', fontSize: '11px' }}>{value.toFixed(1)}%</span>
    </div>
  )
}

export default function StrategyTable({ refreshKey }) {
  const [metrics, setMetrics] = useState([])

  useEffect(() => {
    fetch(`${API_BASE}/api/metrics`)
      .then(r => r.json())
      .then(setMetrics)
      .catch(() => {})
  }, [refreshKey])

  const sorted = [...metrics].sort((a, b) => b.total_pnl - a.total_pnl)

  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border2}`, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: T.orange, color: '#000', padding: '3px 10px', fontSize: '10px', fontWeight: '900', fontFamily: T.font, letterSpacing: '1px' }}>
        STRATEGY PERFORMANCE
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0a0a0a' }}>
              <th style={TH_L}>STRATEGY</th>
              <th style={TH}>TRD</th>
              <th style={TH}>WIN%</th>
              <th style={TH}>PNL</th>
              <th style={TH}>AVG W</th>
              <th style={TH}>AVG L</th>
              <th style={TH}>SHRP</th>
              <th style={TH}>DD%</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={8} style={{ ...COL_L, color: T.gray, textAlign: 'center', padding: '20px' }}>NO TRADES YET</td></tr>
            )}
            {sorted.map((m, i) => (
              <tr key={m.strategy} style={{ background: i % 2 === 0 ? 'transparent' : '#050505' }}>
                <td style={{ ...COL_L, color: T.orange, fontWeight: '700' }}>{m.strategy}</td>
                <td style={{ ...COL, color: T.blue }}>{m.trades}</td>
                <td style={COL}><Bar value={m.win_rate} color={m.win_rate >= 55 ? T.green : m.win_rate >= 45 ? T.yellow : T.red} /></td>
                <td style={{ ...COL, color: pnlColor(m.total_pnl), fontWeight: '700' }}>{m.total_pnl >= 0 ? '+' : ''}${m.total_pnl.toFixed(2)}</td>
                <td style={{ ...COL, color: T.green }}>${m.avg_win.toFixed(2)}</td>
                <td style={{ ...COL, color: T.red }}>-${Math.abs(m.avg_loss).toFixed(2)}</td>
                <td style={{ ...COL, color: m.sharpe >= 1 ? T.green : m.sharpe >= 0 ? T.yellow : T.red }}>{m.sharpe.toFixed(2)}</td>
                <td style={{ ...COL, color: m.max_drawdown > 15 ? T.red : T.gray }}>{m.max_drawdown.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
