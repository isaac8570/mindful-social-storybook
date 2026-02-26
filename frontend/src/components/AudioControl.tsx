import { useState, useEffect } from 'react'
import { useLang } from '../App'

interface AudioControlProps {
  isRecording: boolean
  isConnected: boolean
  isSproutSpeaking?: boolean
  isWaiting?: boolean
  onPressStart: () => void
  onPressEnd: () => void
  onInterrupt: () => void
}

export default function AudioControl({
  isRecording,
  isConnected,
  isSproutSpeaking = false,
  isWaiting = false,
  onPressStart,
  onPressEnd,
  onInterrupt,
}: AudioControlProps) {
  const [pressed, setPressed] = useState(false)
  const [holdTimer, setHoldTimer] = useState(0)
  const { t } = useLang()

  // Timer to show how long user is holding
  useEffect(() => {
    let interval: number | undefined
    if (isRecording) {
      setHoldTimer(0)
      interval = window.setInterval(() => {
        setHoldTimer((t) => t + 0.1)
      }, 100)
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

  // Determine current state for UI
  const getState = () => {
    if (!isConnected) return 'connecting'
    if (isRecording) return 'recording'
    if (isWaiting) return 'waiting'
    if (isSproutSpeaking) return 'speaking'
    return 'idle'
  }

  const state = getState()

  return (
    <div className="flex flex-col items-center gap-2 py-4 px-4 safe-area-bottom">
      {/* Status indicator */}
      <div className={`
        text-sm font-medium px-4 py-1.5 rounded-full mb-1 transition-all duration-300
        ${state === 'connecting' ? 'bg-gray-100 text-gray-500' : ''}
        ${state === 'recording' ? 'bg-red-100 text-red-600' : ''}
        ${state === 'waiting' ? 'bg-yellow-50 text-yellow-700 animate-pulse' : ''}
        ${state === 'speaking' ? 'bg-green-100 text-green-600' : ''}
        ${state === 'idle' ? 'bg-sprout-warm/50 text-sprout-brown' : ''}
      `}>
        {state === 'connecting' && t.connecting}
        {state === 'recording' && `🎙 ${t.listening} ${holdTimer.toFixed(1)}s`}
        {state === 'waiting' && '🌱 생각하는 중...'}
        {state === 'speaking' && '🌱 말하는 중...'}
        {state === 'idle' && t.pushToTalk}
      </div>

      {/* Main button area */}
      <div className="relative">
        {/* Outer ring animation when recording */}
        {isRecording && (
          <>
            <span className="absolute inset-[-8px] rounded-full bg-red-200 animate-ping opacity-40" />
            <span className="absolute inset-[-4px] rounded-full bg-red-300 animate-pulse opacity-60" />
          </>
        )}
        
        {/* Sprout speaking indicator */}
        {isSproutSpeaking && !isRecording && (
          <span className="absolute inset-[-4px] rounded-full bg-green-200 animate-pulse opacity-60" />
        )}

        {/* Push-to-talk button */}
        <button
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onTouchEnd={handlePointerUp}
          disabled={!isConnected}
          className={`
            relative w-20 h-20 rounded-full shadow-lg
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

      {/* Instructions */}
      <p className="text-xs text-sprout-brown/50 font-story text-center mt-1">
        {isRecording 
          ? '손을 떼면 전송돼요' 
          : '버튼을 누르고 있는 동안 말해주세요'}
      </p>

      {/* Interrupt button — visible when Sprout is speaking */}
      {isConnected && isSproutSpeaking && !isRecording && (
        <button
          onClick={onInterrupt}
          className="mt-2 text-sm text-red-400 bg-red-50 px-4 py-1.5 rounded-full hover:bg-red-100 transition-colors"
        >
          {t.stopStory}
        </button>
      )}
    </div>
  )
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? 'white' : '#5a4a3a'}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}
