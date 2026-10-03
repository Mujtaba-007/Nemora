'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'

export function PollutionShard() {
  const groupRef = useRef<Group>(null)

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.2
      groupRef.current.rotation.y += 0.005
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.4) * 0.1
    }
  })

  return (
    <group ref={groupRef}>
      {/* Main jagged shard */}
      <mesh position={[0, 0, 0]} rotation={[0.3, 0, 0.2]}>
        <coneGeometry args={[0.8, 2, 4]} />
        <meshStandardMaterial
          color="#FF4466"
          wireframe
          transparent
          opacity={0.8}
          emissive="#FF4466"
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* Secondary shards */}
      <mesh position={[0.5, 0.3, 0.3]} rotation={[0.5, 0.3, 0.7]}>
        <coneGeometry args={[0.4, 1, 4]} />
        <meshStandardMaterial
          color="#FF4466"
          wireframe
          transparent
          opacity={0.6}
          emissive="#FF4466"
          emissiveIntensity={0.3}
        />
      </mesh>

      <mesh position={[-0.4, -0.2, 0.4]} rotation={[-0.3, 0.5, -0.4]}>
        <coneGeometry args={[0.35, 0.9, 4]} />
        <meshStandardMaterial
          color="#FF4466"
          wireframe
          transparent
          opacity={0.6}
          emissive="#FF4466"
          emissiveIntensity={0.3}
        />
      </mesh>

      <mesh position={[0.2, -0.5, -0.3]} rotation={[0.6, -0.3, 0.2]}>
        <tetrahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial
          color="#FF6688"
          wireframe
          transparent
          opacity={0.5}
          emissive="#FF4466"
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Floating debris */}
      {[...Array(6)].map((_, i) => (
        <DebrisParticle key={i} index={i} />
      ))}
    </group>
  )
}

function DebrisParticle({ index }: { index: number }) {
  const meshRef = useRef<Mesh>(null)
  const offset = index * 1.2

  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.elapsedTime * 0.5 + offset
      meshRef.current.position.x = Math.sin(time) * 1.5
      meshRef.current.position.y = Math.cos(time * 0.7) * 1.2
      meshRef.current.position.z = Math.sin(time * 0.5) * 1
      meshRef.current.rotation.x += 0.02
      meshRef.current.rotation.y += 0.03
    }
  })

  return (
    <mesh ref={meshRef}>
      <tetrahedronGeometry args={[0.08, 0]} />
      <meshStandardMaterial
        color="#FF4466"
        emissive="#FF4466"
        emissiveIntensity={0.8}
      />
    </mesh>
  )
}
