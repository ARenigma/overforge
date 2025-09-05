"use client"

import { useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"

interface SpacesMenuProps {
  anchorEl: HTMLElement
  currentTabSize: number
  onTabSizeChangeAction: (tabSize: number) => void
  onCloseAction: () => void
}

export function SpacesMenu({ anchorEl, currentTabSize, onTabSizeChangeAction, onCloseAction }: SpacesMenuProps) {
  const tabSizes = [2, 4, 8]
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Position the menu relative to the anchor element
    if (menuRef.current && anchorEl) {
      const anchorRect = anchorEl.getBoundingClientRect()
      const menuEl = menuRef.current

      // Position above the anchor element
      menuEl.style.position = "fixed"
      menuEl.style.bottom = `${window.innerHeight - anchorRect.top + 4}px`
      menuEl.style.left = `${anchorRect.left}px`
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
    <div ref={menuRef} className="bg-white border border-gray-300 rounded-md shadow-lg p-2">
      <div className="text-xs text-gray-600 mb-2 px-2">Tab Size</div>
      <div className="flex flex-col gap-1">
        {tabSizes.map((size) => (
          <Button
            key={size}
            variant={currentTabSize === size ? "default" : "ghost"}
            size="sm"
            onClick={() => onTabSizeChangeAction(size)}
            className="h-6 text-xs justify-start hover:font-medium"
          >
            {size} spaces
          </Button>
        ))}
      </div>
    </div>
  )
} 