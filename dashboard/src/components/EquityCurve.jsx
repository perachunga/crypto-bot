import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, defs, linearGradient, stop
} from 'recharts'
import { T, pnlColor } from '../theme.js'
import { API_BASE } from '../config.js'

const COLORS   = [T.orange, T.green, T.blue, T.yellow, '#cc44ff', '#ff44aa']
const INITIAL  = 10000
const MAX_PTS  = 200

// Gradiente dinámico: verde si equity ≥ inicial, rojo si no
function GradientDefs({ id, color }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
        <stop offset="95%" stopColor={color} stopOpacity={0.02} />
      </linearGradient>
    </defs>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#000', border: `1px solid ${T.border2}`,
      padding: '8px 12px', fontSize: '11px', fontFamily: T.font,
      minWidth: '160px',
    }}>
      <p style={{ color: T.gray, marginBottom: '6px', fontSize: '10px', letterSpacing: '1px' }}>{label}</p>
      {payload.map((p, i) => {
        const pnl   = p.value - INITIAL
        const color = pnlColor(pnl)
        return (
          <div key={i} style={{ marginBottom: '3px' }}>
            <span style={{ color: T.gray, fontSize: '9px', letterSpacing: '1px' }}>{p.name}</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: p.color }}>${Number(p.value).toFixed(2)}</span>
              <span style={{ color }}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Botón de selección de estrategia
function StratBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '1px 7px', fontSize: '9px', fontFamily: T.font, letterSpacing: '1px',
      background: active ? '#000' : 'transparent',
      color:      active ? T.orange : '#000',
      border:     active ? `1px solid ${T.orange}` : '1px solid transparent',
      cursor: 'pointer', fontWeight: '700',
    }}>{label}</button>
  )
}

