import { useState } from 'react'
import { useLang } from '../App'

interface AudioControlProps {
  isRecording: boolean
  isConnected: boolean
  onPressStart: () => void
  onPressEnd: () => void
  onInterrupt: () => void
}

export default function AudioControl({
  isRecording,
  isConnected,
  onPressStart,
  onPressEnd,
  onInterrupt,
}: AudioControlProps) {
  const [pressed, setPressed] = useState(false)
  const { t } = useLang()

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

  return (
    <div className="flex flex-col items-center gap-3 pb-6">
      {/* Push-to-talk button */}
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        disabled={!isConnected}
        className={`
          relative w-20 h-20 rounded-full shadow-lg
          flex items-center justify-center
          transition-all duration-150 select-none
          ${!isConnected
            ? 'bg-gray-200 cursor-not-allowed'
            : pressed
            ? 'bg-red-400 scale-95 shadow-inner'
            : 'bg-sprout-green hover:bg-sprout-softgreen active:scale-95'
          }
        `}
        aria-label="Push to talk"
      >
        {/* Pulse ring when recording */}
        {isRecording && (
          <span className="absolute inset-0 rounded-full bg-red-300 animate-ping opacity-60" />
        )}
        <MicIcon active={isRecording} />
      </button>

      <p className="text-xs text-sprout-brown/60 font-story">
        {!isConnected
          ? t.connecting
          : isRecording
          ? t.listening
          : t.pushToTalk}
      </p>

      {/* Interrupt button — only visible while Sprout is speaking */}
      {isConnected && !isRecording && (
        <button
          onClick={onInterrupt}
          className="text-xs text-sprout-brown/40 underline underline-offset-2 hover:text-sprout-brown/70 transition-colors"
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
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? 'white' : '#5a4a3a'}
      strokeWidth="2"
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
