"use client"

import { useRef, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Play, Edit, ArrowRightLeft } from "lucide-react"

interface HistoryEntry {
  id: string
  timestamp: number
  code: string
  questionId: string
  event: string
}

interface HistoryMiniMapProps {
  anchorEl: HTMLElement
  onCloseAction: () => void
  history?: HistoryEntry[]
  currentQuestionId?: string
}

export function HistoryMiniMap({ anchorEl, onCloseAction, history = [], currentQuestionId }: HistoryMiniMapProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Format timestamp to relative time
  const formatTimestamp = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return `${seconds}s ago`
  }

  // Filter history for current question and reverse to show most recent first
  const currentQuestionHistory = history
    .filter(entry => entry.questionId === currentQuestionId)
    .reverse()
    .slice(0, 10) // Show last 10 entries

  useEffect(() => {
    // Position the menu relative to the anchor element
    if (menuRef.current && anchorEl) {
      const anchorRect = anchorEl.getBoundingClientRect()
      const menuEl = menuRef.current

      // Position above the anchor element
      menuEl.style.position = "fixed"
      menuEl.style.bottom = `${window.innerHeight - anchorRect.top + 4}px`
      menuEl.style.right = `${window.innerWidth - anchorRect.right}px`
      menuEl.style.zIndex = "50"
    }

    // Handle click outside to close
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && 
          !anchorEl.contains(event.target as Node)) {
        onCloseAction()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [anchorEl, onCloseAction])

  return (
    <div ref={menuRef} className="bg-white border border-gray-300 rounded-md shadow-lg p-2 w-64">
      <div className="text-xs text-gray-600 mb-2 px-2">Code History</div>
      <ScrollArea className="max-h-48">
        <div className="space-y-1">
          {currentQuestionHistory.length > 0 ? (
            currentQuestionHistory.map((entry) => (
              <div
                key={entry.id}
                className="p-2 rounded hover:bg-gray-100 cursor-pointer border border-gray-200"
              >
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>{formatTimestamp(entry.timestamp)}</span>
                  <div className="flex items-center">
                    {entry.event === "execute" ? (
                      <Play className="w-3 h-3 text-green-600" />
                    ) : entry.event === "init" ? (
                      <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
                    ) : entry.event === "switch" ? (
                      <ArrowRightLeft className="w-3 h-3 text-orange-600" />
                    ) : (
                      <Edit className="w-3 h-3 text-blue-600" />
                    )}
                  </div>
                </div>
                <div className="text-xs font-mono text-gray-700 leading-tight">
                  {entry.code.split('\n').slice(0, 2).join('\n')}
                  {entry.code.split('\n').length > 2 && '...'}
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-xs text-gray-500">
              No history available for this question
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
} 