import { T, pnlColor } from '../theme.js'

function Tile({ label, value, color, sub }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '1px',
      padding: '4px 14px', borderRight: `1px solid ${T.border2}`, minWidth: '110px',
    }}>
      <span style={{ fontSize: '9px', color: T.orange, letterSpacing: '1px', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: '18px', fontWeight: '700', color: color || T.white, fontFamily: T.font, lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: '9px', color: T.gray }}>{sub}</span>}
    </div>
  )
}

export default function MetricsBar({ summary, connected, prices }) {
  const {
    total_equity = 0,
    total_realized_pnl = 0,
    total_unrealized_pnl = 0,
    total_trades = 0,
    avg_win_rate = 0,
    open_positions = 0,
  } = summary || {}

  const btc = prices?.['BTC/USDT:USDT'] || prices?.['BTC'] || 0
  const eth = prices?.['ETH/USDT:USDT'] || prices?.['ETH'] || 0

  return (
    <div style={{
      background: T.bg1,
      borderBottom: `2px solid ${T.orange}`,
      display: 'flex',
      alignItems: 'stretch',
      height: '52px',
      overflow: 'hidden',
    }}>
      {/* Status badge */}
      <div style={{
        background: connected ? T.orange : T.border2,
        color: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 12px', minWidth: '80px',
        fontSize: '10px', fontWeight: '900', letterSpacing: '2px', fontFamily: T.font,
      }}>
        {connected ? '● LIVE' : '○ OFF'}
      </div>

      <Tile label="Equity" value={`$${total_equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
      <Tile label="PnL Realiz" value={`${total_realized_pnl >= 0 ? '+' : ''}$${Math.abs(total_realized_pnl).toFixed(2)}`} color={pnlColor(total_realized_pnl)} />
      <Tile label="PnL No Real" value={`${total_unrealized_pnl >= 0 ? '+' : ''}$${Math.abs(total_unrealized_pnl).toFixed(2)}`} color={pnlColor(total_unrealized_pnl)} sub="open P&L" />
      <Tile label="Win Rate" value={`${avg_win_rate.toFixed(1)}%`} color={avg_win_rate >= 50 ? T.green : T.red} />
      <Tile label="Trades" value={total_trades} color={T.blue} />
      <Tile label="Posiciones" value={open_positions} color={open_positions > 0 ? T.yellow : T.gray} />

      {/* Separador */}
      <div style={{ flex: 1 }} />

      {/* Precios en vivo */}
      {btc > 0 && (
        <>
          <div style={{ borderLeft: `1px solid ${T.border2}`, padding: '4px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: '9px', color: T.orange }}>BTC/USDT</span>
            <span style={{ fontSize: '15px', color: T.white, fontFamily: T.font, fontWeight: '700' }}>{btc.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
          </div>
          <div style={{ borderLeft: `1px solid ${T.border2}`, padding: '4px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: '9px', color: T.orange }}>ETH/USDT</span>
            <span style={{ fontSize: '15px', color: T.white, fontFamily: T.font, fontWeight: '700' }}>{eth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </>
      )}
    </div>
  )
}
