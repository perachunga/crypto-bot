import { useState, useEffect, useCallback, useRef } from 'react'
import { T, pnlColor } from '../theme.js'
import { API_BASE } from '../config.js'

const INITIAL = 10000
const COLORS  = [T.orange, T.green, T.blue, T.yellow, '#cc44ff', '#ff44aa']
const W = 100  // viewBox width units (%)
const PAD = { top: 16, right: 8, bottom: 24, left: 56 }

function useMouse(ref) {
  const [pos, setPos] = useState(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const move = e => {
      const r = el.getBoundingClientRect()
      setPos({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height })
    }
    const leave = () => setPos(null)
    el.addEventListener('mousemove', move)
    el.addEventListener('mouseleave', leave)
    return () => { el.removeEventListener('mousemove', move); el.removeEventListener('mouseleave', leave) }
  }, [])
  return pos
}

export default function EquityCurve({ refreshKey, wsMessage }) {
  const [series,     setSeries]     = useState([])   // [{ name, color, points: [{ts, pnl}] }]
  const [selected,   setSelected]   = useState('ALL')
  const svgRef = useRef(null)
  const mouse  = useMouse(svgRef)

  // ── Cargar datos ────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    fetch(`${API_BASE}/api/equity`)
      .then(r => r.json())
      .then(rows => {
        const map = {}
        rows.forEach(r => {
          if (!map[r.strategy_name]) map[r.strategy_name] = []
          map[r.strategy_name].push({ ts: r.timestamp, pnl: +(r.equity - INITIAL).toFixed(2) })
        })
        const built = Object.entries(map).map(([name, pts], i) => ({
          name,
          color: COLORS[i % COLORS.length],
          points: pts.sort((a, b) => a.ts < b.ts ? -1 : 1),
        }))
        setSeries(built)
      })
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [refreshKey, load])

  // Actualización RT al cerrar un trade
  useEffect(() => {
    if (!wsMessage || wsMessage.type !== 'trade') return
    const { strategy_name, equity } = wsMessage.data || {}
    if (!strategy_name || equity == null) return
    const ts  = new Date().toISOString()
    const pnl = +(equity - INITIAL).toFixed(2)
    setSeries(prev => prev.map(s =>
      s.name === strategy_name
        ? { ...s, points: [...s.points, { ts, pnl }].slice(-200) }
        : s
    ))
  }, [wsMessage])

  // ── Datos a mostrar ─────────────────────────────────────────────────────────
  const visible = selected === 'ALL' ? series : series.filter(s => s.name === selected)

  // Timeline común: todos los timestamps de las estrategias visibles, ordenados
  const allTs = [...new Set(visible.flatMap(s => s.points.map(p => p.ts)))].sort()

  // Para cada serie, interpolar PnL en cada timestamp (forward-fill desde 0)
  const aligned = visible.map(s => {
    let last = 0
    const byTs = Object.fromEntries(s.points.map(p => [p.ts, p.pnl]))
    return {
      ...s,
      values: allTs.map(t => {
        if (byTs[t] !== undefined) last = byTs[t]
        return last
      }),
    }
  })

  // ── Escalas ─────────────────────────────────────────────────────────────────
  const allVals = aligned.flatMap(s => s.values)
  const minV = allVals.length ? Math.min(0, ...allVals) : -50
  const maxV = allVals.length ? Math.max(0, ...allVals) : 50
  const padV = Math.max((maxV - minV) * 0.12, 10)
  const yMin = minV - padV
  const yMax = maxV + padV

  const xScale = i  => allTs.length < 2 ? 50 : (i / (allTs.length - 1)) * 100
  const yScale = v  => 100 - ((v - yMin) / (yMax - yMin)) * 100
  const y0      = yScale(0)

  // ── Path SVG ────────────────────────────────────────────────────────────────
  const makePath = values => {
    if (!values.length) return ''
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(2)},${yScale(v).toFixed(2)}`).join(' ')
  }

  // ── Tooltip ─────────────────────────────────────────────────────────────────
  const tooltip = (() => {
    if (!mouse || !allTs.length) return null
    const svgEl = svgRef.current
    if (!svgEl) return null
    const { w, h, x } = mouse
    const innerW = w  // approx
    const pct = x / innerW
    const idx = Math.round(pct * (allTs.length - 1))
    const clampIdx = Math.max(0, Math.min(idx, allTs.length - 1))
    const ts = allTs[clampIdx]
    const label = ts?.slice(11, 16) || ''
    const entries = aligned.map(s => ({ name: s.name, color: s.color, pnl: s.values[clampIdx] }))
    return { idx: clampIdx, label, entries, x: mouse.x, y: mouse.y }
  })()

  // ── Y-axis ticks ────────────────────────────────────────────────────────────
  const range  = yMax - yMin
  const step   = range < 100 ? 25 : range < 300 ? 50 : range < 600 ? 100 : 200
  const ticks  = []
  const start  = Math.ceil(yMin / step) * step
  for (let v = start; v <= yMax; v += step) ticks.push(v)

  // ── X-axis labels ───────────────────────────────────────────────────────────
  const xLabels = allTs.length > 1
    ? [0, Math.floor(allTs.length * 0.25), Math.floor(allTs.length * 0.5),
       Math.floor(allTs.length * 0.75), allTs.length - 1]
        .filter((v, i, a) => a.indexOf(v) === i)
        .map(i => ({ i, label: allTs[i]?.slice(11, 16) || '' }))
    : []

  const totalPnl = series.reduce((acc, s) => {
    const last = s.points[s.points.length - 1]?.pnl ?? 0
    return acc + last
  }, 0)

  const isEmpty = allTs.length === 0

  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border2}`, height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: T.orange, padding: '3px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '10px', fontWeight: '900', fontFamily: T.font, letterSpacing: '1px', color: '#000' }}>PNL CURVE</span>
          <span style={{ fontSize: '10px', fontWeight: '700', fontFamily: T.font, color: pnlColor(totalPnl) }}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
          <button onClick={() => setSelected('ALL')} style={btnStyle(selected === 'ALL', T.orange)}>ALL</button>
          {series.map(s => {
            const last = s.points[s.points.length - 1]?.pnl ?? 0
            return (
              <button key={s.name} onClick={() => setSelected(s.name)} style={btnStyle(selected === s.name, s.color)}>
                {s.name} <span style={{ color: pnlColor(last), marginLeft: 3 }}>{last >= 0 ? '+' : ''}${last.toFixed(0)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Chart */}
      <div ref={svgRef} style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {isEmpty ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.gray, fontSize: '11px', fontFamily: T.font }}>
            ESPERANDO DATOS...
          </div>
        ) : (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
            style={{ display: 'block', overflow: 'visible' }}>

            {/* Grid horizontal */}
            {ticks.map(v => (
              <line key={v}
                x1="0" y1={yScale(v)} x2="100" y2={yScale(v)}
                stroke={v === 0 ? T.border2 : '#141414'} strokeWidth={v === 0 ? 0.3 : 0.2}
                strokeDasharray={v === 0 ? '1 0' : '0.5 1.5'}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* Área de relleno (solo en modo single) */}
            {selected !== 'ALL' && aligned.map(s => {
              if (!s.values.length) return null
              const fillPath = makePath(s.values)
                + ` L${xScale(s.values.length - 1).toFixed(2)},${y0.toFixed(2)}`
                + ` L0,${y0.toFixed(2)} Z`
              const col = pnlColor(s.values[s.values.length - 1])
              return (
                <path key={s.name + '_fill'} d={fillPath}
                  fill={col} fillOpacity={0.08} stroke="none" />
              )
            })}

            {/* Líneas */}
            {aligned.map(s => (
              <path key={s.name} d={makePath(s.values)}
                fill="none" stroke={s.color} strokeWidth="0.5"
                vectorEffect="non-scaling-stroke" />
            ))}

            {/* Último punto de cada serie */}
            {aligned.map(s => {
              if (!s.values.length) return null
              const lx = xScale(s.values.length - 1)
              const ly = yScale(s.values[s.values.length - 1])
              return (
                <circle key={s.name + '_last'} cx={lx} cy={ly} r="1"
                  fill={s.color} vectorEffect="non-scaling-stroke" />
              )
            })}

            {/* Línea vertical del cursor */}
            {tooltip && (
              <line
                x1={xScale(tooltip.idx)} y1="0"
                x2={xScale(tooltip.idx)} y2="100"
                stroke={T.border2} strokeWidth="0.3"
                strokeDasharray="1 1" vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        )}

        {/* Y-axis labels (overlay absoluto) */}
        {!isEmpty && (
          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '50px', pointerEvents: 'none' }}>
            {ticks.map(v => (
              <div key={v} style={{
                position: 'absolute',
                top: `${yScale(v)}%`,
                right: '4px',
                transform: 'translateY(-50%)',
                fontSize: '8px', color: v === 0 ? T.gray : T.gray2,
                fontFamily: T.font, whiteSpace: 'nowrap',
              }}>
                {v >= 0 ? '+' : ''}${v}
              </div>
            ))}
          </div>
        )}

        {/* X-axis labels */}
        {!isEmpty && (
          <div style={{ position: 'absolute', bottom: 0, left: '50px', right: 0, height: '20px', pointerEvents: 'none' }}>
            {xLabels.map(({ i, label }) => (
              <div key={i} style={{
                position: 'absolute',
                left: `${xScale(i)}%`,
                transform: 'translateX(-50%)',
                fontSize: '8px', color: T.gray2, fontFamily: T.font,
              }}>{label}</div>
            ))}
          </div>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: Math.min(tooltip.x + 10, (svgRef.current?.offsetWidth || 400) - 140),
            top:  Math.max(tooltip.y - 60, 4),
            background: '#000', border: `1px solid ${T.border2}`,
            padding: '6px 10px', fontSize: '10px', fontFamily: T.font,
            pointerEvents: 'none', zIndex: 10, minWidth: '130px',
          }}>
            <div style={{ color: T.gray, fontSize: '9px', marginBottom: '4px', letterSpacing: '1px' }}>{tooltip.label}</div>
            {tooltip.entries.map(e => (
              <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '2px' }}>
                <span style={{ color: e.color, fontSize: '9px' }}>{e.name}</span>
                <span style={{ color: pnlColor(e.pnl), fontWeight: '700' }}>
                  {e.pnl >= 0 ? '+' : ''}${e.pnl.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function btnStyle(active, color) {
  return {
    padding: '1px 6px', fontSize: '9px', fontFamily: "'Courier New', monospace",
    letterSpacing: '1px', background: active ? '#111' : 'transparent',
    color: active ? color : '#555',
    border: active ? `1px solid ${color}` : '1px solid #222',
    cursor: 'pointer', fontWeight: '700',
  }
}
