import { useRef, useEffect, useState, useCallback } from 'react'

interface SproutAgentProps {
  volume: number
}

// ─── SVG Sprout Character ─────────────────────────────────────────────────────
// - 마우스/터치 따라 눈동자 이동
// - 말할 때 입 벌림
// - 숨쉬기 / 깜빡임 / 흔들림 애니메이션

export default function SproutAgent({ volume }: SproutAgentProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 })
  const [blink, setBlink] = useState(false)
  const [sway, setSway] = useState(0)
  const [breathe, setBreathe] = useState(0)

  // ── 마우스/터치 눈동자 추적 ──────────────────────────────────────────────────
  const handlePointerMove = useCallback((e: PointerEvent | TouchEvent) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2

    let clientX: number, clientY: number
    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = (e as PointerEvent).clientX
      clientY = (e as PointerEvent).clientY
    }

    const dx = clientX - cx
    const dy = clientY - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const maxDist = Math.min(rect.width, rect.height) * 0.6
    const factor = Math.min(dist, maxDist) / maxDist
    const angle = Math.atan2(dy, dx)
    const MAX_PUPIL = 4.5

    setPupilOffset({
      x: Math.cos(angle) * factor * MAX_PUPIL,
      y: Math.sin(angle) * factor * MAX_PUPIL,
    })
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove as EventListener)
    window.addEventListener('touchmove', handlePointerMove as EventListener, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove as EventListener)
      window.removeEventListener('touchmove', handlePointerMove as EventListener)
    }
  }, [handlePointerMove])

  // ── 깜빡임 ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 3000
      return setTimeout(() => {
        setBlink(true)
        setTimeout(() => setBlink(false), 130)
        blinkTimer = scheduleBlink()
      }, delay)
    }
    let blinkTimer = scheduleBlink()
    return () => clearTimeout(blinkTimer)
  }, [])

  // ── 흔들림 + 숨쉬기 ─────────────────────────────────────────────────────────
  useEffect(() => {
    let frame: number
    let start = performance.now()
    const animate = (now: number) => {
      const t = (now - start) / 1000
      setSway(Math.sin(t * 0.7) * 3)
      setBreathe(Math.sin(t * 1.1) * 0.018)
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [])

  // ── 말할 때 입 크기 ──────────────────────────────────────────────────────────
  const mouthOpen = Math.min(volume * 1.8, 1)
  const eyeScaleY = blink ? 0.08 : 1

  // ── 몸통 숨쉬기 스케일 ───────────────────────────────────────────────────────
  const bodyScaleY = 1 + breathe + volume * 0.04
  const bodyScaleX = 1 - breathe * 0.4 - volume * 0.02

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'none',
      }}
    >
      <svg
        viewBox="0 0 200 240"
        width="100%"
        height="100%"
        style={{
          maxWidth: 220,
          maxHeight: 280,
          transform: `rotate(${sway}deg)`,
          transformOrigin: 'bottom center',
          transition: 'transform 0.05s linear',
          overflow: 'visible',
          filter: 'drop-shadow(0 12px 24px rgba(120,180,80,0.25))',
        }}
      >
        {/* ── 그림자 ── */}
        <ellipse cx="100" cy="232" rx="42" ry="8"
          fill="rgba(0,0,0,0.08)" />

        {/* ── 몸통 (bean shape) ── */}
        <g transform={`translate(100,118) scale(${bodyScaleX},${bodyScaleY}) translate(-100,-118)`}>
          {/* 몸통 그라데이션 */}
          <defs>
            <radialGradient id="bodyGrad" cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#d4f0b0" />
              <stop offset="55%" stopColor="#a8d878" />
              <stop offset="100%" stopColor="#7ab84a" />
            </radialGradient>
            <radialGradient id="cheekGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffb3a0" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ff8870" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="eyeGrad" cx="35%" cy="30%" r="60%">
              <stop offset="0%" stopColor="#5a3a1a" />
              <stop offset="100%" stopColor="#2a1a08" />
            </radialGradient>
          </defs>

          {/* 몸통 */}
          <ellipse cx="100" cy="130" rx="62" ry="72"
            fill="url(#bodyGrad)"
            stroke="#8fc855" strokeWidth="1.5"
          />
          {/* 배 하이라이트 */}
          <ellipse cx="88" cy="108" rx="22" ry="28"
            fill="white" opacity="0.18" />
        </g>

        {/* ── 잎사귀 왼쪽 ── */}
        <g style={{ transformOrigin: '78px 62px', animation: 'leafWave1 2.8s ease-in-out infinite' }}>
          <ellipse cx="68" cy="52" rx="22" ry="13"
            fill="#6abf3a" stroke="#4e9a28" strokeWidth="1"
            transform="rotate(-35, 68, 52)" />
          <line x1="78" y1="62" x2="58" y2="44"
            stroke="#4e9a28" strokeWidth="1.2" strokeLinecap="round" />
        </g>

        {/* ── 잎사귀 오른쪽 ── */}
        <g style={{ transformOrigin: '122px 62px', animation: 'leafWave2 3.2s ease-in-out infinite' }}>
          <ellipse cx="132" cy="52" rx="22" ry="13"
            fill="#7acc44" stroke="#5aaa30" strokeWidth="1"
            transform="rotate(35, 132, 52)" />
          <line x1="122" y1="62" x2="142" y2="44"
            stroke="#5aaa30" strokeWidth="1.2" strokeLinecap="round" />
        </g>

        {/* ── 줄기 ── */}
        <path d="M100 68 Q98 80 100 90"
          stroke="#5aaa30" strokeWidth="3" fill="none" strokeLinecap="round" />

        {/* ── 왼쪽 눈 ── */}
        <g transform="translate(76, 112)">
          {/* 눈 흰자 */}
          <ellipse cx="0" cy="0" rx="13" ry="14"
            fill="white" stroke="#c8e89a" strokeWidth="1" />
          {/* 눈동자 */}
          <g transform={`translate(${pupilOffset.x}, ${pupilOffset.y}) scale(1, ${eyeScaleY})`}
            style={{ transformOrigin: '0 0' }}>
            <ellipse cx="0" cy="0" rx="7.5" ry="8"
              fill="url(#eyeGrad)" />
            {/* 하이라이트 */}
            <ellipse cx="-2.5" cy="-2.5" rx="2.5" ry="2.5"
              fill="white" opacity="0.9" />
            <ellipse cx="2" cy="2" rx="1.2" ry="1.2"
              fill="white" opacity="0.5" />
          </g>
          {/* 눈꺼풀 (깜빡임) */}
          {blink && (
            <ellipse cx="0" cy="0" rx="13" ry="14"
              fill="#a8d878" />
          )}
        </g>

        {/* ── 오른쪽 눈 ── */}
        <g transform="translate(124, 112)">
          <ellipse cx="0" cy="0" rx="13" ry="14"
            fill="white" stroke="#c8e89a" strokeWidth="1" />
          <g transform={`translate(${pupilOffset.x}, ${pupilOffset.y}) scale(1, ${eyeScaleY})`}
            style={{ transformOrigin: '0 0' }}>
            <ellipse cx="0" cy="0" rx="7.5" ry="8"
              fill="url(#eyeGrad)" />
            <ellipse cx="-2.5" cy="-2.5" rx="2.5" ry="2.5"
              fill="white" opacity="0.9" />
            <ellipse cx="2" cy="2" rx="1.2" ry="1.2"
              fill="white" opacity="0.5" />
          </g>
          {blink && (
            <ellipse cx="0" cy="0" rx="13" ry="14"
              fill="#a8d878" />
          )}
        </g>

        {/* ── 볼터치 ── */}
        <ellipse cx="60" cy="128" rx="14" ry="9"
          fill="url(#cheekGrad)" opacity="0.7" />
        <ellipse cx="140" cy="128" rx="14" ry="9"
          fill="url(#cheekGrad)" opacity="0.7" />

        {/* ── 입 ── */}
        {mouthOpen < 0.15 ? (
          /* 닫힌 입 — 귀여운 미소 */
          <path
            d={`M 86 142 Q 100 ${150 + mouthOpen * 6} 114 142`}
            stroke="#5a3a1a" strokeWidth="2.5" fill="none"
            strokeLinecap="round"
          />
        ) : (
          /* 열린 입 — 말하는 중 */
          <g>
            <ellipse cx="100" cy="146"
              rx={10 + mouthOpen * 6}
              ry={3 + mouthOpen * 9}
              fill="#3a1a08"
            />
            {/* 혀 */}
            <ellipse cx="100" cy={148 + mouthOpen * 4}
              rx={6 + mouthOpen * 3}
              ry={2 + mouthOpen * 3}
              fill="#ff7a7a" opacity="0.8"
            />
          </g>
        )}

        {/* ── 팔 (말할 때 들썩) ── */}
        <g style={{ transformOrigin: '44px 148px', animation: volume > 0.1 ? 'armWave 0.4s ease-in-out infinite alternate' : 'none' }}>
          <path d="M 44 148 Q 22 158 18 172"
            stroke="#8fc855" strokeWidth="10" fill="none"
            strokeLinecap="round" />
          {/* 손 */}
          <circle cx="16" cy="176" r="9" fill="#a8d878" stroke="#7ab84a" strokeWidth="1" />
        </g>
        <g style={{ transformOrigin: '156px 148px', animation: volume > 0.1 ? 'armWave 0.4s ease-in-out infinite alternate-reverse' : 'none' }}>
          <path d="M 156 148 Q 178 158 182 172"
            stroke="#8fc855" strokeWidth="10" fill="none"
            strokeLinecap="round" />
          <circle cx="184" cy="176" r="9" fill="#a8d878" stroke="#7ab84a" strokeWidth="1" />
        </g>

        {/* ── 발 ── */}
        <ellipse cx="82" cy="200" rx="16" ry="9"
          fill="#7ab84a" stroke="#5a9a30" strokeWidth="1" />
        <ellipse cx="118" cy="200" rx="16" ry="9"
          fill="#7ab84a" stroke="#5a9a30" strokeWidth="1" />

        {/* ── 애니메이션 keyframes ── */}
        <style>{`
          @keyframes leafWave1 {
            0%, 100% { transform: rotate(-8deg); }
            50% { transform: rotate(4deg); }
          }
          @keyframes leafWave2 {
            0%, 100% { transform: rotate(8deg); }
            50% { transform: rotate(-4deg); }
          }
          @keyframes armWave {
            0% { transform: rotate(-8deg); }
            100% { transform: rotate(8deg); }
          }
        `}</style>
      </svg>
    </div>
  )
}
