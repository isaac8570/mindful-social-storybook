import { useRef, useMemo } from 'react'
import { Canvas, useFrame, extend } from '@react-three/fiber'
import * as THREE from 'three'

// Extend R3F with Three.js primitives so JSX types are recognized
extend(THREE)

// ─── Procedural Knit Shader ──────────────────────────────────────────────────

const knitVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float uTime;
  uniform float uBreath;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;

    // Subtle surface displacement for knit texture
    vec3 pos = position;
    float noise = sin(pos.x * 12.0 + uTime * 0.5) * cos(pos.y * 12.0 + uTime * 0.3) * 0.012;
    pos += normal * noise;

    // Breathing scale driven by audio volume
    pos *= (1.0 + uBreath * 0.12);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const knitFragmentShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float uTime;

  // Simple hash for procedural noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1,0)), f.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
      f.y
    );
  }

  void main() {
    // Knit pattern: interlocking loops
    vec2 uv = vUv * 18.0;
    vec2 cell = floor(uv);
    vec2 local = fract(uv);

    // Horizontal yarn strands
    float yarnH = smoothstep(0.35, 0.5, abs(local.y - 0.5));
    // Vertical loop bumps
    float loopX = sin(local.x * 3.14159 * 2.0) * 0.5 + 0.5;
    float loopY = sin(local.y * 3.14159 * 2.0) * 0.5 + 0.5;
    float knit = mix(loopX, loopY, 0.5) * (1.0 - yarnH * 0.4);

    // Warm green base with slight variation
    vec3 baseColor = vec3(0.48, 0.78, 0.50);       // soft green
    vec3 yarnColor = vec3(0.55, 0.85, 0.57);        // lighter yarn highlight
    vec3 shadowColor = vec3(0.38, 0.65, 0.42);      // shadow in loops

    vec3 color = mix(shadowColor, mix(baseColor, yarnColor, knit), knit);

    // Add subtle fuzz/noise for wool texture
    float fuzz = noise(vUv * 80.0 + uTime * 0.1) * 0.06;
    color += fuzz;

    // Rim lighting for warmth
    float rim = 1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0);
    rim = pow(rim, 2.5);
    color += rim * vec3(0.3, 0.15, 0.05) * 0.4;

    // Diffuse lighting
    vec3 lightDir = normalize(vec3(1.0, 1.5, 2.0));
    float diff = max(dot(vNormal, lightDir), 0.0);
    color *= (0.5 + diff * 0.6);

    gl_FragColor = vec4(color, 1.0);
  }
`

// ─── Leaf decoration ─────────────────────────────────────────────────────────

function Leaf({ position, rotation }: { position: [number, number, number]; rotation: [number, number, number] }) {
  return (
    <mesh position={position} rotation={rotation}>
      <sphereGeometry args={[0.12, 8, 6]} />
      <meshStandardMaterial color="#5aad5e" roughness={0.8} />
    </mesh>
  )
}

// ─── Sprout Body ─────────────────────────────────────────────────────────────

function SproutBody({ volume }: { volume: number }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBreath: { value: 0 },
    }),
    []
  )

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime()
    // Smooth breath: lerp toward target volume
    uniforms.uBreath.value = THREE.MathUtils.lerp(
      uniforms.uBreath.value,
      volume,
      0.08
    )
    // Gentle idle sway
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.4) * 0.08
      meshRef.current.position.y = Math.sin(clock.getElapsedTime() * 0.6) * 0.04
    }
  })

  return (
    <group>
      {/* Main body */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          vertexShader={knitVertexShader}
          fragmentShader={knitFragmentShader}
          uniforms={uniforms}
        />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.28, 0.18, 0.92]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#2d1a0e" />
      </mesh>
      <mesh position={[0.28, 0.18, 0.92]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#2d1a0e" />
      </mesh>

      {/* Eye shine */}
      <mesh position={[-0.25, 0.22, 0.98]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color="white" />
      </mesh>
      <mesh position={[0.31, 0.22, 0.98]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color="white" />
      </mesh>

      {/* Smile */}
      <mesh position={[0, -0.05, 0.96]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.18, 0.025, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#2d1a0e" />
      </mesh>

      {/* Leaves on top */}
      <Leaf position={[0, 1.1, 0.1]} rotation={[0.3, 0, -0.3]} />
      <Leaf position={[0.2, 1.05, 0.05]} rotation={[0.2, 0.3, 0.4]} />
      <Leaf position={[-0.2, 1.08, 0.0]} rotation={[0.2, -0.3, -0.4]} />
    </group>
  )
}

// ─── Scene ───────────────────────────────────────────────────────────────────

function Scene({ volume }: { volume: number }) {
  return (
    <>
      <ambientLight intensity={0.6} color="#fff5e6" />
      <directionalLight position={[3, 5, 5]} intensity={0.8} color="#ffe8cc" />
      <pointLight position={[-3, 2, 2]} intensity={0.3} color="#c8f0c8" />
      <SproutBody volume={volume} />
    </>
  )
}

// ─── Export ──────────────────────────────────────────────────────────────────

interface SproutAgentProps {
  volume: number
}

export default function SproutAgent({ volume }: SproutAgentProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 3.2], fov: 45 }}
      style={{ background: 'transparent' }}
      gl={{ antialias: true, alpha: true }}
    >
      <Scene volume={volume} />
    </Canvas>
  )
}
