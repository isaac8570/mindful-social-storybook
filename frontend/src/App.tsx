import { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react'
import SproutAgent from './components/SproutAgent'
import StoryBoard, { StoryItem } from './components/StoryBoard'
import AudioControl from './components/AudioControl'
import { useWebSocket, StoryChunk } from './hooks/useWebSocket'
import { useAudio, AudioPlaybackQueue } from './hooks/useAudio'

function resolveWsUrl(raw: string): string {
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw
  // Relative path like /ws/story → derive from current page origin
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${raw}`
}

const WS_URL = resolveWsUrl(import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws/story')

// ─── i18n ────────────────────────────────────────────────────────────────────

type Lang = 'ko' | 'en'

const translations = {
  ko: {
    title: 'Sprout',
    connecting: '연결 중...',
    listening: '듣고 있어요...',
    pushToTalk: '누르고 말해줘',
    stopStory: '이야기 멈추기',
    greeting: '안녕! 나는 Sprout야 🌱\n무엇이 무섭거나 걱정되는지 말해줘.\n함께 이야기를 만들어볼게!',
  },
  en: {
    title: 'Sprout',
    connecting: 'Connecting...',
    listening: 'Listening...',
    pushToTalk: 'Hold to talk',
    stopStory: 'Stop story',
    greeting: "Hi! I'm Sprout 🌱\nTell me what scares you or worries you.\nLet's create a story together!",
  },
}

type Translations = typeof translations.ko

const LangContext = createContext<{ lang: Lang; t: Translations; setLang: (l: Lang) => void }>({
  lang: 'ko',
  t: translations.ko,
  setLang: () => {},
})

export const useLang = () => useContext(LangContext)

let itemCounter = 0
const uid = () => `item-${++itemCounter}`

export default function App() {
  const [storyItems, setStoryItems] = useState<StoryItem[]>([])
  const [volume, setVolume] = useState(0)
  const [lang, setLang] = useState<Lang>('ko')
  const [isSproutSpeaking, setIsSproutSpeaking] = useState(false)
  const [isWaitingForSprout, setIsWaitingForSprout] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string>('')
  const audioQueueRef = useRef(new AudioPlaybackQueue())
  
  const t = translations[lang]

  // Wire playback volume → Sprout breathing + speaking state
  useEffect(() => {
    audioQueueRef.current.onPlaybackVolume = (v) => {
      setVolume(v)
      const speaking = v > 0.05
      setIsSproutSpeaking(speaking)
      if (speaking) {
        setIsWaitingForSprout(false)
        setStatusMsg('')
      }
    }
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

      case 'status':
        setStatusMsg(chunk.data || '')
        // Clear status after 8 seconds if no new status
        setTimeout(() => setStatusMsg(s => s === chunk.data ? '' : s), 8000)
        break

      case 'error':
        setStatusMsg(`⚠️ ${chunk.data || '오류가 발생했어요'}`)
        console.error('[Story] Error from server:', chunk.data)
        break
    }
  }, [])

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const { status, connect, sendAudio, sendText, sendInterrupt } = useWebSocket({
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
    // Unlock AudioContext on first user gesture (browser autoplay policy)
    audioQueueRef.current.unlock()
    // Interrupt Sprout if currently speaking
    audioQueueRef.current.clear()
    sendInterrupt()
    setIsWaitingForSprout(false)
    startRecording()
  }, [sendInterrupt, startRecording])

  const handlePressEnd = useCallback(() => {
    stopRecording()
    setIsWaitingForSprout(true) // show "Sprout is thinking..."
  }, [stopRecording])

  const handleInterrupt = useCallback(() => {
    audioQueueRef.current.clear()
    sendInterrupt()
    setIsWaitingForSprout(false)
  }, [sendInterrupt])

  const isConnected = status === 'connected'

  return (
    <LangContext.Provider value={{ lang, t, setLang }}>
      <div className="flex flex-col h-full w-full bg-sprout-cream overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <h1 className="font-story text-sprout-brown text-lg font-semibold tracking-wide">
            🌱 {t.title}
          </h1>
          <div className="flex items-center gap-3">
            {/* Language selector */}
            <div className="flex bg-sprout-warm/50 rounded-full p-0.5">
              <button
                onClick={() => setLang('ko')}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${
                  lang === 'ko'
                    ? 'bg-white text-sprout-brown shadow-sm'
                    : 'text-sprout-brown/60 hover:text-sprout-brown'
                }`}
              >
                한국어
              </button>
              <button
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${
                  lang === 'en'
                    ? 'bg-white text-sprout-brown shadow-sm'
                    : 'text-sprout-brown/60 hover:text-sprout-brown'
                }`}
              >
                English
              </button>
            </div>
            {/* Connection status */}
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                isConnected
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {isConnected ? '●' : '○'}
            </span>
          </div>
        </div>

        {/* ── 3D Character (top portion) ── */}
        <div className="flex-none h-[35vh] min-h-[200px] max-h-[350px]">
          <SproutAgent volume={volume} />
        </div>

        {/* ── Divider ── */}
        <div className="mx-5 border-t border-sprout-warm" />

        {/* ── Status banner ── */}
        {statusMsg && (
          <div className="mx-5 mt-2 px-4 py-2 bg-sprout-warm/60 rounded-2xl flex items-center gap-2 animate-pulse">
            <span className="text-sm text-sprout-brown font-story">{statusMsg}</span>
          </div>
        )}

        {/* ── Story area (flex-grow) ── */}
        <div className="flex-1 overflow-hidden">
          <StoryBoard items={storyItems} />
        </div>

        {/* ── Audio control (bottom) ── */}
        <div className="flex-none bg-sprout-cream/90 backdrop-blur-sm border-t border-sprout-warm">
          <AudioControl
            isRecording={isRecording}
            isConnected={isConnected}
            isSproutSpeaking={isSproutSpeaking}
            isWaiting={isWaitingForSprout}
            onPressStart={handlePressStart}
            onPressEnd={handlePressEnd}
            onInterrupt={handleInterrupt}
            onSendText={(text) => {
              audioQueueRef.current.unlock()
              audioQueueRef.current.clear()
              sendInterrupt()
              sendText(text)
              setIsWaitingForSprout(true)
            }}
          />
        </div>
      </div>
    </LangContext.Provider>
  )
}
