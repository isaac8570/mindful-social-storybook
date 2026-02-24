import { useState, useCallback, useRef, useEffect } from 'react'
import SproutAgent from './components/SproutAgent'
import StoryBoard, { StoryItem } from './components/StoryBoard'
import AudioControl from './components/AudioControl'
import { useWebSocket, StoryChunk } from './hooks/useWebSocket'
import { useAudio, AudioPlaybackQueue } from './hooks/useAudio'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws/story'

let itemCounter = 0
const uid = () => `item-${++itemCounter}`

export default function App() {
  const [storyItems, setStoryItems] = useState<StoryItem[]>([])
  const [volume, setVolume] = useState(0)
  const audioQueueRef = useRef(new AudioPlaybackQueue())

  // Wire playback volume → Sprout breathing
  useEffect(() => {
    audioQueueRef.current.onPlaybackVolume = setVolume
  }, [])

  // ── Handle incoming WebSocket chunks ──────────────────────────────────────
  const handleChunk = useCallback((chunk: StoryChunk) => {
    switch (chunk.type) {
      case 'text':
        if (chunk.data) {
          setStoryItems((prev) => {
            // Append to last text item if it exists, else create new
            const last = prev[prev.length - 1]
            if (last?.type === 'text') {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + chunk.data },
              ]
            }
            return [...prev, { id: uid(), type: 'text', content: chunk.data! }]
          })
        }
        break

      case 'image':
        if (chunk.data) {
          setStoryItems((prev) => [
            ...prev,
            { id: uid(), type: 'image', content: chunk.data! },
          ])
        }
        break

      case 'audio':
        if (chunk.data && chunk.sequence !== undefined) {
          audioQueueRef.current.enqueue(chunk.data, chunk.sequence)
        }
        break

      case 'error':
        console.error('[Story] Error from server:', chunk.data)
        break
    }
  }, [])

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const { status, connect, sendAudio, sendInterrupt } = useWebSocket({
    url: WS_URL,
    onChunk: handleChunk,
  })

  useEffect(() => {
    connect()
  }, [connect])

  // ── Audio recording ───────────────────────────────────────────────────────
  const { isRecording, startRecording, stopRecording } = useAudio({
    onAudioData: sendAudio,
    onVolumeChange: setVolume,
  })

  const handlePressStart = useCallback(() => {
    // Interrupt Sprout if currently speaking
    audioQueueRef.current.clear()
    sendInterrupt()
    startRecording()
  }, [sendInterrupt, startRecording])

  const handlePressEnd = useCallback(() => {
    stopRecording()
  }, [stopRecording])

  const handleInterrupt = useCallback(() => {
    audioQueueRef.current.clear()
    sendInterrupt()
  }, [sendInterrupt])

  const isConnected = status === 'connected'

  return (
    <div className="flex flex-col h-screen w-screen bg-sprout-cream overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <h1 className="font-story text-sprout-brown text-lg font-semibold tracking-wide">
          🌱 Sprout
        </h1>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-mono ${
            isConnected
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {status}
        </span>
      </div>

      {/* ── 3D Character (top 45%) ── */}
      <div className="flex-none" style={{ height: '45vh' }}>
        <SproutAgent volume={volume} />
      </div>

      {/* ── Divider ── */}
      <div className="mx-5 border-t border-sprout-warm" />

      {/* ── Story area (flex-grow) ── */}
      <div className="flex-1 overflow-hidden">
        <StoryBoard items={storyItems} />
      </div>

      {/* ── Audio control (bottom) ── */}
      <div className="flex-none bg-sprout-cream/90 backdrop-blur-sm border-t border-sprout-warm">
        <AudioControl
          isRecording={isRecording}
          isConnected={isConnected}
          onPressStart={handlePressStart}
          onPressEnd={handlePressEnd}
          onInterrupt={handleInterrupt}
        />
      </div>
    </div>
  )
}
