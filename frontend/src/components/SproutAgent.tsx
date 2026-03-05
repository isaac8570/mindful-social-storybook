import { useRef, useMemo, Component, ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Error boundary so 3D crash doesn't kill the whole app
class CanvasErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

// ─── Design by Gemini ────────────────────────────────────────────────────────
// Body: Soft bean shape, #A9D18E (main), #E6F5DF (highlight)
// Eyes: Large ovals, #333333, white sparkles
// Mouth: Simple upturned curve
// Blush: #FFD4C2
// Leaves: 2 rounded leaves, #9CCC65
// Animations: breathing, blink, sway, leaf wave

// ─── Modern Soft Shader ──────────────────────────────────────────────────────

const softVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float uTime;
  uniform float uBreath;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;

    vec3 pos = position;
    
    // Gentle breathing - subtle rise and fall
    float breath = sin(uTime * 1.2) * 0.02 + uBreath * 0.08;
    pos.y *= (1.0 + breath);
    pos.x *= (1.0 - breath * 0.3);
    pos.z *= (1.0 - breath * 0.3);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const softFragmentShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float uTime;

  void main() {
    // Gemini's colors: #A9D18E (main), #E6F5DF (highlight)
    vec3 mainColor = vec3(0.663, 0.820, 0.557);    // #A9D18E
    vec3 highlightColor = vec3(0.902, 0.961, 0.875); // #E6F5DF
    vec3 shadowColor = vec3(0.545, 0.718, 0.443);  // darker shade

    // Soft gradient from bottom to top
    float gradient = smoothstep(-1.0, 1.2, vPosition.y);
    vec3 color = mix(mainColor, highlightColor, gradient * 0.4);

    // Soft rim lighting (modern 3D look)
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float rim = 1.0 - max(dot(vNormal, viewDir), 0.0);
    rim = pow(rim, 3.0);
    color = mix(color, highlightColor, rim * 0.5);

    // Subtle top light
    float topLight = max(dot(vNormal, normalize(vec3(0.0, 1.0, 0.5))), 0.0);
    color = mix(color, highlightColor, topLight * 0.3);

    // Soft shadow at bottom
    float bottomShadow = smoothstep(0.0, -0.8, vPosition.y);
    color = mix(color, shadowColor, bottomShadow * 0.3);

    // Very subtle ambient occlusion feel
    float ao = smoothstep(-0.5, 0.5, vPosition.y) * 0.15 + 0.85;
    color *= ao;

    gl_FragColor = vec4(color, 1.0);
  }
`

// ─── Modern Rounded Leaf ─────────────────────────────────────────────────────

function ModernLeaf({ 
  position, 
  rotation, 
  scale = 1,
  delay = 0 
}: { 
  position: [number, number, number]
  rotation: [number, number, number]
  scale?: number
  delay?: number
}) {
  const meshRef = useRef<THREE.Group>(null)
  
  useFrame(({ clock }) => {
    if (meshRef.current) {
      const t = clock.getElapsedTime() + delay
      // Gentle sway like a plant in breeze
      meshRef.current.rotation.z = rotation[2] + Math.sin(t * 0.8) * 0.1
      meshRef.current.rotation.x = rotation[0] + Math.cos(t * 0.6) * 0.05
    }
  })

  return (
    <group ref={meshRef} position={position} rotation={rotation} scale={scale}>
      {/* Leaf shape - rounded ellipsoid */}
      <mesh>
        <sphereGeometry args={[0.18, 16, 12]} />
        <meshStandardMaterial 
          color="#9CCC65"  // Gemini's leaf color
          roughness={0.7}
          metalness={0.0}
        />
      </mesh>
      {/* Leaf stem */}
      <mesh position={[0, -0.15, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.03, 0.12, 8]} />
        <meshStandardMaterial color="#7CB342" roughness={0.8} />
      </mesh>
    </group>
  )
}

// ─── Modern Eye with Blink ───────────────────────────────────────────────────

function ModernEye({ position, blinkOffset = 0 }: { position: [number, number, number]; blinkOffset?: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const blinkRef = useRef(1) // 1 = open, 0 = closed
  
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + blinkOffset
    
    // Slow, contented blink every ~4 seconds
    const blinkCycle = t % 4
    if (blinkCycle < 0.15) {
      blinkRef.current = Math.cos(blinkCycle / 0.15 * Math.PI) * 0.5 + 0.5
    } else {
      blinkRef.current = 1
    }
    
    if (groupRef.current) {
      groupRef.current.scale.y = 0.3 + blinkRef.current * 0.7
    }
  })

  return (
    <group ref={groupRef} position={position}>
      {/* Eye - large oval */}
      <mesh scale={[1, 1.3, 0.8]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshBasicMaterial color="#333333" />  {/* Gemini's eye color */}
      </mesh>
      {/* Main sparkle */}
      <mesh position={[0.025, 0.04, 0.06]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* Small sparkle */}
      <mesh position={[-0.015, -0.01, 0.055]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
      </mesh>
    </group>
  )
}

// ─── Soft Blush ──────────────────────────────────────────────────────────────

function Blush({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} rotation={[0, 0, 0]}>
      <circleGeometry args={[0.08, 16]} />
      <meshBasicMaterial 
        color="#FFD4C2"  // Gemini's blush color
        transparent 
        opacity={0.4} 
      />
    </mesh>
  )
}

// ─── Simple Smile ────────────────────────────────────────────────────────────

function SimpleSmile({ volume }: { volume: number }) {
  const meshRef = useRef<THREE.Mesh>(null)
  
  useFrame(() => {
    if (meshRef.current) {
      // Smile widens slightly when speaking
      const scale = 1 + volume * 0.2
      meshRef.current.scale.set(scale, 1, 1)
    }
  })

  return (
    <mesh ref={meshRef} position={[0, -0.12, 0.72]} rotation={[0.1, 0, Math.PI]}>
      <torusGeometry args={[0.08, 0.018, 8, 16, Math.PI * 0.8]} />
      <meshBasicMaterial color="#5D4037" />
    </mesh>
  )
}

// ─── Sprout Body (Bean Shape) ────────────────────────────────────────────────

function SproutBody({ volume }: { volume: number }) {
  const groupRef = useRef<THREE.Group>(null)
  
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBreath: { value: 0 },
    }),
    []
  )

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    uniforms.uTime.value = t
    
    // Smooth breath
    uniforms.uBreath.value = THREE.MathUtils.lerp(
      uniforms.uBreath.value,
      volume,
      0.1
    )
    
    // Gentle sway (like a plant in light breeze)
    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(t * 0.5) * 0.03
      groupRef.current.position.y = Math.sin(t * 0.8) * 0.02
    }
  })

  return (
    <group ref={groupRef}>
      {/* Main body - soft bean shape (bottom-heavy) */}
      <mesh scale={[0.85, 1, 0.8]}>
        <sphereGeometry args={[0.8, 64, 64]} />
        <shaderMaterial
          vertexShader={softVertexShader}
          fragmentShader={softFragmentShader}
          uniforms={uniforms}
        />
      </mesh>

      {/* Eyes - large, widely spaced */}
      <ModernEye position={[-0.22, 0.1, 0.62]} blinkOffset={0} />
      <ModernEye position={[0.22, 0.1, 0.62]} blinkOffset={0.5} />

      {/* Blush - soft peach */}
      <Blush position={[-0.35, -0.05, 0.65]} />
      <Blush position={[0.35, -0.05, 0.65]} />

      {/* Simple smile */}
      <SimpleSmile volume={volume} />

      {/* Two rounded leaves - slightly angled */}
      <ModernLeaf 
        position={[-0.12, 0.85, 0]} 
        rotation={[0.2, 0, -0.3]} 
        scale={1.1} 
        delay={0} 
      />
      <ModernLeaf 
        position={[0.12, 0.85, 0]} 
        rotation={[0.2, 0, 0.3]} 
        scale={1.1} 
        delay={0.8} 
      />
    </group>
  )
}

// ─── Scene ───────────────────────────────────────────────────────────────────

function Scene({ volume }: { volume: number }) {
  return (
    <>
      {/* Soft, warm lighting */}
      <ambientLight intensity={0.7} color="#fffaf5" />
      <directionalLight position={[2, 4, 5]} intensity={0.5} color="#fff8f0" />
      <directionalLight position={[-2, 2, 3]} intensity={0.3} color="#f0fff0" />
      {/* Subtle rim light */}
      <pointLight position={[0, 1, -2]} intensity={0.2} color="#e8f5e9" />
      <SproutBody volume={volume} />
    </>
  )
}

// ─── Export ──────────────────────────────────────────────────────────────────

interface SproutAgentProps {
  volume: number
}

// ─── CSS Fallback Character (no WebGL) ───────────────────────────────────────

function SproutCSS({ volume }: { volume: number }) {
  const scale = 1 + volume * 0.08
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', flexDirection: 'column', gap: 8,
    }}>
      <div style={{
        fontSize: 100,
        transform: `scale(${scale})`,
        transition: 'transform 0.1s ease',
        animation: 'sprout-sway 3s ease-in-out infinite',
        display: 'inline-block',
        filter: 'drop-shadow(0 8px 16px rgba(169,209,142,0.4))',
      }}>
        🌱
      </div>
      <style>{`
        @keyframes sprout-sway {
          0%, 100% { transform: scale(${scale}) rotate(-3deg); }
          50% { transform: scale(${scale}) rotate(3deg); }
        }
      `}</style>
    </div>
  )
}

export default function SproutAgent({ volume }: SproutAgentProps) {
  // Detect WebGL support before trying to render Canvas
  const hasWebGL = (() => {
    try {
      const canvas = document.createElement('canvas')
      return !!(
        canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      )
    } catch {
      return false
    }
  })()

  if (!hasWebGL) {
    return <SproutCSS volume={volume} />
  }

  return (
    <CanvasErrorBoundary fallback={<SproutCSS volume={volume} />}>
      <Canvas
        camera={{ position: [0, 0.2, 2.8], fov: 35 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0)
        }}
      >
        <Scene volume={volume} />
      </Canvas>
    </CanvasErrorBoundary>
  )
}
