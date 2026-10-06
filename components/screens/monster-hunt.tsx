'use client'

import { Suspense, useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Copy, Check } from 'lucide-react'
import { PollutionShard } from '@/components/three/pollution-shard'
import { CrystalOrb } from '@/components/three/crystal-orb'
import { useCO2Store } from '@/lib/store'
import { useAuthStore } from '@/lib/auth-store'
import { optimizePrompt, saveGuestClaimToken, ApiError, type OptimizeResult } from '@/lib/api'
import { MAX_PROMPT_CHARS } from '@/lib/limits'

// Human-readable messages for each non-award reason
const REASON_MESSAGES: Record<string, string> = {
  DUPLICATE_PROMPT:  'Already optimized recently. No coins awarded.',
  DAILY_CAP_REACHED: 'Daily reward limit reached. Come back tomorrow.',
  NO_SAVINGS:        'No savings found for this prompt, so no reward.',
  REWARD_ERROR:      'Rewards are temporarily unavailable.',
}

export function MonsterHunt({ onNavigate: _onNavigate }: { onNavigate?: (screen: number) => void }) {
  const { addCO2Saved, currentPrompt, draftPrompt, setDraftPrompt, refreshGardenData } = useCO2Store()
  const { user, openAuthModal, refreshProfile } = useAuthStore()
  const [prompt, setPrompt] = useState(currentPrompt || '')
  const [strategy, setStrategy] = useState<'compress' | 'facts-only' | 'bullets'>('compress')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Character-based prompt limit
  const charCount = prompt.length

  // Pre-fill from draftPrompt (set by Prompt Lab) on mount, then clear it
  useEffect(() => {
    if (draftPrompt) {
      setPrompt(draftPrompt)
      setDraftPrompt('')
    } else if (currentPrompt && !prompt) {
      setPrompt(currentPrompt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCopy = async (text: string) => {
    let success = false
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text)
        success = true
      } catch {
        // Fallback to execCommand below
      }
    }

    if (!success) {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        textarea.style.top = '0'
        document.body.appendChild(textarea)
        textarea.select()
        success = document.execCommand('copy')
        document.body.removeChild(textarea)
      } catch {
        success = false
      }
    }

    if (success) {
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Failed to copy to clipboard')
    }
  }

  const handleOptimize = async () => {
    if (!prompt.trim() || charCount > MAX_PROMPT_CHARS) return
    setIsLoading(true)
    try {
      const data = await optimizePrompt({ prompt, strategy })
      setResult(data)
      setCopied(false)

      // Only update the global CO2 counter when the reward was actually awarded
      if (data.awarded) {
        addCO2Saved(data.savings)
      }

      if (data.persisted && data.awarded) {
        await refreshProfile()
        await refreshGardenData(true)
        toast.success(`Hunted! Saved ${data.savings.toFixed(3)}g CO2 and earned ${data.coins_awarded} coins!`)
      } else if (!user) {
        // Guest: still show result even if no savings
        if (data.claim_token) {
          saveGuestClaimToken(data.claim_token)
        }
        if (data.awarded) {
          toast.info(`Hunted! Saved ${data.savings.toFixed(3)}g CO2. Log in to earn coins!`)
        } else {
          const msg = data.reason ? (REASON_MESSAGES[data.reason] ?? data.reason) : 'No reward for this optimization.'
          toast.info(`Hunted! ${msg}`)
        }
      } else if (user && !data.awarded) {
        const msg = data.reason ? (REASON_MESSAGES[data.reason] ?? data.reason) : 'No reward for this optimization.'
        toast.info(msg)
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        toast.error(error.message, {
          description: error.retryAfter ? `Please wait ${error.retryAfter} seconds.` : undefined,
          duration: 5000,
        })
      } else if (error instanceof Error) {
        toast.error('Optimization Failed', {
          description: error.message,
          duration: 5000,
        })
      } else {
        toast.error('An unexpected error occurred while hunting.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-8"
      >
        <h1 className="text-4xl lg:text-5xl font-sans font-bold text-foreground mb-2">
          <span className="text-neon-red">Monster</span>{' '}
          <span className="text-neon-green neon-text">Hunt</span>
        </h1>
        <p className="text-muted-foreground font-mono text-sm">
          Optimize your prompt and slash its carbon footprint
        </p>
      </motion.div>

      {/* Prompt Input */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="w-full max-w-6xl mb-8"
      >
        <div className="glass-card p-6">
          {/* Strategy Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs font-mono text-muted-foreground">Compression Strategy:</p>
            <div className="flex items-center gap-1 p-1 bg-black/40 border border-glass-border rounded-lg" role="radiogroup" aria-label="Compression strategy">
              {(
                [
                  { id: 'compress',   label: '⚡ Compress',  desc: 'Standard density' },
                  { id: 'facts-only', label: '🎯 Facts-Only', desc: 'Extract factual specs' },
                  { id: 'bullets',    label: '📋 Bullets',   desc: 'Concise bullet points' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={strategy === s.id}
                  aria-label={`${s.desc} strategy`}
                  onClick={() => setStrategy(s.id)}
                  className={`py-1 px-2.5 rounded-md font-mono text-xs transition-all ${
                    strategy === s.id
                      ? 'bg-neon-green/20 text-neon-green border border-neon-green/40 shadow-[0_0_10px_rgba(0,255,136,0.3)]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title={s.desc}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter a long prompt here and watch it get optimized..."
            className="w-full h-32 p-4 bg-black/30 border border-glass-border rounded-xl
                       text-foreground font-mono text-sm resize-none
                       focus:outline-none focus:border-neon-green focus:ring-2 focus:ring-neon-green/30
                       transition-all duration-300 placeholder:text-muted-foreground"
          />
          {/* Character counter */}
          <div className="flex justify-end mt-1.5 px-1">
            <span
              className={`text-xs font-mono transition-colors ${
                charCount > MAX_PROMPT_CHARS
                  ? 'text-neon-red font-semibold'
                  : charCount >= MAX_PROMPT_CHARS * 0.9
                  ? 'text-amber-400'
                  : 'text-muted-foreground'
              }`}
            >
              {charCount.toLocaleString()} / {MAX_PROMPT_CHARS.toLocaleString()} characters
            </span>
          </div>
          <button
            onClick={handleOptimize}
            disabled={isLoading || !prompt.trim() || charCount > MAX_PROMPT_CHARS}
            className="mt-4 w-full py-3 px-6 bg-neon-green/20 border border-neon-green text-neon-green 
                       font-mono font-bold rounded-xl hover:bg-neon-green/30 transition-all duration-300
                       disabled:opacity-50 disabled:cursor-not-allowed
                       shadow-[0_0_20px_rgba(0,255,136,0.2)] flex flex-col items-center justify-center leading-tight"
          >
            {isLoading ? (
              <span>Optimizing...</span>
            ) : (
              <>
                <span>⚡ Hunt the Monster</span>
                <span className="text-[11px] font-normal opacity-80 mt-0.5">
                  Give a prompt of {MAX_PROMPT_CHARS.toLocaleString()} characters or fewer
                </span>
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Results */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-6xl"
        >
          {/* Guest Mode Banking Callout */}
          {!user && result.awarded && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card mb-6 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-yellow-400/30 bg-yellow-400/5 shadow-[0_0_20px_rgba(245,197,24,0.1)]"
            >
              <div className="flex items-center gap-2 text-xs font-mono text-yellow-300">
                <span className="text-base">⚡</span>
                <span>
                  You optimized as a guest. <strong>Log in to bank these {result.coins_awarded} coins</strong> and record your carbon reduction!
                </span>
              </div>
              <button
                type="button"
                onClick={() => openAuthModal('login', `Log in to bank ${result.coins_awarded} eco-coins!`)}
                className="py-1.5 px-4 bg-yellow-400/20 border border-yellow-400 text-yellow-300 font-mono text-xs font-bold rounded-lg hover:bg-yellow-400/30 transition-all shrink-0"
              >
                Log In to Bank Coins
              </button>
            </motion.div>
          )}

          {/* Stats Bar */}
          <div className="glass-card p-4 mb-6 flex flex-wrap items-center justify-center gap-6 lg:gap-8">
            <div className="text-center">
              <p className="text-xs font-mono text-muted-foreground">CO2 Saved</p>
              <p className="text-2xl font-bold text-neon-green neon-text">{result.savings.toFixed(3)}g</p>
            </div>
            <div className="h-10 w-px bg-glass-border" />
            <div className="text-center">
              <p className="text-xs font-mono text-muted-foreground">Coins Earned</p>
              {result.awarded ? (
                <>
                  <p className="text-2xl font-bold text-neon-green neon-text">🪙 {result.coins_awarded}</p>
                  {!result.persisted && (
                    <span className="text-[10px] font-mono text-yellow-400 block">Log in to save</span>
                  )}
                </>
              ) : (
                <p className="text-xs font-mono text-muted-foreground mt-1 max-w-[140px]">
                  {result.reason ? (REASON_MESSAGES[result.reason] ?? result.reason) : 'No reward.'}
                </p>
              )}
            </div>
            <div className="h-10 w-px bg-glass-border" />
            <div className="text-center">
              <p className="text-xs font-mono text-muted-foreground">Token Reduction</p>
              <p className="text-2xl font-bold text-neon-green neon-text">
                -{result.original.tokens > 0
                  ? Math.round(((result.original.tokens - result.optimized.tokens) / result.original.tokens) * 100)
                  : 0}% tokens
              </p>
            </div>
            <div className="h-10 w-px bg-glass-border" />
            <div className="text-center">
              <p className="text-xs font-mono text-muted-foreground">CO2 Reduction</p>
              <p className="text-2xl font-bold text-neon-green neon-text">
                {result.original.co2 > 0
                  ? Math.round((result.savings / result.original.co2) * 100)
                  : 0}%
              </p>
            </div>
          </div>

          {/* Split View */}
          <div className="grid grid-cols-2 gap-4 lg:gap-8">
            {/* Left: Original */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="glass-card-red p-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-neon-red animate-pulse" />
                <h2 className="font-sans font-bold text-neon-red">Original Prompt</h2>
              </div>
              <div className="h-[200px] mb-4">
                <Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
                  <Suspense fallback={null}>
                    <ambientLight intensity={0.2} />
                    <pointLight position={[5, 5, 5]} intensity={1} color="#FF4466" />
                    <PollutionShard />
                    <OrbitControls enableZoom={false} enablePan={false} />
                    <Environment preset="night" />
                  </Suspense>
                </Canvas>
              </div>
              <div className="space-y-3">
                <pre className="bg-black/30 p-3 rounded-lg text-xs font-mono text-neon-red overflow-x-auto whitespace-pre-wrap">
                  {result.original.text}
                </pre>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">CO2:</span>
                  <span className="text-neon-red font-bold">{result.original.co2.toFixed(3)}g</span>
                </div>
              </div>
            </motion.div>

            {/* Right: Optimized */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="glass-card-green p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-neon-green animate-pulse" />
                  <h2 className="font-sans font-bold text-neon-green">Optimized Prompt</h2>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(result.optimized.text)}
                  className="p-1.5 rounded-md bg-neon-green/10 border border-neon-green/30 text-neon-green hover:bg-neon-green/20 transition-all focus:outline-none focus:ring-2 focus:ring-neon-green/40"
                  title="Copy optimized prompt"
                  aria-label="Copy optimized prompt"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="h-[200px] mb-4">
                <Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
                  <Suspense fallback={null}>
                    <ambientLight intensity={0.2} />
                    <pointLight position={[5, 5, 5]} intensity={1} color="#00FF88" />
                    <CrystalOrb />
                    <OrbitControls enableZoom={false} enablePan={false} />
                    <Environment preset="night" />
                  </Suspense>
                </Canvas>
              </div>
              <div className="space-y-3">
                <pre className="bg-black/30 p-3 rounded-lg text-xs font-mono text-neon-green overflow-x-auto whitespace-pre-wrap">
                  {result.optimized.text}
                </pre>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">CO2:</span>
                  <span className="text-neon-green font-bold">{result.optimized.co2.toFixed(3)}g</span>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
