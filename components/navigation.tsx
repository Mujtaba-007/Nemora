'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Beaker, Swords, TreePine, Trophy } from 'lucide-react'
import { UserChip } from '@/components/auth/user-chip'
import { getGlobalStats, type GlobalStats } from '@/lib/api'

interface NavigationProps {
  currentScreen: number
  onNavigate: (screen: number) => void
}

const screens = [
  { id: 0, name: 'Prompt Lab', icon: Beaker },
  { id: 1, name: 'Monster Hunt', icon: Swords },
  { id: 2, name: 'My Garden', icon: TreePine },
  { id: 3, name: 'Arena', icon: Trophy },
]

export function Navigation({ currentScreen, onNavigate }: NavigationProps) {
  const [stats, setStats] = useState<GlobalStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let isMounted = true

    const fetchStats = async () => {
      try {
        const data = await getGlobalStats()
        if (isMounted) {
          setStats(data)
          setHasError(false)
        }
      } catch {
        if (isMounted) {
          setHasError(true)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchStats()

    // Refresh every 60 seconds
    const interval = setInterval(fetchStats, 60000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="fixed top-0 left-0 right-0 z-40 p-4"
    >
      <div className="max-w-4xl mx-auto glass-card p-2 flex items-center justify-between gap-2">
        {/* Logo */}
        <div className="hidden sm:flex items-center gap-2 px-3">
          <span className="text-lg font-sans font-bold text-neon-green">
            Nemora
          </span>
        </div>

        {/* Nav Items */}
        <div className="flex-1 flex items-center justify-center gap-1 sm:gap-2">
          {screens.map((screen) => {
            const Icon = screen.icon
            const isActive = currentScreen === screen.id

            return (
              <motion.button
                key={screen.id}
                onClick={() => onNavigate(screen.id)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`
                  relative flex items-center gap-2 px-3 py-2 rounded-lg
                  font-mono text-xs sm:text-sm transition-colors duration-300
                  ${
                    isActive
                      ? 'text-neon-green'
                      : 'text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{screen.name}</span>

                {/* Active indicator */}
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-neon-green/10 border border-neon-green/30 rounded-lg -z-10"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </motion.button>
            )
          })}
        </div>

        {/* User Identity / Auth & Status */}
        <div className="flex items-center gap-2 px-1 sm:px-2">
          <UserChip />
          <div className="hidden md:flex items-center gap-1.5 pl-2 border-l border-glass-border">
            {isLoading && !stats ? (
              <div className="flex items-center gap-1.5 animate-pulse">
                <div className="w-2 h-2 rounded-full bg-glass-border" />
                <div className="w-24 h-3 bg-white/10 rounded" />
              </div>
            ) : stats && !hasError ? (
              <>
                <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                  {((stats.total_co2_saved || 0) / 1000).toFixed(1)} kg CO2 saved | {Math.round(stats.trees_equivalent || 0)} trees
                </span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                <span className="text-[10px] font-mono text-muted-foreground">Online</span>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  )
}
