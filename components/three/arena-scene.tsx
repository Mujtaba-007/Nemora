'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'

export function ArenaScene() {
  const groupRef = useRef<Group>(null)

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.1
      groupRef.current.rotation.y += 0.002
    }
  })

  return (
    <group ref={groupRef}>
      {/* Central trophy/pedestal */}
      <mesh position={[0, -0.5, 0]}>
        <cylinderGeometry args={[0.8, 1, 0.3, 16]} />
        <meshStandardMaterial
          color="#1a2a3a"
          emissive="#00FF88"
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* Trophy cup */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.4, 0.2, 0.8, 16]} />
        <meshStandardMaterial
          color="#00FF88"
          transparent
          opacity={0.7}
          emissive="#00FF88"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Trophy top */}
      <mesh position={[0, 0.8, 0]}>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial
          color="#00FF88"
          emissive="#00FF88"
          emissiveIntensity={0.5}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Glowing rings */}
      {[1, 1.3, 1.6].map((radius, i) => (
        <GlowRing key={i} radius={radius} speed={0.3 + i * 0.1} yOffset={-0.3 + i * 0.2} />
      ))}

      {/* Stars/particles */}
      {[...Array(12)].map((_, i) => (
        <Star key={i} index={i} />
      ))}
    </group>
  )
}

function GlowRing({ radius, speed, yOffset }: { radius: number; speed: number; yOffset: number }) {
  const meshRef = useRef<Mesh>(null)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.z = state.clock.elapsedTime * speed
    }
  })

  return (
    <mesh ref={meshRef} position={[0, yOffset, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.02, 8, 32]} />
      <meshStandardMaterial
        color="#00FF88"
        emissive="#00FF88"
        emissiveIntensity={0.6}
        transparent
        opacity={0.5}
      />
    </mesh>
  )
}

function Star({ index }: { index: number }) {
  const meshRef = useRef<Mesh>(null)
  const angle = (index / 12) * Math.PI * 2
  const radius = 2

  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.elapsedTime * 0.5 + angle
      meshRef.current.position.x = Math.cos(time) * radius
      meshRef.current.position.y = Math.sin(time * 0.5) * 0.5
      meshRef.current.position.z = Math.sin(time) * radius
      meshRef.current.rotation.y += 0.02
      meshRef.current.rotation.x += 0.01
    }
  })

  return (
    <mesh ref={meshRef}>
      <octahedronGeometry args={[0.08, 0]} />
      <meshStandardMaterial
        color="#FFaa44"
        emissive="#FFaa44"
        emissiveIntensity={1}
      />
    </mesh>
  )
}
