"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Code, Users, Video, MessageSquare, Play, LogOut, Clock, Settings, Maximize2, Minimize2 } from "lucide-react"
import CodeEditor from "@/components/code-editor"
import VideoPanel from "@/components/video-panel"
import ChatPanel from "@/components/chat-panel"
import AIQuestionModal from "@/components/ai-question-modal"
import { useAuth } from "@/context/auth-context"
import AuthForm from "@/components/auth-form"

interface RoomData {
  id: string
  name: string
  participants: Array<{
    id: string
    name: string
    avatar?: string
    role: "interviewer" | "candidate"
  }>
  language: string
  experienceLevel: string
  status: "waiting" | "active" | "completed"
  createdAt: string
}

export default function RoomPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [roomData, setRoomData] = useState<RoomData | null>(null)
  const [code, setCode] = useState("// Welcome to the coding interview!\n// Start coding here...\n")
  const [output, setOutput] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const [showAIQuestion, setShowAIQuestion] = useState(false)
  const [isVideoExpanded, setIsVideoExpanded] = useState(false)
  const [timer, setTimer] = useState(0)
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const params = useParams()
  const roomId = params.id as string

  useEffect(() => {
    if (!user) {
      router.push("/")
      return
    }

    fetchRoomData()

    // Start timer
    setIsTimerRunning(true)
  }, [user, router, roomId])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isTimerRunning])

  const fetchRoomData = async () => {
    try {
      const token = user.token
      const response = await fetch(`/api/room/${roomId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setRoomData(data.room)
      } else {
        router.push("/rooms")
      }
    } catch (error) {
      console.error("Failed to fetch room data:", error)
      router.push("/rooms")
    }
  }

  const runCode = async () => {
    setIsRunning(true)
    setOutput("Running code...")

    try {
      const token = user.token
      const response = await fetch(`/api/room/${roomId}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code,
          language: roomData?.language,
        }),
      })

      const data = await response.json()
      setOutput(data.output || "Code executed successfully!")
    } catch (error) {
      setOutput("Error executing code. Please try again.")
    } finally {
      setIsRunning(false)
    }
  }

  const leaveRoom = () => {
    router.push("/rooms")
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const getLanguageIcon = (language: string) => {
    const icons: { [key: string]: string } = {
      javascript: "🟨",
      python: "🐍",
      java: "☕",
      cpp: "⚡",
      csharp: "🔷",
      go: "🐹",
      rust: "🦀",
      typescript: "🔷",
    }
    return icons[language] || "💻"
  }

  if (!user) {
    return <AuthForm />
  }

  if (!roomData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Code className="h-6 w-6 text-purple-600" />
                <span className="font-bold text-gray-900">{roomData.name}</span>
              </div>
              <Badge variant="secondary">
                {getLanguageIcon(roomData.language)} {roomData.language}
              </Badge>
              <Badge variant="outline">{roomData.experienceLevel} level</Badge>
            </div>

            <div className="flex items-center space-x-4">
              {/* Timer */}
              <div className="flex items-center space-x-2 text-sm">
                <Clock className="h-4 w-4" />
                <span className="font-mono">{formatTime(timer)}</span>
              </div>

              {/* Participants */}
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <div className="flex -space-x-2">
                  {roomData.participants.map((participant) => (
                    <Avatar key={participant.id} className="h-8 w-8 border-2 border-white">
                      <AvatarImage src={participant.avatar || "/placeholder.svg"} />
                      <AvatarFallback>
                        {participant.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              </div>

              <Button variant="outline" onClick={() => setShowAIQuestion(true)}>
                AI Question
              </Button>

              <Button variant="outline" onClick={leaveRoom}>
                <LogOut className="h-4 w-4 mr-2" />
                Leave
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-4">
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-120px)]">
          {/* Left Panel - Video and Chat */}
          <div className={`${isVideoExpanded ? "col-span-6" : "col-span-3"} space-y-4`}>
            {/* Video Panel */}
            <Card className="h-64">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center space-x-2">
                    <Video className="h-4 w-4" />
                    <span>Video Chat</span>
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setIsVideoExpanded(!isVideoExpanded)}>
                    {isVideoExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-2">
                <VideoPanel participants={roomData.participants} />
              </CardContent>
            </Card>

            {/* Chat Panel */}
            <Card className="flex-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4" />
                  <span>Chat</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 h-full">
                <ChatPanel roomId={roomId} user={user} />
              </CardContent>
            </Card>
          </div>

          {/* Center Panel - Code Editor */}
          <div className={`${isVideoExpanded ? "col-span-4" : "col-span-6"} space-y-4`}>
            <Card className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center space-x-2">
                    <Code className="h-4 w-4" />
                    <span>Code Editor</span>
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <Button onClick={runCode} disabled={isRunning} size="sm">
                      <Play className="h-4 w-4 mr-2" />
                      {isRunning ? "Running..." : "Run"}
                    </Button>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 h-full">
                <CodeEditor value={code} onChange={setCode} language={roomData.language} height="calc(100vh - 200px)" />
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Output and Info */}
          <div className={`${isVideoExpanded ? "col-span-2" : "col-span-3"} space-y-4`}>
            {/* Output Panel */}
            <Card className="h-64">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Output</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-900 text-green-400 p-3 rounded text-sm font-mono h-48 overflow-auto">
                  {output || "Run your code to see output here..."}
                </div>
              </CardContent>
            </Card>

            {/* Room Info */}
            <Card className="flex-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Room Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">Room ID</p>
                  <p className="text-sm font-mono">{roomData.id}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs text-gray-500">Participants</p>
                  <div className="space-y-1">
                    {roomData.participants.map((participant) => (
                      <div key={participant.id} className="flex items-center space-x-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={participant.avatar || "/placeholder.svg"} />
                          <AvatarFallback className="text-xs">
                            {participant.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{participant.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {participant.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-xs text-gray-500">Session Time</p>
                  <p className="text-sm font-mono">{formatTime(timer)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* AI Question Modal */}
      <AIQuestionModal
        isOpen={showAIQuestion}
        onClose={() => setShowAIQuestion(false)}
        language={roomData.language}
        experienceLevel={roomData.experienceLevel}
        onTimerPause={() => setIsTimerRunning(false)}
        onTimerResume={() => setIsTimerRunning(true)}
      />
    </div>
  )
}
