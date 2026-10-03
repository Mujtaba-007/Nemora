'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface LoadingOverlayProps {
  onComplete: () => void
}

export function LoadingOverlay({ onComplete }: LoadingOverlayProps) {
  const [progress, setProgress] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setTimeout(() => {
            setIsComplete(true)
            setTimeout(onComplete, 500)
          }, 300)
          return 100
        }
        // Simulate loading with variable speed
        const increment = Math.random() * 15 + 5
        return Math.min(prev + increment, 100)
      })
    }, 150)

    return () => clearInterval(interval)
  }, [onComplete])

  return (
    <AnimatePresence>
      {!isComplete && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 bg-cosmic flex flex-col items-center justify-center"
        >
          {/* Logo / Brand */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <h1 className="text-4xl lg:text-6xl font-sans font-bold text-neon-green neon-text">
              Nemora
            </h1>
          </motion.div>

          {/* Loading Animation */}
          <div className="relative w-48 h-48 mb-8">
            {/* Outer ring */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 border-2 border-neon-green/20 rounded-full"
            />
            
            {/* Progress ring */}
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle
                cx="96"
                cy="96"
                r="88"
                fill="none"
                stroke="rgba(0, 255, 136, 0.1)"
                strokeWidth="4"
              />
              <motion.circle
                cx="96"
                cy="96"
                r="88"
                fill="none"
                stroke="#00FF88"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={553}
                strokeDashoffset={553 - (553 * progress) / 100}
                style={{
                  filter: 'drop-shadow(0 0 10px rgba(0, 255, 136, 0.5))',
                }}
              />
            </svg>

            {/* Inner content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-4xl font-bold font-mono text-neon-green neon-text"
              >
                {Math.round(progress)}%
              </motion.div>
            </div>

            {/* Orbiting dots */}
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                animate={{ rotate: 360 }}
                transition={{
                  duration: 3 + i,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                className="absolute inset-0"
              >
                <div
                  className="absolute w-3 h-3 bg-neon-green rounded-full"
                  style={{
                    top: '0%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    boxShadow: '0 0 15px rgba(0, 255, 136, 0.8)',
                  }}
                />
              </motion.div>
            ))}
          </div>

          {/* Loading text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <p className="text-muted-foreground font-mono text-sm mb-2">
              Initializing eco-systems...
            </p>
            <div className="flex items-center justify-center gap-2">
              {['3D Engine', 'Data Sync', 'AI Models'].map((item, i) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0.3 }}
                  animate={{ opacity: progress > (i + 1) * 30 ? 1 : 0.3 }}
                  className="flex items-center gap-1"
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      progress > (i + 1) * 30 ? 'bg-neon-green' : 'bg-muted-foreground'
                    }`}
                  />
                  <span className="text-xs font-mono text-muted-foreground">{item}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
