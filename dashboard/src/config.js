// En desarrollo, las llamadas /api/* van al proxy de Vite (localhost:8001)
// En producción (Vercel), apuntan al backend Railway via VITE_API_URL

const rawApiUrl = import.meta.env.VITE_API_URL ?? ''

// Eliminar trailing slash si lo hay
export const API_BASE = rawApiUrl.replace(/\/$/, '')

// WebSocket: en dev usa la variable o localhost; en prod usa VITE_WS_URL
export const WS_URL =
  import.meta.env.VITE_WS_URL ??
  (API_BASE
    ? API_BASE.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/ws'
    : 'ws://localhost:8001/ws')
