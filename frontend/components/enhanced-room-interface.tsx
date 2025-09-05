"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Play, Search, History, Video, MessageSquare, Settings, Trash2, Mic, PhoneOff, Send, Sparkles, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { useSocket } from "@/hooks/useSocket"
import { useAuth } from "@/hooks/useAuth"
import { useSupabaseAuth } from "@/context/SupabaseAuthContext"
import { useRouter, useParams } from "next/navigation"
import { EnhancedCodeMirrorEditor } from "@/components/enhanced-code-mirror-editor"
import { EnhancedVideoCallPanel } from "@/components/enhanced-video-call-panel"
import { EnhancedChatPanel } from "@/components/enhanced-chat-panel"
import { GoToLineDialog } from "@/components/go-to-line-dialog"
import { SpacesMenu } from "@/components/spaces-menu"
import { HistoryMiniMap } from "@/components/history-mini-map"
import { Timer } from "@/components/timer"
import { LanguageIcon } from "@/components/language-icon"
import { QuantumLoading } from "@/components/quantum-loading"
import CodeValidationWarnings from "@/components/CodeValidationWarnings"
import { cn } from "@/lib/utils"
import { SearchDialog } from "@/components/search-dialog"
import { InterviewerDashboard } from "@/components/InterviewerDashboard"
import { AssessmentStatus } from "@/components/AssessmentStatus"
import ConsolePanel from "@/components/console-panel"
import WebPreviewPanel from "@/components/web-preview-panel"
import { useSessionContainer } from "@/hooks/useSessionContainer"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Utility function to convert markdown-like formatting to HTML
const formatProblemText = (text: string): string => {
  if (!text) return '';
  
  // Check if the text is already HTML (has HTML tags)
  const isHTML = /<[^>]+>/.test(text);
  
  if (isHTML) {
    // If it's already HTML, just return it as-is without additional processing
    // This prevents adding extra <br> tags to properly formatted HTML
    return text;
  }
  
  // Only apply markdown conversion for non-HTML text
  return text
    // Convert **bold** to <strong>
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Convert line breaks to <br>
    .replace(/\n/g, '<br>')
    // Convert - list items to proper list format
    .replace(/^- (.+)$/gm, '<li class="mb-1">$1</li>')
    // Wrap consecutive list items in <ul>
    .replace(/(<li.*?<\/li>(\s*<br>\s*<li.*?<\/li>)*)/g, '<ul class="list-disc ml-4 mb-3">$1</ul>')
    // Clean up nested ul tags and line breaks
    .replace(/<\/ul>\s*<br>\s*<ul>/g, '')
    // Format headings with colons (like **Problem Title:**)
    .replace(/<strong>([^<]*?:)\s*<\/strong>/g, '<div class="text-base font-semibold text-gray-900 mt-4 mb-2">$1</div>')
    // Format other bold text without colons
    .replace(/<strong>([^<]*?)<\/strong>/g, '<span class="font-medium text-gray-800">$1</span>')
    // Clean up excessive line breaks
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    // Add minimal spacing between paragraphs
    .replace(/(<br><br>)/g, '<div class="mb-3"></div>');
};

interface Question {
  id: string
  title: string
  description: string
  language: string
  category?: string
  framework?: string
}

interface Participant {
  userId: string
  username: string
  role: string
}

interface ChatMessage {
  id: string
  userId: string
  username: string
  message: string
  content?: string
  timestamp: string | number  // Backend sends string, frontend can handle both
  sender?: {
    id: string
    name: string
    type: string
  }
  questionContext?: any
  isCounterQuestion?: boolean
  targetQuestionId?: string
  isEngagementResponse?: boolean
}