export default function EquityCurve({ refreshKey, wsMessage }) {
  const [data,       setData]       = useState([])
  const [strategies, setStrategies] = useState([])
  const [selected,   setSelected]   = useState('ALL')
  // chartMap: { strategyName: [{ time, value }, ...] }
  const [chartMap,   setChartMap]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('equity_chart') || '{}') } catch { return {} }
  })

  // Persistir chartMap en localStorage
  useEffect(() => {
    localStorage.setItem('equity_chart', JSON.stringify(chartMap))
  }, [chartMap])

  // Cargar equity histórico desde API
  const loadEquity = useCallback(() => {
    fetch(`${API_BASE}/api/equity`)
      .then(r => r.json())
      .then(rows => {
        const strats = new Set()
        const byStrat = {}
        rows.forEach(r => {
          strats.add(r.strategy_name)
          if (!byStrat[r.strategy_name]) byStrat[r.strategy_name] = []
          const ts = r.timestamp?.slice(11, 16) || ''
          byStrat[r.strategy_name].push({ time: ts, value: r.equity })
        })
        setStrategies([...strats])
        setChartMap(prev => {
          const next = { ...prev }
          Object.entries(byStrat).forEach(([s, pts]) => { next[s] = pts.slice(-MAX_PTS) })
          return next
        })
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
    setChartMap(prev => {
      const pts = [...(prev[strategy_name] || []), { time: ts, value: equity }].slice(-MAX_PTS)
      return { ...prev, [strategy_name]: pts }
    })
    setStrategies(prev => prev.includes(strategy_name) ? prev : [...prev, strategy_name])
  }, [wsMessage])

  // Construir datos del gráfico según selección
  const visibleStrats = selected === 'ALL' ? strategies : [selected]

  // Para "ALL": merge todos los puntos en una timeline común
  const chartData = (() => {
    if (selected !== 'ALL' && chartMap[selected]) {
      return chartMap[selected].map(p => ({ time: p.time, [selected]: p.value }))
    }
    // Merge por tiempo
    const merged = {}
    visibleStrats.forEach(s => {
      ;(chartMap[s] || []).forEach(p => {
        if (!merged[p.time]) merged[p.time] = { time: p.time }
        merged[p.time][s] = p.value
      })
    })
    return Object.values(merged).slice(-MAX_PTS)
  })()

  // Color dinámico para cada estrategia (verde/rojo/naranja según último valor)
  const stratColor = (strat, idx) => {
    const pts = chartMap[strat]
    if (!pts?.length) return COLORS[idx % COLORS.length]
    const last = pts[pts.length - 1].value
    if (last > INITIAL * 1.001) return T.green
    if (last < INITIAL * 0.999) return T.red
    return COLORS[idx % COLORS.length]
  }

  // Stats rápidas del selected
  const statsFor = (strat) => {
    const pts = chartMap[strat]
    if (!pts?.length) return null
    const last = pts[pts.length - 1].value
    const pnl  = last - INITIAL
    const pct  = (pnl / INITIAL * 100)
    const peak = Math.max(...pts.map(p => p.value))
    const dd   = peak > 0 ? ((peak - last) / peak * 100) : 0
    return { last, pnl, pct, dd }
  }

  const isEmpty = chartData.length === 0

  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border2}`, height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        background: T.orange, padding: '3px 10px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: '10px', fontWeight: '900', fontFamily: T.font, letterSpacing: '1px', color: '#000' }}>
          EQUITY CURVE
        </span>
        <div style={{ display: 'flex', gap: '2px' }}>
          <StratBtn label="ALL" active={selected === 'ALL'} onClick={() => setSelected('ALL')} />
          {strategies.map(s => (
            <StratBtn key={s} label={s} active={selected === s} onClick={() => setSelected(s)} />
          ))}
        </div>
      </div>

      {/* Stats bar — solo cuando hay una estrategia seleccionada */}
      {selected !== 'ALL' && (() => {
        const st = statsFor(selected)
        if (!st) return null
        const pnlC = pnlColor(st.pnl)
        return (
          <div style={{
            display: 'flex', gap: '20px', padding: '4px 12px',
            borderBottom: `1px solid ${T.border2}`, background: '#0d0d0d',
          }}>
            {[
              ['EQUITY',   `$${st.last.toFixed(2)}`,                           T.white],
              ['PNL',      `${st.pnl >= 0 ? '+' : ''}$${st.pnl.toFixed(2)}`,  pnlC],
              ['RETURN',   `${st.pct >= 0 ? '+' : ''}${st.pct.toFixed(2)}%`,  pnlC],
              ['MAX DD',   `${st.dd.toFixed(2)}%`,                              st.dd > 5 ? T.red : T.gray],
            ].map(([lbl, val, col]) => (
              <div key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '8px', color: T.gray, fontFamily: T.font, letterSpacing: '1px' }}>{lbl}</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: col, fontFamily: T.font }}>{val}</span>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Gráfico */}
      <div style={{ flex: 1, padding: '8px 4px 4px 0', minHeight: 0 }}>
        {isEmpty ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.gray, fontSize: '11px', fontFamily: T.font }}>
            ESPERANDO DATOS...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>

              {/* Gradientes por estrategia */}
              <defs>
                {visibleStrats.map((s, i) => {
                  const c = stratColor(s, i)
                  return (
                    <linearGradient key={s} id={`grad_${s}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={c} stopOpacity={0.02} />
                    </linearGradient>
                  )
                })}
              </defs>

              <CartesianGrid strokeDasharray="2 6" stroke="#151515" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: T.gray, fontFamily: T.font }}
                tickLine={false}
                axisLine={{ stroke: T.border2 }}
              />
              <YAxis
                tickFormatter={v => `$${(v/1000).toFixed(1)}k`}
                tick={{ fontSize: 9, fill: T.gray, fontFamily: T.font }}
                tickLine={false}
                axisLine={{ stroke: T.border2 }}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={INITIAL}
                stroke={T.border2}
                strokeDasharray="4 3"
                label={{ value: 'BASE', fill: T.gray2, fontSize: 8, fontFamily: T.font }}
              />

              {visibleStrats.map((s, i) => {
                const c = stratColor(s, i)
                return (
                  <Area
                    key={s}
                    type="monotone"
                    dataKey={s}
                    stroke={c}
                    strokeWidth={1.5}
                    fill={`url(#grad_${s})`}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                )
              })}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
