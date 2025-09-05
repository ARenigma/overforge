"use client"

import { useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Search, X } from "lucide-react"

interface SearchDialogProps {
  anchorEl: HTMLElement
  searchQuery: string
  onSearchChangeAction: (value: string) => void
  onCloseAction: () => void
}

export function SearchDialog({
  anchorEl,
  searchQuery,
  onSearchChangeAction,
  onCloseAction,
}: SearchDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dialogRef.current &&
        !dialogRef.current.contains(event.target as Node) &&
        !anchorEl.contains(event.target as Node)
      ) {
        onCloseAction()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseAction()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)

    // Focus the input when the dialog opens
    if (inputRef.current) {
      inputRef.current.focus()
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [anchorEl, onCloseAction])

  // Position the dialog beside the search button
  const anchorRect = anchorEl.getBoundingClientRect()
  
  return (
    <div
      ref={dialogRef}
      className="fixed z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-3 min-w-[280px]"
      style={{
        right: window.innerWidth - anchorRect.left + 8,
        top: anchorRect.top,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Search className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">Find in Editor</span>
        <button
          onClick={onCloseAction}
          className="ml-auto p-1 hover:bg-gray-100 rounded"
        >
          <X className="w-3 h-3 text-gray-500" />
        </button>
      </div>
      
      <Input
        ref={inputRef}
        placeholder="Search in editor..."
        value={searchQuery}
        onChange={(e) => onSearchChangeAction(e.target.value)}
        className="text-sm"
      />
      
      {searchQuery && (
        <div className="mt-2 text-xs text-gray-500">
          Press Ctrl+F to find next, Ctrl+Shift+F to find previous
        </div>
      )}
    </div>
  )
} 