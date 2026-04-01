import { useState, useEffect } from 'react'
import { T, pnlColor } from '../theme.js'
import { API_BASE } from '../config.js'

function StatBadge({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '58px' }}>
      <span style={{ fontSize: '8px', color: T.orange, letterSpacing: '1px', fontFamily: T.font }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: '700', color: color || T.white, fontFamily: T.font }}>{value}</span>
    </div>
  )
}

function ParamRow({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', borderBottom: '1px solid #111' }}>
      <span style={{ fontSize: '9px', color: T.gray, fontFamily: T.font }}>{k}</span>
      <span style={{ fontSize: '9px', color: T.white, fontFamily: T.font }}>{String(v)}</span>
    </div>
  )
}

function StrategyCard({ strategy, onReset, onToggle }) {
  const [confirming, setConfirming] = useState(false)
  const [resetting, setResetting]   = useState(false)
  const { name, enabled, params, metrics, capital, initial, return_pct } = strategy
  const m = metrics || {}

  const doReset = async () => {
    if (!confirming) { setConfirming(true); return }
    setResetting(true)
    setConfirming(false)
    await fetch(`${API_BASE}/api/strategies/${name}/reset`, { method: 'POST' })
    setTimeout(() => { setResetting(false); onReset() }, 800)
  }

  const doToggle = async () => {
    await fetch(`${API_BASE}/api/strategies/${name}/toggle`, { method: 'PATCH' })
    onToggle()
  }

  return (
    <div style={{
      background: T.bg1,
      border: `1px solid ${enabled ? T.border2 : '#2a2a2a'}`,
      display: 'flex', flexDirection: 'column',
      opacity: enabled ? 1 : 0.6,
    }}>
      {/* Card header */}
      <div style={{
        background: enabled ? T.orange : '#333',
        color: '#000',
        padding: '4px 10px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: '11px', fontWeight: '900', fontFamily: T.font, letterSpacing: '1px' }}>
          {name}
        </span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{
            fontSize: '8px', fontWeight: '900', fontFamily: T.font,
            background: '#000', color: enabled ? T.green : T.gray,
            padding: '1px 5px',
          }}>
            {enabled ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '0', padding: '8px 10px', borderBottom: `1px solid #111`, flexWrap: 'wrap', gap: '12px' }}>
        <StatBadge label="TRADES"  value={m.trades || 0}  color={T.blue} />
        <StatBadge label="WIN%"    value={`${(m.win_rate || 0).toFixed(1)}%`}
                   color={(m.win_rate || 0) >= 50 ? T.green : T.red} />
        <StatBadge label="PNL"     value={`${(m.total_pnl || 0) >= 0 ? '+' : ''}$${Math.abs(m.total_pnl || 0).toFixed(2)}`}
                   color={pnlColor(m.total_pnl || 0)} />
        <StatBadge label="SHARPE"  value={(m.sharpe || 0).toFixed(2)}
                   color={(m.sharpe || 0) >= 1 ? T.green : (m.sharpe || 0) >= 0 ? T.yellow : T.red} />
        <StatBadge label="MAX DD"  value={`${(m.max_drawdown || 0).toFixed(1)}%`}
                   color={(m.max_drawdown || 0) > 15 ? T.red : T.gray} />
      </div>

      {/* Capital */}
      <div style={{ padding: '6px 10px', borderBottom: `1px solid #111`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '8px', color: T.orange, fontFamily: T.font, letterSpacing: '1px' }}>CAPITAL</span>
          <span style={{ fontSize: '15px', fontWeight: '700', fontFamily: T.font, color: T.white }}>
            ${(capital || initial || 10000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <span style={{
          fontSize: '12px', fontWeight: '700', fontFamily: T.font,
          color: (return_pct || 0) >= 0 ? T.green : T.red,
        }}>
          {(return_pct || 0) >= 0 ? '+' : ''}{(return_pct || 0).toFixed(2)}%
        </span>
      </div>

      {/* Params */}
      <div style={{ padding: '6px 10px', flex: 1, overflow: 'auto', maxHeight: '120px' }}>
        {Object.entries(params || {}).map(([k, v]) => (
          <ParamRow key={k} k={k.toUpperCase()} v={v} />
        ))}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '1px', borderTop: `1px solid #111` }}>
        <button
          onClick={doToggle}
          style={{
            flex: 1, padding: '7px', fontSize: '9px', fontWeight: '900',
            fontFamily: T.font, letterSpacing: '1px', cursor: 'pointer',
            background: enabled ? '#1a1a1a' : '#2a1a00',
            color: enabled ? T.gray : T.orange,
            border: 'none',
          }}
        >
          {enabled ? 'DISABLE' : 'ENABLE'}
        </button>
        <button
          onClick={doReset}
          style={{
            flex: 1, padding: '7px', fontSize: '9px', fontWeight: '900',
            fontFamily: T.font, letterSpacing: '1px', cursor: 'pointer',
            background: confirming ? '#3d0000' : resetting ? '#1a0000' : '#1a0a00',
            color: confirming ? '#ff0000' : resetting ? T.gray : T.red,
            border: 'none',
            transition: 'all 0.15s',
          }}
        >
          {resetting ? 'RESETTING...' : confirming ? '⚠ CONFIRM RESET' : 'RESET PORTFOLIO'}
        </button>
      </div>

      {/* Confirm cancel */}
      {confirming && (
        <button onClick={() => setConfirming(false)} style={{
          width: '100%', padding: '4px', fontSize: '9px', fontFamily: T.font,
          background: '#111', color: T.gray, border: 'none', cursor: 'pointer',
        }}>
          CANCEL
        </button>
      )}
    </div>
  )
}

export default function StrategiesPanel() {
  const [strategies, setStrategies] = useState([])

  const load = () => {
    fetch(`${API_BASE}/api/strategies`).then(r => r.json()).then(setStrategies).catch(() => {})
  }

  useEffect(() => {
    load()
    const iv = setInterval(load, 10000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      {/* Panel header */}
      <div style={{
        background: T.orange, color: '#000',
        padding: '4px 12px', fontSize: '10px', fontWeight: '900',
        fontFamily: T.font, letterSpacing: '2px', flexShrink: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>STRATEGY MANAGER</span>
        <span style={{ fontSize: '9px' }}>{strategies.filter(s => s.enabled).length}/{strategies.length} ACTIVE</span>
      </div>

      {/* Grid de estrategias */}
      <div style={{
        flex: 1, overflow: 'auto', padding: '1px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '1px',
        background: T.border2,
        alignContent: 'start',
      }}>
        {strategies.map(s => (
          <StrategyCard key={s.name} strategy={s} onReset={load} onToggle={load} />
        ))}
        {strategies.length === 0 && (
          <div style={{ gridColumn: '1/-1', padding: '24px', textAlign: 'center', color: T.gray, fontSize: '11px', fontFamily: T.font }}>
            LOADING STRATEGIES...
          </div>
        )}
      </div>
    </div>
  )
}
