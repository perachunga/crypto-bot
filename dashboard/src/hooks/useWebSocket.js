import { useEffect, useRef, useCallback, useState } from 'react'

export function useWebSocket(url) {
  const [lastMessage, setLastMessage] = useState(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          setLastMessage(msg)
        } catch {}
      }

      ws.onclose = () => {
        setConnected(false)
        setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    } catch {}
  }, [url])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  return { lastMessage, connected }
}
