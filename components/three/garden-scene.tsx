'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import { useCO2Store } from '@/lib/store'

interface GardenSceneProps {
  trees?: { treeId: number; co2Saved: number; plantedDate: string }[]
}

export function GardenScene({ trees }: GardenSceneProps = {}) {
  const groupRef = useRef<Group>(null)
  const storeStats = useCO2Store((state) => state.gardenStats)
  const gardenStats = trees !== undefined ? trees : storeStats

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.1) * 0.1
    }
  })

  return (
    <group ref={groupRef}>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <circleGeometry args={[4, 32]} />
        <meshStandardMaterial
          color="#0a2020"
          transparent
          opacity={0.5}
          emissive="#00FF88"
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* Trees based on CO2 saved */}
      {gardenStats.map((stat, index) => (
        <Tree
          key={stat.treeId}
          position={getTreePosition(index, gardenStats.length)}
          height={mapCO2ToHeight(stat.co2Saved)}
          index={index}
        />
      ))}

      {/* Ambient particles */}
      {[...Array(20)].map((_, i) => (
        <Firefly key={i} index={i} />
      ))}
    </group>
  )
}

function getTreePosition(index: number, total: number): [number, number, number] {
  const angle = (index / total) * Math.PI * 2
  const radius = 1.5 + (index % 2) * 0.8
  return [Math.cos(angle) * radius, -1, Math.sin(angle) * radius]
}

function mapCO2ToHeight(co2: number): number {
  // Map CO2 saved (0-30) to tree height (0.5-2.5)
  return 0.5 + (co2 / 30) * 2
}

interface TreeProps {
  position: [number, number, number]
  height: number
  index: number
}

function Tree({ position, height, index }: TreeProps) {
  const treeRef = useRef<Group>(null)

  useFrame((state) => {
    if (treeRef.current) {
      // Gentle sway
      treeRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5 + index) * 0.03
    }
  })

  const trunkHeight = height * 0.4
  const foliageSize = height * 0.3

  return (
    <group ref={treeRef} position={position}>
      {/* Trunk */}
      <mesh position={[0, trunkHeight / 2, 0]}>
        <cylinderGeometry args={[0.04, 0.06, trunkHeight, 8]} />
        <meshStandardMaterial
          color="#3a2820"
          emissive="#1a1008"
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Foliage layers */}
      <mesh position={[0, trunkHeight + foliageSize * 0.5, 0]}>
        <coneGeometry args={[foliageSize, foliageSize * 1.2, 8]} />
        <meshStandardMaterial
          color="#00FF88"
          transparent
          opacity={0.85}
          emissive="#00FF88"
          emissiveIntensity={0.2 + height * 0.1}
        />
      </mesh>
      <mesh position={[0, trunkHeight + foliageSize * 1.2, 0]}>
        <coneGeometry args={[foliageSize * 0.7, foliageSize, 8]} />
        <meshStandardMaterial
          color="#00FF88"
          transparent
          opacity={0.85}
          emissive="#00FF88"
          emissiveIntensity={0.3 + height * 0.1}
        />
      </mesh>
      <mesh position={[0, trunkHeight + foliageSize * 1.7, 0]}>
        <coneGeometry args={[foliageSize * 0.4, foliageSize * 0.8, 8]} />
        <meshStandardMaterial
          color="#00FF88"
          transparent
          opacity={0.9}
          emissive="#00FF88"
          emissiveIntensity={0.4 + height * 0.1}
        />
      </mesh>
    </group>
  )
}

function Firefly({ index }: { index: number }) {
  const meshRef = useRef<Mesh>(null)
  const offset = useMemo(() => ({
    x: Math.random() * 6 - 3,
    y: Math.random() * 2,
    z: Math.random() * 6 - 3,
    speed: 0.3 + Math.random() * 0.4,
    phase: Math.random() * Math.PI * 2,
  }), [])

  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.elapsedTime * offset.speed + offset.phase
      meshRef.current.position.x = offset.x + Math.sin(time) * 0.5
      meshRef.current.position.y = offset.y + Math.sin(time * 1.5) * 0.3
      meshRef.current.position.z = offset.z + Math.cos(time) * 0.5
      
      // Pulsing opacity
      const material = meshRef.current.material as MeshStandardMaterial
      if (material) {
        material.opacity = 0.5 + Math.sin(time * 3) * 0.5
      }
    }
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.03, 8, 8]} />
      <meshStandardMaterial
        color="#00FF88"
        emissive="#00FF88"
        emissiveIntensity={2}
        transparent
        opacity={0.8}
      />
    </mesh>
  )
}
