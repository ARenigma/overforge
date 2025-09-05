"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface GoToLineDialogProps {
  anchorEl: HTMLElement
  onGoToLineAction: (lineNumber: number) => void
  onCloseAction: () => void
  maxLine?: number
}

export function GoToLineDialog({ anchorEl, onGoToLineAction, onCloseAction, maxLine = 100 }: GoToLineDialogProps) {
  const [lineNumber, setLineNumber] = useState("")
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Position the dialog relative to the anchor element
    if (dialogRef.current && anchorEl) {
      const anchorRect = anchorEl.getBoundingClientRect()
      const dialogEl = dialogRef.current

      // Position above the anchor element
      dialogEl.style.position = "fixed"
      dialogEl.style.bottom = `${window.innerHeight - anchorRect.top + 4}px`
      dialogEl.style.left = `${anchorRect.left}px`
      dialogEl.style.zIndex = "50"
    }

    // Handle click outside to close
    const handleClickOutside = (event: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node) && 
          !anchorEl.contains(event.target as Node)) {
        onCloseAction()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [anchorEl, onCloseAction])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const line = parseInt(lineNumber, 10)
    if (!isNaN(line) && line > 0 && line <= maxLine) {
      onGoToLineAction(line)
      setLineNumber("")
      onCloseAction()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCloseAction()
    }
  }

  return (
    <div
      ref={dialogRef}
      className="bg-white border border-gray-300 rounded-md shadow-lg p-3 w-64"
      onKeyDown={handleKeyDown}
    >
      <div className="text-xs text-gray-600 mb-2">Go to Line</div>
      <form onSubmit={handleSubmit} className="space-y-2">
        <Input
          type="number"
          placeholder={`Line (1-${maxLine})`}
          value={lineNumber}
          onChange={(e) => setLineNumber(e.target.value)}
          min="1"
          max={maxLine}
          autoFocus
          className="h-7 text-xs"
        />
        <div className="flex gap-1">
          <Button type="submit" size="sm" className="flex-1 h-6 text-xs">
            Go
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCloseAction} className="flex-1 h-6 text-xs">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
} 