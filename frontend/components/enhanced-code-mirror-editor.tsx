"use client"

import { useEffect, useRef } from "react"
import { EditorView, basicSetup } from "codemirror"
import { python } from "@codemirror/lang-python"
import { javascript } from "@codemirror/lang-javascript"
import { java } from "@codemirror/lang-java"
import { cpp } from "@codemirror/lang-cpp"
import { EditorState } from "@codemirror/state"
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search"
import { keymap } from "@codemirror/view"
import { indentUnit } from "@codemirror/language"

interface EnhancedCodeMirrorEditorProps {
  value: string
  onCodeChangeAction: (value: string) => void
  language?: string
  searchQuery?: string
  tabSize?: number
  onCursorPositionChangeAction?: (line: number, col: number) => void
  onExecuteAction?: () => void
  isExecuting?: boolean
}

export function EnhancedCodeMirrorEditor({
  value,
  onCodeChangeAction,
  language = "python",
  searchQuery = "",
  tabSize = 4,
  onCursorPositionChangeAction,
  onExecuteAction,
  isExecuting = false,
}: EnhancedCodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isRecreatingRef = useRef(false) // Track when editor is being recreated
  const lastValueRef = useRef<string>(value) // Track last value

  const getLanguageExtension = (lang: string) => {
    switch (lang.toLowerCase()) {
      case "python":
        return python()
      case "javascript":
      case "js":
        return javascript()
      case "java":
        return java()
      case "cpp":
      case "c++":
        return cpp()
      default:
        return python()
    }
  }

  // Create/recreate editor when language, tabSize, or isExecuting changes
  useEffect(() => {
    if (!editorRef.current) return

    // Mark that we're recreating the editor
    isRecreatingRef.current = true

    // Clean up existing editor
    if (viewRef.current) {
      viewRef.current.destroy()
      viewRef.current = null
    }

    // Custom keymap for Ctrl+Enter to execute code
    const customKeymap = [
      {
        key: "Ctrl-Enter",
        run: () => {
          if (onExecuteAction && !isExecuting) {
            onExecuteAction()
          }
          return true
        },
      },
    ]

    const extensions = [
      basicSetup,
      getLanguageExtension(language),
      indentUnit.of(" ".repeat(tabSize)),
      keymap.of([...searchKeymap, ...customKeymap]),
      highlightSelectionMatches(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onCodeChangeAction(update.state.doc.toString())
        }

        if (update.selectionSet && onCursorPositionChangeAction) {
          const pos = update.state.selection.main.head
          const line = update.state.doc.lineAt(pos)
          const col = pos - line.from + 1
          onCursorPositionChangeAction(line.number, col)
        }
      }),
      EditorView.theme({
        "&": {
          height: "100%",
          fontSize: "13px",
        },
        ".cm-content": {
          padding: "12px",
          minHeight: "100%",
          lineHeight: "1.5",
        },
        ".cm-focused": {
          outline: "none",
        },
        ".cm-editor": {
          height: "100%",
        },
        ".cm-scroller": {
          fontFamily: "JetBrains Mono, Consolas, Monaco, 'Courier New', monospace",
        },
        ".cm-gutters": {
          backgroundColor: "#f8f9fa",
          borderRight: "1px solid #e9ecef",
        },
        ".cm-lineNumbers": {
          color: "#6c757d",
          fontSize: "12px",
        },
        ".cm-activeLine": {
          backgroundColor: "#f8f9fa",
        },
        ".cm-selectionMatch": {
          backgroundColor: "#fff3cd",
        },
      }),
    ]

    const state = EditorState.create({
      doc: value,
      extensions,
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view

    // Mark recreation as complete on next tick
    setTimeout(() => {
      isRecreatingRef.current = false
    }, 0)

    return () => {
      if (view) {
        view.destroy()
      }
    }
  }, [language, tabSize, isExecuting])

  // Handle value changes (e.g., when switching between questions)
  useEffect(() => {
    // Skip update if editor is being recreated or doesn't exist
    if (!viewRef.current || isRecreatingRef.current) {
      return
    }

    const currentContent = viewRef.current.state.doc.toString()
    
    // Only update if the content actually differs
    if (currentContent !== value) {
      console.log("🔄 Editor content update:", {
        from: currentContent.substring(0, 50) + "...",
        to: value.substring(0, 50) + "...",
        isRecreating: isRecreatingRef.current
      })

      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: value,
        },
      })
    }
  }, [value])

  return <div ref={editorRef} className="h-full w-full overflow-auto bg-white" />
} 