"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Play,
  Search,
  History,
  Video,
  MessageSquare,
  Settings,
  Trash2,
  Mic,
  PhoneOff,
  Send,
  Sparkles,
  Globe,
  Moon,
  Sun,
  LogOut,
  ChevronDown,
  X,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useSocket } from "@/hooks/useSocket";
import { useAuth } from "@/hooks/useAuth";
import { useSupabaseAuth } from "@/context/SupabaseAuthContext";
import { useRouter } from "next/navigation";
import { EnhancedCodeMirrorEditor } from "@/components/enhanced-code-mirror-editor";
import { EnhancedVideoCallPanel } from "@/components/enhanced-video-call-panel";
import { EnhancedChatPanel } from "@/components/enhanced-chat-panel";
import { GoToLineDialog } from "@/components/go-to-line-dialog";
import { SpacesMenu } from "@/components/spaces-menu";
import { HistoryMiniMap } from "@/components/history-mini-map";
import { Timer } from "@/components/timer";
import { LanguageIcon } from "@/components/language-icon";
import { QuantumLoading } from "@/components/quantum-loading";
import CodeValidationWarnings from "@/components/CodeValidationWarnings";
import { cn } from "@/lib/utils";
import { SearchDialog } from "@/components/search-dialog";
import { InterviewerDashboard } from "@/components/InterviewerDashboard";
import { AssessmentStatus } from "@/components/AssessmentStatus";
import WebPreviewPanel from "@/components/web-preview-panel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ConsolePanel from "@/components/console-panel";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

// Utility function to convert markdown-like formatting to HTML
const formatProblemText = (text: string): string => {
  if (!text) return "";
  
  // Check if the text is already HTML (has HTML tags)
  const isHTML = /<[^>]+>/.test(text);
  
  if (isHTML) {
    // If it's already HTML, just return it as-is without additional processing
    // This prevents adding extra <br> tags to properly formatted HTML
    return text;
  }
  
  // Only apply markdown conversion for non-HTML text
  return (
    text
    // Convert **bold** to <strong>
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Convert line breaks to <br>
      .replace(/\n/g, "<br>")
    // Convert - list items to proper list format
    .replace(/^- (.+)$/gm, '<li class="mb-1">$1</li>')
    // Wrap consecutive list items in <ul>
      .replace(
        /(<li.*?<\/li>(\s*<br>\s*<li.*?<\/li>)*)/g,
        '<ul class="list-disc ml-4 mb-3">$1</ul>',
      )
    // Clean up nested ul tags and line breaks
      .replace(/<\/ul>\s*<br>\s*<ul>/g, "")
    // Format headings with colons (like **Problem Title:**)
      .replace(
        /<strong>([^<]*?:)\s*<\/strong>/g,
        '<div class="text-base font-semibold text-gray-900 mt-4 mb-2">$1</div>',
      )
    // Format other bold text without colons
      .replace(
        /<strong>([^<]*?)<\/strong>/g,
        '<span class="font-medium text-gray-800">$1</span>',
      )
    // Clean up excessive line breaks
      .replace(/(<br>\s*){3,}/g, "<br><br>")
    // Add minimal spacing between paragraphs
      .replace(/(<br><br>)/g, '<div class="mb-3"></div>')
  );
};

interface SessionContainer {
  sessionId: string;
  type: string;
  language: string;
  framework: string;
  containerName: string;
  containerId: string;
  webUrl: string;
  status: 'running' | 'creating' | 'stopped' | 'error';
  createdAt: Date;
  lastActivity: Date;
  port: number;
  isShared: boolean;
}

interface Question {
  id: string;
  title: string;
  description: string;
  language: string;
  category?: string;
  framework?: string;
}

interface Participant {
  userId: string;
  username: string;
  role: string;
}

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  content?: string;
  timestamp: string | number; // Backend sends string, frontend can handle both
  sender?: {
    id: string;
    name: string;
    type: string;
  };
  questionContext?: any;
  isCounterQuestion?: boolean;
  targetQuestionId?: string;
  isEngagementResponse?: boolean;
}

