'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'

export function EarthTree() {
  const groupRef = useRef<Group>(null)
  const earthRef = useRef<Mesh>(null)
  const treeRef = useRef<Group>(null)

  useFrame((state) => {
    if (groupRef.current) {
      // Floating animation
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.2
    }
    if (earthRef.current) {
      // Slow rotation
      earthRef.current.rotation.y += 0.002
    }
    if (treeRef.current) {
      // Subtle sway
      treeRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.8) * 0.05
    }
  })

  return (
    <group ref={groupRef}>
      {/* Earth sphere */}
      <mesh ref={earthRef} position={[0, 0, 0]}>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshStandardMaterial
          color="#0a4060"
          wireframe
          transparent
          opacity={0.6}
          emissive="#00FF88"
          emissiveIntensity={0.1}
        />
      </mesh>
      
      {/* Continents outline effect */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[1.52, 16, 16]} />
        <meshStandardMaterial
          color="#00FF88"
          wireframe
          transparent
          opacity={0.3}
        />
      </mesh>

      {/* Tree growing from Earth */}
      <group ref={treeRef} position={[0, 1.5, 0]}>
        {/* Trunk */}
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.08, 0.12, 0.6, 8]} />
          <meshStandardMaterial
            color="#4a3728"
            emissive="#2a1f18"
            emissiveIntensity={0.2}
          />
        </mesh>
        
        {/* Foliage layers */}
        <mesh position={[0, 0.8, 0]}>
          <coneGeometry args={[0.5, 0.6, 8]} />
          <meshStandardMaterial
            color="#00FF88"
            transparent
            opacity={0.8}
            emissive="#00FF88"
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0, 1.1, 0]}>
          <coneGeometry args={[0.4, 0.5, 8]} />
          <meshStandardMaterial
            color="#00FF88"
            transparent
            opacity={0.8}
            emissive="#00FF88"
            emissiveIntensity={0.4}
          />
        </mesh>
        <mesh position={[0, 1.35, 0]}>
          <coneGeometry args={[0.25, 0.4, 8]} />
          <meshStandardMaterial
            color="#00FF88"
            transparent
            opacity={0.9}
            emissive="#00FF88"
            emissiveIntensity={0.5}
          />
        </mesh>
      </group>

      {/* Orbiting particles */}
      {[...Array(8)].map((_, i) => (
        <OrbitingParticle key={i} index={i} />
      ))}
    </group>
  )
}

function OrbitingParticle({ index }: { index: number }) {
  const meshRef = useRef<Mesh>(null)
  const angle = (index / 8) * Math.PI * 2
  const radius = 2.2 + (index % 2) * 0.3

  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.elapsedTime * 0.3 + angle
      meshRef.current.position.x = Math.cos(time) * radius
      meshRef.current.position.z = Math.sin(time) * radius
      meshRef.current.position.y = Math.sin(time * 2) * 0.3
    }
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.05, 8, 8]} />
      <meshStandardMaterial
        color="#00FF88"
        emissive="#00FF88"
        emissiveIntensity={1}
      />
    </mesh>
  )
}
