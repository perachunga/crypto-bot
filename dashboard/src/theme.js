// Bloomberg Terminal design tokens
export const T = {
  bg:       '#000000',
  bg1:      '#0a0a0a',
  bg2:      '#111111',
  border:   '#ff6600',
  border2:  '#333333',
  orange:   '#ff6600',
  white:    '#ffffff',
  gray:     '#888888',
  gray2:    '#555555',
  green:    '#00ff41',
  red:      '#ff3333',
  yellow:   '#ffcc00',
  blue:     '#00aaff',
  font:     "'Courier New', 'Lucida Console', monospace",
}

export function pnlColor(v) {
  if (v > 0) return T.green
  if (v < 0) return T.red
  return T.gray
}

export function pnlFmt(v, prefix = '$') {
  const sign = v >= 0 ? '+' : '-'
  return `${sign}${prefix}${Math.abs(v).toFixed(2)}`
}
