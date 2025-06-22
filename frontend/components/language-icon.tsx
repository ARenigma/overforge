"use client"

import { Code } from "lucide-react"

interface LanguageIconProps {
  language: string
  className?: string
}

export function LanguageIcon({ language, className = "w-4 h-4" }: LanguageIconProps) {
  const getLanguageColor = (lang: string) => {
    switch (lang.toLowerCase()) {
      case "python":
        return "text-yellow-600"
      case "javascript":
      case "js":
        return "text-yellow-500"
      case "java":
        return "text-orange-600"
      case "cpp":
      case "c++":
        return "text-blue-600"
      case "typescript":
      case "ts":
        return "text-blue-500"
      default:
        return "text-gray-600"
    }
  }

  return (
    <Code className={`${className} ${getLanguageColor(language)}`} />
  )
} 