export default function EnhancedRoomInterface() {
  const params = useParams()
  const roomId = params?.id as string
  const { user } = useAuth()
  const { getAuthHeaders } = useSupabaseAuth()
  const router = useRouter()
  
  // Socket connection
  const socket = useSocket(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5001")

  // State management - same as original
  const [questions, setQuestions] = useState<Question[]>([])
  const [activeQuestionId, setActiveQuestionId] = useState<string>("")
  const [code, setCode] = useState<Record<string, string>>({})
  const [consoleOutput, setConsoleOutput] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [showVideoCall, setShowVideoCall] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [cursorPosition, setCursorPosition] = useState({ line: 1, col: 1 })
  const [showGoToLine, setShowGoToLine] = useState(false)
  const [showSpacesMenu, setShowSpacesMenu] = useState(false)
  const [showHistoryMap, setShowHistoryMap] = useState(false)
  const [tabSize, setTabSize] = useState(4)
  const [sessionStartTime] = useState(Date.now())
  const [participants, setParticipants] = useState<Participant[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [language, setLanguage] = useState("python")
  const [experience, setExperience] = useState("junior")
  const [isLoading, setIsLoading] = useState(true)
  const [questionsReady, setQuestionsReady] = useState(false)
  const [codeHistory, setCodeHistory] = useState<Array<{
    id: string
    timestamp: number
    code: string
    questionId: string
    event: string
  }>>([])
  const [validationResults, setValidationResults] = useState<Record<string, any>>({})
  const [showValidationWarnings, setShowValidationWarnings] = useState<Record<string, boolean>>({})

  // Enhanced features
  const [framework, setFramework] = useState<string>("")
  const [rightPanelActiveTab, setRightPanelActiveTab] = useState("console")
  const [hasExecuted, setHasExecuted] = useState(false)
  
  // Session container integration
  const {
    container,
    isCreating: isCreatingContainer,
    isExecuting: isExecutingInContainer,
    error: containerError,
    createSession,
    executeCode: executeInContainer,
    destroySession
  } = useSessionContainer(roomId)

  // New state for 3-parameter assessment and role management
  const [userRole, setUserRole] = useState<'interviewer' | 'candidate' | null>(null)
  const [assessmentState, setAssessmentState] = useState<any>(null)
  const [jobDescription, setJobDescription] = useState<string>("")
  const [isParameterAssessment, setIsParameterAssessment] = useState(false)
  const [isAssessmentMode, setIsAssessmentMode] = useState(false)
  const [jobProfileId, setJobProfileId] = useState<string>("")
  const [awaitingParameterAnswer, setAwaitingParameterAnswer] = useState(false)
  const [currentParameterQuestion, setCurrentParameterQuestion] = useState<any>(null)
  const [assessmentStatus, setAssessmentStatus] = useState<any>(null)

  // Refs for positioning dialogs
  const lineColRef = useRef<HTMLButtonElement>(null)
  const spacesRef = useRef<HTMLButtonElement>(null)
  const historyRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLButtonElement>(null)
  const socketInitialized = useRef(false)
  const joinRoomCalled = useRef(false)
  const recentParameterQuestions = useRef<Map<string, number>>(new Map())

  // Prevent redundant initialization calls - use a more stable approach
  const initializationCalled = useRef(false)
  const assessmentInitialized = useRef(false)
  
  // Add a stable flag that persists across re-renders
  const [initializationComplete, setInitializationComplete] = useState(false)

  const activeQuestion = questions.find((q) => q.id === activeQuestionId)
  const selectedLanguage = activeQuestion?.language || language

  // Auto-create container when framework changes
  useEffect(() => {
    const needsContainer = framework && framework !== 'none' && activeQuestion?.framework
    if (needsContainer && !container && !isCreatingContainer) {
      handleCreateContainer()
    }
  }, [framework, activeQuestion, container, isCreatingContainer])

  const handleCreateContainer = async () => {
    if (!framework) return
    
    try {
      await createSession({
        type: 'framework',
        language: selectedLanguage,
        framework: framework,
        sourceCode: code[activeQuestionId] || ''
      })
    } catch (error) {
      console.error('Failed to create container:', error)
    }
  }

  // Handle chat panel opening and parameter state updates from Enhanced Chat Panel
  const handleChatMessage = useCallback((message: any) => {
    console.log("📱 LHIS: Handling chat message:", message)
    
    // Add message to messages state
    setMessages((prev) => {
      // Check for duplicates
      const isDuplicate = prev.some(msg => msg.id === message.id);
      if (isDuplicate) {
        console.log("🚫 LHIS: Duplicate message detected, skipping");
        return prev;
      }
      
      console.log("✅ LHIS: Adding message to messages state");
      return [...prev, message];
    });
    
    // Open chat panel for ALL LHIS messages
    if (message.userId === 'lhis') {
      console.log("📱 LHIS: Opening chat panel for LHIS message")
      setShowChat(true)
      setRightPanelActiveTab("chat")
      
      // Handle parameter assessment state updates
      if (message.isCounterQuestion) {
        console.log("📱 LHIS: Setting parameter question state")
        setAwaitingParameterAnswer(true)
        setCurrentParameterQuestion(message.questionContext || message)
      }
    }
  }, [])

  // Initialize room - similar to original but simplified
  useEffect(() => {
    if (!user || !socket || socketInitialized.current || joinRoomCalled.current) return

    console.log("🏠 Enhanced Room: Initializing room", roomId)
    socketInitialized.current = true
    joinRoomCalled.current = true

    const urlParams = new URLSearchParams(window.location.search)
    const roleParam = urlParams.get('role')
    
    // Determine role: URL param > user.role > default to candidate
    let detectedRole = 'candidate'
    if (roleParam) {
      detectedRole = roleParam
      console.log("🏠 Enhanced Room: Role from URL:", roleParam)
    } else if (user.role) {
      detectedRole = user.role
      console.log("🏠 Enhanced Room: Role from user:", user.role)
    } else {
      console.log("🏠 Enhanced Room: No role found, defaulting to candidate")
    }
    
    console.log("🏠 Enhanced Room: Final role set to:", detectedRole)
    setUserRole(detectedRole as 'interviewer' | 'candidate')

    // Join room
    socket.emit("joinRoom", {
      roomName: roomId,
      userId: user.id,
      username: user.username || user.email?.split('@')[0] || 'User',
      role: detectedRole
    })

    // Load questions - same logic as original
    loadParameterProblems()
    
    setQuestionsReady(true)
    setIsLoading(false)
  }, [user, socket, roomId])

  const loadParameterProblems = async () => {
    console.log("🔄 Enhanced Room: Loading parameter problems...")
    
    try {
      // First, try to load from session problems API (parameter-based sessions)
      try {
        console.log(`🔍 Enhanced Room: Checking for parameter-based session: ${roomId}`)
        
        const response = await fetch(`/api/sessions/${roomId}/problems`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        })

        if (response.ok) {
          const result = await response.json()

          if (
            result.success &&
            result.data.isParameterSession &&
            result.data.problems.length > 0
          ) {
            console.log(
              `✅ Enhanced Room: Found parameter-based session with ${result.data.problems.length} problems`,
            )

            // Format problems for the interface and preserve framework information
            const formattedProblems = result.data.problems.map(
              (problem: any) => ({
                id: problem.id,
                title: problem.title,
                description: problem.description,
                language: problem.language,
                category: problem.category,
                framework: problem.framework, // Preserve framework information
              }),
            )

            setQuestions(formattedProblems)
            setActiveQuestionId(formattedProblems[0].id)
            setLanguage(result.data.coreLanguage.toLowerCase())
            setIsParameterAssessment(true)
            setIsAssessmentMode(true)

            // Set framework if available from session data or first framework problem
            if (result.data.framework) {
              console.log(`🎯 Enhanced Room: Setting framework from session: ${result.data.framework}`)
              setFramework(result.data.framework)
            } else {
              // Look for framework in problems
              const frameworkProblem = formattedProblems.find((p: any) => p.framework)
              if (frameworkProblem) {
                console.log(`🎯 Enhanced Room: Setting framework from problem: ${frameworkProblem.framework}`)
                setFramework(frameworkProblem.framework)
              }
            }

            console.log(
              `✅ Enhanced Room: Loaded parameter problems:`,
              formattedProblems.map((p: any) => `${p.title} (${p.category})${p.framework ? ` [${p.framework}]` : ''}`),
            )
            return
          }
        }

        console.log(`📝 Enhanced Room: No parameter-based session found, trying other methods`)
      } catch (error) {
        console.error(`❌ Enhanced Room: Error checking for parameter-based session:`, error)
      }

      // Fallback to job profile loading
      const urlParams = new URLSearchParams(window.location.search)
      const jobProfileParam = urlParams.get('jobProfile')
      
      if (jobProfileParam) {
        console.log("📋 Enhanced Room: Loading from job profile:", jobProfileParam)
        setJobProfileId(jobProfileParam)
        setIsParameterAssessment(true)
        setIsAssessmentMode(true)
        
        // Load master problem
        const response = await fetch(`/api/job-profiles/${jobProfileParam}`)
        if (response.ok) {
          const jobProfile = await response.json()
          
          if (jobProfile.master_problem) {
            const masterProblem = typeof jobProfile.master_problem === 'object' 
              ? jobProfile.master_problem.description 
              : jobProfile.master_problem
            
            const masterQuestion = {
              id: 'master-problem',
              title: 'Problem',
              description: masterProblem,
              language: jobProfile.required_language || 'python',
              framework: jobProfile.framework
            }
            
            setQuestions([masterQuestion])
            setActiveQuestionId('master-problem')
            setLanguage(jobProfile.required_language || 'python')
            
            if (jobProfile.framework) {
              setFramework(jobProfile.framework)
            }
            
            console.log("✅ Enhanced Room: Master problem loaded")
            return
          }
        }
      }

      // Final fallback to default problems
        console.log("📋 Enhanced Room: Loading default problems")
        const defaultQuestion = {
          id: 'default-problem',
          title: 'Coding Problem',
          description: 'Write a function to solve the given problem.',
          language: 'python'
        }
        
        setQuestions([defaultQuestion])
        setActiveQuestionId('default-problem')
    } catch (error) {
      console.error("❌ Enhanced Room: Failed to load problems:", error)
    }
  }

  const runCode = async () => {
    if (!activeQuestionId || isRunning) return
    
    setIsRunning(true)
    setConsoleOutput([])
    setHasExecuted(true)
    // We now use the container's webUrl, so we don't need a specific preview tab logic here
    // The preview tab will just show the iframe
    setRightPanelActiveTab("console") 

    try {
      const result = await executeInContainer(code[activeQuestionId])

      if (result) {
        setConsoleOutput(prev => [...prev, result.output, result.error].filter(Boolean) as string[])
        
        if (result.webUrl) {
          setRightPanelActiveTab("preview")
        }
      }
    } catch (e: any) {
      setConsoleOutput(prev => [...prev, e.message])
    } finally {
      setIsRunning(false)
    }
  }

  const handleCodeChange = (value: string) => {
    setCode((prev) => ({ ...prev, [activeQuestionId]: value }))
    
    // Emit code change via socket
    if (socket && user) {
      socket.emit("codeChange", {
        roomName: roomId,
        code: value,
        language: selectedLanguage,
        userId: user.id,
      })
    }
    
    // Track in history
    setCodeHistory((prev) => [
      ...prev,
      {
        id: `edit-${Date.now()}`,
        timestamp: Date.now(),
        code: value,
        questionId: activeQuestionId,
        event: "edit"
      }
    ].slice(-50))
  }

  const clearConsole = () => {
    setConsoleOutput([])
  }

  const handleCursorPositionChange = (line: number, col: number) => {
    setCursorPosition({ line, col })
  }

  const handleGoToLine = (lineNumber: number) => {
    // Implementation for go to line
    setShowGoToLine(false)
  }

  const handleTabSizeChange = (newTabSize: number) => {
    setTabSize(newTabSize)
    setShowSpacesMenu(false)
  }

  const handleLoadingComplete = () => {
    setIsLoading(false)
  }

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/auth")
      return
    }
  }, [user, router])

  if (!user) {
    return <div>Loading...</div>
  }

  // Render Interviewer Dashboard for interviewers (same as original)
  if (userRole === 'interviewer' && isAssessmentMode && jobProfileId) {
    return (
      <>
        <QuantumLoading
          isVisible={isLoading}
          onComplete={handleLoadingComplete}
          loadingText="Initializing Interviewer Dashboard"
          subText="Setting up 3-parameter assessment system..."
        />

        <div className={isLoading ? "hidden" : "block h-screen"}>
          <InterviewerDashboard
            roomId={roomId}
            socket={socket}
            assessmentState={assessmentState}
            candidateInfo={{
              name: participants.find(p => p.role === 'candidate')?.username || "Candidate",
              language: language,
              experienceLevel: experience
            }}
          />
        </div>
      </>
    )
  }

  return (
    <>
      {/* Quantum Loading Screen */}
      <QuantumLoading
        isVisible={isLoading}
        onComplete={handleLoadingComplete}
        loadingText="Initializing Enhanced Interface"
        subText={`Setting up Docker containers and live preview...`}
      />

      {/* Main Application */}
      <div className={isLoading ? "hidden" : "block"}>
        <div className="h-screen flex flex-col bg-gray-50">
          {/* Header - exactly same as original */}
          <div className="h-12 bg-white border-b flex items-center justify-between px-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <h1 className="text-sm font-semibold"><span className="text-gray-900">over</span><span className="text-orange-500 font-bold">Forge</span> Platform</h1>
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                Live Session
              </Badge>
              <Badge variant="default" className="text-xs bg-purple-600">
                Enhanced Mode
              </Badge>
              <Timer startTime={sessionStartTime} />
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                size="sm"
                onClick={() => {
                  const currentParams = new URLSearchParams(window.location.search)
                  currentParams.set('skipChoose', 'true')
                  const paramString = currentParams.toString()
                  router.push(`/room/${roomId}?${paramString}`)
                }}
                className="text-gray-600 border-gray-200 hover:bg-gray-50"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Original
              </Button>
              <Button 
                variant={showVideoCall ? "default" : "outline"}
                size="sm"
                onClick={() => setShowVideoCall(!showVideoCall)}
              >
                <Video className="w-4 h-4 mr-1" />
                Video
              </Button>
              <Button 
                variant={showChat ? "default" : "outline"} 
                size="sm" 
                onClick={() => {
                  setShowChat(!showChat)
                  if (!showChat) setRightPanelActiveTab("chat")
                }}
              >
                <MessageSquare className="w-4 h-4 mr-1" />
                Chat
              </Button>
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Enhanced 3-Panel Layout */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            
            {/* Left Panel: Problem + Code Editor (50%) */}
            <div className="bg-white border-r flex flex-col" style={{ width: "50%" }}>
              
              {/* Problem Section */}
              <div className="border-b bg-gray-50" style={{ height: "40%" }}>
                <div className="h-8 bg-gray-100 border-b flex items-center px-4 text-sm font-medium text-gray-700">
                  <div className="flex items-center gap-2">
                    <span>Problem</span>
                    {framework && (
                      <Badge variant="secondary" className="text-xs">
                        {framework}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <ScrollArea className="h-full p-4">
                  {activeQuestion ? (
                    <div className="prose prose-sm max-w-none">
                      <div 
                        dangerouslySetInnerHTML={{ 
                          __html: formatProblemText(activeQuestion.description) 
                        }}
                        className="text-gray-800 leading-relaxed"
                      />
                    </div>
                  ) : (
                    <div className="text-gray-500 text-center py-8">
                      Loading problem...
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Code Editor Section */}
              <div className="flex-1 flex flex-col">
                {/* Editor Tabs */}
                <div className="bg-gray-50 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {questions.map((question, index) => (
                        <button
                          key={question.id}
                          onClick={() => setActiveQuestionId(question.id)}
                          className={cn(
                            "px-4 py-2 text-sm font-medium border-r border-gray-300 flex items-center gap-2 hover:bg-white transition-all duration-75 relative bg-gray-100",
                            activeQuestionId === question.id
                              ? "bg-white text-blue-600 border-b border-b-white -mb-px border-t-2 border-t-blue-500"
                              : "text-gray-600 hover:text-gray-900",
                          )}
                        >
                          <span>{question.title}</span>
                        </button>
                      ))}
                      <div className="flex-1 bg-gray-100" />
                    </div>

                    <div className="flex items-center gap-2 pr-4">
                      {framework && (
                        <Select value={framework} onValueChange={setFramework}>
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue placeholder="Framework" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="django">Django</SelectItem>
                            <SelectItem value="express">Express.js</SelectItem>
                            <SelectItem value="spring-boot">Spring Boot</SelectItem>
                            <SelectItem value="react">React</SelectItem>
                            <SelectItem value="vue">Vue.js</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      
                      <Button 
                        ref={searchRef}
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setShowSearch(!showSearch)} 
                        className="h-7 w-7 p-0"
                      >
                        <Search className="w-4 h-4" />
                      </Button>
                      
                      <Button 
                        onClick={isRunning ? () => setIsRunning(false) : runCode}
                        size="sm"
                        className={cn(
                          "h-7",
                          isRunning ? "bg-gray-500 hover:bg-gray-600 text-white" : "bg-green-600 hover:bg-green-700",
                        )}
                      >
                        {isRunning ? (
                          <>
                            <div className="w-2 h-2 bg-white mr-1"></div>
                            <span className="text-xs">Stop</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 mr-0.5" />
                            <span className="text-xs">Run</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Validation Warnings */}
                {activeQuestionId && validationResults[activeQuestionId] && showValidationWarnings[activeQuestionId] && (
                  <div className="border-b bg-white px-4 py-2">
                    <CodeValidationWarnings 
                      validation={validationResults[activeQuestionId]}
                      compact={true}
                      onDismiss={() => {
                        setShowValidationWarnings(prev => ({
                          ...prev,
                          [activeQuestionId]: false
                        }))
                      }}
                    />
                  </div>
                )}

                {/* Code Editor */}
                <div className="flex-1 overflow-hidden relative">
                  <EnhancedCodeMirrorEditor
                    key={activeQuestionId}
                    value={code[activeQuestionId] || ""}
                    onCodeChangeAction={handleCodeChange}
                    language={selectedLanguage}
                    searchQuery={searchQuery}
                    tabSize={tabSize}
                    onCursorPositionChangeAction={handleCursorPositionChange}
                    onExecuteAction={runCode}
                  />
                </div>

                {/* Bottom Toolbar */}
                <div className="h-8 bg-gray-100 border-t flex items-center px-4 text-xs text-gray-600 flex-shrink-0">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <LanguageIcon language={selectedLanguage} className="w-3.5 h-3.5" />
                      <span>{selectedLanguage.charAt(0).toUpperCase() + selectedLanguage.slice(1)}</span>
                    </span>
                    
                    <button 
                      ref={lineColRef}
                      onClick={() => setShowGoToLine(!showGoToLine)}
                      className="hover:text-gray-900 cursor-pointer"
                    >
                      Ln {cursorPosition.line}, Col {cursorPosition.col}
                    </button>
                    
                    <button 
                      ref={spacesRef}
                      onClick={() => setShowSpacesMenu(!showSpacesMenu)}
                      className="hover:text-gray-900 cursor-pointer"
                    >
                      Spaces: {tabSize}
                    </button>
                    
                    {container && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span>Container: {container.status}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel: Console + Chat/Video/Preview (50%) */}
            <div className="flex flex-col" style={{ width: "50%" }}>
              
              {/* Console Panel (60%) */}
              <div style={{ height: "60%" }}>
                <ConsolePanel
                  output={consoleOutput.join('\n')}
                  onClear={clearConsole}
                  isExecuting={isRunning}
                  hasBeenExecuted={hasExecuted}
                />
              </div>

              {/* Tabs Panel (40%) */}
              <div className="border-t bg-white" style={{ height: "40%" }}>
                <Tabs value={rightPanelActiveTab} onValueChange={setRightPanelActiveTab} className="h-full flex flex-col">
                  <TabsList className="grid w-full grid-cols-3 bg-gray-50 border-b rounded-none h-10">
                    <TabsTrigger value="chat" className="text-xs">
                      <MessageSquare className="w-3 h-3 mr-1" />
                      Chat
                    </TabsTrigger>
                    <TabsTrigger value="video" className="text-xs">
                      <Video className="w-3 h-3 mr-1" />
                      Video
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="text-xs">
                      <Settings className="w-3 h-3 mr-1" />
                      Preview
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="chat" className="flex-1 m-0 p-0 overflow-hidden">
                    <EnhancedChatPanel
                      key={`chat-${roomId}`}
                      roomId={roomId}
                      socket={socket}
                      awaitingParameterAnswer={awaitingParameterAnswer}
                      currentParameterQuestion={currentParameterQuestion}
                      isAssessmentMode={isAssessmentMode}
                      externalMessages={messages}
                      onChatMessage={handleChatMessage}
                    />
                  </TabsContent>
                  
                  <TabsContent value="video" className="flex-1 m-0 p-0 overflow-hidden">
                    <div className="h-full p-3">
                      <div className="text-center text-gray-500 text-sm">
                        Video call functionality
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="preview" className="flex-1 m-0 p-0 overflow-hidden">
                    <WebPreviewPanel
                      container={container}
                      framework={framework}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>

          {/* Search Dialog */}
          {showSearch && searchRef.current && (
            <SearchDialog
              anchorEl={searchRef.current}
              searchQuery={searchQuery}
              onSearchChangeAction={setSearchQuery}
              onCloseAction={() => setShowSearch(false)}
            />
          )}

          {/* Go to Line Dialog */}
          {showGoToLine && lineColRef.current && (
            <GoToLineDialog
              anchorEl={lineColRef.current}
              onGoToLineAction={handleGoToLine}
              onCloseAction={() => setShowGoToLine(false)}
              maxLine={code[activeQuestionId]?.split("\n").length || 1}
            />
          )}

          {/* Spaces Menu */}
          {showSpacesMenu && spacesRef.current && (
            <SpacesMenu
              anchorEl={spacesRef.current}
              currentTabSize={tabSize}
              onTabSizeChangeAction={handleTabSizeChange}
              onCloseAction={() => setShowSpacesMenu(false)}
            />
          )}
        </div>
      </div>
    </>
  )
} 