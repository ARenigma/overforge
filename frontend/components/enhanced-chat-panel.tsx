"use client"

import React, { useState, useRef, useCallback, useEffect } from "react"
import { Send, X, MessageSquare, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuth } from "@/hooks/useAuth"
import { Badge } from "@/components/ui/badge"

interface ChatMessage {
  id: string
  userId: string
  username: string
  message: string
  content?: string
  timestamp: string | number
  sender?: {
    id: string
    name: string
    type: string
  }
  questionContext?: any
  questionLabel?: string  // Question source label
  isCounterQuestion?: boolean
  targetQuestionId?: string
  threadingStatus?: string
}

interface Message {
  id: string
  userId: string
  username: string
  content: string
  message?: string  // Alternative content field
  timestamp: string | number
  questionContext?: {
    type: string
    parameterId?: string
    parameterName?: string
    depthLevel?: number
    badge?: string
    shouldPersist?: boolean
  }
  questionLabel?: string  // Question source label
  sender?: {
    id: string
    name: string
    type: string
  }
  isCounterQuestion?: boolean
  targetQuestionId?: string
  threadingStatus?: string
}

interface EnhancedChatPanelProps {
  roomId: string
  socket?: any
  onClose?: () => void
  isResizable?: boolean
  awaitingParameterAnswer?: boolean
  currentParameterQuestion?: any
  isAssessmentMode?: boolean
  externalMessages?: ChatMessage[]
  onChatMessage?: (message: any) => void
}

