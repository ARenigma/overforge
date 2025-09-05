"use client"

import { useState, useEffect, useRef } from "react"
import { Clock } from "lucide-react"

interface TimerProps {
  startTime: number
  isRunning?: boolean
  className?: string
}

export function Timer({ startTime, isRunning = true, className = "", countdownUntil, onExpire }: TimerProps & { countdownUntil?: number; onExpire?: () => void; }) {
  const [elapsed, setElapsed] = useState(0)
  const [remaining, setRemaining] = useState<number | null>(null)
  const hasExpiredRef = useRef(false)

  useEffect(() => {
    if (!isRunning) return

    const interval = setInterval(() => {
      if (countdownUntil && countdownUntil > 0) {
        const rem = Math.max(0, countdownUntil - Date.now())
        setRemaining(rem)
        if (rem === 0 && !hasExpiredRef.current) {
          hasExpiredRef.current = true
          onExpire && onExpire()
        }
      } else {
        setElapsed(Date.now() - startTime)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime, isRunning, countdownUntil, onExpire])

  useEffect(() => {
    // Reset expiration guard when countdown target changes
    hasExpiredRef.current = false
    if (countdownUntil && countdownUntil > 0) {
      setRemaining(Math.max(0, countdownUntil - Date.now()))
    } else {
      setRemaining(null)
    }
  }, [countdownUntil])

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    }
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`
  }

  const displayMs = remaining !== null ? remaining : elapsed

  return (
    <div className={`flex items-center gap-1 text-sm text-muted-foreground ${className}`}>
      <Clock className="w-4 h-4" />
      <span className="font-mono">{formatTime(displayMs)}</span>
    </div>
  )
} 