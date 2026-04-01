import { useState, useEffect } from 'react'
import { T, pnlColor } from '../theme.js'
import { API_BASE } from '../config.js'

export default function MMPanel({ wsMessage }) {
  const [state, setState] = useState([])
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    const load = () => {
      fetch(`${API_BASE}/api/mm`).then(r => r.json()).then(setState).catch(() => {})
      fetch(`${API_BASE}/api/metrics/MarketMaker`).then(r => r.json()).then(setMetrics).catch(() => {})
    }
    load()
    const iv = setInterval(load, 3000)
    return () => clearInterval(iv)
  }, [])

  // Actualizar en cada trade de MM
  useEffect(() => {
    if (wsMessage?.type === 'trade' && wsMessage.data?.strategy_name === 'MarketMaker') {
      fetch(`${API_BASE}/api/mm`).then(r => r.json()).then(setState).catch(() => {})
      fetch(`${API_BASE}/api/metrics/MarketMaker`).then(r => r.json()).then(setMetrics).catch(() => {})
    }
  }, [wsMessage])

  const cell = { padding: '4px 10px', fontSize: '11px', fontFamily: T.font, borderBottom: '1px solid #0d0d0d', textAlign: 'right', whiteSpace: 'nowrap' }
  const cellL = { ...cell, textAlign: 'left' }
  const th = { ...cell, fontSize: '9px', color: T.orange, letterSpacing: '1px', borderBottom: `1px solid ${T.border2}` }
  const thL = { ...th, textAlign: 'left' }

  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border2}`, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ background: T.orange, color: '#000', padding: '4px 10px', fontWeight: '900', fontSize: '10px', fontFamily: T.font, letterSpacing: '2px', display: 'flex', justifyContent: 'space-between' }}>
        <span>MARKET MAKER — A-S MODEL</span>
        <span style={{ fontSize: '9px' }}>HIGH FREQUENCY</span>
      </div>

      {/* Métricas globales del MM */}
      {metrics && (
        <div style={{ display: 'flex', padding: '6px 10px', borderBottom: `1px solid ${T.border2}`, flexWrap: 'wrap', gap: '16px' }}>
          {[
            { label: 'TRADES',    value: metrics.trades,                       color: T.blue },
            { label: 'WIN%',      value: `${metrics.win_rate?.toFixed(1)}%`,    color: metrics.win_rate >= 55 ? T.green : T.red },
            { label: 'TOTAL PNL', value: `${metrics.total_pnl >= 0 ? '+' : ''}$${Math.abs(metrics.total_pnl || 0).toFixed(2)}`, color: pnlColor(metrics.total_pnl) },
            { label: 'AVG WIN',   value: `$${(metrics.avg_win || 0).toFixed(3)}`,   color: T.green },
            { label: 'AVG LOSS',  value: `-$${Math.abs(metrics.avg_loss || 0).toFixed(3)}`, color: T.red },
            { label: 'SHARPE',    value: (metrics.sharpe || 0).toFixed(2),      color: (metrics.sharpe || 0) >= 1 ? T.green : T.yellow },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontSize: '8px', color: T.orange, fontFamily: T.font, letterSpacing: '1px' }}>{label}</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color, fontFamily: T.font }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabla de inventario y cotizaciones */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: T.bg2 }}>
            <tr>
              <th style={thL}>SYMBOL</th>
              <th style={thL}>STATUS</th>
              <th style={th}>INVENTORY</th>
              <th style={th}>AVG ENTRY</th>
              <th style={th}>OUR BID</th>
              <th style={th}>OUR ASK</th>
              <th style={th}>SPREAD</th>
              <th style={th}>SPREAD BPS</th>
            </tr>
          </thead>
          <tbody>
            {state.length === 0 && (
              <tr><td colSpan={8} style={{ ...cellL, color: T.gray, textAlign: 'center', padding: '20px' }}>
                SIN DATOS — ESPERANDO TICKS...
              </td></tr>
            )}
            {state.map((row, i) => {
              const bid     = row.quotes?.bid ?? 0
              const ask     = row.quotes?.ask ?? 0
              const mid     = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0
              const spread  = ask - bid
              const spreadBps = mid > 0 ? (spread / mid * 10000) : 0

              return (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : '#050505' }}>
                  <td style={{ ...cellL, color: T.white, fontWeight: '700' }}>
                    {row.symbol?.replace(':USDT', '').replace('/', '')}
                  </td>
                  <td style={cellL}>
                    <span style={{
                      fontSize: '9px', fontWeight: '900', fontFamily: T.font,
                      color: row.side === 'flat' ? T.gray : row.side === 'long' ? T.green : T.red,
                      background: row.side === 'flat' ? '#111' : row.side === 'long' ? '#001a00' : '#1a0000',
                      padding: '1px 6px',
                    }}>
                      {row.side?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ ...cell, color: pnlColor(row.inventory_usdt) }}>
                    {row.inventory_usdt >= 0 ? '+' : ''} ${Math.abs(row.inventory_usdt).toFixed(2)}
                  </td>
                  <td style={{ ...cell, color: T.gray }}>
                    {row.avg_entry > 0 ? `$${row.avg_entry.toFixed(2)}` : '-'}
                  </td>
                  <td style={{ ...cell, color: T.green }}>
                    {bid > 0 ? `$${bid.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td style={{ ...cell, color: T.red }}>
                    {ask > 0 ? `$${ask.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td style={{ ...cell, color: T.yellow }}>
                    {spread > 0 ? `$${spread.toFixed(2)}` : '-'}
                  </td>
                  <td style={{ ...cell, color: spreadBps > 0 && spreadBps < 10 ? T.green : T.yellow }}>
                    {spreadBps > 0 ? `${spreadBps.toFixed(1)} bps` : '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Nota del modelo */}
      <div style={{ padding: '4px 10px', borderTop: `1px solid #111`, fontSize: '9px', color: T.gray, fontFamily: T.font }}>
        MODEL: AVELLANEDA-STOIKOV  |  QUOTE SIZE: $150 MARGIN (10x → $1,500 NOTIONAL)  |  MAX INVENTORY: $600  |  ADVERSE SEL FILTER: CVD&gt;35%
      </div>
    </div>
  )
}
