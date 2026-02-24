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

export function useWebSocket({ url, onChunk }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<WSStatus>('disconnected')
  const onChunkRef = useRef(onChunk)
  onChunkRef.current = onChunk

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[WS] Connected')
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

    ws.onclose = () => {
      console.log('[WS] Disconnected')
      setStatus('disconnected')
    }
  }, [url])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
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
    return () => {
      wsRef.current?.close()
    }
  }, [])

  return { status, connect, disconnect, sendText, sendAudio, sendInterrupt }
}
