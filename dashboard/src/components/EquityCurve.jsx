import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { T } from '../theme.js'
import { API_BASE } from '../config.js'

const COLORS = [T.orange, T.green, T.blue, T.yellow, '#cc44ff', '#ff44aa']
const INITIAL_CAPITAL = 10000

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#000', border: `1px solid ${T.orange}`,
      padding: '8px 12px', fontSize: '11px', fontFamily: T.font,
    }}>
      <p style={{ color: T.gray, marginBottom: '4px', fontSize: '10px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <strong>${Number(p.value).toFixed(2)}</strong>
        </p>
      ))}
    </div>
  )
}

export default function EquityCurve({ refreshKey }) {
  const [data, setData] = useState([])
  const [strategies, setStrategies] = useState([])
  const [selected, setSelected] = useState('ALL')

  useEffect(() => {
    fetch(`${API_BASE}/api/equity`)
      .then(r => r.json())
      .then(rows => {
        const byTime = {}
        const strats = new Set()
        rows.forEach(r => {
          const ts = r.timestamp?.slice(11, 16) || ''
          if (!byTime[ts]) byTime[ts] = { time: ts }
          byTime[ts][r.strategy_name] = r.equity
          strats.add(r.strategy_name)
        })
        setStrategies([...strats])
        setData(Object.values(byTime).slice(-200))
      })
      .catch(() => {})
  }, [refreshKey])

  const visibleStrategies = selected === 'ALL' ? strategies : [selected]

  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border2}`, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Panel header */}
      <div style={{
        background: T.orange, color: '#000',
        padding: '3px 10px', fontSize: '10px', fontWeight: '900',
        fontFamily: T.font, letterSpacing: '1px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>EQUITY CURVE</span>
        <div style={{ display: 'flex', gap: '2px' }}>
          {['ALL', ...strategies].map(s => (
            <button key={s} onClick={() => setSelected(s)} style={{
              padding: '1px 6px', fontSize: '9px', fontFamily: T.font,
              background: selected === s ? '#000' : 'transparent',
              color: selected === s ? T.orange : '#000',
              border: 'none', cursor: 'pointer', fontWeight: '700',
            }}>{s}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: '8px 4px 4px 0' }}>
        {data.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.gray, fontSize: '11px', fontFamily: T.font }}>
            ESPERANDO DATOS...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1a1a1a" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: T.gray, fontFamily: T.font }} tickLine={false} axisLine={{ stroke: T.border2 }} />
              <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 9, fill: T.gray, fontFamily: T.font }} tickLine={false} axisLine={{ stroke: T.border2 }} width={65} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={INITIAL_CAPITAL} stroke={T.border2} strokeDasharray="4 2" label={{ value: 'BASE', fill: T.gray, fontSize: 9 }} />
              {visibleStrategies.map((s, i) => (
                <Line key={s} type="monotone" dataKey={s} stroke={COLORS[i % COLORS.length]} strokeWidth={1.5} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
