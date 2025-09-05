"use client"

import type React from "react"
import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { Play, Search, History, Video, MessageSquare, Settings, Trash2, Clock, Users, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EnhancedCodeMirrorEditor } from "@/components/enhanced-code-mirror-editor"
import { EnhancedChatPanel } from "@/components/enhanced-chat-panel"
import { GoToLineDialog } from "@/components/go-to-line-dialog"
import { Timer } from "@/components/timer"
import { LanguageIcon } from "@/components/language-icon"
import CodeValidationWarnings from "@/components/CodeValidationWarnings"
import codeValidationService from "@/services/codeValidationService"
import { useAuth } from "@/hooks/useAuth"
import io from "socket.io-client"
import { cn } from "@/lib/utils"

interface AIQuestion {
  id: string
  title: string
  problem: string
  language: string
}

export function EnhancedCodingPlatform() {
  const { user, token } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  
  const sessionId = params.id as string

  // Core state management
  const [aiQuestions, setAiQuestions] = useState<AIQuestion[]>([])
  const [activeQuestionId, setActiveQuestionId] = useState<string>("")
  const [codeByQuestionId, setCodeByQuestionId] = useState<{ [key: string]: string }>({})
  const [outputByQuestionId, setOutputByQuestionId] = useState<{ [key: string]: string }>({})
  const [isRunningByQuestionId, setIsRunningByQuestionId] = useState<{ [key: string]: boolean }>({})
  
  // UI state
  const [editorWidth, setEditorWidth] = useState(60)
  const [showChat, setShowChat] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [cursorPosition, setCursorPosition] = useState({ line: 1, col: 1 })
  const [showGoToLine, setShowGoToLine] = useState(false)
  const [tabSize, setTabSize] = useState(4)
  const [sessionStartTime] = useState(Date.now())
  const [consoleOutput, setConsoleOutput] = useState<string[]>([])
  const [currentLanguageForEditor, setCurrentLanguageForEditor] = useState<string>("")
  const [sessionLanguage, setSessionLanguage] = useState<string>("")
  const [sessionExperience, setSessionExperience] = useState<string>("")
  const [areInitialQuestionsProcessed, setAreInitialQuestionsProcessed] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  
  // Validation state
  const [validationResults, setValidationResults] = useState<{ [key: string]: any }>({})
  const [executionBlocked, setExecutionBlocked] = useState<{ [key: string]: boolean }>({})
  const [validationDebounce, setValidationDebounce] = useState<NodeJS.Timeout | null>(null)

  // Refs
  const lineColRef = useRef<HTMLButtonElement>(null)
  const resizeRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const socketRef = useRef<any>(null)
  const codeUpdateThrottleRef = useRef<number>(0)

  const activeQuestion = aiQuestions.find((q) => q.id === activeQuestionId)
  const selectedLanguage = activeQuestion?.language || currentLanguageForEditor || "python"

  // Initialize validation service
  useEffect(() => {
    if (token) {
      codeValidationService.setToken(token)
    }
  }, [token])

  // Socket connection management
  useEffect(() => {
    if (!user || !token || !sessionId) return

    const sessionLanguageParam = searchParams.get('language') || 'python'
    const sessionExperienceParam = searchParams.get('experience') || 'junior'
    
    setSessionLanguage(sessionLanguageParam)
    setSessionExperience(sessionExperienceParam)

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5001"
    const currentSocket = io(socketUrl, {
      auth: { token },
      transports: ["websocket"],
    })

    currentSocket.on("connect", () => {
      console.log("Socket connected for session:", sessionId)
      currentSocket.emit("joinRoom", {
        roomName: sessionId,
        userId: user.id,
        username: user.username,
        language: sessionLanguageParam,
        experienceLevel: sessionExperienceParam,
      })
    })

    currentSocket.on("initialRoomQuestions", (questions: AIQuestion[]) => {
      console.log("Received initialRoomQuestions:", questions)
      if (questions && questions.length > 0) {
        setAiQuestions(prevQuestions => {
          const newQuestions = questions.filter(q => !prevQuestions.some(pq => pq.id === q.id));
          return [...prevQuestions, ...newQuestions];
        });

        if (!activeQuestionId) {
        setActiveQuestionId(questions[0].id)
        }
        
        const initialCodes: { [key: string]: string } = {}
        const initialOutputs: { [key: string]: string } = {}
        const initialRunningStates: { [key: string]: boolean } = {}

        questions.forEach(q => {
          if (!codeByQuestionId[q.id]) {
          initialCodes[q.id] = ""
          initialOutputs[q.id] = ""
          initialRunningStates[q.id] = false
          }
        })
        
        setCodeByQuestionId(prev => ({...prev, ...initialCodes}))
        setOutputByQuestionId(prev => ({...prev, ...initialOutputs}))
        setIsRunningByQuestionId(prev => ({...prev, ...initialRunningStates}))
        
        if (!currentLanguageForEditor) {
        setCurrentLanguageForEditor(questions[0].language) 
        }
        setAreInitialQuestionsProcessed(true)
      } else if (aiQuestions.length === 0) {
        console.log("No initial questions received")
        setAreInitialQuestionsProcessed(true)
      }
    })

    currentSocket.on('codeUpdate', ({ code: newCode, questionId }: { code: string, questionId?: string }) => {
      const targetQuestionId = questionId || activeQuestionId
      if (targetQuestionId) {
        setCodeByQuestionId(prev => ({ ...prev, [targetQuestionId]: newCode }))
      }
    })

    currentSocket.on('joinRoomError', (data: { message: string }) => {
      console.error('Failed to join session:', data.message)
      setPageError(`Error joining session: ${data.message}`)
      setAreInitialQuestionsProcessed(true)
    })

    socketRef.current = currentSocket

    return () => {
      console.log("Cleaning up socket connection")
      currentSocket.disconnect()
    }
  }, [user, token, sessionId, searchParams, activeQuestionId, codeByQuestionId, currentLanguageForEditor, aiQuestions.length])

  // Active question language sync
  useEffect(() => {
    if (activeQuestionId && aiQuestions.length > 0) {
      const currentQ = aiQuestions.find(q => q.id === activeQuestionId)
      if (currentQ) {
        setCurrentLanguageForEditor(currentQ.language)
      }
    } else if (sessionLanguage) {
      setCurrentLanguageForEditor(sessionLanguage)
    }
  }, [activeQuestionId, aiQuestions, sessionLanguage])

  // Resize handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return

    const container = resizeRef.current?.parentElement
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100

    if (newWidth >= 30 && newWidth <= 80) {
      setEditorWidth(newWidth)
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // Code change handler with socket sync and validation
  const handleCodeChange = (newCode: string) => {
    if (activeQuestionId) {
      setCodeByQuestionId(prev => ({ ...prev, [activeQuestionId]: newCode }))
      
      // Real-time validation with debouncing
      if (validationDebounce) {
        clearTimeout(validationDebounce)
      }
      
      const timeout = setTimeout(async () => {
        try {
          // Use client-side check for immediate feedback
          const clientCheck = codeValidationService.clientSideCheck(
            newCode, 
            currentLanguageForEditor
          )
          
          // Add contextual validation warning
          const activeQ = aiQuestions.find(q => q.id === activeQuestionId)
          if (activeQ && activeQ.problem && newCode.trim()) {
            // Check if code language matches question expectation
            const questionLang = activeQ.language.toLowerCase()
            const codeLanguage = currentLanguageForEditor.toLowerCase()
            
            // Simple contextual check - if different languages, warn user
            if (questionLang !== codeLanguage) {
              (clientCheck as any).warnings = (clientCheck as any).warnings || []
              ;(clientCheck as any).warnings.push({
                type: 'context_mismatch',
                severity: 'medium',
                message: `Code language (${codeLanguage}) may not match question expectation (${questionLang})`
              })
              ;(clientCheck as any).hasIssues = true
            }
            
            // Check if code seems unrelated to problem (very basic check)
            const problemText = activeQ.problem.toLowerCase()
            const codeText = newCode.toLowerCase()
            
            // Look for some problem keywords in code
            const problemKeywords = extractProblemKeywords(problemText)
            const hasRelevantKeywords = problemKeywords.some(keyword => 
              codeText.includes(keyword) || 
              codeText.includes(keyword.replace(/\s+/g, '')) // without spaces
            )
            
            if (!hasRelevantKeywords && newCode.trim().length > 50) {
              (clientCheck as any).warnings = (clientCheck as any).warnings || []
              ;(clientCheck as any).warnings.push({
                type: 'context_relevance',
                severity: 'low',
                message: 'Code may not be related to the current problem. Please ensure you\'re solving the correct question.'
              })
              ;(clientCheck as any).hasIssues = true
            }
          }
          
          setValidationResults(prev => ({
            ...prev,
            [activeQuestionId]: clientCheck
          }))
          
          // Block execution if critical security issues  
          const shouldBlock = (clientCheck as any).hasIssues && 
                              ((clientCheck as any).errors?.some((e: any) => e.severity === 'critical') ||
                               (clientCheck as any).warnings?.some((w: any) => w.severity === 'critical'))
          
          setExecutionBlocked(prev => ({
            ...prev,
            [activeQuestionId]: shouldBlock
          }))
          
        } catch (error) {
          console.error('Validation error:', error)
        }
      }, 500) // 0.5 second debounce for faster feedback
      
      setValidationDebounce(timeout)
      
      // OPTIMIZED: Reduced throttling for LHIS from 10s to 2s
      const now = Date.now()
      const lastUpdate = codeUpdateThrottleRef.current || 0
      const CODE_UPDATE_THROTTLE = 2000 // 2 seconds for LHIS responsiveness
      const shouldSendUpdate = (now - lastUpdate) >= CODE_UPDATE_THROTTLE
      
      if (shouldSendUpdate && socketRef.current && socketRef.current.connected) {
        codeUpdateThrottleRef.current = now
        
        // Emit standard code change for room participants
        socketRef.current.emit('codeChange', { 
          roomName: sessionId,
          questionId: activeQuestionId,
          code: newCode, 
          language: currentLanguageForEditor,
          userId: user?.id 
        })
        
        // LHIS Integration: Always emit assessment code change if code is substantial
        if (newCode.trim().length >= 50) {
          socketRef.current.emit('assessmentCodeChange', {
            sessionId,
            questionId: activeQuestionId,
            code: newCode,
            language: currentLanguageForEditor
          })
          console.log(`📝 LHIS: Assessment code change emitted (${newCode.length} chars)`)
        }
        
        console.log(`Code update sent for question ${activeQuestionId}`)
      }
    }
  }

  // Helper function to extract key terms from problem description
  const extractProblemKeywords = (problemText: string): string[] => {
    // Remove HTML and get clean text
    const cleanText = problemText.replace(/<[^>]*>/g, '').toLowerCase()
    
    // Extract key programming terms and concepts
    const keywords: string[] = []
    
    // Common programming concepts
    const concepts = [
      'array', 'list', 'string', 'integer', 'function', 'method', 'class', 'object',
      'loop', 'recursion', 'sort', 'search', 'tree', 'graph', 'hash', 'map',
      'stack', 'queue', 'binary', 'linked', 'cart', 'item', 'price', 'total',
      'comment', 'post', 'user', 'temperature', 'weather', 'algorithm'
    ]
    
    concepts.forEach(concept => {
      if (cleanText.includes(concept)) {
        keywords.push(concept)
      }
    })
    
    // Extract quoted terms and specific words
    const quotedTerms = cleanText.match(/'([^']+)'/g) || []
    quotedTerms.forEach(term => {
      keywords.push(term.replace(/'/g, ''))
    })
    
    return keywords
  }

  // Code execution with validation check
  const runCode = async () => {
    if (!activeQuestion || !token || !activeQuestionId) return

    const currentCode = codeByQuestionId[activeQuestionId]
    if (!currentCode?.trim()) return

    // Check if execution is blocked due to security issues
    if (executionBlocked[activeQuestionId]) {
      setConsoleOutput(prev => [
        ...prev, 
        "❌ Execution blocked due to security concerns.",
        "Please review and fix the security warnings before running.",
        ""
      ])
      return
    }

    setIsRunningByQuestionId(prev => ({ ...prev, [activeQuestionId]: true }))
    setConsoleOutput(prev => [...prev, `> Running ${activeQuestion.title}...`])

    const startTime = Date.now()

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          source_code: currentCode,
          language_id: getLanguageId(currentLanguageForEditor),
          stdin: "",
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to execute code")
      }

      const data = await response.json()
      const endTime = Date.now()

      const output = data.result?.stdout || data.result?.stderr || "No output"
      const executionTime = endTime - startTime
      
      setOutputByQuestionId(prev => ({ 
        ...prev, 
        [activeQuestionId]: `${output}\n\nExecution time: ${executionTime}ms` 
      }))
      
      setConsoleOutput(prev => [
        ...prev,
        "✓ Code executed successfully!",
        `Output: ${output}`,
        `Runtime: ${executionTime}ms`,
        "",
      ])
    } catch (error) {
      console.error("Error executing code:", error)
      const errorMsg = "Error executing code. Please try again."
      setOutputByQuestionId(prev => ({ ...prev, [activeQuestionId]: errorMsg }))
      setConsoleOutput(prev => [...prev, errorMsg])
    } finally {
      setIsRunningByQuestionId(prev => ({ ...prev, [activeQuestionId]: false }))
    }
  }

  const getLanguageId = (language: string) => {
    const languageMap: { [key: string]: number } = {
      javascript: 63,
      python: 71,
      java: 62,
      cpp: 54,
    }
    return languageMap[language.toLowerCase()] || 63
  }

  const clearConsole = () => {
    setConsoleOutput([])
  }

  const handleCursorPositionChange = (line: number, col: number) => {
    setCursorPosition({ line, col })
  }

  const handleGoToLine = (lineNumber: number) => {
    // This would be implemented in the CodeMirror editor
    setShowGoToLine(false)
  }

  // Show loading state while questions are loading
  if (!areInitialQuestionsProcessed) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading coding session...</p>
        </div>
      </div>
    )
  }

  // Show error state
  if (pageError) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{pageError}</p>
          <Button onClick={() => router.push('/dashboard')}>Return to Dashboard</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="h-12 bg-white border-b flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold"><span className="text-gray-900">over</span><span className="text-orange-500 font-bold">Forge</span> Platform</h1>
          <Badge variant="outline" className="text-xs flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            Live Session
          </Badge>
          <Timer startTime={sessionStartTime} />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={showChat ? "default" : "outline"}
            size="sm"
            onClick={() => setShowChat(!showChat)}
          >
            <MessageSquare className="w-4 h-4 mr-1" />
            Chat
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
            <LogOut className="w-4 h-4 mr-1" />
            Leave
          </Button>
        </div>
      </div>

      {/* Question tabs */}
      {aiQuestions.length > 0 && (
        <div className="flex bg-white border-b">
          {aiQuestions.map(q => (
            <div 
              key={q.id} 
              className={`px-4 py-2 text-sm font-medium cursor-pointer border-r flex items-center gap-2 ${
                activeQuestionId === q.id ? 'text-purple-600 border-b-2 border-b-purple-600' : 'text-gray-600 hover:bg-gray-50'
              }`}
              onClick={() => {
                console.log(`🔄 Switching to question ${q.id}:`)
                console.log(`   Title: ${q.title}`)
                console.log(`   Language: ${q.language}`)
                console.log(`   Current code length: ${codeByQuestionId[q.id]?.length || 0}`)
                console.log(`   Code preview: "${(codeByQuestionId[q.id] || '').substring(0, 50)}..."`)
                
                setActiveQuestionId(q.id)
                
                // Log all question states for debugging
                console.log("📊 All question code states:")
                Object.keys(codeByQuestionId).forEach(questionId => {
                  const question = aiQuestions.find(aq => aq.id === questionId)
                  console.log(`   ${questionId} (${question?.title}): "${(codeByQuestionId[questionId] || '').substring(0, 30)}..."`)
                })
              }}
            >
              <LanguageIcon language={q.language} />
              {q.title}
              {/* Show indicator if question has code */}
              {codeByQuestionId[q.id] && codeByQuestionId[q.id].trim() && (
                <div className="w-2 h-2 bg-green-500 rounded-full" title="Has code"></div>
              )}
            </div>
          ))}
          <div className="flex-1 flex items-center justify-end pr-4 gap-2">
            <Button
              ref={lineColRef}
              variant="ghost"
              size="sm"
              onClick={() => setShowGoToLine(true)}
              className="text-xs"
            >
              Ln {cursorPosition.line}, Col {cursorPosition.col}
            </Button>
            <Button 
              onClick={runCode} 
              disabled={!activeQuestionId || !!(activeQuestionId && isRunningByQuestionId[activeQuestionId])} 
              size="sm"
            >
              <Play className="h-3 w-3 mr-1" />
              {(activeQuestionId && isRunningByQuestionId[activeQuestionId]) ? "Running..." : "Run"}
            </Button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor section */}
        <div className="flex-1 flex overflow-hidden" style={{ width: `${editorWidth}%` }}>
          <div className="flex-1 bg-white flex flex-col">
                         {/* Validation warnings */}
             {activeQuestionId && validationResults[activeQuestionId] && (
               <CodeValidationWarnings 
                 validation={validationResults[activeQuestionId]}
                 compact={true}
                 onDismiss={() => {
                   setValidationResults(prev => ({
                     ...prev,
                     [activeQuestionId]: null
                   }))
                 }}
               />
             )}
            
            {/* Code Editor */}
            <div className="flex-1">
              {activeQuestionId && codeByQuestionId[activeQuestionId] !== undefined ? (
                <EnhancedCodeMirrorEditor
                  value={codeByQuestionId[activeQuestionId]}
                  onCodeChangeAction={handleCodeChange}
                  language={currentLanguageForEditor}
                  searchQuery={searchQuery}
                  tabSize={tabSize}
                  onCursorPositionChangeAction={handleCursorPositionChange}
                  onExecuteAction={runCode}
                  isExecuting={!!(activeQuestionId && isRunningByQuestionId[activeQuestionId])}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4 text-center">
                  <Clock className="h-8 w-8 mb-2 text-blue-500" />
                  {aiQuestions.length > 0 ? 
                    "Select a question tab above to start coding." : 
                    "Waiting for questions to load..."
                  }
                </div>
              )}
            </div>
          </div>

          {/* Resize handle */}
          <div
            ref={resizeRef}
            className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize flex-shrink-0 transition-colors"
            onMouseDown={handleMouseDown}
          />
        </div>

        {/* Right panel - Problem and Output */}
        <div className="flex flex-col" style={{ width: `${100 - editorWidth}%` }}>
          {/* Problem statement */}
          <div className="h-1/2 border-b bg-white">
            <div className="p-3 border-b bg-gray-50 flex items-center">
              <Settings className="h-4 w-4 mr-2" />
              <span className="text-sm font-medium">
                Problem: {activeQuestion?.title || "Select a question"}
              </span>
            </div>
            <ScrollArea className="h-[calc(100%-49px)]">
              <div className="p-4">
                <div 
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ 
                    __html: activeQuestion?.problem || 
                      (aiQuestions.length > 0 && !activeQuestionId 
                        ? "Please select a question tab above to see the problem description." 
                        : "Loading problem description...") 
                  }}
                />
              </div>
            </ScrollArea>
          </div>

          {/* Output console */}
          <div className="h-1/2 bg-white">
            <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
              <div className="flex items-center">
                <div className="h-4 w-4 mr-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium">Output</span>
                {activeQuestion && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    {activeQuestion.title}
                  </Badge>
                )}
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearConsole}
                className="h-6 w-6 p-0"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <ScrollArea className="h-[calc(100%-49px)] bg-gray-900">
              <pre className="text-sm font-mono text-green-400 p-4 whitespace-pre-wrap">
                {(activeQuestionId && outputByQuestionId[activeQuestionId]) || 
                 (consoleOutput.length > 0 ? consoleOutput.join('\n') : "Run your code to see output here...")
                }
              </pre>
            </ScrollArea>
          </div>
        </div>

        {/* Chat panel */}
        {showChat && (
          <EnhancedChatPanel
            roomId={sessionId}
            socket={socketRef.current || undefined}
            onClose={() => setShowChat(false)}
            isResizable={true}
          />
        )}
      </div>

      {/* Go to Line Dialog */}
      {showGoToLine && lineColRef.current && (
        <GoToLineDialog
          anchorEl={lineColRef.current}
          onCloseAction={() => setShowGoToLine(false)}
          onGoToLineAction={handleGoToLine}
          maxLine={1000}
        />
      )}
    </div>
  )
} 
