"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Play, Search, History, Video, MessageSquare, Settings, Trash2, Mic, PhoneOff, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { useSocket } from "@/hooks/useSocket"
import { useAuth } from "@/hooks/useAuth"
import { useRouter } from "next/navigation"
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

export default function RoomPage({ params }: { params: { id: string } }) {
  const { id: roomId } = params
  const { user } = useAuth()
  const router = useRouter()
  
  // Socket connection
  const socket = useSocket(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000")

  // State management
  const [questions, setQuestions] = useState<Question[]>([])
  const [activeQuestionId, setActiveQuestionId] = useState<string>("")
  const [code, setCode] = useState<Record<string, string>>({})
  const [consoleOutput, setConsoleOutput] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [editorWidth, setEditorWidth] = useState(60)
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
  const [consoleSectionHeight, setConsoleSectionHeight] = useState(50) // Percentage for question vs console split
  const [chatVideoSectionHeight, setChatVideoSectionHeight] = useState(50) // Percentage for chat vs video split
  const [rightPanelWidth, setRightPanelWidth] = useState(30) // Percentage width for chat/video panels (30% default)
  const [isLoading, setIsLoading] = useState(true)
  const [questionsReady, setQuestionsReady] = useState(false)
  const [codeHistory, setCodeHistory] = useState<Array<{
    id: string
    timestamp: number
    code: string
    questionId: string
    event: string
  }>>([])  // Track code changes for history
  const [validationResults, setValidationResults] = useState<Record<string, any>>({}) // Track validation per question
  const [showValidationWarnings, setShowValidationWarnings] = useState<Record<string, boolean>>({}) // Control warning visibility per question

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
  const resizeRef = useRef<HTMLDivElement>(null)
  const consoleResizeRef = useRef<HTMLDivElement>(null)
  const chatVideoResizeRef = useRef<HTMLDivElement>(null)
  const horizontalResizeRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const isConsoleDragging = useRef(false)
  const isChatVideoDragging = useRef(false)
  const isHorizontalDragging = useRef(false)
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
      
      // Only set parameter-specific state for parameter questions
      if (message.questionContext?.type === 'parameter_question') {
        console.log("📱 LHIS: Setting parameter question state")
        setAwaitingParameterAnswer(true)
        setCurrentParameterQuestion(message.questionContext)
      }
    }
  }, [])

  // Handle engagement responses from AI interviewer
  const handleUserEngagementResponse = useCallback((response: string, engagementType?: string) => {
    if (!socket || !user) return
    
    console.log("🤖 User responded to AI engagement:", { response, engagementType })
    
    // Send engagement response to backend
    socket.emit('userEngagementResponse', {
      roomId,
      userId: user.id,
      response,
      engagementType: engagementType || 'general'
    })
    
    // Add user's response to chat
    const responseMessage: ChatMessage = {
      id: `user-engagement-${Date.now()}`,
      userId: user.id,
      username: user.username,
      message: response,
      content: response,
      timestamp: new Date().toISOString(),
      sender: {
        id: user.id,
        name: user.username,
        type: 'user'
      },
      isEngagementResponse: true
    }
    
    setMessages((prev) => [...prev, responseMessage])
    
    // Log successful response (no toast notification)
    console.log("✅ Response sent to AI interviewer:", response)
  }, [socket, roomId, user])

  // Debug language calculation
  useEffect(() => {
    console.log("🎯 Language Calculation Debug:", {
      activeQuestionId,
      activeQuestionLanguage: activeQuestion?.language,
      fallbackLanguage: language,
      finalSelectedLanguage: selectedLanguage,
      allQuestions: questions.map(q => ({ id: q.id, lang: q.language }))
    })
  }, [activeQuestionId, activeQuestion, language, selectedLanguage, questions])

  // Initialize language and experience from URL parameters on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search)
      const urlLanguage = searchParams.get('language') || "python"
      const urlExperience = searchParams.get('experienceLevel') || "junior"
      const urlJobProfile = searchParams.get('jobProfile') || ""
      
      console.log("🔍 Room Page URL Params Init:", {
        currentURL: window.location.href,
        searchParams: window.location.search,
        parsedLanguage: urlLanguage,
        parsedExperience: urlExperience,
        parsedJobProfile: urlJobProfile,
        hasLanguageParam: searchParams.has('language'),
        hasExperienceParam: searchParams.has('experienceLevel'),
        hasJobProfileParam: searchParams.has('jobProfile')
      })
      
      setLanguage(urlLanguage)
      setExperience(urlExperience)
      
      // If job profile is present, initialize assessment system
      if (urlJobProfile) {
        setJobDescription(urlJobProfile)
        setIsParameterAssessment(true)
        console.log("🎯 Assessment mode enabled with job profile:", urlJobProfile)
      }
    }
  }, []) // Only run once on mount

  // Socket effect - Set up all listeners and initialize assessment
  useEffect(() => {
    if (!socket || !user || !roomId) {
      console.log("❌ Socket effect early return:", { 
        hasSocket: !!socket, 
        hasUser: !!user, 
        hasRoomId: !!roomId 
      })
      return
    }
    
    // Prevent duplicate initialization using both ref and state
    if (initializationCalled.current || initializationComplete) {
      console.log("🚫 Socket effect already called, skipping duplicate")
      return
    }
    
    initializationCalled.current = true
    setInitializationComplete(true)
    console.log("🔌 Socket Effect - Setting up listeners first:", { roomId, userId: user.id })

    const urlParams = new URLSearchParams(window.location.search)
    const jobProfileParam = urlParams.get('jobProfile')

    // Socket connection listeners with better logging
    socket.on("connect", () => {
      console.log("🟢 Socket connected successfully:", socket.id)
      
      // BULLETPROOF: Trigger LHIS initialization immediately on connection
      if (jobProfileParam && !assessmentInitialized.current) {
        console.log("🎯 LHIS: Initializing assessment immediately...")
        assessmentInitialized.current = true
        
        // Initialize LHIS with retry logic
        const initializeLHIS = async (retries = 3) => {
          try {
            console.log(`🔄 LHIS: Initialization attempt ${4 - retries}/3`)
            
            socket.emit('initializeAssessment', {
              sessionId: roomId,
              candidateId: user.id,
              jobProfileId: jobProfileParam
            })
            
            socket.emit('joinAssessmentRoom', {
              sessionId: roomId,
              candidateId: user.id,
              role: 'candidate'
            })
            
            console.log("✅ LHIS: Initialization requests sent")
            
          } catch (error) {
            console.error(`❌ LHIS: Initialization attempt failed:`, error)
            if (retries > 0) {
              console.log(`🔄 LHIS: Retrying initialization in 2 seconds... (${retries} retries left)`)
              setTimeout(() => initializeLHIS(retries - 1), 2000)
            } else {
              console.error("❌ LHIS: All initialization attempts failed")
              setConsoleOutput(prev => [...prev, "❌ LHIS: Failed to initialize assessment after 3 attempts"])
            }
          }
        }
        
        // Start initialization immediately if connected, or wait briefly if not
        if (socket.connected) {
          initializeLHIS()
        } else {
          setTimeout(() => {
            if (socket.connected) {
              initializeLHIS()
            } else {
              console.error("❌ Socket still not connected after delay")
            }
          }, 1000)
        }
      }
    })

    socket.on("disconnect", () => {
      console.log("🔴 Socket disconnected")
      // Reset initialization flags for reconnection
      assessmentInitialized.current = false
    })

    socket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error)
      // Reset flags to allow retry
      assessmentInitialized.current = false
    })

    // Store language and experience from URL
    setLanguage(language)
    setExperience(experience)

    // Store job profile ID if present
    if (jobProfileParam) {
      console.log("🎯 Living AI Interviewer enabled with job profile:", jobProfileParam)
      setJobProfileId(jobProfileParam)
    }

    // Get additional URL parameters for assessment detection
    const jobDescriptionParam = urlParams.get('jobDescription')
    const roleParam = urlParams.get('role')
    
    console.log("🎭 Role Detection:", {
      roleParam,
      jobDescriptionParam: jobDescriptionParam ? "Present" : "None",
      isParameterAssessment: !!jobDescriptionParam
    })

    // NEW: Living AI Interviewer Assessment System listeners
    if (jobProfileParam) {
      console.log("🎯 Setting up LHIS listeners for job profile:", jobProfileParam)
      
      // LHIS Assessment initialized - Handle master problem
      socket.on('assessmentInitialized', (data: any) => {
        console.log("✅ LHIS: Assessment initialized:", data)
        
        // Set assessment state and job profile data
        setAssessmentStatus(data.assessmentState)
        setIsAssessmentMode(true)
        
        // Handle master problem - create a question from it
        if (data.jobProfile && data.jobProfile.masterProblem) {
          console.log("📋 LHIS: Master problem received:", data.jobProfile.title)
          console.log("📋 Master problem length:", data.jobProfile.masterProblem.length)
          
          const masterQuestion = {
            id: 'master-problem',
            title: 'Problem',
            description: data.jobProfile.masterProblem,
            language: selectedLanguage
          }
          
          // Set the master problem as the primary question
          setQuestions([masterQuestion])
          setActiveQuestionId('master-problem')
          setQuestionsReady(true)
          
          console.log("✅ LHIS: Master problem set as primary question")
        } else {
          console.error("❌ LHIS: No master problem in response:", data)
        }
        
        // Add initial message to chat if provided
        if (data.initialMessage) {
          const welcomeMessage = {
            id: `welcome-${Date.now()}`,
            userId: 'lhis',
            username: 'LHIS',
            message: data.initialMessage,
            content: data.initialMessage,
            timestamp: Date.now(),
            sender: { id: 'lhis', name: 'LHIS', type: 'welcome' }
          }
          setMessages(prev => [...prev, welcomeMessage])
        }
      })

      // LHIS Assessment room joined
      socket.on('assessmentRoomJoined', (data: any) => {
        console.log("✅ LHIS: Joined assessment room:", data)
      })

      // LHIS Chat messages - Let Enhanced Chat Panel handle this directly
      // No socket listener here to avoid duplication
      
      // LHIS Assessment errors
      socket.on('assessmentError', (error: any) => {
        console.error("❌ LHIS: Assessment error:", error)
        setConsoleOutput(prev => [...prev, `❌ LHIS Error: ${error.error}`])
      })

      // LHIS Answer processing - Handle feedback and next questions
      socket.on('chatMessage', (message: any) => {
        console.log("💬 Room: Received chat message:", message)
        
        // Handle LHIS feedback messages (when answer is processed)
        if (message.sender?.type === 'feedback' && awaitingParameterAnswer) {
          console.log("✅ LHIS: Answer feedback received, clearing awaiting state")
          setAwaitingParameterAnswer(false)
          setCurrentParameterQuestion(null)
        }
        
        // Forward the message to Enhanced Chat Panel via handleChatMessage callback
        console.log("📤 Room: Forwarding chat message to Enhanced Chat Panel")
        handleChatMessage(message)
      })
    } else if (jobDescriptionParam) {
      // Only set up 3-parameter assessment listeners if no LHIS
      socket.on('assessmentInitialized', (data: any) => {
        console.log("🚀 Assessment initialized:", data)
        setAssessmentState(data.assessmentState)
      })

      socket.on('assessmentFeedback', (data: any) => {
        console.log("📊 Assessment feedback:", data)
        setAssessmentState(data.assessmentState)
      })

      socket.on('assessmentComplete', (data: any) => {
        console.log("✅ Assessment complete:", data)
        setAssessmentState(data.assessmentState)
      })
    }

    // Join the room after all listeners are set up
    if (!joinRoomCalled.current) {
      console.log("📡 All listeners set up. Now joining room...")
      joinRoomCalled.current = true
      
      socket.emit("joinRoom", {
        roomName: roomId,
        userId: user.id,
        username: user.firstName || "User",
        language,
        experienceLevel: experience,
        jobDescription: jobDescriptionParam,
        jobProfile: jobProfileParam,
        role: roleParam || 'candidate'
      })
    } else {
      console.log("⚠️  joinRoom already called, skipping duplicate")
    }

    // Cleanup function
    return () => {
      initializationCalled.current = false
      assessmentInitialized.current = false
      socketInitialized.current = false
      joinRoomCalled.current = false
      setInitializationComplete(false)
      console.log("🧹 Socket effect cleanup - resetting flags")
      
      // Remove socket event listeners
      socket.off("connect")
      socket.off("disconnect") 
      socket.off("connect_error")
      socket.off("joinRoomError")
      socket.off("initialRoomQuestions")
      socket.off("codeUpdate")
      socket.off("chatMessage")
      socket.off("participantJoined")
      socket.off("participantLeft")
      socket.off("codeValidation")
      socket.off("codeBlocked")
      
      // LHIS listeners cleanup
      socket.off("assessmentInitialized")
      socket.off("assessmentRoomJoined")
      socket.off("assessmentError")
      socket.off("assessmentFeedback")
      socket.off("assessmentComplete")
      
      console.log("🧹 Socket cleanup complete")
    }
  }, [roomId, user?.id, socket]) // Add socket back to dependencies for proper reconnection

  // Handle window resize and mouse events for editor resizing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    e.preventDefault()
  }, [])

  const handleConsoleMouseDown = useCallback((e: React.MouseEvent) => {
    isConsoleDragging.current = true
    e.preventDefault()
  }, [])

  const handleChatVideoMouseDown = useCallback((e: React.MouseEvent) => {
    isChatVideoDragging.current = true
    e.preventDefault()
  }, [])

  const handleHorizontalMouseDown = useCallback((e: React.MouseEvent) => {
    isHorizontalDragging.current = true
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging.current) {
      const container = resizeRef.current?.parentElement
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100

      if (newWidth >= 30 && newWidth <= 80) {
        setEditorWidth(newWidth)
      }
    }

    if (isConsoleDragging.current) {
      const container = consoleResizeRef.current?.parentElement
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const newHeight = ((e.clientY - containerRect.top) / containerRect.height) * 100

      // Console panel cannot go smaller than 50% - divider cannot go below middle (50%)
      if (newHeight >= 25 && newHeight <= 50) {
        setConsoleSectionHeight(newHeight)
      }
    }

    if (isChatVideoDragging.current) {
      const container = chatVideoResizeRef.current?.parentElement
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const newHeight = ((e.clientY - containerRect.top) / containerRect.height) * 100

      // Chat panel cannot go smaller than 50% - enforce 25% to 75% range  
      // This ensures both chat and video get minimum 25% (which is 50% of the right panel)
      if (newHeight >= 25 && newHeight <= 75) {
        setChatVideoSectionHeight(newHeight)
      }
    }

    if (isHorizontalDragging.current) {
      const container = horizontalResizeRef.current?.parentElement
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const newWidth = ((containerRect.right - e.clientX) / containerRect.width) * 100

      // Right panel (chat/video) should be between 20% and 50% of total width
      if (newWidth >= 20 && newWidth <= 50) {
        setRightPanelWidth(newWidth)
      }
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
    isConsoleDragging.current = false
    isChatVideoDragging.current = false
    isHorizontalDragging.current = false
  }, [])

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // Code execution
  const runCode = async () => {
    if (!activeQuestion || !code[activeQuestionId]) return

    setIsRunning(true)
    setConsoleOutput((prev) => [...prev, `> Running ${activeQuestion.title}...`])
    
    // Track code execution in history
    setCodeHistory((prev) => [
      ...prev,
      {
        id: `execution-${Date.now()}`,
        timestamp: Date.now(),
        code: code[activeQuestionId],
        questionId: activeQuestionId,
        event: "execute"
      }
    ].slice(-50))

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code[activeQuestionId],
          language: selectedLanguage,
          input: "",
        }),
      })

      const result = await response.json()

      if (result.success) {
        setConsoleOutput((prev) => [
          ...prev,
          "✓ Code executed successfully!",
          result.output ? `Output: ${result.output}` : "No output",
          `Runtime: ${result.time || "N/A"}s`,
          `Memory: ${result.memory || "N/A"} MB`,
          "",
        ])
      } else {
        setConsoleOutput((prev) => [
          ...prev,
          "✗ Execution failed:",
          result.error || "Unknown error",
          "",
        ])
      }
    } catch (error) {
      setConsoleOutput((prev) => [
        ...prev,
        "✗ Network error:",
        error instanceof Error ? error.message : "Unknown error",
        "",
      ])
    } finally {
      setIsRunning(false)
    }
  }

  // Handle code changes
  const handleCodeChange = (value: string) => {
    setCode((prev) => ({ ...prev, [activeQuestionId]: value }))
    
    // Clear validation results for this question when code changes significantly
    // This ensures fresh validation instead of showing stale cached results
    const previousCode = code[activeQuestionId] || '';
    const isSignificantChange = Math.abs(value.length - previousCode.length) > 10 || 
                                value.trim() !== previousCode.trim();
    
    if (isSignificantChange) {
      console.log(`🔄 Significant code change detected, clearing validation for ${activeQuestionId}`);
      setValidationResults((prev) => {
        const updated = { ...prev };
        delete updated[activeQuestionId];
        return updated;
      });
      setShowValidationWarnings((prev) => {
        const updated = { ...prev };
        delete updated[activeQuestionId];
        return updated;
      });
    }
    
    // Track code history
    setCodeHistory((prev) => [
      ...prev,
      {
        id: `history-${Date.now()}`,
        timestamp: Date.now(),
        code: value,
        questionId: activeQuestionId,
        event: "edit"
      }
    ].slice(-50)) // Keep only last 50 changes
    
    // Emit code change to other participants
    if (socket) {
      socket.emit("codeChange", {
        roomName: roomId,
        questionId: activeQuestionId,
        code: value,
        language: selectedLanguage,
        userId: user?.id,
      })
      
      // NEW: Living AI Interviewer - Monitor code changes for assessment
      if (jobProfileId && value.trim().length > 20) {
        // Emit assessment code change for real-time monitoring
        socket.emit("assessmentCodeChange", {
          sessionId: roomId,
          questionId: activeQuestionId,
          code: value,
          language: selectedLanguage
        })
        console.log("🎯 Assessment code change emitted for monitoring")
      }
    }
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

  const handleTabSizeChange = (newTabSize: number) => {
    setTabSize(newTabSize)
    setShowSpacesMenu(false)
  }

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/auth")
      return
    }
  }, [user, router])

  // Handle loading completion
  const handleLoadingComplete = () => {
    setIsLoading(false)
  }

  // Auto-complete loading if questions are ready
  useEffect(() => {
    if (questionsReady && isLoading) {
      // Add a small delay to ensure user sees the completion
      console.log("Questions are ready, completing loading...")
      const timer = setTimeout(() => {
        setIsLoading(false)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [questionsReady, isLoading])

  // Add a timeout to force loading completion if AI takes too long
  useEffect(() => {
    const forceCompleteTimer = setTimeout(() => {
      if (isLoading) {
        console.log("Force completing loading due to timeout...")
        setIsLoading(false)
      }
    }, 15000) // 15 seconds timeout

    return () => clearTimeout(forceCompleteTimer)
  }, [isLoading])

  // Debug: Log current state
  useEffect(() => {
    console.log("Current state:", { 
      isLoading, 
      questionsReady, 
      questionsLength: questions.length,
      activeQuestionId,
      hasUser: !!user
    })
  }, [isLoading, questionsReady, questions.length, activeQuestionId, user])

  // Fallback: Direct master problem loading if socket initialization fails
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const jobProfileParam = urlParams.get('jobProfile')
    
    if (jobProfileParam && !questionsReady && !isLoading) {
      console.log("🔄 Fallback: Attempting direct master problem load...")
      
      // Try to load master problem directly via API
      const timer = setTimeout(async () => {
        try {
          const response = await fetch(`/api/job-profiles/${jobProfileParam}`)
          if (response.ok) {
            const jobProfile = await response.json()
            
            if (jobProfile.master_problem) {
              console.log("✅ Fallback: Master problem loaded directly")
              
              const masterProblem = typeof jobProfile.master_problem === 'object' 
                ? jobProfile.master_problem.description 
                : jobProfile.master_problem
              
              const masterQuestion = {
                id: 'master-problem',
                title: 'Problem',
                description: masterProblem,
                language: selectedLanguage
              }
              
              setQuestions([masterQuestion])
              setActiveQuestionId('master-problem')
              setQuestionsReady(true)
              setIsAssessmentMode(true)
              
              console.log("✅ Fallback: Master problem set successfully")
            }
          }
        } catch (error) {
          console.error("❌ Fallback: Failed to load master problem:", error)
        }
      }, 3000) // Wait 3 seconds before fallback
      
      return () => clearTimeout(timer)
    }
  }, [jobProfileId, questionsReady, isLoading, selectedLanguage])

  if (!user) {
    return <div>Loading...</div>
  }

  // Render Interviewer Dashboard for interviewers
  if (userRole === 'interviewer') {
    return (
      <>
        {/* Quantum Loading Screen */}
        <QuantumLoading
          isVisible={isLoading}
          onComplete={handleLoadingComplete}
          loadingText="Initializing Interviewer Dashboard"
          subText="Setting up 3-parameter assessment system..."
        />

        {/* Interviewer Dashboard */}
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
        loadingText="Initializing Quantum AI Engine"
        subText={`Generating ${language} interview questions for ${experience} level...`}
      />

      {/* Main Application */}
      <div className={isLoading ? "hidden" : "block"}>
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
                variant={showVideoCall ? "default" : "outline"}
                size="sm"
                onClick={() => setShowVideoCall(!showVideoCall)}
              >
                <Video className="w-4 h-4 mr-1" />
                Video
              </Button>
              <Button variant={showChat ? "default" : "outline"} size="sm" onClick={() => setShowChat(!showChat)}>
                <MessageSquare className="w-4 h-4 mr-1" />
                Chat
              </Button>
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
          </div>
          </div>

          {/* Main Content Area - Full Height */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Main Content */}
            <div className="flex-1 flex">
              {/* Editor Section */}
              <div className="bg-white border-r flex flex-col" style={{ width: `${editorWidth}%` }}>
                {/* Editor Tabs */}
                <div className="bg-gray-50 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {questions.slice(0, 2).map((question, index) => (
                        <button
                          key={question.id}
                          onClick={() => {
                            setActiveQuestionId(question.id)
                            // Track question switch in history
                            setCodeHistory((prev) => [
                              ...prev,
                              {
                                id: `switch-${Date.now()}`,
                                timestamp: Date.now(),
                                code: code[question.id] || "",
                                questionId: question.id,
                                event: "switch"
                              }
                            ].slice(-50))
                          }}
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

                {/* Bottom Toolbar - Inside Editor Panel */}
                <div className="h-8 bg-gray-100 border-t flex items-center px-4 text-xs text-gray-600 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <LanguageIcon language={selectedLanguage} className="w-3.5 h-3.5" />
                      <span>{selectedLanguage.charAt(0).toUpperCase() + selectedLanguage.slice(1)}</span>
                    </span>
              </div>

                  <div className="flex items-center ml-auto mr-4">
                    <button
                      ref={lineColRef}
                      className={cn(
                        "hover:bg-gray-200 px-2 py-1 rounded-l transition-all duration-75 cursor-pointer hover:font-medium",
                        showGoToLine && "bg-gray-200 font-medium",
                      )}
                      onClick={() => {
                        setShowSpacesMenu(false)
                        setShowHistoryMap(false)
                        setShowGoToLine(!showGoToLine)
                      }}
                    >
                      Ln {cursorPosition.line}, Col {cursorPosition.col}
                    </button>
                    <button
                      ref={spacesRef}
                      className={cn(
                        "hover:bg-gray-200 px-2 py-1 transition-all duration-75 cursor-pointer hover:font-medium",
                        showSpacesMenu && "bg-gray-200 font-medium",
                      )}
                      onClick={() => {
                        setShowGoToLine(false)
                        setShowHistoryMap(false)
                        setShowSpacesMenu(!showSpacesMenu)
                      }}
                    >
                      • Spaces: {tabSize}
                    </button>
                    <button
                      ref={historyRef}
                      className={cn(
                        "hover:bg-gray-200 px-2 py-1 rounded-r transition-all duration-75 cursor-pointer hover:font-medium flex items-center",
                        showHistoryMap && "bg-gray-200 font-medium",
                      )}
                      onClick={() => {
                        setShowGoToLine(false)
                        setShowSpacesMenu(false)
                        setShowHistoryMap(!showHistoryMap)
                      }}
                    >
                      <History className="w-3 h-3 mr-1" />
                      History
                    </button>
              </div>
            </div>
              </div>

              {/* Resize Handle with Visual Indicator */}
              <div
                ref={resizeRef}
                className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize flex-shrink-0 transition-colors relative group"
                onMouseDown={handleMouseDown}
              >
                {/* Subtle visual indicator */}
                <div className="absolute inset-y-0 left-1/2 transform -translate-x-1/2 w-0.5">
                  <div className="h-full flex flex-col justify-center items-center space-y-1 opacity-30 group-hover:opacity-60 transition-opacity">
                    <div className="w-0.5 h-1 bg-gray-400 rounded-full"></div>
                    <div className="w-0.5 h-1 bg-gray-400 rounded-full"></div>
                    <div className="w-0.5 h-1 bg-gray-400 rounded-full"></div>
                    <div className="w-0.5 h-1 bg-gray-400 rounded-full"></div>
                    <div className="w-0.5 h-1 bg-gray-400 rounded-full"></div>
                  </div>
                </div>
              </div>

              {/* Console Section */}
              <div className="bg-white flex flex-col" style={{ width: `${100 - editorWidth}%` }}>
                {/* Question Section */}
                <div className="flex flex-col" style={{ height: `${consoleSectionHeight}%` }}>
                  <div className="border-b bg-gray-50 h-[34px] flex items-center">
                    <div className="flex items-center justify-between px-4 w-full">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Problem</span>
                      </div>
                    </div>
                  </div>

                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {/* Living AI Interviewer Assessment Status */}
                      <AssessmentStatus
                        assessmentStatus={assessmentStatus}
                        isAssessmentMode={isAssessmentMode}
                        awaitingParameterAnswer={awaitingParameterAnswer}
                        currentParameterQuestion={currentParameterQuestion}
                      />
                      
                      {activeQuestion ? (
                        <div>
                          <div 
                            className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none problem-content"
                            dangerouslySetInnerHTML={{ __html: formatProblemText(activeQuestion.description) }}
                          />
                        </div>
                      ) : (
                        <p className="text-gray-500">Select a question to view the problem statement</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Console Resize Handle with Visual Indicator */}
                <div
                  ref={consoleResizeRef}
                  className="h-1 bg-gray-200 hover:bg-blue-400 cursor-row-resize flex-shrink-0 transition-colors relative group"
                  onMouseDown={handleConsoleMouseDown}
                >
                  {/* Subtle visual indicator */}
                  <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2 h-0.5">
                    <div className="w-full flex justify-center items-center space-x-1 opacity-30 group-hover:opacity-60 transition-opacity">
                      <div className="w-1 h-0.5 bg-gray-400 rounded-full"></div>
                      <div className="w-1 h-0.5 bg-gray-400 rounded-full"></div>
                      <div className="w-1 h-0.5 bg-gray-400 rounded-full"></div>
                      <div className="w-1 h-0.5 bg-gray-400 rounded-full"></div>
                      <div className="w-1 h-0.5 bg-gray-400 rounded-full"></div>
                    </div>
                  </div>
                </div>

                {/* Console Output Section */}
                <div className="flex flex-col" style={{ height: `${100 - consoleSectionHeight}%` }}>
                  <div className="border-b bg-gray-50 h-[34px] flex items-center">
                    <div className="flex items-center justify-between px-4 w-full">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Console</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={clearConsole}
                          className="hover:bg-gray-200 px-2 py-1 rounded transition-all duration-75 cursor-pointer hover:font-medium text-xs flex items-center"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Clear Console
                        </button>
                      </div>
                    </div>
                  </div>

                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-1 font-mono text-sm">
                      {consoleOutput.length === 0 ? (
                        <p className="text-gray-500">Results of your code will appear here when you run</p>
                      ) : (
                        consoleOutput.map((line, index) => (
                          <div
                            key={index}
                            className={cn(
                              line.startsWith(">")
                                ? "text-blue-600"
                                : line.startsWith("✓")
                                  ? "text-green-600"
                                  : line.startsWith("✗")
                                    ? "text-red-600"
                                    : "text-gray-800",
                            )}
                          >
                            {line}
                          </div>
                        ))
                      )}
                    </div>
                </ScrollArea>
                </div>
              </div>
            </div>

            {/* Horizontal Resize Handle between Main Content and Chat/Video Panels */}
            {(showVideoCall || showChat) && (
              <div
                ref={horizontalResizeRef}
                className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize flex-shrink-0 transition-colors relative group"
                onMouseDown={handleHorizontalMouseDown}
              >
                {/* Subtle visual indicator */}
                <div className="absolute inset-y-0 left-1/2 transform -translate-x-1/2 w-0.5">
                  <div className="h-full flex flex-col justify-center items-center space-y-1 opacity-30 group-hover:opacity-60 transition-opacity">
                    <div className="w-0.5 h-1 bg-gray-400 rounded-full"></div>
                    <div className="w-0.5 h-1 bg-gray-400 rounded-full"></div>
                    <div className="w-0.5 h-1 bg-gray-400 rounded-full"></div>
                    <div className="w-0.5 h-1 bg-gray-400 rounded-full"></div>
                    <div className="w-0.5 h-1 bg-gray-400 rounded-full"></div>
                  </div>
                </div>
              </div>
            )}

            {/* Right Side Panels - Chat/Video Combined when both are active */}
            {(showVideoCall || showChat) && (
              <div className="bg-white border-l flex flex-col flex-shrink-0" style={{ width: `${rightPanelWidth}%` }}>
                {/* Both Video and Chat are active - Show with resizable divider */}
                {showVideoCall && showChat && (
                  <>
                    {/* Video Call Section */}
                    <div className="flex flex-col overflow-hidden" style={{ height: `${chatVideoSectionHeight}%` }}>
                      <div className="border-b bg-gray-50 h-[34px] flex items-center flex-shrink-0">
                        <div className="flex items-center justify-between px-4 w-full">
                          <div className="flex items-center gap-2">
                            <Video className="w-4 h-4" />
                            <span className="text-sm font-medium">Video Call</span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setShowVideoCall(false)}
                            className="h-6 w-6 p-0"
                          >
                            ×
              </Button>
          </div>
        </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="h-full p-3 flex flex-col gap-3">
                          {/* Video Grid */}
                          <div className="space-y-2 flex-1">
                            {/* Local Video */}
                            <div className="relative">
                              <div className="aspect-video bg-gray-900 rounded-md overflow-hidden relative">
                                <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                                  <div className="text-center">
                                    <div className="w-12 h-12 bg-blue-500 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-semibold">
                                      You
                                    </div>
                                    <div className="text-xs text-gray-400">Camera Off</div>
                                  </div>
                                </div>
                                <div className="absolute bottom-1 left-1 bg-black/70 text-white px-2 py-0.5 rounded text-xs">
                                  You
                                </div>
                              </div>
                            </div>

                            {/* Remote Video */}
                            <div className="relative">
                              <div className="aspect-video bg-gray-900 rounded-md overflow-hidden relative">
                                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                  <div className="text-center">
                                    <div className="w-12 h-12 bg-white/20 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-semibold">
                                      IN
                                    </div>
                                    <div className="text-xs text-gray-200">Waiting for interviewer...</div>
                                  </div>
                                </div>
                                <div className="absolute bottom-1 left-1 bg-black/70 text-white px-2 py-0.5 rounded text-xs">
                                  Interviewer
                                </div>
                              </div>
                            </div>
          </div>

                          {/* Controls */}
                          <div className="flex justify-center gap-1">
                            <Button variant="default" size="sm" className="flex-1 h-8">
                              <Mic className="w-3 h-3" />
                            </Button>
                            <Button variant="default" size="sm" className="flex-1 h-8">
                              <Video className="w-3 h-3" />
                            </Button>
                            <Button variant="destructive" size="sm" className="flex-1 h-8">
                              <PhoneOff className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Chat/Video Resize Handle */}
                    <div
                      ref={chatVideoResizeRef}
                      className="h-1 bg-gray-200 hover:bg-blue-400 cursor-row-resize flex-shrink-0 transition-colors relative group"
                      onMouseDown={handleChatVideoMouseDown}
                    >
                      {/* Subtle visual indicator */}
                      <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2 h-0.5">
                        <div className="w-full flex justify-center items-center space-x-1 opacity-30 group-hover:opacity-60 transition-opacity">
                          <div className="w-1 h-0.5 bg-gray-400 rounded-full"></div>
                          <div className="w-1 h-0.5 bg-gray-400 rounded-full"></div>
                          <div className="w-1 h-0.5 bg-gray-400 rounded-full"></div>
                          <div className="w-1 h-0.5 bg-gray-400 rounded-full"></div>
                          <div className="w-1 h-0.5 bg-gray-400 rounded-full"></div>
                </div>
                      </div>
                    </div>

                    {/* Chat Section */}
                    <div className="flex flex-col overflow-hidden" style={{ height: `${100 - chatVideoSectionHeight}%` }}>
                      <div className="border-b bg-gray-50 h-[34px] flex items-center flex-shrink-0">
                        <div className="flex items-center justify-between px-4 w-full">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" />
                            <span className="text-sm font-medium">Chat</span>
                            {isAssessmentMode && (
                              <div className="flex items-center gap-1" title="LHIS AI System Active">
                                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                <span className="text-xs text-gray-500 font-medium">LHIS</span>
                              </div>
                            )}
                          </div>
                <Button 
                            variant="ghost" 
                  size="sm" 
                            onClick={() => setShowChat(false)}
                            className="h-6 w-6 p-0"
                >
                            ×
                    </Button>
                  </div>
                </div>
                      <div className="flex-1 overflow-hidden">
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
                      </div>
                    </div>
                    </>
                  )}

                {/* Only Video Call is active */}
                {showVideoCall && !showChat && (
                  <div className="flex flex-col h-full">
                    <div className="border-b bg-gray-50 h-[34px] flex items-center flex-shrink-0">
                      <div className="flex items-center justify-between px-4 w-full">
                        <div className="flex items-center gap-2">
                          <Video className="w-4 h-4" />
                          <span className="text-sm font-medium">Video Call</span>
                </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setShowVideoCall(false)}
                          className="h-6 w-6 p-0"
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="h-full p-3 flex flex-col gap-3">
                        {/* Video Grid */}
                        <div className="space-y-2 flex-1">
                          {/* Local Video */}
                          <div className="relative">
                            <div className="aspect-video bg-gray-900 rounded-md overflow-hidden relative">
                              <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                                <div className="text-center">
                                  <div className="w-16 h-16 bg-blue-500 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-semibold">
                                    You
                                  </div>
                                  <div className="text-xs text-gray-400">Camera Off</div>
                                </div>
                              </div>
                              <div className="absolute bottom-1 left-1 bg-black/70 text-white px-2 py-0.5 rounded text-xs">
                                You
                              </div>
                            </div>
            </div>

                          {/* Remote Video */}
                          <div className="relative">
                            <div className="aspect-video bg-gray-900 rounded-md overflow-hidden relative">
                              <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                <div className="text-center">
                                  <div className="w-16 h-16 bg-white/20 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-semibold">
                                    IN
                </div>
                                  <div className="text-xs text-gray-200">Waiting for interviewer...</div>
                  </div>
                              </div>
                              <div className="absolute bottom-1 left-1 bg-black/70 text-white px-2 py-0.5 rounded text-xs">
                                Interviewer
                              </div>
                            </div>
                          </div>
              </div>

                        {/* Controls */}
                        <div className="flex justify-center gap-2">
                          <Button variant="default" size="sm" className="flex-1 h-8">
                            <Mic className="w-3 h-3" />
                          </Button>
                          <Button variant="default" size="sm" className="flex-1 h-8">
                            <Video className="w-3 h-3" />
                          </Button>
                          <Button variant="destructive" size="sm" className="flex-1 h-8">
                            <PhoneOff className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Only Chat is active */}
                {!showVideoCall && showChat && (
                  <div className="flex flex-col h-full">
                    <div className="border-b bg-gray-50 h-[34px] flex items-center flex-shrink-0">
                      <div className="flex items-center justify-between px-4 w-full">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4" />
                          <span className="text-sm font-medium">Chat</span>
                          {isAssessmentMode && (
                            <div className="flex items-center gap-1" title="LHIS AI System Active">
                              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                              <span className="text-xs text-gray-500 font-medium">LHIS</span>
                            </div>
                          )}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setShowChat(false)}
                          className="h-6 w-6 p-0"
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden">
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
                    </div>
                  </div>
                )}
              </div>
            )}
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

          {/* History Mini-Map */}
          {showHistoryMap && historyRef.current && (
            <HistoryMiniMap 
              anchorEl={historyRef.current} 
              onCloseAction={() => setShowHistoryMap(false)}
              history={codeHistory}
              currentQuestionId={activeQuestionId}
            />
          )}
    </div>
      </div>
    </>
  )
}
