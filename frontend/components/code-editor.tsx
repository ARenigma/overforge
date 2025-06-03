"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EditorView } from "@codemirror/view"
import CodeMirror from "@uiw/react-codemirror"
import { javascript } from "@codemirror/lang-javascript"
import { python } from "@codemirror/lang-python"
import { cpp } from "@codemirror/lang-cpp"
import { java } from "@codemirror/lang-java"
import { useAuth } from "@/context/auth-context"
import { Play, Code, Terminal } from "lucide-react"

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language: string
  onLanguageChange: (language: string) => void
}

const languages = [
  { value: "javascript", label: "JavaScript", id: 63 },
  { value: "python", label: "Python", id: 71 },
  { value: "cpp", label: "C++", id: 54 },
  { value: "java", label: "Java", id: 62 },
]

export default function CodeEditor({ value, onChange, language, onLanguageChange }: CodeEditorProps) {
  const [output, setOutput] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const [executionTime, setExecutionTime] = useState<number | null>(null)
  const { token } = useAuth()

  const getLanguageExtension = () => {
    switch (language) {
      case "javascript":
        return javascript()
      case "python":
        return python()
      case "cpp":
        return cpp()
      case "java":
        return java()
      default:
        return javascript()
    }
  }

  const getLanguageId = () => {
    const lang = languages.find((l) => l.value === language)
    return lang?.id || 63
  }

  const handleRunCode = async () => {
    if (!value.trim() || !token) return

    setIsRunning(true)
    setOutput("")
    setExecutionTime(null)

    const startTime = Date.now()

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          source_code: value,
          language_id: getLanguageId(),
          stdin: "",
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to execute code")
      }

      const data = await response.json()
      const endTime = Date.now()

      setOutput(data.result.stdout || data.result.stderr || "No output")
      setExecutionTime(endTime - startTime)
    } catch (error) {
      console.error("Error executing code:", error)
      setOutput("Error executing code. Please try again.")
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Code Editor
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={language} onValueChange={onLanguageChange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleRunCode} disabled={isRunning} size="sm">
              <Play className="h-4 w-4 mr-2" />
              {isRunning ? "Running..." : "Run"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        <div className="flex-1 border-b">
          <CodeMirror
            value={value}
            height="400px"
            extensions={[getLanguageExtension(), EditorView.lineWrapping]}
            onChange={onChange}
            theme="dark"
            className="overflow-auto"
          />
        </div>

        {(output || isRunning) && (
          <div className="h-48 border-t">
            <div className="flex items-center justify-between p-3 bg-muted/50 border-b">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                <span className="font-medium">Output</span>
              </div>
              {executionTime && <Badge variant="outline">{executionTime}ms</Badge>}
            </div>
            <ScrollArea className="h-[calc(100%-49px)]">
              <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
                {isRunning ? "Executing code..." : output}
              </pre>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
