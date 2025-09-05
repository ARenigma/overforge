"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Terminal, 
  Trash2, 
  Copy, 
  Download, 
  Cpu, 
  HardDrive, 
  Clock,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  ChevronRight
} from "lucide-react"
import { cn } from "@/lib/utils";

interface ConsoleOutput {
  id: string;
  timestamp: number;
  type: 'output' | 'error' | 'info' | 'warning';
  content: string;
  executionTime?: number;
}

interface SessionContainer {
  sessionId: string;
  framework: string;
  status: string;
  resourceLimits?: {
    cpus: string;
    memory: string;
    timeout: number;
  };
  port?: number;
  webUrl?: string;
}

interface ConsolePanelProps {
  output: string;
  isExecuting?: boolean;
  container?: SessionContainer | null;
  error?: string | null;
  onClear?: () => void;
  className?: string;
  framework?: string | null;
  containerStatus?: string | null;
  hasBeenExecuted: boolean;
}

export default function ConsolePanel({
  output,
  isExecuting = false,
  container,
  error,
  onClear,
  className = "",
  framework,
  containerStatus,
  hasBeenExecuted
}: ConsolePanelProps) {
  const [outputHistory, setOutputHistory] = useState<ConsoleOutput[]>([])
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const outputRef = useRef<HTMLPreElement>(null)

  // Add new output to history
  useEffect(() => {
    if (output && output !== "Ready to execute code..." && output !== "Executing...") {
      const newOutput: ConsoleOutput = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        type: output.toLowerCase().includes('error') ? 'error' : 'output',
        content: output
      }
      
      setOutputHistory(prev => [...prev.slice(-50), newOutput]) // Keep last 50 outputs
    }
  }, [output])

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight
      }
    }
  }, [output])

  const handleCopyOutput = () => {
    navigator.clipboard.writeText(output)
  }

  const handleDownloadOutput = () => {
    const blob = new Blob([output], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `console-output-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleClearConsole = () => {
    setOutputHistory([])
    onClear?.()
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getOutputTypeColor = (type: ConsoleOutput['type']) => {
    switch (type) {
      case 'error': return 'text-red-400'
      case 'warning': return 'text-yellow-400'
      case 'info': return 'text-blue-400'
      default: return 'text-green-400'
    }
  }

  return (
    <Card className={`flex flex-col h-full ${className}`}>
      <CardHeader className="pb-2 px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Console Output
            {isExecuting && (
              <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
            )}
            {container && (
              <Badge variant="outline" className="text-xs">
                <Cpu className="h-3 w-3 mr-1" />
                {container.resourceLimits?.cpus} CPU
              </Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyOutput}
              disabled={!output || isExecuting}
              title="Copy output"
              className="h-6 w-6 p-0"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownloadOutput}
              disabled={!output || isExecuting}
              title="Download output"
              className="h-6 w-6 p-0"
            >
              <Download className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearConsole}
              title="Clear console"
              className="h-6 w-6 p-0"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
        {/* Console Output Area */}
        <ScrollArea ref={scrollAreaRef} className="flex-1">
          <div className="p-4 bg-black text-green-400 font-mono text-sm min-h-full">
            {isExecuting ? (
              <div className="flex items-center gap-2 text-blue-400">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Executing code...</span>
              </div>
            ) : output ? (
              <pre ref={outputRef} className="whitespace-pre-wrap break-words">
                {output}
              </pre>
            ) : (
              <div className="text-gray-500">
                Ready to execute code...
                {container && (
                  <div className="mt-2 text-xs">
                    Container: {container.framework} ({container.status})
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Container Information Panel */}
        {container && (
          <div className="border-t bg-muted/50 p-3">
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Container ID:</span>
                <span className="font-mono text-xs">
                  {container.sessionId.substring(0, 8)}...
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Framework:</span>
                <Badge variant="outline" className="text-xs">
                  {container.framework}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status:</span>
                <div className="flex items-center gap-1">
                  {container.status === 'running' ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-yellow-500" />
                  )}
                  <span className="text-xs capitalize">{container.status}</span>
                </div>
              </div>

              {container.resourceLimits && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Memory Limit:</span>
                    <div className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3" />
                      <span>{container.resourceLimits.memory}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">CPU Limit:</span>
                    <div className="flex items-center gap-1">
                      <Cpu className="h-3 w-3" />
                      <span>{container.resourceLimits.cpus} cores</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Timeout:</span>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{container.resourceLimits.timeout / 1000}s</span>
                    </div>
                  </div>
                </>
              )}

              {container.port && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Port:</span>
                  <span className="font-mono">{container.port}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <Alert className="m-3 mt-0">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {error}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
} 