export function EnhancedChatPanel({ roomId, socket, onClose, isResizable = false, awaitingParameterAnswer, currentParameterQuestion, isAssessmentMode, externalMessages, onChatMessage }: EnhancedChatPanelProps) {
  // Convert ChatMessage to Message format
  const convertedMessages: Message[] = (externalMessages || []).map(msg => ({
    id: msg.id,
    userId: msg.userId,
    username: msg.username,
    content: msg.message || msg.content || "",
    timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString(),
    isCounterQuestion: msg.isCounterQuestion,
    targetQuestionId: msg.targetQuestionId,
    questionContext: msg.questionContext,
    questionLabel: msg.questionLabel,  // Include question source label
    threadingStatus: msg.threadingStatus, // Include threading status
    sender: msg.sender
  }))
  
  const [messages, setMessages] = useState<Message[]>(convertedMessages)
  const [newMessage, setNewMessage] = useState("")
  const [width, setWidth] = useState(288) // 72 * 4 = 288px (w-72)
  const [isResizing, setIsResizing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [lhisStatus, setLhisStatus] = useState<'active' | 'error' | 'offline'>('active') // LHIS status tracking
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { user, token } = useAuth()

  // Debug effect to log messages state changes
  useEffect(() => {
    console.log("🔍 Enhanced Chat Panel: Messages state updated, count:", messages.length);
    console.log("🔍 Enhanced Chat Panel: Current messages:", messages);
  }, [messages])

  const resizeRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Auto-resize textarea based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px` // Max height of 120px
    }
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Adjust textarea height when message changes
  useEffect(() => {
    adjustTextareaHeight()
  }, [newMessage, adjustTextareaHeight])

  // Monitor LHIS status based on socket connection and AI responses
  useEffect(() => {
    if (socket) {
      // Set status to active when socket is connected
      setLhisStatus('active')
      
      // Listen for LHIS-specific events to update status
      socket.on('connect', () => setLhisStatus('active'))
      socket.on('disconnect', () => setLhisStatus('offline'))
      socket.on('assessmentError', () => setLhisStatus('error'))
      socket.on('aiServiceError', () => setLhisStatus('error'))
      
      // Monitor for successful LHIS responses to reset error status
      socket.on('chatMessage', (message: any) => {
        if (message.questionLabel && message.questionLabel.includes('LHIS')) {
          setLhisStatus('active')
        }
      })
      
      return () => {
        socket.off('connect')
        socket.off('disconnect')
        socket.off('assessmentError')
        socket.off('aiServiceError')
      }
    } else {
      setLhisStatus('offline')
    }
  }, [socket])

  // Listen for socket messages
  useEffect(() => {
    console.log("🔧 Enhanced Chat Panel: useEffect triggered. Socket:", !!socket, "RoomId:", roomId);
    if (socket) {
      console.log("🔧 Enhanced Chat Panel: Setting up socket listeners for roomId:", roomId)
      console.log("🔧 Enhanced Chat Panel: Socket connected:", socket.connected);
      
      // Socket listeners removed - messages now handled via externalMessages prop to prevent duplicates
      console.log("ℹ️ Enhanced Chat Panel: Socket listeners disabled - using externalMessages prop for cost optimization");

      // Chat messages are now handled via externalMessages prop from room page
      // to avoid conflicts with room page socket listeners

      // Listen for disconnect event
      socket.on("disconnect", () => {
        console.log("🔌 Enhanced Chat Panel: Socket disconnected")
      })

      // Listen for error events  
      socket.on("error", (error: any) => {
        console.error("❌ Enhanced Chat Panel: Socket error:", error)
      })

      // Cleanup (minimal since most listeners are disabled)
      return () => {
        console.log("🧹 Enhanced Chat Panel: Cleaning up socket listeners");
        socket.off("disconnect")
        socket.off("error")
      }
    }
  }, [socket, roomId])

  // Load chat history from localStorage on component mount
  useEffect(() => {
    const loadChatHistory = () => {
      try {
        const historyKey = `chat-${roomId}-history`;
        const persistedMessages = localStorage.getItem(historyKey);
        
        if (persistedMessages) {
          const parsed = JSON.parse(persistedMessages);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log(`💾 Enhanced Chat Panel: Loaded ${parsed.length} messages from localStorage`);
            setMessages(prev => {
              // Merge with existing messages, avoiding duplicates
              const combined = [...prev];
              parsed.forEach((loadedMsg: Message) => {
                const isDuplicate = combined.some(msg => msg.id === loadedMsg.id);
                if (!isDuplicate) {
                  combined.push(loadedMsg);
                }
              });
              return combined.sort((a, b) => 
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
              );
            });
          }
        }
        
        // Also load persisted counter questions
        const counterKey = `chat-${roomId}-counter-questions`;
        const persistedCounterQuestions = localStorage.getItem(counterKey);
        if (persistedCounterQuestions) {
          const parsed = JSON.parse(persistedCounterQuestions);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log(`🤖 Enhanced Chat Panel: Loaded ${parsed.length} counter questions from localStorage`);
            setMessages(prev => {
              const combined = [...prev];
              parsed.forEach((loadedMsg: Message) => {
                const isDuplicate = combined.some(msg => msg.id === loadedMsg.id);
                if (!isDuplicate) {
                  combined.push(loadedMsg);
                }
              });
              return combined.sort((a, b) => 
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
              );
            });
          }
        }
      } catch (error) {
        console.error("❌ Enhanced Chat Panel: Error loading chat history:", error);
      }
    };

    if (roomId) {
      loadChatHistory();
    }
  }, [roomId]);

  // Save messages to localStorage when they change
  useEffect(() => {
    if (roomId && messages.length > 0) {
      try {
        const historyKey = `chat-${roomId}-history`;
        // Only store non-counter-question messages in regular history
        const regularMessages = messages.filter(msg => !msg.questionContext?.shouldPersist);
        localStorage.setItem(historyKey, JSON.stringify(regularMessages.slice(-50))); // Keep last 50 messages
      } catch (error) {
        console.error("❌ Enhanced Chat Panel: Error saving chat history:", error);
      }
    }
  }, [messages, roomId]);

  // Update messages when externalMessages changes
  useEffect(() => {
    console.log("🔄 Enhanced Chat Panel: externalMessages changed, count:", (externalMessages || []).length);
    console.log("🔄 Enhanced Chat Panel: externalMessages:", externalMessages);
    
    const converted = (externalMessages || []).map(msg => ({
      id: msg.id,
      userId: msg.userId,
      username: msg.username,
      content: msg.message || msg.content || "",
      timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString(),
      isCounterQuestion: msg.isCounterQuestion,
      targetQuestionId: msg.targetQuestionId,
      questionContext: msg.questionContext,
      questionLabel: msg.questionLabel,
      threadingStatus: msg.threadingStatus
    }))
    
    console.log("🔄 Enhanced Chat Panel: Setting converted messages, count:", converted.length);
    setMessages(converted)
  }, [externalMessages])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const sendMessage = async () => {
    if (!newMessage.trim() || isLoading || !socket || !user) return

    setIsLoading(true)
    
    try {
      // Create the user message object
      const userMessage: Message = {
        id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId: user.id,
        username: user.username || user.firstName || 'You',
        content: newMessage.trim(),
        timestamp: new Date().toISOString(),
        sender: {
          id: user.id,
          name: user.username || user.firstName || 'You',
          type: 'user'
        },
        threadingStatus: 'active'
      }

      // Add user message to chat immediately for better UX
      console.log("💬 Enhanced Chat Panel: Adding user message to chat:", userMessage)
      
      // Emit message through socket
      if (isAssessmentMode && awaitingParameterAnswer && currentParameterQuestion) {
        // Send as parameter answer
        socket.emit("submitParameterAnswer", {
          sessionId: roomId,
          answer: newMessage.trim(),
          parameterId: currentParameterQuestion.parameterId,
          depthLevel: currentParameterQuestion.depthLevel,
          questionId: currentParameterQuestion.questionId
        })
        
        // Add the user's answer to the chat (with the same message structure)
        if (onChatMessage) {
          onChatMessage(userMessage)
        }
      } else {
        // Send as regular chat message
        socket.emit("chatMessage", {
          roomName: roomId,
          message: newMessage.trim(),
          userId: user.id.toString(),
          username: user.username,
        })
        
        // Add to chat via onChatMessage callback
        if (onChatMessage) {
          onChatMessage(userMessage)
        }
      }

      // Clear input
      setNewMessage("")
    } catch (error) {
      console.error("Error sending message:", error)
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : "Failed to send message. Please try again."
      console.error("Chat Error:", errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  // Resize handle function for resizable chat panel
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)

    const startX = e.clientX
    const startWidth = width

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startX - e.clientX // Reversed for left resizing
      const newWidth = Math.min(Math.max(startWidth + deltaX, 200), 800) // Min 200px, Max 800px
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [width])

  // LHIS Status Indicator Component
  const LHISStatusDot = () => {
    const getStatusColor = () => {
      switch (lhisStatus) {
        case 'active':
          return 'bg-orange-500'
        case 'error':
          return 'bg-red-500'
        case 'offline':
          return 'bg-gray-400'
        default:
          return 'bg-gray-400'
      }
    }

    const getStatusTitle = () => {
      switch (lhisStatus) {
        case 'active':
          return 'LHIS AI System Active'
        case 'error':
          return 'LHIS AI System Error'
        case 'offline':
          return 'LHIS AI System Offline'
        default:
          return 'LHIS AI System Status Unknown'
      }
    }

    return (
      <div 
        className="flex items-center gap-1" 
        title={getStatusTitle()}
      >
        <div 
          className={`w-2 h-2 rounded-full ${getStatusColor()} ${
            lhisStatus === 'active' ? 'animate-pulse' : ''
          }`}
        />
        <span className="text-xs text-gray-500 font-medium">LHIS</span>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full">
      {/* Resize Handle */}
      {isResizable && (
        <div
          ref={resizeRef}
          className="w-1 bg-gray-200 hover:bg-orange-400 cursor-col-resize flex-shrink-0 transition-colors"
          onMouseDown={handleMouseDown}
        />
      )}

      <Card
        ref={panelRef}
        className="border-l flex flex-col h-full w-full"
        style={isResizable ? { width: `${width}px` } : { width: '100%' }}
      >
        <CardContent className="flex-1 flex flex-col gap-3 p-0 min-h-0 overflow-hidden">
          {/* Messages */}
          <ScrollArea className="flex-1 p-4 min-h-0">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <MessageCircle className="h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">
                  {isAssessmentMode ? "Assessment chat will appear here" : "Start a conversation"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div key={`${message.id}-${index}`} className="group">
                    <div className={`flex gap-3 ${message.userId === user?.id ? 'justify-end' : 'justify-start'}`}>
                      {message.userId !== user?.id && (
                        <Avatar className="h-6 w-6 mt-1 flex-shrink-0">
                          <AvatarFallback className="text-xs bg-gray-200 text-gray-600">
                            {message.username?.charAt(0) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className={`max-w-[80%] ${message.userId === user?.id ? 'order-first' : ''}`}>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-medium text-gray-600">
                            {message.username || 'Unknown User'}
                          </span>
                          
                          {/* Threading Status Indicator - replaces 🧵 emoji */}
                          {message.threadingStatus && (
                            <div 
                              className="flex items-center gap-1" 
                              title={`Conversation Threading: ${message.threadingStatus}`}
                            >
                              <div 
                                className={`w-1.5 h-1.5 rounded-full ${
                                  message.threadingStatus === 'active' 
                                    ? 'bg-blue-500 animate-pulse' 
                                    : message.threadingStatus === 'error'
                                    ? 'bg-red-500'
                                    : 'bg-gray-400'
                                }`}
                              />
                            </div>
                          )}
                          
                          {/* P x.x parameter tag - only show parameter badge, no LHIS badge */}
                          {message.questionContext?.badge && (
                            <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">
                              {message.questionContext.badge}
                            </Badge>
                          )}
                          <span className="text-xs text-gray-400">
                            {typeof message.timestamp === 'string' 
                              ? formatTime(message.timestamp)
                              : formatTime(new Date(message.timestamp).toISOString())
                            }
                          </span>
                        </div>
                        <div
                          className={`rounded-lg px-3 py-2 text-sm break-words ${
                            message.userId === user?.id
                              ? 'bg-orange-500 text-white'
                              : message.sender?.type === 'parameter_question'
                              ? 'bg-orange-50 border border-orange-200 text-orange-900'
                              : message.sender?.type === 'welcome'
                              ? 'bg-green-50 border border-green-200 text-green-900'
                              : message.sender?.type === 'feedback'
                              ? 'bg-blue-50 border border-blue-200 text-blue-900'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          {message.content || message.message}
                        </div>
                      </div>
                      {message.userId === user?.id && (
                        <Avatar className="h-6 w-6 mt-1 flex-shrink-0">
                          <AvatarFallback className="text-xs bg-orange-500 text-white">
                            {user?.username?.charAt(0) || 'Y'}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Message Input */}
          <div className="p-3 border-t flex-shrink-0">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={handleKeyPress}
                disabled={isLoading}
                className={`flex-1 min-h-[40px] max-h-[120px] resize-none text-sm ${
                  awaitingParameterAnswer ? 'border-orange-300 focus:border-orange-500' : ''
                }`}
                rows={1}
              />
              <Button 
                onClick={sendMessage} 
                disabled={!newMessage.trim() || isLoading} 
                size="sm" 
                className={`h-10 w-10 p-0 flex-shrink-0 ${
                  awaitingParameterAnswer ? 'bg-orange-600 hover:bg-orange-700' : 'bg-orange-500 hover:bg-orange-600'
                }`}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 