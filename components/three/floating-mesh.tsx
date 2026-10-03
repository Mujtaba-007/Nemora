'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'

interface FloatingMeshProps {
  position?: [number, number, number]
  scale?: number
  color?: string
  speed?: number
  type?: 'icosahedron' | 'octahedron' | 'dodecahedron' | 'tetrahedron' | 'torus'
}

export function FloatingMesh({
  position = [0, 0, 0],
  scale = 1,
  color = '#00FF88',
  speed = 1,
  type = 'icosahedron'
}: FloatingMeshProps) {
  const meshRef = useRef<Mesh>(null)
  const initialY = position[1]

  useFrame((state) => {
    if (meshRef.current) {
      // Slow floating sine animation
      meshRef.current.position.y = initialY + Math.sin(state.clock.elapsedTime * speed * 0.5) * 0.3
      // Slow rotation
      meshRef.current.rotation.x += 0.002 * speed
      meshRef.current.rotation.y += 0.003 * speed
    }
  })

  const renderGeometry = () => {
    switch (type) {
      case 'octahedron':
        return <octahedronGeometry args={[1, 0]} />
      case 'dodecahedron':
        return <dodecahedronGeometry args={[1, 0]} />
      case 'tetrahedron':
        return <tetrahedronGeometry args={[1, 0]} />
      case 'torus':
        return <torusGeometry args={[1, 0.4, 8, 16]} />
      default:
        return <icosahedronGeometry args={[1, 0]} />
    }
  }

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      {renderGeometry()}
      <meshStandardMaterial
        color={color}
        wireframe
        transparent
        opacity={0.8}
        emissive={color}
        emissiveIntensity={0.3}
      />
    </mesh>
  )
}
