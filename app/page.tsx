'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LoadingOverlay } from '@/components/loading-overlay'
import { Navigation } from '@/components/navigation'
import { PromptLab } from '@/components/screens/prompt-lab'
import { MonsterHunt } from '@/components/screens/monster-hunt'
import { MyGarden } from '@/components/screens/my-garden'
import { Arena } from '@/components/screens/arena'
import { AuthModal } from '@/components/auth/auth-modal'
import { useAuthStore } from '@/lib/auth-store'

const screens = [
  { id: 0, component: PromptLab },
  { id: 1, component: MonsterHunt },
  { id: 2, component: MyGarden },
  { id: 3, component: Arena },
]

// Animation variants for horizontal page transitions
const pageVariants = {
  initial: (direction: number) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  animate: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? '-100%' : '100%',
    opacity: 0,
  }),
}

const pageTransition = {
  type: 'tween' as const,
  ease: 'easeInOut' as const,
  duration: 0.5,
}

export default function Nemora() {
  const { status, initializeAuth } = useAuthStore()
  const [overlayComplete, setOverlayComplete] = useState(false)
  const [currentScreen, setCurrentScreen] = useState(0)
  const [direction, setDirection] = useState(0)

  // Initialize auth once on mount and subscribe to session & profile changes
  useEffect(() => {
    let cleanup: (() => void) | undefined
    initializeAuth().then((unsub) => {
      cleanup = unsub
    })
    return () => {
      if (cleanup) cleanup()
    }
  }, [initializeAuth])

  // Prevent logged-out flash: remain in loading state until overlay completes AND session status is determined
  const isLoading = !overlayComplete || status === 'loading'

  const handleLoadingComplete = useCallback(() => {
    setOverlayComplete(true)
  }, [])

  const handleNavigate = useCallback((newScreen: number) => {
    if (newScreen < 0 || newScreen >= screens.length) return
    setDirection(newScreen > currentScreen ? 1 : -1)
    setCurrentScreen(newScreen)
  }, [currentScreen])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLoading) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        handleNavigate(Math.min(currentScreen + 1, screens.length - 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        handleNavigate(Math.max(currentScreen - 1, 0))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentScreen, isLoading, handleNavigate])

  const CurrentScreenComponent = screens[currentScreen].component

  return (
    <main className="relative min-h-screen overflow-hidden bg-cosmic">
      {/* Cosmic Background */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-cosmic via-cosmic-light/20 to-cosmic" />
        
        {/* Stars */}
        <div className="absolute inset-0">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-px h-px bg-white rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                opacity: Math.random() * 0.7 + 0.3,
              }}
            />
          ))}
        </div>

        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0, 255, 136, 0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0, 255, 136, 0.5) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isLoading && <LoadingOverlay onComplete={handleLoadingComplete} />}
      </AnimatePresence>

      {/* Main Content */}
      {!isLoading && (
        <>
          {/* Navigation */}
          <Navigation currentScreen={currentScreen} onNavigate={handleNavigate} />

          {/* Screen Content */}
          <div className="relative pt-20 min-h-screen">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentScreen}
                custom={direction}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
                className="w-full"
              >
                <CurrentScreenComponent onNavigate={handleNavigate} />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Screen Indicators */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-30"
          >
            {screens.map((screen, index) => (
              <button
                key={screen.id}
                onClick={() => handleNavigate(index)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  currentScreen === index
                    ? 'bg-neon-green w-8 shadow-[0_0_10px_rgba(0,255,136,0.5)]'
                    : 'bg-muted-foreground/50 hover:bg-muted-foreground'
                }`}
                aria-label={`Go to screen ${index + 1}`}
              />
            ))}
          </motion.div>

          {/* Keyboard Navigation Hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="fixed bottom-6 right-6 text-xs font-mono text-muted-foreground/50 hidden lg:block"
          >
            Use ← → arrows or click to navigate
          </motion.div>
        </>
      )}

      {/* Global Auth Modal */}
      <AuthModal />
    </main>
  )
}
