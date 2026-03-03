import { useEffect, useRef, useCallback, useState } from 'react'

export type ChunkType = 'text' | 'image' | 'audio' | 'status' | 'error'

export interface StoryChunk {
  type: ChunkType
  data?: string
  mime_type?: string
  sequence?: number
}

export type WSStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface UseWebSocketOptions {
  url: string
  onChunk: (chunk: StoryChunk) => void
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000] // ms, capped at last value

export function useWebSocket({ url, onChunk }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<WSStatus>('disconnected')
  const onChunkRef = useRef(onChunk)
  onChunkRef.current = onChunk
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef = useRef(false)

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }

  const connect = useCallback(() => {
    if (unmountedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return

    clearReconnectTimer()
    setStatus('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return }
      console.log('[WS] Connected')
      reconnectAttemptRef.current = 0
      setStatus('connected')
    }

    ws.onmessage = (event) => {
      try {
        const chunk: StoryChunk = JSON.parse(event.data)
        onChunkRef.current(chunk)
      } catch (e) {
        console.error('[WS] Failed to parse message', e)
      }
    }

    ws.onerror = (e) => {
      console.error('[WS] Error', e)
      setStatus('error')
    }

    ws.onclose = (event) => {
      console.log(`[WS] Disconnected (code=${event.code})`)
      setStatus('disconnected')
      if (unmountedRef.current) return
      // Auto-reconnect unless closed cleanly by us (code 1000)
      if (event.code !== 1000) {
        const attempt = reconnectAttemptRef.current
        const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)]
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${attempt + 1})`)
        reconnectAttemptRef.current++
        reconnectTimerRef.current = setTimeout(() => {
          if (!unmountedRef.current) connect()
        }, delay)
      }
    }
  }, [url]) // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback(() => {
    clearReconnectTimer()
    reconnectAttemptRef.current = 0
    wsRef.current?.close(1000, 'user disconnect')
    wsRef.current = null
  }, [])

  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'text', data: text }))
  }, [])

  const sendAudio = useCallback((base64Audio: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({
      type: 'audio',
      data: base64Audio,
      mime_type: 'audio/pcm;rate=16000',
    }))
  }, [])

  const sendInterrupt = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'interrupt' }))
  }, [])

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      clearReconnectTimer()
      wsRef.current?.close(1000, 'unmount')
    }
  }, [])

  return { status, connect, disconnect, sendText, sendAudio, sendInterrupt }
}
