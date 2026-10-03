'use client'

import { Suspense, useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArenaScene } from '@/components/three/arena-scene'
import { useAuthStore } from '@/lib/auth-store'
import {
  submitChallenge,
  getDailyChallenge,
  getLeaderboard,
  ApiError,
  type DailyChallengeData,
  type LeaderboardEntry,
} from '@/lib/api'

interface ArenaProps {
  onNavigate?: (screen: number) => void
}

export function Arena({ onNavigate: _onNavigate }: ArenaProps) {
  const { user, profile, openAuthModal } = useAuthStore()

  const [activeChallenge, setActiveChallenge] = useState<DailyChallengeData | null>(null)
  const [liveLeaderboard, setLiveLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loadingChallenge, setLoadingChallenge] = useState(true)
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true)
  const [code, setCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load challenge and leaderboard on mount
  useEffect(() => {
    getDailyChallenge()
      .then((challenge) => {
        setActiveChallenge(challenge)
        if (challenge) setCode(challenge.starter_code)
      })
      .finally(() => setLoadingChallenge(false))

    getLeaderboard()
      .then((entries) => setLiveLeaderboard(entries))
      .finally(() => setLoadingLeaderboard(false))
  }, [])

  const handleSubmit = async () => {
    if (!user) {
      openAuthModal('login', 'Authenticate to submit code and climb the leaderboard!')
      return
    }
    if (!activeChallenge) {
      toast.error('No active challenge available.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await submitChallenge({ challengeId: activeChallenge.id, code })
      toast.success(`Solution Evaluated! Score: ${res.score}/100 (Rank #${res.rank})`)
      // Refresh leaderboard after submission
      getLeaderboard().then((entries) => setLiveLeaderboard(entries))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        openAuthModal('login', 'Session expired. Please log in again.')
      } else if (err instanceof Error) {
        toast.error('Submission Failed', { description: err.message })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const efficiencyScore = activeChallenge?.max_score ?? 0

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-neon-green'
    if (score >= 70) return 'text-yellow-400'
    return 'text-neon-red'
  }

  const getScoreGlow = (score: number) => {
    if (score >= 90) return 'shadow-[0_0_20px_rgba(0,255,136,0.5)]'
    if (score >= 70) return 'shadow-[0_0_20px_rgba(255,200,0,0.5)]'
    return 'shadow-[0_0_20px_rgba(255,68,102,0.5)]'
  }

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
          The <span className="text-neon-green neon-text">Arena</span>
        </h1>
        <p className="text-muted-foreground font-mono text-sm">
          Compete, optimize, and climb the eco-leaderboard
        </p>
      </motion.div>

      {/* Main Content */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 3D Trophy */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="glass-card p-4 h-[300px] lg:col-span-1"
        >
          <Canvas camera={{ position: [0, 1, 5], fov: 45 }}>
            <Suspense fallback={null}>
              <ambientLight intensity={0.3} />
              <pointLight position={[5, 5, 5]} intensity={1} color="#00FF88" />
              <pointLight position={[-5, 3, -5]} intensity={0.5} color="#FFaa44" />
              <ArenaScene />
              <OrbitControls enableZoom={false} enablePan={false} />
              <Environment preset="night" />
            </Suspense>
          </Canvas>
        </motion.div>

        {/* Leaderboard */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="glass-card p-6 lg:col-span-2"
        >
          <h3 className="font-sans font-bold text-foreground mb-4 flex items-center gap-2">
            <span className="text-neon-green">⚡</span> Global Leaderboard
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-mono text-muted-foreground border-b border-glass-border">
                  <th className="pb-3 pr-4">Rank</th>
                  <th className="pb-3 pr-4">Player</th>
                  <th className="pb-3 pr-4 text-right">Efficiency</th>
                  <th className="pb-3 text-right">CO2 Saved</th>
                </tr>
              </thead>
              <tbody>
                {loadingLeaderboard ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-xs font-mono text-muted-foreground animate-pulse">
                      Loading leaderboard…
                    </td>
                  </tr>
                ) : liveLeaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-xs font-mono text-muted-foreground">
                      No entries yet — be the first to compete!
                    </td>
                  </tr>
                ) : (
                  liveLeaderboard.map((player, index) => {
                    const isCurrentUser = profile?.username === player.username
                    return (
                      <motion.tr
                        key={player.username}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + index * 0.1 }}
                        className={`border-b border-glass-border/50 ${isCurrentUser ? 'bg-neon-green/10' : ''}`}
                      >
                        <td className="py-3 pr-4">
                          <span
                            className={`font-mono font-bold ${
                              (player.rank ?? 0) <= 3 ? 'text-neon-green' : 'text-muted-foreground'
                            }`}
                          >
                            #{player.rank ?? index + 1}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`font-sans ${
                              isCurrentUser ? 'text-neon-green font-bold' : 'text-foreground'
                            }`}
                          >
                            {player.username}
                            {isCurrentUser ? ' (you)' : ''}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <span className={`font-mono font-bold ${getScoreColor(player.efficiency)}`}>
                            {player.efficiency.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <span className="font-mono text-neon-green">{player.total_co2_saved.toFixed(1)}g</span>
                        </td>
                      </motion.tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Daily Challenge */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="glass-card p-6 lg:col-span-3"
        >
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Challenge Info */}
            <div className="lg:w-1/3">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-neon-green animate-pulse" />
                <h3 className="font-sans font-bold text-foreground">Daily Challenge</h3>
              </div>
              {loadingChallenge ? (
                <p className="text-xs font-mono text-muted-foreground animate-pulse">Loading challenge…</p>
              ) : activeChallenge ? (
                <>
                  <h4 className="text-xl font-bold text-neon-green mb-2">{activeChallenge.title}</h4>
                  <p className="text-sm text-muted-foreground mb-4">{activeChallenge.description}</p>

                  {/* Score Display */}
                  <div className="glass-card p-4">
                    <p className="text-xs font-mono text-muted-foreground mb-2">Max Score</p>
                    <div className="flex items-center gap-4">
                      <div
                        className={`text-4xl font-bold font-mono ${getScoreColor(efficiencyScore)} ${getScoreGlow(efficiencyScore)} rounded-lg p-2`}
                      >
                        {efficiencyScore}
                      </div>
                      <div className="flex-1">
                        <div className="h-3 bg-black/30 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${efficiencyScore}%` }}
                            transition={{ duration: 0.5 }}
                            className={`h-full rounded-full ${
                              efficiencyScore >= 90
                                ? 'bg-neon-green'
                                : efficiencyScore >= 70
                                ? 'bg-yellow-400'
                                : 'bg-neon-red'
                            }`}
                          />
                        </div>
                        <p className="text-xs font-mono text-muted-foreground mt-1">
                          Target: {efficiencyScore}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No challenge available today. Check back tomorrow!</p>
              )}

              {/* Hints */}
              <div className="mt-4 p-3 bg-black/20 rounded-lg">
                <p className="text-xs font-mono text-neon-green mb-1">💡 Optimization Hints:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Use Promise.all for parallel requests</li>
                  <li>• Implement caching strategies</li>
                  <li>• Batch operations when possible</li>
                </ul>
              </div>
            </div>

            {/* Code Editor */}
            <div className="lg:w-2/3">
              <p className="text-xs font-mono text-muted-foreground mb-2">
                Optimize this code to improve your score:
              </p>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-64 p-4 bg-black/40 backdrop-blur-sm border border-glass-border rounded-xl 
                           text-neon-green font-mono text-sm resize-none
                           focus:outline-none focus:border-neon-green focus:ring-2 focus:ring-neon-green/30
                           transition-all duration-300"
                spellCheck={false}
                placeholder={loadingChallenge ? 'Loading challenge code…' : ''}
              />
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs font-mono text-muted-foreground">
                  {code.split('\n').length} lines
                </p>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setCode(activeChallenge?.starter_code ?? '')}
                    className="px-4 py-2 bg-glass-bg border border-glass-border rounded-lg
                               text-xs font-mono text-foreground hover:border-neon-green
                               transition-colors duration-300"
                  >
                    Reset Code
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={isSubmitting || !activeChallenge}
                    onClick={handleSubmit}
                    className="px-4 py-2 bg-neon-green/20 border border-neon-green text-neon-green rounded-lg
                               text-xs font-mono font-bold hover:bg-neon-green/30 disabled:opacity-50
                               transition-colors duration-300 shadow-[0_0_10px_rgba(0,255,136,0.2)]"
                  >
                    {isSubmitting ? 'Evaluating...' : 'Submit Solution'}
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
