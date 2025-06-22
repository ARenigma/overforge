"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface QuantumLoadingProps {
  isVisible: boolean
  onComplete?: () => void
  loadingText?: string
  subText?: string
}

const QuantumParticle = ({ index, delay }: { index: number; delay: number }) => {
  return (
    <motion.div
      className="absolute w-1 h-1 bg-blue-400 rounded-full"
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0, 1, 0.8, 1, 0],
        scale: [0, 1, 0.8, 1.2, 0],
        x: [
          Math.cos(index * 0.5) * 150,
          Math.cos(index * 0.5 + Math.PI) * 200,
          Math.cos(index * 0.5 + Math.PI * 2) * 150,
        ],
        y: [
          Math.sin(index * 0.5) * 150,
          Math.sin(index * 0.5 + Math.PI) * 200,
          Math.sin(index * 0.5 + Math.PI * 2) * 150,
        ],
      }}
      transition={{
        duration: 4,
        delay: delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      style={{
        filter: "drop-shadow(0 0 8px rgba(59, 130, 246, 0.8))",
      }}
    />
  )
}

const ElectromagneticField = () => {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Field Lines */}
      {Array.from({ length: 12 }, (_, i) => (
        <motion.div
          key={i}
          className="absolute border-t border-blue-300/30"
          style={{
            width: "400px",
            top: "50%",
            left: "50%",
            transformOrigin: "0 0",
          }}
          initial={{ rotate: i * 30, opacity: 0 }}
          animate={{
            rotate: [i * 30, i * 30 + 360],
            opacity: [0, 0.6, 0.3, 0.6, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "linear",
          }}
        />
      ))}
      
      {/* Magnetic Field Waves */}
      {Array.from({ length: 6 }, (_, i) => (
        <motion.div
          key={`wave-${i}`}
          className="absolute border border-purple-400/20 rounded-full"
          style={{
            width: 100 + i * 50,
            height: 100 + i * 50,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.8, 0.2, 0.8],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            delay: i * 0.5,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  )
}

const WaveFunction = () => {
  const points = Array.from({ length: 100 }, (_, i) => {
    const x = (i / 100) * 800 - 400
    return { x, index: i }
  })

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="-400 -300 800 600">
      {/* Primary Wave */}
      <motion.path
        d={`M ${points.map(p => `${p.x},${50 * Math.sin(p.index * 0.2)}`).join(' L ')}`}
        fill="none"
        stroke="url(#waveGradient1)"
        strokeWidth="3"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ 
          pathLength: [0, 1, 0], 
          opacity: [0, 1, 0],
          strokeDashoffset: [0, -100, -200]
        }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: "easeInOut",
          strokeDashoffset: { duration: 2, repeat: Infinity, ease: "linear" }
        }}
        style={{ strokeDasharray: "20 10" }}
      />
      
      {/* Secondary Wave (90 degrees out of phase) */}
      <motion.path
        d={`M ${points.map(p => `${p.x},${50 * Math.cos(p.index * 0.2)}`).join(' L ')}`}
        fill="none"
        stroke="url(#waveGradient2)"
        strokeWidth="2"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ 
          pathLength: [0, 1, 0], 
          opacity: [0, 0.8, 0],
          strokeDashoffset: [50, -50, -150]
        }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: "easeInOut",
          delay: 0.5,
          strokeDashoffset: { duration: 2, repeat: Infinity, ease: "linear", delay: 0.5 }
        }}
        style={{ strokeDasharray: "15 8" }}
      />

      <defs>
        <linearGradient id="waveGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(59, 130, 246, 0)" />
          <stop offset="50%" stopColor="rgba(59, 130, 246, 1)" />
          <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
        </linearGradient>
        <linearGradient id="waveGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(147, 51, 234, 0)" />
          <stop offset="50%" stopColor="rgba(147, 51, 234, 1)" />
          <stop offset="100%" stopColor="rgba(147, 51, 234, 0)" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const QuantumCore = () => {
  return (
    <div className="relative w-24 h-24">
      {/* Central Core */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500"
        animate={{
          rotate: 360,
          scale: [1, 1.1, 1],
        }}
        transition={{
          rotate: { duration: 3, repeat: Infinity, ease: "linear" },
          scale: { duration: 2, repeat: Infinity, ease: "easeInOut" },
        }}
        style={{
          filter: "drop-shadow(0 0 20px rgba(147, 51, 234, 0.8))",
        }}
      />
      
      {/* Electron Orbitals */}
      {Array.from({ length: 3 }, (_, i) => (
        <motion.div
          key={i}
          className="absolute inset-0 border-2 border-blue-400/40 rounded-full"
          style={{
            width: 24 + i * 16,
            height: 24 + i * 16,
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
          animate={{
            rotate: i % 2 === 0 ? 360 : -360,
          }}
          transition={{
            duration: 4 + i,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <motion.div
            className="absolute w-2 h-2 bg-blue-400 rounded-full"
            style={{ top: -4, left: "50%", transform: "translateX(-50%)" }}
            animate={{
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.3,
              ease: "easeInOut",
            }}
          />
        </motion.div>
      ))}
    </div>
  )
}

const DataStream = ({ direction }: { direction: "up" | "down" | "left" | "right" }) => {
  const getPosition = () => {
    switch (direction) {
      case "up": return { bottom: 0, left: "50%", transform: "translateX(-50%)" }
      case "down": return { top: 0, left: "50%", transform: "translateX(-50%)" }
      case "left": return { top: "50%", right: 0, transform: "translateY(-50%)" }
      case "right": return { top: "50%", left: 0, transform: "translateY(-50%)" }
    }
  }

  const getAnimationDirection = () => {
    switch (direction) {
      case "up": return { y: [100, -100] }
      case "down": return { y: [-100, 100] }
      case "left": return { x: [100, -100] }
      case "right": return { x: [-100, 100] }
    }
  }

  return (
    <div className="absolute" style={getPosition()}>
      {Array.from({ length: 8 }, (_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-6 bg-gradient-to-t from-transparent via-cyan-400 to-transparent"
          initial={{ opacity: 0 }}
          animate={{
            ...getAnimationDirection(),
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut",
          }}
          style={{
            [direction === "up" || direction === "down" ? "left" : "top"]: `${i * 8}px`,
          }}
        />
      ))}
    </div>
  )
}

export function QuantumLoading({ 
  isVisible, 
  onComplete, 
  loadingText = "Initializing Quantum AI Engine",
  subText = "Generating personalized interview questions..."
}: QuantumLoadingProps) {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState(0)

  const phases = [
    "Calibrating electromagnetic fields...",
    "Synchronizing quantum processors...",
    "Analyzing code patterns...",
    "Optimizing neural pathways...",
    "Preparing interview environment...",
  ]

  useEffect(() => {
    if (!isVisible) return

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + Math.random() * 3
        if (newProgress >= 100) {
          clearInterval(progressInterval)
          setTimeout(() => onComplete?.(), 500)
          return 100
        }
        return newProgress
      })
    }, 100)

    const phaseInterval = setInterval(() => {
      setPhase(prev => (prev + 1) % phases.length)
    }, 2000)

    return () => {
      clearInterval(progressInterval)
      clearInterval(phaseInterval)
    }
  }, [isVisible, onComplete, phases.length])

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Background Effects */}
          <ElectromagneticField />
          <WaveFunction />
          
          {/* Data Streams */}
          <DataStream direction="up" />
          <DataStream direction="down" />
          <DataStream direction="left" />
          <DataStream direction="right" />

          {/* Quantum Particles */}
          <div className="absolute inset-0 flex items-center justify-center">
            {Array.from({ length: 20 }, (_, i) => (
              <QuantumParticle key={i} index={i} delay={i * 0.1} />
            ))}
          </div>

          {/* Main Content */}
          <div className="relative z-10 text-center text-white max-w-2xl px-8">
            {/* Quantum Core */}
            <div className="flex justify-center mb-8">
              <QuantumCore />
            </div>

            {/* Main Text */}
            <motion.h1
              className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              {loadingText}
            </motion.h1>

            {/* Sub Text */}
            <motion.p
              className="text-xl text-blue-200 mb-8"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            >
              {subText}
            </motion.p>

            {/* Phase Indicator */}
            <motion.div
              className="mb-8"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.8 }}
            >
              <motion.p
                key={phase}
                className="text-sm text-cyan-300 font-mono"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5 }}
              >
                {phases[phase]}
              </motion.p>
            </motion.div>

            {/* Progress Bar */}
            <motion.div
              className="w-full max-w-md mx-auto"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.8 }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">Progress</span>
                <span className="text-sm text-gray-300">{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-full"
                  style={{ width: `${progress}%` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
              
              {/* Progress Glow Effect */}
              <motion.div
                className="w-full h-2 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-cyan-500/20 rounded-full mt-1"
                animate={{
                  opacity: [0.3, 0.8, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </motion.div>

            {/* Technical Stats */}
            <motion.div
              className="grid grid-cols-3 gap-4 mt-8 text-xs text-gray-400 font-mono"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.8 }}
            >
              <div>
                <div className="text-cyan-400">Neural Sync</div>
                <div>{Math.min(progress * 1.2, 100).toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-purple-400">Quantum State</div>
                <div>{(Math.sin(Date.now() / 1000) * 50 + 50).toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-blue-400">Field Strength</div>
                <div>{(Math.cos(Date.now() / 800) * 30 + 70).toFixed(1)}%</div>
              </div>
            </motion.div>
          </div>

          {/* Corner Decorations */}
          {Array.from({ length: 4 }, (_, i) => (
            <motion.div
              key={i}
              className="absolute w-16 h-16 border-l-2 border-t-2 border-blue-400/30"
              style={{
                [i < 2 ? "top" : "bottom"]: 20,
                [i % 2 === 0 ? "left" : "right"]: 20,
                transform: `rotate(${i * 90}deg)`,
              }}
              animate={{
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: i * 0.5,
                ease: "easeInOut",
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
} 