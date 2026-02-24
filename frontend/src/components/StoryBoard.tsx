import { useEffect, useRef, useState } from 'react'

interface StoryItem {
  id: string
  type: 'text' | 'image'
  content: string
}

interface StoryBoardProps {
  items: StoryItem[]
}

// ─── Typewriter text block ────────────────────────────────────────────────────

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('')
  const indexRef = useRef(0)

  useEffect(() => {
    indexRef.current = 0
    setDisplayed('')
    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1))
        indexRef.current++
      } else {
        clearInterval(interval)
      }
    }, 28)
    return () => clearInterval(interval)
  }, [text])

  return (
    <p className="text-sprout-brown font-story text-base leading-relaxed">
      {displayed}
      {displayed.length < text.length && (
        <span className="animate-pulse">▌</span>
      )}
    </p>
  )
}

// ─── Fade-in image block ──────────────────────────────────────────────────────

function FadeInImage({ src }: { src: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className="my-3 rounded-2xl overflow-hidden shadow-md transition-all duration-700"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(0.96)' }}
    >
      <img
        src={`data:image/png;base64,${src}`}
        alt="Story illustration"
        className="w-full object-cover rounded-2xl"
        style={{ maxHeight: '220px' }}
      />
    </div>
  )
}

// ─── StoryBoard ───────────────────────────────────────────────────────────────

export default function StoryBoard({ items }: StoryBoardProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items])

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <p className="text-sprout-brown/60 font-story text-lg leading-relaxed">
          안녕! 나는 Sprout야 🌱<br />
          무엇이 무섭거나 걱정되는지 말해줘.<br />
          함께 이야기를 만들어볼게!
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-4 space-y-2">
      {items.map((item) =>
        item.type === 'text' ? (
          <TypewriterText key={item.id} text={item.content} />
        ) : (
          <FadeInImage key={item.id} src={item.content} />
        )
      )}
      <div ref={bottomRef} />
    </div>
  )
}

export type { StoryItem }
