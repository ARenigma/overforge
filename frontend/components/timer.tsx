"use client"

import { useState, useEffect } from "react"
import { Clock } from "lucide-react"

interface TimerProps {
  startTime: number
  isRunning?: boolean
  className?: string
}

export function Timer({ startTime, isRunning = true, className = "" }: TimerProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isRunning) return

    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime)
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime, isRunning])

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    }
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }

  return (
    <div className={`flex items-center gap-1 text-sm text-muted-foreground ${className}`}>
      <Clock className="w-4 h-4" />
      <span className="font-mono">{formatTime(elapsed)}</span>
    </div>
  )
} 