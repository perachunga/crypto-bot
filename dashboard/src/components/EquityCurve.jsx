import { useState, useEffect, useCallback } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'
import { T, pnlColor } from '../theme.js'
import { API_BASE } from '../config.js'

const COLORS   = [T.orange, T.green, T.blue, T.yellow, '#cc44ff', '#ff44aa']
const INITIAL  = 10000
const MAX_PTS  = 200

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#000', border: `1px solid ${T.border2}`,
      padding: '8px 12px', fontSize: '11px', fontFamily: T.font, minWidth: '170px',
    }}>
      <p style={{ color: T.gray, marginBottom: '5px', fontSize: '9px', letterSpacing: '1px' }}>{label}</p>
      {payload.map((p, i) => {
        const pnl = p.value
        const col = pnlColor(pnl)
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '2px' }}>
            <span style={{ color: p.color, fontSize: '9px', letterSpacing: '1px' }}>{p.name}</span>
            <span style={{ color: col, fontWeight: '700' }}>
              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function StratBtn({ label, color, active, onClick, pnl }) {
  const col = pnl != null ? pnlColor(pnl) : T.gray
  return (
    <button onClick={onClick} style={{
      padding: '2px 8px', fontSize: '9px', fontFamily: T.font, letterSpacing: '1px',
      background:   active ? '#111' : 'transparent',
      color:        active ? (color || T.orange) : T.gray,
      border:       active ? `1px solid ${color || T.orange}` : `1px solid ${T.border2}`,
      cursor: 'pointer', fontWeight: '700',
      display: 'flex', alignItems: 'center', gap: '5px',
    }}>
      {label}
      {pnl != null && (
        <span style={{ color: col, fontSize: '8px' }}>
          {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(0)}
        </span>
      )}
    </button>
  )
}

export default function EquityCurve({ refreshKey, wsMessage }) {
  const [rawData,    setRawData]    = useState({})   // { strategy: [{ time, equity }] }
  const [strategies, setStrategies] = useState([])
  const [selected,   setSelected]   = useState('ALL')

  const loadEquity = useCallback(() => {
    fetch(`${API_BASE}/api/equity`)
      .then(r => r.json())
      .then(rows => {
        const byStrat = {}
        const strats  = new Set()
        rows.forEach(r => {
          strats.add(r.strategy_name)
          if (!byStrat[r.strategy_name]) byStrat[r.strategy_name] = []
          const ts = r.timestamp?.slice(11, 16) || ''
          byStrat[r.strategy_name].push({ time: ts, equity: r.equity })
        })
        setStrategies([...strats])
        setRawData(byStrat)
      })
      .catch(() => {})
  }, [])

  useEffect(() => { loadEquity() }, [refreshKey, loadEquity])

  // Actualización en tiempo real al cerrar un trade
  useEffect(() => {
    if (!wsMessage || wsMessage.type !== 'trade') return
    const { strategy_name, equity } = wsMessage.data || {}
    if (!strategy_name || equity == null) return
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
    setRawData(prev => {
      const pts = [...(prev[strategy_name] || []), { time: ts, equity }].slice(-MAX_PTS)
      return { ...prev, [strategy_name]: pts }
    })
    setStrategies(prev => prev.includes(strategy_name) ? prev : [...prev, strategy_name])
  }, [wsMessage])

  // PnL de cada estrategia (último valor - INITIAL)
  const stratPnl = (s) => {
    const pts = rawData[s]
    if (!pts?.length) return null
    return pts[pts.length - 1].equity - INITIAL
  }

  // Construir datos del gráfico: eje X = tiempo, cada columna = PnL de una estrategia
  const chartData = (() => {
    const visibles = selected === 'ALL' ? strategies : [selected]
    const merged   = {}
    visibles.forEach(s => {
      ;(rawData[s] || []).forEach(p => {
        if (!merged[p.time]) merged[p.time] = { time: p.time }
        merged[p.time][s] = +(p.equity - INITIAL).toFixed(2)
      })
    })
    return Object.values(merged).slice(-MAX_PTS)
  })()

  const visibles = selected === 'ALL' ? strategies : [selected]
  const isEmpty  = chartData.length === 0

  // Stats globales en modo ALL
  const totalPnl = strategies.reduce((acc, s) => acc + (stratPnl(s) || 0), 0)

  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border2}`, height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        background: T.orange, padding: '3px 10px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '10px', fontWeight: '900', fontFamily: T.font, letterSpacing: '1px', color: '#000' }}>
            PNL CURVE
          </span>
          {selected === 'ALL' && strategies.length > 0 && (
            <span style={{ fontSize: '10px', fontWeight: '700', fontFamily: T.font, color: pnlColor(totalPnl) }}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
          <StratBtn label="ALL" active={selected === 'ALL'} onClick={() => setSelected('ALL')}
            pnl={selected === 'ALL' ? null : null} />
          {strategies.map((s, i) => (
            <StratBtn key={s} label={s} color={COLORS[i % COLORS.length]}
              active={selected === s} onClick={() => setSelected(s)}
              pnl={stratPnl(s)} />
          ))}
        </div>
      </div>

      {/* Gráfico */}
      <div style={{ flex: 1, padding: '8px 4px 4px 0', minHeight: 0 }}>
        {isEmpty ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.gray, fontSize: '11px', fontFamily: T.font }}>
            ESPERANDO DATOS...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <defs>
                {visibles.map((s, i) => {
                  const pnl = stratPnl(s)
                  const c   = pnl != null && pnl < 0 ? T.red : COLORS[i % COLORS.length]
                  return (
                    <linearGradient key={s} id={`g_${s}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={c} stopOpacity={0.0} />
                    </linearGradient>
                  )
                })}
              </defs>

              <CartesianGrid strokeDasharray="2 6" stroke="#111" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: T.gray, fontFamily: T.font }}
                tickLine={false}
                axisLine={{ stroke: T.border2 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={v => `${v >= 0 ? '+' : ''}$${v}`}
                tick={{ fontSize: 9, fill: T.gray, fontFamily: T.font }}
                tickLine={false}
                axisLine={{ stroke: T.border2 }}
                width={58}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke={T.border2} strokeDasharray="4 3" />

              {visibles.map((s, i) => {
                const pnl = stratPnl(s)
                const c   = pnl != null && pnl < 0 ? T.red : COLORS[i % COLORS.length]
                // En modo ALL: solo líneas. En modo single: área rellena
                return selected === 'ALL' ? (
                  <Line key={s} type="stepAfter" dataKey={s} stroke={c}
                    strokeWidth={1.5} dot={false} isAnimationActive={false} />
                ) : (
                  <Area key={s} type="stepAfter" dataKey={s} stroke={c} strokeWidth={2}
                    fill={`url(#g_${s})`} dot={{ r: 2, fill: c }} isAnimationActive={false} />
                )
              })}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
