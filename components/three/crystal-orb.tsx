'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'

export function CrystalOrb() {
  const groupRef = useRef<Group>(null)
  const innerRef = useRef<Mesh>(null)

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.15
      groupRef.current.rotation.y += 0.003
    }
    if (innerRef.current) {
      innerRef.current.rotation.x += 0.005
      innerRef.current.rotation.z += 0.003
    }
  })

  return (
    <group ref={groupRef}>
      {/* Outer shell */}
      <mesh>
        <sphereGeometry args={[1.2, 32, 32]} />
        <meshStandardMaterial
          color="#00FF88"
          transparent
          opacity={0.15}
          emissive="#00FF88"
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* Wireframe outer */}
      <mesh>
        <sphereGeometry args={[1.22, 16, 16]} />
        <meshStandardMaterial
          color="#00FF88"
          wireframe
          transparent
          opacity={0.4}
          emissive="#00FF88"
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Inner crystal structure */}
      <mesh ref={innerRef}>
        <icosahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial
          color="#00FF88"
          wireframe
          transparent
          opacity={0.8}
          emissive="#00FF88"
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Core */}
      <mesh>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#00FF88"
          emissiveIntensity={0.8}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Orbiting rings */}
      <Ring radius={1.5} speed={0.5} />
      <Ring radius={1.7} speed={-0.3} tilt={Math.PI / 3} />
      <Ring radius={1.6} speed={0.4} tilt={-Math.PI / 4} />
    </group>
  )
}

function Ring({ radius, speed, tilt = 0 }: { radius: number; speed: number; tilt?: number }) {
  const meshRef = useRef<Mesh>(null)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.z = state.clock.elapsedTime * speed + tilt
    }
  })

  return (
    <mesh ref={meshRef} rotation={[Math.PI / 2, 0, tilt]}>
      <torusGeometry args={[radius, 0.01, 8, 64]} />
      <meshStandardMaterial
        color="#00FF88"
        emissive="#00FF88"
        emissiveIntensity={0.5}
        transparent
        opacity={0.6}
      />
    </mesh>
  )
}
