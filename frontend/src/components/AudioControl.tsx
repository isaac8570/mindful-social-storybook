import { useState, useEffect, useRef } from 'react'
import { useLang } from '../App'

interface AudioControlProps {
  isRecording: boolean
  isConnected: boolean
  isSproutSpeaking?: boolean
  isWaiting?: boolean
  onPressStart: () => void
  onPressEnd: () => void
  onInterrupt: () => void
  onSendText?: (text: string) => void
}

export default function AudioControl({
  isRecording,
  isConnected,
  isSproutSpeaking = false,
  isWaiting = false,
  onPressStart,
  onPressEnd,
  onInterrupt,
  onSendText,
}: AudioControlProps) {
  const [pressed, setPressed] = useState(false)
  const [holdTimer, setHoldTimer] = useState(0)
  const [textInput, setTextInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { t, lang } = useLang()

  useEffect(() => {
    let interval: number | undefined
    if (isRecording) {
      setHoldTimer(0)
      interval = window.setInterval(() => setHoldTimer(t => t + 0.1), 100)
    } else {
      setHoldTimer(0)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  const handlePointerDown = () => {
    if (!isConnected) return
    setPressed(true)
    onPressStart()
  }

  const handlePointerUp = () => {
    if (!pressed) return
    setPressed(false)
    onPressEnd()
  }

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = textInput.trim()
    if (text && isConnected && onSendText) {
      onSendText(text)
      setTextInput('')
    }
  }

  const getState = () => {
    if (!isConnected) return 'connecting'
    if (isRecording) return 'recording'
    if (isWaiting) return 'waiting'
    if (isSproutSpeaking) return 'speaking'
    return 'idle'
  }
  const state = getState()
  const placeholder = lang === 'ko' ? '무엇이 무섭거나 걱정되나요?' : "What scares or worries you?"

  return (
    <div className="flex flex-col gap-2 py-3 px-4 safe-area-bottom">

      {/* ── 텍스트 입력창 (항상 표시) ── */}
      {onSendText && (
        <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            placeholder={placeholder}
            disabled={!isConnected || isRecording}
            className="
              flex-1 text-sm px-4 py-2.5 rounded-full
              border-2 border-sprout-warm bg-white
              text-sprout-brown placeholder-sprout-brown/35
              focus:outline-none focus:border-sprout-green
              disabled:opacity-50 transition-colors
            "
          />
          <button
            type="submit"
            disabled={!isConnected || !textInput.trim() || isRecording}
            className="
              w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
              bg-sprout-green text-white shadow
              disabled:opacity-40 hover:bg-sprout-softgreen
              active:scale-95 transition-all
            "
            aria-label="전송"
          >
            <SendIcon />
          </button>
        </form>
      )}

      {/* ── 마이크 버튼 + 상태 ── */}
      <div className="flex items-center justify-center gap-4">

        {/* Interrupt */}
        {isConnected && isSproutSpeaking && !isRecording && (
          <button
            onClick={onInterrupt}
            className="text-xs text-red-400 bg-red-50 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors"
          >
            {t.stopStory}
          </button>
        )}

        {/* 마이크 버튼 */}
        <div className="relative">
          {isRecording && (
            <>
              <span className="absolute inset-[-8px] rounded-full bg-red-200 animate-ping opacity-40" />
              <span className="absolute inset-[-4px] rounded-full bg-red-300 animate-pulse opacity-60" />
            </>
          )}
          {isSproutSpeaking && !isRecording && (
            <span className="absolute inset-[-4px] rounded-full bg-green-200 animate-pulse opacity-60" />
          )}
          <button
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onTouchEnd={handlePointerUp}
            disabled={!isConnected}
            className={`
              relative w-14 h-14 rounded-full shadow-lg
              flex items-center justify-center
              transition-all duration-150 select-none touch-none
              ${!isConnected
                ? 'bg-gray-200 cursor-not-allowed'
                : isRecording
                ? 'bg-red-500 scale-110 shadow-xl'
                : 'bg-sprout-green hover:bg-sprout-softgreen hover:scale-105 active:scale-95'
              }
            `}
            style={{ WebkitTapHighlightColor: 'transparent' }}
            aria-label="Push to talk"
          >
            <MicIcon active={isRecording} />
          </button>
        </div>

        {/* 상태 텍스트 */}
        <div className={`
          text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-300 min-w-[80px] text-center
          ${state === 'connecting' ? 'bg-gray-100 text-gray-400' : ''}
          ${state === 'recording' ? 'bg-red-100 text-red-600' : ''}
          ${state === 'waiting' ? 'bg-yellow-50 text-yellow-700 animate-pulse' : ''}
          ${state === 'speaking' ? 'bg-green-100 text-green-600' : ''}
          ${state === 'idle' ? 'bg-sprout-warm/50 text-sprout-brown' : ''}
        `}>
          {state === 'connecting' && t.connecting}
          {state === 'recording' && `🎙 ${holdTimer.toFixed(1)}s`}
          {state === 'waiting' && '🌱 생각 중...'}
          {state === 'speaking' && '🌱 말하는 중'}
          {state === 'idle' && t.pushToTalk}
        </div>
      </div>

    </div>
  )
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
      stroke={active ? 'white' : '#5a4a3a'} strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}