export default function RoomPage({ params }: { params: { id: string } }) {
  const { id: roomId } = params;
  const { user } = useAuth();
  const { getAuthHeaders } = useSupabaseAuth();
  const router = useRouter();

  // Remove interface selection redirect - load room directly
  
  // Socket connection
  const socket = useSocket(
    process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5001",
  );

  // State management
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string>("");
  const [code, setCode] = useState<Record<string, string>>({});
  const [consoleOutput, setConsoleOutput] = useState<Record<string, string[]>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [editorWidth, setEditorWidth] = useState(50);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, col: 1 });
  const [showGoToLine, setShowGoToLine] = useState(false);
  const [showSpacesMenu, setShowSpacesMenu] = useState(false);
  const [showHistoryMap, setShowHistoryMap] = useState(false);
  const [tabSize, setTabSize] = useState(4);
  const [sessionStartTime] = useState(Date.now());
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [language, setLanguage] = useState("python");
  const [experience, setExperience] = useState("junior");
  const [consoleSectionHeight, setConsoleSectionHeight] = useState(50); // Percentage for question vs console split
  const [chatVideoSectionHeight, setChatVideoSectionHeight] = useState(50); // Percentage for chat vs video split
  const [rightPanelWidth, setRightPanelWidth] = useState(30); // Percentage width for chat/video panels (30% default)
  const [isLoading, setIsLoading] = useState(true);
  const [questionsReady, setQuestionsReady] = useState(false);
  const [codeHistory, setCodeHistory] = useState<
    Array<{
      id: string;
      timestamp: number;
      code: string;
      questionId: string;
      event: string;
    }>
  >([]); // Track code changes for history
  const [validationResults, setValidationResults] = useState<
    Record<string, any>
  >({}); // Track validation per question
  const [showValidationWarnings, setShowValidationWarnings] = useState<
    Record<string, boolean>
  >({}); // Control warning visibility per question

  // Enhanced features state
  const [showWebPreview, setShowWebPreview] = useState(false);
  const [isDraggingResize, setIsDraggingResize] = useState(false);
  const [activeConsoleTab, setActiveConsoleTab] = useState<string>("output");
  const [availableConsoleTabs, setAvailableConsoleTabs] = useState<string[]>(["output"]);

  // Session container integration
  const [containers, setContainers] = useState<Record<string, SessionContainer | null>>({});
  const [containerState, setContainerState] = useState<Record<string, {
    isLoading: boolean;
    isExecuting: boolean;
    error: string | null;
    notFound?: boolean; // Flag to prevent re-fetching on 404
  }>>({});

  // New state for 3-parameter assessment and role management
  const [userRole, setUserRole] = useState<"interviewer" | "candidate" | null>(
    null,
  );
  const [assessmentState, setAssessmentState] = useState<any>(null);
  const [jobDescription, setJobDescription] = useState<string>("");
  const [isParameterAssessment, setIsParameterAssessment] = useState(false);
  const [isAssessmentMode, setIsAssessmentMode] = useState(false);
  const [jobProfileId, setJobProfileId] = useState<string>("");
  const [awaitingParameterAnswer, setAwaitingParameterAnswer] = useState(false);
  const [currentParameterQuestion, setCurrentParameterQuestion] =
    useState<any>(null);
  const [assessmentStatus, setAssessmentStatus] = useState<any>(null);

  // Per-parameter countdown timer state
  const [questionTimerEndTimes, setQuestionTimerEndTimes] = useState<Record<string, number>>({});
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);

  // New: Next-tab confirmation dialog with 1-minute auto-switch countdown
  const [showNextTabDialog, setShowNextTabDialog] = useState(false);
  const [nextTabTargetId, setNextTabTargetId] = useState<string | null>(null);
  const [nextTabAutoSwitchUntil, setNextTabAutoSwitchUntil] = useState<number | null>(null);
  const [nextTabRemainingMs, setNextTabRemainingMs] = useState<number>(60000);
  const nextTabTimerRef = useRef<number | null>(null);

  // Completion tracking state
  const [attemptedTabs, setAttemptedTabs] = useState<Set<string>>(new Set());
  const [parameterDepthProgress, setParameterDepthProgress] = useState<Record<number, number>>({});
  const [parameterTabMapping, setParameterTabMapping] = useState<Record<number, string>>({});
  const [timerEndedTabs, setTimerEndedTabs] = useState<Set<string>>(new Set());

  // Derived active timer end
  const activeCountdownUntil = activeQuestionId ? questionTimerEndTimes[activeQuestionId] : undefined;

  // Start a 10-minute timer the first time a tab becomes active
  useEffect(() => {
    if (!activeQuestionId) return;
    setQuestionTimerEndTimes(prev => {
      if (prev[activeQuestionId]) return prev;
      return { ...prev, [activeQuestionId]: Date.now() + 10 * 60 * 1000 };
    });
    // Mark tab as attempted when first activated
    setAttemptedTabs(prev => new Set([...prev, activeQuestionId]));
  }, [activeQuestionId]);

  // Check for test completion whenever relevant state changes
  useEffect(() => {
    if (!isAssessmentMode || questions.length === 0) return;

    const allTabsAttempted = questions.every(q => attemptedTabs.has(q.id));
    const allParametersFullyAnswered = Object.values(parameterDepthProgress).every(depth => depth >= 3);
    const allAttemptedTabsTimerEnded = questions.filter(q => attemptedTabs.has(q.id)).every(q => timerEndedTabs.has(q.id));

    const shouldComplete = allTabsAttempted && (allParametersFullyAnswered || allAttemptedTabsTimerEnded);

    if (shouldComplete && !showCompletionDialog && !showNextTabDialog) {
      setShowCompletionDialog(true);
    }
  }, [attemptedTabs, parameterDepthProgress, timerEndedTabs, questions, isAssessmentMode, showCompletionDialog, showNextTabDialog]);

  const handleActiveTimerExpire = useCallback(() => {
    // Mark current tab as timer-ended
    if (activeQuestionId) {
      setTimerEndedTabs(prev => new Set([...prev, activeQuestionId]));
    }

    // Post a system prompt and ask to switch; auto-switch in 60s if no response
    const currentIndex = questions.findIndex(q => q.id === activeQuestionId);
    const systemMessage = {
      id: `timer-expire-${Date.now()}`,
      userId: 'system',
      username: 'System',
      message: '⏰ Time is up for this parameter. Switch to the next one or we\'ll do it automatically in 60 seconds.',
      timestamp: Date.now(),
      sender: { id: 'system', name: 'System', type: 'timer' }
    } as any;
    setMessages(prev => [...prev, systemMessage]);

    if (currentIndex >= 0 && currentIndex < questions.length - 1) {
      const next = questions[currentIndex + 1];
      setNextTabTargetId(next.id);
      setNextTabAutoSwitchUntil(Date.now() + 60 * 1000);
      setShowNextTabDialog(true);
    }
    // Note: Completion check will happen in the useEffect above
  }, [activeQuestionId, questions]);

  // Manage next-tab dialog countdown and auto-switch
  useEffect(() => {
    if (!showNextTabDialog || !nextTabAutoSwitchUntil) return;

    const update = () => {
      const remaining = Math.max(0, nextTabAutoSwitchUntil - Date.now());
      setNextTabRemainingMs(remaining);
      if (remaining === 0) {
        // Auto-switch if still open and target exists
        if (showNextTabDialog && nextTabTargetId) {
          setActiveQuestionId(nextTabTargetId);
        }
        setShowNextTabDialog(false);
        setNextTabTargetId(null);
        setNextTabAutoSwitchUntil(null);
      }
    };

    update();
    const intervalId = window.setInterval(update, 1000);
    nextTabTimerRef.current = intervalId;
    return () => {
      if (nextTabTimerRef.current) {
        window.clearInterval(nextTabTimerRef.current);
        nextTabTimerRef.current = null;
      }
    };
  }, [showNextTabDialog, nextTabAutoSwitchUntil, nextTabTargetId]);

  const handleNextTabStay = () => {
    // User responded: cancel auto-switch
    if (nextTabTimerRef.current) {
      window.clearInterval(nextTabTimerRef.current);
      nextTabTimerRef.current = null;
    }
    setShowNextTabDialog(false);
    setNextTabTargetId(null);
    setNextTabAutoSwitchUntil(null);
  };

  const handleNextTabSwitchNow = () => {
    if (nextTabTargetId) {
      setActiveQuestionId(nextTabTargetId);
    }
    if (nextTabTimerRef.current) {
      window.clearInterval(nextTabTimerRef.current);
      nextTabTimerRef.current = null;
    }
    setShowNextTabDialog(false);
    setNextTabTargetId(null);
    setNextTabAutoSwitchUntil(null);
  };

  const formatCountdown = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Refs for positioning dialogs
  const lineColRef = useRef<HTMLButtonElement>(null);
  const spacesRef = useRef<HTMLButtonElement>(null);
  const historyRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLButtonElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const consoleResizeRef = useRef<HTMLDivElement>(null);
  const chatVideoResizeRef = useRef<HTMLDivElement>(null);
  const horizontalResizeRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const isConsoleDragging = useRef(false);
  const isChatVideoDragging = useRef(false);
  const isHorizontalDragging = useRef(false);
  const socketInitialized = useRef(false);
  const joinRoomCalled = useRef(false);
  const recentParameterQuestions = useRef<Map<string, number>>(new Map());

  // Prevent redundant initialization calls - use a more stable approach
  const initializationCalled = useRef(false);
  const assessmentInitialized = useRef(false);
  
  // Add a stable flag that persists across re-renders
  const [initializationComplete, setInitializationComplete] = useState(false);

  const getQuestionTabTitle = (question: Question): string => {
    if (question.framework) {
      return question.framework;
    }
    if (question.category === 'core_language' && question.language) {
      const lang = question.language;
      // Handle "javascript" -> "JavaScript"
      if (lang === 'javascript') return 'JavaScript';
      return lang.charAt(0).toUpperCase() + lang.slice(1);
    }
    if (question.category === 'tech_stack' && question.title) {
      // Heuristic to get the main tech from the title, e.g., "DynamoDB" from "DynamoDB User Manager"
      const titleParts = question.title.split(' ');
      if (titleParts.length > 1 && titleParts[0].toLowerCase() === 'node.js') {
        return 'Node.js';
      }
      return titleParts[0];
    }
    return question.title;
  };

  const activeQuestion = questions.find((q) => q.id === activeQuestionId);
  const selectedLanguage = activeQuestion?.language || language;
  const activeFramework = activeQuestion?.framework;
  const activeContainer = activeQuestionId ? containers[activeQuestionId] : null;
  const activeContainerState = activeQuestionId ? containerState[activeQuestionId] : null;

  // API Configuration
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
  const apiUrl = apiBase.endsWith('/api') ? apiBase : `${apiBase}/api`;

  // Auto-fetch container status for any question that might have one
  useEffect(() => {
    const getContainerStatus = async (problemId: string) => {
      // If we have a container, are loading, or already know it's not found, do nothing.
      if (containers[problemId] || containerState[problemId]?.isLoading || containerState[problemId]?.notFound) {
        return;
      }

      console.log(`🔍 Fetching container status for problem: ${problemId}`);
      setContainerState(prev => ({ ...prev, [problemId]: { isLoading: true, isExecuting: false, error: null, notFound: false } }));
      
      try {
        const url = `${apiUrl}/session-containers/${problemId}`;
        const headers = getAuthHeaders();
        console.log(`🔍 Making request to: ${url}`);
        console.log(`🔍 With headers:`, headers);
        
        const response = await fetch(url, { headers });
        console.log(`🔍 Response status: ${response.status}`);

        if (response.ok) {
          const data = await response.json();
          console.log(`🔍 Response data:`, data);
          if (data.success && data.session) {
            console.log(`✅ Container found for ${problemId}:`, data.session);
            setContainers(prev => ({ ...prev, [problemId]: data.session }));
            setContainerState(prev => ({ ...prev, [problemId]: { isLoading: false, isExecuting: false, error: null, notFound: false } }));
          } else {
            throw new Error(data.error || 'Failed to get container status on OK response');
          }
        } else if (response.status === 404) {
           console.log(`❌ Container for ${problemId} not found (404), not trying again.`);
           setContainerState(prev => ({ ...prev, [problemId]: { isLoading: false, isExecuting: false, error: null, notFound: true } }));
        } else {
          const errorText = await response.text();
          console.error(`❌ Request failed with status ${response.status}: ${errorText}`);
          throw new Error(errorText || `Request failed with status ${response.status}`);
        }
      } catch (error) {
        console.error(`❌ Error fetching container status for ${problemId}:`, error);
        setContainerState(prev => ({ ...prev, [problemId]: { isLoading: false, isExecuting: false, error: (error as Error).message, notFound: false } }));
      }
    };
    
    // Request container status for ANY active question.
    // The backend will determine if a container exists for it.
    if (activeQuestion) {
      getContainerStatus(activeQuestion.id);
    }
  }, [activeQuestion, apiUrl, getAuthHeaders, containers, containerState]);

  const executeInContainer = async (problemId: string, code: string) => {
    setContainerState(prev => ({ ...prev, [problemId]: { ...prev[problemId], isExecuting: true, error: null } }));
    const timestamp = new Date().toLocaleTimeString();
    try {
      const currentQuestion = questions.find(q => q.id === problemId);
      if (!currentQuestion) {
        throw new Error("Active question not found.");
      }

      console.log(`🚀 Executing code for problem: ${problemId}`);
      console.log(`🚀 Available containers:`, containers);
      console.log(`🚀 Container for this problem:`, containers[problemId]);

      // Get the container information for this specific question
      const container = containers[problemId];
      if (!container) {
        console.error(`❌ No container found for problem ${problemId}. Available containers:`, Object.keys(containers));
        throw new Error("Container not found for this question. Please wait for container to be ready.");
      }

      console.log(`🚀 Using container session ID: ${container.sessionId}`);

      const response = await fetch(`${apiUrl}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          sessionId: container.sessionId, // Use the actual session ID from container
          code,
          language: currentQuestion.language,
          framework: currentQuestion.framework || currentQuestion.language,
          questionId: problemId,
        }),
      });

      console.log(`🚀 Execute response status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`❌ Execute request failed:`, errorData);
        throw new Error(errorData.error || "Failed to execute code");
      }
      
      const result = await response.json();
      console.log(`🚀 Execute result:`, result);
      
      if (result.success) {
        // Update the session state, as it might have changed
        if (result.session) {
          setContainers(prev => ({ ...prev, [problemId]: result.session }));
        }

        // Display a clear success message and the actual output
        appendToConsole(`[${timestamp}] Code executed successfully.`);
        if (result.output) {
          appendToConsole(result.output);
        }

        // Only open the preview tab if a web URL is explicitly provided
        if (result.session?.webUrl) {
          addPreviewTab();
        }
      } else {
        // Handle execution errors
        const errorMessage = result.error || result.output || 'Execution failed';
        appendToConsole(`[${timestamp}] Error: ${errorMessage}`);
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error(`❌ Error executing code in container for ${problemId}:`, error);
      appendToConsole(`[${timestamp}] Error: ${(error as Error).message}`);
    } finally {
      setContainerState(prev => ({ ...prev, [problemId]: { ...prev[problemId], isExecuting: false } }));
    }
  };

  const questionMeasureRef = useRef<HTMLSpanElement>(null);
  const [editorMinWidth, setEditorMinWidth] = useState<number>(0);

  // Helper to get the current question line as it appears in the editor
  const getCurrentQuestionLine = () => {
    const question = questions.find((q) => q.id === activeQuestionId);
    if (!question) return "";
    const commentPrefix =
      selectedLanguage === "python"
        ? "# "
        : selectedLanguage === "javascript"
          ? "// "
          : selectedLanguage === "java"
            ? "// "
            : selectedLanguage === "cpp" || selectedLanguage === "csharp"
              ? "// "
              : selectedLanguage === "go"
                ? "// "
                : selectedLanguage === "rust"
                  ? "// "
                  : "# ";
    let problemText = question.description
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
    problemText = problemText.replace(/^#+\s*/, "");
    return `${commentPrefix}${problemText}`;
  };

  // Effect to measure question width and set min-width
  useEffect(() => {
    const updateMinWidth = () => {
      if (questionMeasureRef.current) {
        const width = questionMeasureRef.current.offsetWidth;
        // Add minimal padding and clamp to 70vw max
        const minWidth = Math.min(width + 5, window.innerWidth * 0.65);
        setEditorMinWidth(minWidth);
      }
    };
    updateMinWidth();
    window.addEventListener("resize", updateMinWidth);
    return () => window.removeEventListener("resize", updateMinWidth);
  }, [activeQuestionId, questions, selectedLanguage]);

  // Handle chat panel opening and parameter state updates from Enhanced Chat Panel
  const handleChatMessage = useCallback((message: any) => {
    console.log("📱 LHIS: Handling chat message:", message);
    
    // Add message to messages state
    setMessages((prev) => {
      // Check for duplicates
      const isDuplicate = prev.some((msg) => msg.id === message.id);
      if (isDuplicate) {
        console.log("🚫 LHIS: Duplicate message detected, skipping");
        return prev;
      }
      
      console.log("✅ LHIS: Adding message to messages state");
      return [...prev, message];
    });
    
    // Open chat panel for ALL LHIS messages
    if (message.userId === "lhis") {
      console.log("📱 LHIS: Opening chat panel for LHIS message");
      setShowChat(true);
      
      // Only set parameter-specific state for parameter questions
      if (message.questionContext?.type === "parameter_question") {
        console.log("📱 LHIS: Setting parameter question state");
        setAwaitingParameterAnswer(true);
        setCurrentParameterQuestion(message.questionContext);
      }
    }
  }, []);

  // Handle engagement responses from AI interviewer
  const handleUserEngagementResponse = useCallback(
    (response: string, engagementType?: string) => {
      if (!socket || !user) return;
    
      console.log("🤖 User responded to AI engagement:", {
        response,
        engagementType,
      });
    
    // Send engagement response to backend
      socket.emit("userEngagementResponse", {
      roomId,
      userId: user.id,
      response,
        engagementType: engagementType || "general",
      });
    
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
          type: "user",
      },
        isEngagementResponse: true,
      };
    
      setMessages((prev) => [...prev, responseMessage]);
    
    // Log successful response (no toast notification)
      console.log("✅ Response sent to AI interviewer:", response);
    },
    [socket, roomId, user],
  );

  // Debug language calculation
  useEffect(() => {
    console.log("🎯 Language Calculation Debug:", {
      activeQuestionId,
      activeQuestionLanguage: activeQuestion?.language,
      fallbackLanguage: language,
      finalSelectedLanguage: selectedLanguage,
      allQuestions: questions.map((q) => ({ id: q.id, lang: q.language })),
    });
  }, [activeQuestionId, activeQuestion, language, selectedLanguage, questions]);

  // Initialize language and experience from URL parameters on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const urlLanguage = searchParams.get("language") || "python";
      const urlExperience = searchParams.get("experienceLevel") || "junior";
      const urlJobProfile = searchParams.get("jobProfile") || "";
      
      console.log("🔍 Room Page URL Params Init:", {
        currentURL: window.location.href,
        searchParams: window.location.search,
        parsedLanguage: urlLanguage,
        parsedExperience: urlExperience,
        parsedJobProfile: urlJobProfile,
        hasLanguageParam: searchParams.has("language"),
        hasExperienceParam: searchParams.has("experienceLevel"),
        hasJobProfileParam: searchParams.has("jobProfile"),
      });

      setLanguage(urlLanguage);
      setExperience(urlExperience);
      
      // If job profile is present, initialize assessment system
      if (urlJobProfile) {
        setJobDescription(urlJobProfile);
        setIsParameterAssessment(true);
        console.log(
          "🎯 Assessment mode enabled with job profile:",
          urlJobProfile,
        );
      }
    }
  }, []); // Only run once on mount

  // Load parameter-based session problems
  useEffect(() => {
    const loadParameterProblems = async () => {
      if (!roomId || questionsReady) return;

      try {
        console.log(`🔍 Checking for parameter-based session: ${roomId}`);

        const response = await fetch(`/api/sessions/${roomId}/problems`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            // Don't require auth for this endpoint since it's session-based
          },
        });

        if (response.ok) {
          const result = await response.json();

          if (
            result.success &&
            result.data.isParameterSession &&
            result.data.problems.length > 0
          ) {
            console.log(
              `✅ Found parameter-based session with ${result.data.problems.length} problems`,
            );

            // Format problems for the interface
            const formattedProblems = result.data.problems.map(
              (problem: any) => ({
                id: problem.id,
                title: problem.title,
                description: problem.description,
                language: problem.language,
                category: problem.category,
                framework: problem.framework
              }),
            );

            const initialCode: Record<string, string> = {};
            const initialOutputs: Record<string, string[]> = {};
            formattedProblems.forEach((p: Question) => {
                initialCode[p.id] = code[p.id] || ''; // Preserve existing code
                initialOutputs[p.id] = consoleOutput[p.id] || []; // Preserve existing output
            });
            setCode(prev => ({...prev, ...initialCode}));
            setConsoleOutput(prev => ({...prev, ...initialOutputs}));

            setQuestions(formattedProblems);
            if (!activeQuestionId) {
                setActiveQuestionId(formattedProblems[0].id);
            }
            setQuestionsReady(true);
            setLanguage(result.data.coreLanguage.toLowerCase());
            setIsParameterAssessment(true);

            console.log(
              `✅ Loaded parameter problems:`,
              formattedProblems.map((p: any) => p.title),
            );
            return;
          }
        }

        console.log(
          `📝 No parameter-based session found, continuing with normal flow`,
        );
      } catch (error) {
        console.error(`❌ Error checking for parameter-based session:`, error);
      }
    };

    loadParameterProblems();
  }, [roomId, questionsReady]);

  // Socket effect - Set up all listeners and initialize assessment
  useEffect(() => {
    if (!socket || !user || !roomId) {
      console.log("❌ Socket effect early return:", { 
        hasSocket: !!socket, 
        hasUser: !!user, 
        hasRoomId: !!roomId,
      });
      return;
    }
    
    // Prevent duplicate initialization using both ref and state
    if (initializationCalled.current || initializationComplete) {
      console.log("🚫 Socket effect already called, skipping duplicate");
      return;
    }

    initializationCalled.current = true;
    setInitializationComplete(true);
    console.log("🔌 Socket Effect - Setting up listeners first:", {
      roomId,
      userId: user.id,
    });

    const urlParams = new URLSearchParams(window.location.search);
    const jobProfileParam = urlParams.get("jobProfile");

    // Socket connection listeners with better logging
    socket.on("connect", () => {
      console.log("🟢 Socket connected successfully:", socket.id);
      
      // BULLETPROOF: Trigger LHIS initialization immediately on connection
      if (jobProfileParam && !assessmentInitialized.current) {
        console.log("🎯 LHIS: Initializing assessment immediately...");
        assessmentInitialized.current = true;
        
        // Initialize LHIS with retry logic
        const initializeLHIS = async (retries = 3) => {
          try {
            console.log(`🔄 LHIS: Initialization attempt ${4 - retries}/3`);
            
            socket.emit("initializeAssessment", {
              sessionId: roomId,
              candidateId: user.id,
              jobProfileId: jobProfileParam,
            });
            
            socket.emit("joinAssessmentRoom", {
              sessionId: roomId,
              candidateId: user.id,
              role: "candidate",
            });
            
            console.log("✅ LHIS: Initialization requests sent");
          } catch (error) {
            console.error(`❌ LHIS: Initialization attempt failed:`, error);
            if (retries > 0) {
              console.log(
                `🔄 LHIS: Retrying initialization in 2 seconds... (${retries} retries left)`,
              );
              setTimeout(() => initializeLHIS(retries - 1), 2000);
            } else {
              console.error("❌ LHIS: All initialization attempts failed");
              appendToConsole(
                "❌ LHIS: Failed to initialize assessment after 3 attempts",
              );
            }
          }
        };
        
        // Start initialization immediately if connected, or wait briefly if not
        if (socket.connected) {
          initializeLHIS();
        } else {
          setTimeout(() => {
            if (socket.connected) {
              initializeLHIS();
            } else {
              console.error("❌ Socket still not connected after delay");
            }
          }, 1000);
        }
      }
    });

    socket.on("disconnect", () => {
      console.log("🔴 Socket disconnected");
      // Reset initialization flags for reconnection
      assessmentInitialized.current = false;
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error);
      // Reset flags to allow retry
      assessmentInitialized.current = false;
    });

    // Store language and experience from URL
    setLanguage(language);
    setExperience(experience);

    // Store job profile ID if present
    if (jobProfileParam) {
      console.log(
        "🎯 Living AI Interviewer enabled with job profile:",
        jobProfileParam,
      );
      setJobProfileId(jobProfileParam);
    }

    // Get additional URL parameters for assessment detection
    const jobDescriptionParam = urlParams.get("jobDescription");
    const roleParam = urlParams.get("role");
    
    console.log("🎭 Role Detection:", {
      roleParam,
      jobDescriptionParam: jobDescriptionParam ? "Present" : "None",
      isParameterAssessment: !!jobDescriptionParam,
    });

    // NEW: Living AI Interviewer Assessment System listeners
    if (jobProfileParam) {
      console.log(
        "🎯 Setting up LHIS listeners for job profile:",
        jobProfileParam,
      );
      
      // LHIS Assessment initialized - Handle master problem
      socket.on("assessmentInitialized", (data: any) => {
        console.log("✅ LHIS: Assessment initialized:", data);
        
        // Set assessment state and job profile data
        setAssessmentStatus(data.assessmentState);
        setIsAssessmentMode(true);

        // DISABLED: AI master problem - now using database problems only
        // Skip master problem setup since we're using database problems
        console.log(
          "📋 LHIS: Using database problems instead of AI master problem",
        );
        
        // Add initial message to chat if provided
        if (data.initialMessage) {
          const welcomeMessage = {
            id: `welcome-${Date.now()}`,
            userId: "lhis",
            username: "LHIS",
            message: data.initialMessage,
            content: data.initialMessage,
            timestamp: Date.now(),
            sender: { id: "lhis", name: "LHIS", type: "welcome" },
          };
          setMessages((prev) => [...prev, welcomeMessage]);
          }
      });

      // LHIS Assessment room joined
      socket.on("assessmentRoomJoined", (data: any) => {
        console.log("✅ LHIS: Joined assessment room:", data);
      });

      // LHIS Chat messages - Let Enhanced Chat Panel handle this directly
      // No socket listener here to avoid duplication
      
      // LHIS Assessment errors
      socket.on("assessmentError", (error: any) => {
        console.error("❌ LHIS: Assessment error:", error);
        appendToConsole(`❌ LHIS Error: ${error.error}`);
      });

      // LHIS Answer processing - Handle feedback and next questions
      socket.on("chatMessage", (message: any) => {
        console.log("💬 Room: Received chat message:", message);
        
        // Handle LHIS feedback messages (when answer is processed)
        if (message.sender?.type === "feedback" && awaitingParameterAnswer) {
          console.log(
            "✅ LHIS: Answer feedback received, clearing awaiting state",
          );
          setAwaitingParameterAnswer(false);
          setCurrentParameterQuestion(null);
        }

        // Extend timer by +1 minute whenever a depth question is triggered
        if (message.sender?.type === 'parameter_question') {
          setQuestionTimerEndTimes(prev => {
            const currentEnd = prev[activeQuestionId] || (Date.now() + 10 * 60 * 1000);
            const base = Math.max(currentEnd, Date.now());
            return { ...prev, [activeQuestionId]: base + 60 * 1000 };
          });

          // Track parameter depth progress
          if (message.questionContext?.parameterId !== undefined) {
            const paramId = message.questionContext.parameterId;
            const depth = message.questionContext.depthLevel || 1;
            setParameterDepthProgress(prev => ({ ...prev, [paramId]: Math.max(prev[paramId] || 0, depth) }));
            
            // Map parameter to current tab (assumption: depth questions relate to active tab)
            if (activeQuestionId) {
              setParameterTabMapping(prev => ({ ...prev, [paramId]: activeQuestionId }));
            }
          }
        }

        // Forward the message to Enhanced Chat Panel via handleChatMessage callback
        console.log("📤 Room: Forwarding chat message to Enhanced Chat Panel");
        handleChatMessage(message);
      });
    } else if (jobDescriptionParam) {
      // Only set up 3-parameter assessment listeners if no LHIS
      socket.on("assessmentInitialized", (data: any) => {
        console.log("🚀 Assessment initialized:", data);
        setAssessmentState(data.assessmentState);
      });

      socket.on("assessmentFeedback", (data: any) => {
        console.log("📊 Assessment feedback:", data);
        setAssessmentState(data.assessmentState);
      });

      socket.on("assessmentComplete", (data: any) => {
        console.log("✅ Assessment complete:", data);
        setAssessmentState(data.assessmentState);
      });
    }

    // Join the room after all listeners are set up
    if (!joinRoomCalled.current) {
      console.log("📡 All listeners set up. Now joining room...");
      joinRoomCalled.current = true;
      
      socket.emit("joinRoom", {
        roomName: roomId,
        userId: user.id,
        username: user.firstName || "User",
        language,
        experienceLevel: experience,
        jobDescription: jobDescriptionParam,
        jobProfile: jobProfileParam,
        role: roleParam || "candidate",
      });

      // Also join assessment room for LHIS functionality
      console.log("🔍 About to emit joinAssessmentRoom for:", roomId);
      socket.emit("joinAssessmentRoom", {
        sessionId: roomId,
        candidateId: user.id,
        role: roleParam || "candidate"
      });
      console.log("📡 Also joining assessment room for LHIS:", roomId);
    } else {
      console.log("⚠️  joinRoom already called, skipping duplicate");
    }

    // Socket event listeners
    socket.on("assessmentRoomJoined", (data) => {
      console.log("✅ Assessment room joined successfully:", data);
    });

    // Debug listeners for chat messages (temporary - should be handled by chat panel)
    socket.on("debugMessage", (message) => {
      console.log("🐛 Main Page: Received debugMessage:", message);
    });

    // Listen to only ONE event to prevent duplicates - use newMessage as primary
    socket.on("newMessage", (message) => {
      console.log("📩 Main Page: Received newMessage:", message);
      // Directly add to messages state with strict deduplication
      setMessages((prev) => {
        const exists = prev.some(m => m.id === message.id);
        if (!exists) {
          console.log("✅ Main Page: Adding message to state:", message.id);
          // Auto-open chat panel when new message arrives
          if (!showChat) {
            console.log("🎯 Main Page: Auto-opening chat panel for new message");
            setShowChat(true);
          }
          return [...prev, message];
        } else {
          console.log("⚠️ Main Page: Duplicate message ignored:", message.id);
          return prev;
        }
      });
    });

    socket.on("connect", () => {
      console.log("Socket connected");

      if (!joinRoomCalled.current) {
        socket.emit("joinRoom", {
          roomName: roomId,
          userId: user.id,
          username: user.username,
          role: userRole || "candidate", // Provide a default role
        });
        
        // Also join assessment room for LHIS functionality
        console.log("🔍 Connect: About to emit joinAssessmentRoom for:", roomId);
        socket.emit("joinAssessmentRoom", {
          sessionId: roomId,
          candidateId: user.id,
          role: userRole || "candidate"
        });
        console.log("📡 Connect: Also joining assessment room for LHIS:", roomId);
        
        joinRoomCalled.current = true;
      }
    });

    socket.on(
      "codeChange",
      ({ code: newCode, userId }: { code: string; userId: string }) => {
        if (userId !== user.id) {
          setCode((prev) => ({ ...prev, [activeQuestionId]: newCode }));
        }
      },
    );

    socket.on(
      "languageChange",
      ({
        language: newLanguage,
        userId,
      }: {
        language: string;
        userId: string;
      }) => {
        if (userId !== user.id) {
          setLanguage(newLanguage);
        }
      },
    );

    // Add framework change listener
    socket.on(
      "frameworkChange",
      ({
        framework: newFramework,
        userId,
      }: {
        framework: string;
        userId: string;
      }) => {
        if (userId !== user.id) {
          // This function is likely deprecated by making framework derive from the active question.
          // However, if some other part of the UI calls it, we should ensure it does nothing
          // or finds the relevant question and switches to it.
          // For now, let's find a question with that framework and activate it.
          const questionWithFramework = questions.find(q => q.framework === newFramework);
          if (questionWithFramework) {
            setActiveQuestionId(questionWithFramework.id);
          }
        }
      },
    );

    // Cleanup function
    return () => {
      initializationCalled.current = false;
      assessmentInitialized.current = false;
      socketInitialized.current = false;
      joinRoomCalled.current = false;
      setInitializationComplete(false);
      console.log("🧹 Socket effect cleanup - resetting flags");
      
      // Remove socket event listeners
      socket.off("connect");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.off("joinRoomError");
      socket.off("initialRoomQuestions");
      socket.off("codeUpdate");
      socket.off("chatMessage");
      socket.off("participantJoined");
      socket.off("participantLeft");
      socket.off("codeValidation");
      socket.off("codeBlocked");
      socket.off("frameworkChange");
      
      // LHIS listeners cleanup
      socket.off("assessmentInitialized");
      socket.off("assessmentRoomJoined");
      socket.off("assessmentError");
      socket.off("assessmentFeedback");
      socket.off("assessmentComplete");

      console.log("🧹 Socket cleanup complete");
    };
  }, [roomId, user?.id, socket, questions]); // Add socket back to dependencies for proper reconnection

  // Handle window resize and mouse events for editor resizing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingResize(true);
    isDragging.current = true;
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    
    const containerWidth = window.innerWidth;
    const newWidth = (e.clientX / containerWidth) * 100;
    
    // Constrain between 30% and 80%
    const clampedWidth = Math.max(30, Math.min(80, newWidth));
    setEditorWidth(clampedWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDraggingResize(false);
    isDragging.current = false;
  }, []);

  // Add global mouse event listeners for resize
  useEffect(() => {
    if (isDraggingResize) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDraggingResize, handleMouseMove, handleMouseUp]);

  // Code execution
  const runCode = async () => {
    if (!activeQuestionId || !code[activeQuestionId]?.trim()) return;

    setIsRunning(true);
    
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
    const currentCode = code[activeQuestionId];

    try {
      // Use container execution if a container is available for the active question
      if (activeContainer) {
        console.log("🚀 Executing in container:", activeContainer.sessionId);
        await executeInContainer(activeQuestionId, currentCode);
        setIsRunning(false);
        return;
      }

      // Fallback to Judge0 execution via our backend
      console.log("🚀 Executing with Judge0 (via backend)");

      try {
        const response = await fetch(`${apiUrl}/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders() // Assumes this provides necessary auth headers
            },
            body: JSON.stringify({
                source_code: currentCode,
                language: selectedLanguage,
                stdin: ''
            })
        });

        if (!response.ok) {
            const errorResult = await response.json();
            throw new Error(errorResult.error || `Request failed with status ${response.status}`);
        }

        const resultData = await response.json();
        
        if (resultData.stdout) {
          appendToConsole(`[${timestamp}] ${resultData.stdout}`);
        } else if (resultData.stderr) {
          appendToConsole(`[${timestamp}] Error: ${resultData.stderr}`);
        } else if (resultData.compile_output) {
          appendToConsole(`[${timestamp}] Compile Error: ${resultData.compile_output}`);
        }
        setCodeHasBeenExecuted(true);
        setActiveConsoleTab("output");

      } catch (error) {
        console.error("Execution error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        appendToConsole(`[${timestamp}] Execution failed: ${errorMessage}`);
      } finally {
        setIsRunning(false);
      }
    } catch (error) {
      console.error("Execution error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      appendToConsole(`[${timestamp}] Execution failed: ${errorMessage}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Handle code changes
  const handleCodeChange = (value: string) => {
    // The editor's value is now the pure user code, no comment stripping needed.
    setCode((prevCode) => ({
      ...prevCode,
      [activeQuestionId]: value,
    }));

    // Track code changes in history
    setCodeHistory((prev) =>
      [
        ...prev,
        {
          id: `edit-${Date.now()}`,
          timestamp: Date.now(),
          code: value,
          questionId: activeQuestionId,
          event: "edit",
        },
      ].slice(-50),
    );

    // Emit code change via socket
    if (socket) {
      socket.emit("codeChange", {
        roomName: roomId,
        code: value,
        questionId: activeQuestionId,
        userId: user?.id,
        language: selectedLanguage,
      });
      
      // LHIS Integration: Always emit assessment code change if code is substantial
      if (value.trim().length >= 200) {
        socket.emit('assessmentCodeChange', {
          sessionId: roomId,
          questionId: activeQuestionId,
          code: value,
          language: selectedLanguage
        });
        console.log(`📝 LHIS: Assessment code change emitted (${value.length} chars)`);
      }
    }
  };

  const clearConsole = () => {
    if (activeQuestionId) {
      setConsoleOutput(prev => ({
        ...prev,
        [activeQuestionId]: []
      }));
    }
  };

  const appendToConsole = (text: string, qId?: string) => {
    const targetId = qId || activeQuestionId;
    if (targetId) {
      setConsoleOutput(prev => ({
        ...prev,
        [targetId]: [...(prev[targetId] || []), text],
      }));
    }
  };

  // Console tab management functions
  const addPreviewTab = () => {
    if (!availableConsoleTabs.includes("preview")) {
      setAvailableConsoleTabs(prev => [...prev, "preview"]);
    }
    setActiveConsoleTab("preview");
  };

  const removePreviewTab = () => {
    setAvailableConsoleTabs(prev => prev.filter(tab => tab !== "preview"));
    if (activeConsoleTab === "preview") {
      setActiveConsoleTab("output");
    }
  };

  const switchToConsoleTab = (tabName: string) => {
    if (availableConsoleTabs.includes(tabName)) {
      setActiveConsoleTab(tabName);
    }
  };

  const handleCursorPositionChange = (line: number, col: number) => {
    setCursorPosition({ line, col });
  };

  const handleGoToLine = (lineNumber: number) => {
    // This would be implemented in the CodeMirror editor
    setShowGoToLine(false);
  };

  const handleTabSizeChange = (newTabSize: number) => {
    setTabSize(newTabSize);
    setShowSpacesMenu(false);
  };

  // Generate code with problem comments inline
  const getCodeWithProblemComments = (questionId: string) => {
    // This function no longer injects comments. It just returns the user's code.
    return code[questionId] || "";
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/auth");
      return;
    }
  }, [user, router]);

  // Handle loading completion
  const handleLoadingComplete = () => {
    setIsLoading(false);
  };

  // Auto-complete loading if questions are ready
  useEffect(() => {
    if (questionsReady && isLoading) {
      // Add a small delay to ensure user sees the completion
      console.log("Questions are ready, completing loading...");
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [questionsReady, isLoading]);

  // Add a timeout to force loading completion if AI takes too long
  useEffect(() => {
    const forceCompleteTimer = setTimeout(() => {
      if (isLoading) {
        console.log("Force completing loading due to timeout...");
        setIsLoading(false);
      }
    }, 15000); // 15 seconds timeout

    return () => clearTimeout(forceCompleteTimer);
  }, [isLoading]);

  // Debug: Log current state
  useEffect(() => {
    console.log("Current state:", { 
      isLoading, 
      questionsReady, 
      questionsLength: questions.length,
      activeQuestionId,
      hasUser: !!user,
    });
  }, [isLoading, questionsReady, questions.length, activeQuestionId, user]);

  // Fallback: Direct master problem loading if socket initialization fails
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const jobProfileParam = urlParams.get("jobProfile");
    
    if (jobProfileParam && !questionsReady && !isLoading) {
      console.log("🔄 Fallback: Attempting direct master problem load...");
      
      // Try to load master problem directly via API
      const timer = setTimeout(async () => {
        try {
          const response = await fetch(`/api/job-profiles/${jobProfileParam}`);
          if (response.ok) {
            const jobProfile = await response.json();
            
            if (jobProfile.master_problem) {
              console.log("✅ Fallback: Master problem loaded directly");
              
              const masterProblem =
                typeof jobProfile.master_problem === "object"
                ? jobProfile.master_problem.description 
                  : jobProfile.master_problem;
              
              const masterQuestion = {
                id: "master-problem",
                title: "Problem",
                description: masterProblem,
                language: selectedLanguage,
              };

              setQuestions([masterQuestion]);
              setActiveQuestionId("master-problem");
              setQuestionsReady(true);
              setIsAssessmentMode(true);

              console.log("✅ Fallback: Master problem set successfully");
            }
          }
        } catch (error) {
          console.error("❌ Fallback: Failed to load master problem:", error);
        }
      }, 3000); // Wait 3 seconds before fallback
      
      return () => clearTimeout(timer);
    }
  }, [jobProfileId, questionsReady, isLoading, selectedLanguage]);

  // Effect to disable page scrolling when the room is active
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  const [gotoLineOpen, setGotoLineOpen] = useState(false);
  const [spacesOpen, setSpacesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [codeHasBeenExecuted, setCodeHasBeenExecuted] = useState(false);
  const [questionTextWidth, setQuestionTextWidth] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showClearConsole, setShowClearConsole] = useState(false);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'dark' : 'light');
  };

  const handleLeaveRoom = () => {
    router.push('/dashboard');
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  // Render Interviewer Dashboard for interviewers
  if (userRole === "interviewer") {
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
        <div className={cn(isLoading ? "hidden" : "block h-screen", "room-interface")}>
          <InterviewerDashboard
            roomId={roomId}
            socket={socket}
            assessmentState={assessmentState}
            candidateInfo={{
              name:
                participants.find((p) => p.role === "candidate")?.username ||
                "Candidate",
              language: language,
              experienceLevel: experience,
            }}
          />
      </div>
      </>
    );
  }

    return (
    <>
      {/* Square corners override */}
      <style jsx global>{`
        .room-interface *,
        .room-interface .rounded,
        .room-interface .rounded-sm,
        .room-interface .rounded-md,
        .room-interface .rounded-lg,
        .room-interface .rounded-xl,
        .room-interface .rounded-2xl,
        .room-interface .rounded-3xl,
        .room-interface .rounded-full {
          border-radius: 0 !important;
        }
        
        /* Keep some essential functional rounded elements */
        .room-interface .animate-spin,
        .room-interface [class*="animate-pulse"] .rounded-full {
          border-radius: 50% !important;
        }

        /* Custom dashed line */
        .hr-big-dash {
          border: none;
          border-top: 1px dashed;
          height: 1px;
        }

        /* Custom color variables */
        :root {
          --tab-bar-color: #F5F6F6;
          --selected-tab-color: #FCFCFC;
          --page-background: #EBECED;
          --orange-highlight: #FF6B35;
        }

        /* Selected tab orange border styling */
        .selected-tab-orange {
          border-left: 2px solid var(--orange-highlight) !important;
          border-right: 2px solid var(--orange-highlight) !important;
          border-top: 2px solid var(--orange-highlight) !important;
          border-bottom: none !important;
        }

        /* Single tab styling - no orange borders when only one tab */
        .single-tab {
          border: none !important;
        }

        /* Tab bar separation from content */
        .tab-bar-separation {
          border-bottom: 1px solid #ddd;
          margin-bottom: 1px;
        }

        /* Enhanced resize handle feedback - Final */
        .resize-handle {
          position: relative;
        }

        .resize-handle-dots .dot {
          background-color: #d1d5db; /* gray-300 */
          transition: all 0.15s ease-in-out;
          opacity: 0.8;
          width: 2px;
          height: 4px;
        }

        /* On hover, just light up the dots */
        .resize-handle:hover .resize-handle-dots .dot {
          background-color: var(--orange-highlight);
          opacity: 1;
        }

        /* On drag, show a faded vertical line and hide the dots */
        .resize-handle.dragging {
           background: linear-gradient(to bottom, 
            transparent, 
            rgba(255, 107, 53, 0.6) 15%, 
            rgba(255, 107, 53, 0.6) 85%, 
            transparent
          ) !important;
        }
        .resize-handle.dragging .resize-handle-dots {
          opacity: 0;
        }
        .editor-toolbar-btn {
          height: 100% !important;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 12px;
          background: none;
          border: none;
          outline: none;
          font-size: 1em;
          transition: background 0.15s;
          border-radius: 0 !important;
        }
        .editor-toolbar-btn:hover, .editor-toolbar-btn.active {
          background: #E5E7EB !important;
          color: #222;
        }
        .editor-toolbar-btn svg {
          margin-right: 4px;
        }
        .editor-toolbar-btn:focus {
          background: #E5E7EB !important;
        }
        .run-button {
          height: 100% !important;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 12px;
          border: none;
          outline: none;
          font-size: 1em;
          transition: all 0.15s;
          border-radius: 0 !important;
        }
        .run-button svg {
          margin-right: 4px;
        }

        /* Force remove CodeMirror gutter/line number separator */
        .cm-gutters, .cm-gutters * , .cm-lineNumbers, .cm-gutter {
          border-right: none !important;
          box-shadow: none !important;
        }
      `}</style>

      {/* Quantum Loading Screen */}
      <QuantumLoading
        isVisible={isLoading}
        onComplete={handleLoadingComplete}
        loadingText="Initializing Quantum AI Engine"
        subText={`Generating ${language} interview questions for ${experience} level...`}
      />

      {/* Main Application */}
      <div className={cn(isLoading ? "hidden" : "block h-screen overflow-hidden", "room-interface")}>
        <div className="h-full flex flex-col" style={{ backgroundColor: '#EBECED' }}>
          {/* Header */}
          <div className="h-12 border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0" style={{ backgroundColor: '#EBECED' }}>
            <div className="flex items-center gap-4">
              <h1 className="text-sm font-semibold">
                <span className="text-gray-900">over</span>
                <span className="text-orange-500 font-bold">Forge</span>{" "}
                Platform
              </h1>
              <Timer startTime={sessionStartTime} countdownUntil={activeCountdownUntil} onExpire={handleActiveTimerExpire} />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowVideoCall(!showVideoCall)}
                className={cn(
                  "transition-colors",
                  showVideoCall
                    ? "bg-blue-100 text-blue-700 border-blue-300"
                    : "",
                )}
              >
                <Video className="w-4 h-4 mr-1" />
                Video
              </Button>
              <Button
                variant={showChat ? "default" : "outline"}
                size="sm"
                onClick={() => setShowChat(!showChat)}
              >
                <MessageSquare className="w-4 h-4 mr-1" />
                Chat
              </Button>
              <Button
                variant={activeConsoleTab === "preview" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (activeContainer && activeFramework) {
                    addPreviewTab();
                  }
                }}
                disabled={!activeContainer}
                title={
                  !activeContainer
                    ? "Select a framework to enable web preview"
                    : "Open web preview in new tab"
                }
              >
                <Globe className="w-4 h-4 mr-1" />
                Preview
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={toggleTheme}>
                    {theme === 'light' ? (
                      <>
                        <Moon className="w-4 h-4 mr-2" />
                        Dark Mode
                      </>
                    ) : (
                      <>
                        <Sun className="w-4 h-4 mr-2" />
                        Light Mode
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLeaveRoom}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Leave Room
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Main Content Area - Full Height */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Main Content */}
            <div className="flex-1 flex">
              {/* Editor Panel - Card Style */}
              <div
                className="shadow-sm flex flex-col"
                style={{ width: `${editorWidth}%`, backgroundColor: '#FCFCFC' }}
              >
                {/* Editor Tabs - Replit Style */}
                <div style={{ backgroundColor: '#F5F6F6' }} className="">
                  <div className="flex items-center justify-between h-8">
                    <div className="flex items-center">
                      {questions.map((question, index) => (
                        <button
                          key={question.id}
                          onClick={() => setActiveQuestionId(question.id)}
                          className={cn(
                            "px-4 py-1 text-sm font-medium transition-all duration-75 relative h-8 flex items-center",
                            questions.length > 1 && index < questions.length - 1 && "border-r border-gray-300",
                            activeQuestionId === question.id
                              ? "text-gray-900 selected-tab-orange"
                              : "text-gray-600 hover:text-gray-900 hover:bg-white hover:bg-opacity-50",
                          )}
                           style={
                             activeQuestionId === question.id
                               ? { backgroundColor: '#FCFCFC' }
                               : { backgroundColor: '#F5F6F6' }
                           }
                        >
                          <LanguageIcon language={question.language} className="w-4 h-4 mr-2" />
                          <span>{getQuestionTabTitle(question)}</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-stretch gap-0 h-full">
                      <button
                        ref={searchRef}
                        onClick={() => setShowSearch(!showSearch)}
                        className="editor-toolbar-btn h-full"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                      <button
                        onClick={
                          isRunning ? () => setIsRunning(false) : runCode
                        }
                        className={cn(
                          "run-button h-full",
                          isRunning ? "bg-red-100 text-red-600" : "bg-green-600 hover:bg-green-700 text-white"
                        )}
                      >
                        {isRunning ? (
                          <>
                            <div className="w-2 h-2 bg-red-500 mr-2 animate-pulse rounded-full"></div>
                            <span className="text-red-500">Stop</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-1" />
                            <span>Run</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Validation Warnings */}
                {activeQuestionId &&
                  validationResults[activeQuestionId] &&
                  showValidationWarnings[activeQuestionId] && (
                  <div className="border-b px-4 py-2" style={{ backgroundColor: '#FCFCFC' }}>
                    <CodeValidationWarnings 
                      validation={validationResults[activeQuestionId]}
                      compact={true}
                      onDismiss={() => {
                          setShowValidationWarnings((prev) => ({
                          ...prev,
                            [activeQuestionId]: false,
                          }));
                      }}
                    />
        </div>
                )}

                {/* Code Editor Section */}
                <div className="flex-1 overflow-hidden relative flex flex-col">
                  {/* New Read-Only Question Panel */}
                  {(() => {
                    const activeQuestion = questions.find(q => q.id === activeQuestionId);
                    if (!activeQuestion) return null;
                    const questionText = activeQuestion.description
                      .replace(/<[^>]*>/g, "")
                      .replace(/^#+\s*/, "")
                      .trim();
                    return (
                      <div className="p-3 bg-white border-b border-[#F2F3F4] text-sm">
                        <p className="font-mono whitespace-pre-wrap text-gray-800">{questionText}</p>
                      </div>
                    );
                  })()}

                  {/* Editor takes remaining space */}
                  <div className="flex-1 overflow-hidden relative">
                    <EnhancedCodeMirrorEditor
                      key={activeQuestionId}
                      value={getCodeWithProblemComments(activeQuestionId)}
                      onCodeChangeAction={handleCodeChange}
                      language={selectedLanguage}
                      searchQuery={searchQuery}
                      tabSize={tabSize}
                      onCursorPositionChangeAction={handleCursorPositionChange}
                      onExecuteAction={runCode}
                    />
                  </div>
                </div>

                {/* Bottom Toolbar - Replit Style */}
                <div className="h-7 border-t border-[#F2F3F4] flex items-center pl-3 text-xs text-gray-600 flex-shrink-0 relative" style={{ backgroundColor: 'white' }}>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <LanguageIcon
                        language={selectedLanguage}
                        className="w-3 h-3"
                      />
                      <span>
                        {selectedLanguage.charAt(0).toUpperCase() +
                          selectedLanguage.slice(1)}
                      </span>
                    </span>
                  </div>

                  <div className="absolute right-0 top-0 bottom-0 flex items-stretch">
                    <button
                      ref={lineColRef}
                      className={cn(
                        "editor-toolbar-btn h-full",
                        showGoToLine && "active"
                      )}
                      onClick={() => {
                        setShowSpacesMenu(false);
                        setShowHistoryMap(false);
                        setShowGoToLine(!showGoToLine);
                      }}
                    >
                      Ln {cursorPosition.line}, Col {cursorPosition.col}
                    </button>
                    <button
                      ref={spacesRef}
                      className={cn(
                        "editor-toolbar-btn h-full",
                        showSpacesMenu && "active"
                      )}
                      onClick={() => {
                        setShowGoToLine(false);
                        setShowHistoryMap(false);
                        setShowSpacesMenu(!showSpacesMenu);
                      }}
                    >
                      Spaces: {tabSize}
                    </button>
                    <button
                      ref={historyRef}
                      className={cn(
                        "editor-toolbar-btn h-full flex items-center",
                        showHistoryMap && "active"
                      )}
                      onClick={() => {
                        setShowGoToLine(false);
                        setShowSpacesMenu(false);
                        setShowHistoryMap(!showHistoryMap);
                      }}
                    >
                      <History className="w-4 h-4 mr-1" />
                      History
                    </button>
                  </div>
                </div>
              </div>

              {/* Resize Handle - Dots Highlight */}
              <div
                ref={resizeRef}
                className={cn(
                  "w-1 cursor-col-resize flex-shrink-0 resize-handle flex items-center justify-center",
                  isDraggingResize && "dragging"
                )}
                onMouseDown={handleMouseDown}
              >
                <div className="h-full flex flex-col justify-center items-center space-y-1 resize-handle-dots">
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                </div>
              </div>

              {/* Right-side Container (Console + Chat) */}
              <div
                className="shadow-sm flex flex-row"
                style={{ width: `${100 - editorWidth}%` }}
              >
                {/* Console Panel (shrinks when chat is open) */}
                <div 
                  className="flex flex-col h-full transition-all duration-200"
                  style={{ width: showChat ? '50%' : '100%', backgroundColor: '#FCFCFC' }}
                >
                  {/* Console Tabs - Replit Style */}
                  <div style={{ backgroundColor: '#F5F6F6' }} className="">
                    <div className="flex items-center justify-between h-8">
                      <div className="flex items-center">
                        {/* Render tabs based on availableConsoleTabs */}
                        {availableConsoleTabs.map((tabName, index) => (
                          <div
                            key={tabName}
                            className={cn(
                              "px-4 py-1 text-sm font-medium transition-all h-8 flex items-center justify-between",
                              availableConsoleTabs.length > 1 && index < availableConsoleTabs.length - 1 && "border-r border-gray-300",
                              activeConsoleTab === tabName
                                ? availableConsoleTabs.length === 1 
                                  ? "text-gray-900 single-tab" 
                                  : "text-gray-900 selected-tab-orange"
                                : "text-gray-600 hover:text-gray-900 hover:bg-white hover:bg-opacity-50",
                            )}
                            style={
                              activeConsoleTab === tabName
                                ? { backgroundColor: '#FCFCFC' }
                                : { backgroundColor: '#F5F6F6' }
                            }
                          >
                            <span
                              onClick={() => switchToConsoleTab(tabName)}
                              className="cursor-pointer flex items-center mr-2"
                            >
                              {tabName === "output" ? (
                                <>
                                  <span className="font-mono font-bold mr-2 text-gray-500">{'>_'}</span>
                                  <span>Console</span>
                                </>
                              ) : (
                                <>
                                  <Monitor className="w-4 h-4 mr-2" />
                                  <span>Preview</span>
                                </>
                              )}
                            </span>
                            {tabName === "preview" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removePreviewTab();
                                }}
                                className="hover:bg-gray-300 hover:bg-opacity-50 p-0.5 transition-colors rounded-sm"
                                title="Close Preview"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                        <div className="flex-1 h-8" style={{ backgroundColor: '#F5F6F6' }} />
                      </div>
                      <div className="flex items-stretch h-full gap-2 px-3 text-xs text-gray-600">
                        <button
                          onClick={() => {
                            setShowGoToLine(false);
                            setShowSpacesMenu(false);
                            setShowHistoryMap(false);
                            setShowSearch(false);
                            setShowClearConsole((prev) => !prev);
                            clearConsole();
                          }}
                          className={cn(
                            "editor-toolbar-btn h-full flex items-center",
                            showClearConsole && "active"
                          )}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Tab Content */}
                  <div className="flex-1 overflow-hidden">
                    {activeConsoleTab === "output" ? (
                      /* Output Panel */
                      <ScrollArea className="h-full p-4">
                        <div className="space-y-1 font-mono text-sm">
                          <AssessmentStatus
                            assessmentStatus={assessmentStatus}
                            isAssessmentMode={isAssessmentMode}
                            awaitingParameterAnswer={awaitingParameterAnswer}
                            currentParameterQuestion={currentParameterQuestion}
                          />
                          {consoleOutput[activeQuestionId]?.length === 0 ? (
                            <p className="text-gray-500">
                              Results of your code will appear here when you run
                            </p>
                          ) : (
                            consoleOutput[activeQuestionId]?.map((line, index) => (
                              <div
                                key={index}
                                className={cn(
                                  line.startsWith(">") ? "text-blue-600" :
                                  line.startsWith("✓") ? "text-green-600" :
                                  line.startsWith("✗") ? "text-red-600" : "text-gray-800",
                                )}
                              >
                                {line}
                              </div>
                            ))
                          )}
                          {activeContainer && (
                            <>
                              <div className="mt-4 mb-2 text-xs text-gray-500 font-mono">
                                <span>Framework: {activeFramework}</span>
                                <span className="mx-2">|</span>
                                <span>Status: <span className="text-green-600">Running</span></span>
                                <span className="mx-2">|</span>
                                <span>Port: {activeContainer.port || 'N/A'}</span>
                              </div>
                              <hr className="hr-big-dash text-gray-300 mb-3 w-48" />
                            </>
                          )}
                        </div>
                      </ScrollArea>
                    ) : (
                      /* Preview Panel */
                      <div className="h-full flex flex-col">
                        <div className="border-b px-4 py-2 flex items-center justify-between" style={{ backgroundColor: '#F5F6F6' }}>
                          <div className="text-xs text-gray-600">
                            {activeContainer ? `http://localhost:${activeContainer.port || 8000}` : 'Container starting...'}
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => window.open(`http://localhost:${activeContainer?.port || 8000}`, '_blank')}
                              className="text-xs px-2 py-1 bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                              disabled={!activeContainer}
                            >
                              Open in New Tab
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 bg-white">
                          {activeContainer ? (
                            <iframe
                              src={`http://localhost:${activeContainer.port || 8000}`}
                              className="w-full h-full border-none"
                              title="Application Preview"
                            />
                          ) : (
                            <div className="h-full flex items-center justify-center text-gray-500">
                              <div className="text-center">
                                <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Container not ready</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Chat Panel (conditionally rendered on the right) */}
                {showChat && (
                  <div className="h-full flex flex-col border-l border-gray-200" style={{ width: '50%' }} data-chat-panel>
                    <div className="bg-white h-full flex flex-col">
                      <EnhancedChatPanel
                        roomId={roomId}
                        socket={socket}
                        onClose={() => setShowChat(false)}
                        isResizable={false}
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

          {/* History Mini-Map */}
          {showHistoryMap && historyRef.current && (
            <HistoryMiniMap
              anchorEl={historyRef.current}
              onCloseAction={() => setShowHistoryMap(false)}
              history={codeHistory}
              currentQuestionId={activeQuestionId}
            />
          )}

          {/* Video Call Panel */}
          {showVideoCall && (
            <div className="fixed bottom-6 right-6 z-50">
              <div className="bg-gray-900 rounded-lg overflow-hidden shadow-2xl border border-gray-700" style={{ width: '300px' }}>
                {/* Minimal header */}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-800">
                  <span className="text-white text-sm font-medium">Video Call</span>
                  <button
                    onClick={() => setShowVideoCall(false)}
                    className="text-gray-400 hover:text-white p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Video stack - vertical layout */}
                <div className="p-2 space-y-2">
                  {/* You */}
                  <div className="relative bg-gray-800 rounded overflow-hidden" style={{ height: '120px' }}>
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                      <Video className="w-8 h-8" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-sm px-2 py-1">
                      You
                    </div>
                  </div>
                  
                  {/* Other participant */}
                  <div className="relative bg-gray-800 rounded overflow-hidden" style={{ height: '120px' }}>
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                      <Video className="w-8 h-8" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-sm px-2 py-1 truncate">
                      {participants.find(p => p.role !== 'candidate')?.username || 'Interviewer'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Next parameter confirmation dialog with 1-minute auto-switch countdown */}
      <AlertDialog open={showNextTabDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Time is up for this parameter</AlertDialogTitle>
            <AlertDialogDescription>
              Switch to the next parameter now or we\'ll switch automatically in {formatCountdown(nextTabRemainingMs)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleNextTabStay}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={handleNextTabSwitchNow}>Switch now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Completion dialog after the last parameter timer ends */}
      <AlertDialog open={showCompletionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assessment complete</AlertDialogTitle>
            <AlertDialogDescription>
              You have completed all parameter timers. Would you like to exit?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCompletionDialog(false)}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => router.push('/dashboard')}>Exit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
