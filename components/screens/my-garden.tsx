'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { motion } from 'framer-motion'
import { GardenScene } from '@/components/three/garden-scene'
import { useCO2Store } from '@/lib/store'
import { useAuthStore } from '@/lib/auth-store'
import { getGardenDaily, type GardenDailyRecord } from '@/lib/api'

interface LiveTree {
  treeId: number
  co2Saved: number
  plantedDate: string
}

export function MyGarden({ onNavigate: _onNavigate }: { onNavigate?: (screen: number) => void }) {
  const { totalCO2Saved } = useCO2Store()
  const { user, profile, openAuthModal } = useAuthStore()

  const [liveRecords, setLiveRecords] = useState<GardenDailyRecord[]>([])
  const [loadingGarden, setLoadingGarden] = useState(false)

  useEffect(() => {
    if (!user) return
    setLoadingGarden(true)
    getGardenDaily()
      .then((records) => setLiveRecords(records))
      .finally(() => setLoadingGarden(false))
  }, [user])

  // Derive live trees from daily records (one tree per record with co2_saved > 0), capped at 60 for performance
  const liveTrees: LiveTree[] = useMemo(() => {
    return liveRecords
      .filter((r) => r.co2_saved > 0)
      .slice(-60)
      .map((r, index) => ({
        treeId: index + 1,
        co2Saved: r.co2_saved,
        plantedDate: r.day,
      }))
  }, [liveRecords])

  // Build 7-day bar chart from the last 7 days, with empty bars and 0g for days with no activity
  const last7Days = useMemo(() => {
    const days: { date: string; fullDate: string; saved: number }[] = []
    const now = new Date()

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const dayNum = String(d.getDate()).padStart(2, '0')
      const fullDate = `${year}-${month}-${dayNum}`
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })

      const match = liveRecords.find((r) => r.day.startsWith(fullDate))
      days.push({
        date: weekday,
        fullDate,
        saved: match ? match.co2_saved : 0,
      })
    }
    return days
  }, [liveRecords])

  const displayTrees = user ? liveTrees : []
  const displayHistory = user ? last7Days : []

  const userCO2Saved = profile?.total_co2_saved ?? totalCO2Saved
  const totalTreesCO2 = displayTrees.reduce((sum, tree) => sum + tree.co2Saved, 0)

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-6"
      >
        <h1 className="text-4xl lg:text-5xl font-sans font-bold text-foreground mb-2">
          My <span className="text-neon-green neon-text">Garden</span>
        </h1>
        <p className="text-muted-foreground font-mono text-sm">
          Watch your sustainable coding efforts grow into a forest
        </p>
      </motion.div>

      {/* Main Content */}
      <div className="relative w-full max-w-6xl">
        {/* Anonymous Callout Overlay */}
        {!user && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 bg-cosmic/80 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center p-8 text-center z-30 border border-glass-border shadow-[0_0_50px_rgba(0,0,0,0.9)]"
          >
            <div className="w-16 h-16 rounded-full bg-neon-green/20 border border-neon-green flex items-center justify-center mb-4 text-neon-green shadow-[0_0_25px_rgba(0,255,136,0.3)]">
              <span className="text-2xl">🌲</span>
            </div>
            <h3 className="text-2xl font-sans font-bold text-foreground mb-2">
              Your Forest Awaits
            </h3>
            <p className="text-xs font-mono text-muted-foreground max-w-sm mb-6">
              Each prompt you optimize plants a living digital tree. Authenticate your terminal to cultivate your personal eco-sanctuary and track cumulative carbon absorption.
            </p>
            <button
              type="button"
              onClick={() => openAuthModal('login', 'Log in to grow your 3D carbon garden!')}
              className="py-3 px-8 bg-neon-green/20 border border-neon-green text-neon-green font-mono font-bold text-xs rounded-xl hover:bg-neon-green/30 transition-all duration-300 shadow-[0_0_25px_rgba(0,255,136,0.3)]"
            >
              Log in to grow your garden
            </button>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 3D Garden */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="glass-card p-4 h-[400px] lg:h-[500px]"
        >
          <Canvas camera={{ position: [4, 3, 4], fov: 50 }}>
            <Suspense fallback={null}>
              <ambientLight intensity={0.3} />
              <pointLight position={[10, 10, 10]} intensity={1} color="#00FF88" />
              <pointLight position={[-5, 5, -5]} intensity={0.5} color="#4488FF" />
              <GardenScene trees={displayTrees} />
              <OrbitControls
                enableZoom={true}
                enablePan={false}
                minDistance={3}
                maxDistance={10}
                autoRotate
                autoRotateSpeed={0.3}
              />
              <Environment preset="forest" />
            </Suspense>
          </Canvas>
        </motion.div>

        {/* Stats & Timeline */}
        <div className="flex flex-col gap-6">
          {/* Overall Stats */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="glass-card p-6"
          >
            <h3 className="font-sans font-bold text-foreground mb-4">Garden Stats</h3>
            {loadingGarden ? (
              <p className="text-xs font-mono text-muted-foreground animate-pulse">
                Loading garden data…
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-neon-green neon-text">
                    {displayTrees.length}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground">Trees Planted</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-neon-green neon-text">
                    {totalTreesCO2.toFixed(1)}g
                  </p>
                  <p className="text-xs font-mono text-muted-foreground">CO2 Captured</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-neon-green neon-text">
                    {userCO2Saved.toFixed(0)}g
                  </p>
                  <p className="text-xs font-mono text-muted-foreground">Total Saved</p>
                </div>
              </div>
            )}
          </motion.div>

          {/* Tree List */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="glass-card p-6 flex-1 overflow-hidden"
          >
            <h3 className="font-sans font-bold text-foreground mb-4">Your Trees</h3>
            <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
              {displayTrees.length === 0 && !loadingGarden ? (
                <p className="text-xs font-mono text-muted-foreground text-center py-4">
                  {user
                    ? 'No trees yet — optimize a prompt to plant your first tree!'
                    : 'Log in to see your trees.'}
                </p>
              ) : (
                displayTrees.map((tree, index) => (
                  <motion.div
                    key={tree.treeId}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    className="flex items-center gap-3 p-3 bg-black/20 rounded-lg"
                  >
                    <div
                      className="w-8 h-8 rounded-full bg-neon-green/20 flex items-center justify-center"
                      style={{
                        boxShadow: `0 0 ${tree.co2Saved}px rgba(0, 255, 136, 0.5)`,
                      }}
                    >
                      <span className="text-neon-green text-sm">🌲</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-mono text-sm text-foreground">Tree #{tree.treeId}</p>
                      <p className="text-xs text-muted-foreground">
                        Planted {tree.plantedDate}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-neon-green font-bold">
                        {tree.co2Saved.toFixed(1)}g
                      </p>
                      <p className="text-xs text-muted-foreground">CO2 saved</p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>

          {/* Weekly Timeline */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="glass-card p-6"
          >
            <h3 className="font-sans font-bold text-foreground mb-4">Weekly Progress</h3>
            {displayHistory.length === 0 ? (
              <p className="text-xs font-mono text-muted-foreground text-center py-4">
                {user ? 'No activity this week yet.' : 'Log in to see your history.'}
              </p>
            ) : (
              <div className="flex items-end justify-between gap-2 h-28 pt-2">
                {displayHistory.map((day, index) => {
                  const maxSaved = Math.max(...displayHistory.map((d) => d.saved), 10)
                  const heightPercent = day.saved > 0 ? Math.min(100, Math.max(12, (day.saved / maxSaved) * 100)) : 0

                  return (
                    <motion.div
                      key={day.fullDate}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ delay: 0.6 + index * 0.05, duration: 0.4 }}
                      className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end"
                      style={{ transformOrigin: 'bottom' }}
                    >
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {day.saved > 0 ? `${day.saved.toFixed(1)}g` : '0g'}
                      </span>
                      <div
                        className={`w-full rounded-t transition-all ${
                          day.saved > 0
                            ? 'bg-gradient-to-t from-neon-green/50 to-neon-green shadow-[0_0_10px_rgba(0,255,136,0.3)]'
                            : 'bg-white/5 border border-white/10'
                        }`}
                        style={{
                          height: day.saved > 0 ? `${heightPercent}%` : '4px',
                          minHeight: '4px',
                        }}
                        title={`${day.fullDate}: ${day.saved.toFixed(2)}g CO2 saved`}
                      />
                      <span className="text-xs font-mono text-muted-foreground">
                        {day.date}
                      </span>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  </div>
  )
}
