"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import CodeEditor from "@/components/code-editor"
import ChatPanel from "@/components/chat-panel"
import VideoPanel from "@/components/video-panel"
import AIQuestionModal from "@/components/ai-question-modal"
import { useAuth } from "@/hooks/useAuth"
import io from "socket.io-client"
import { Brain, Users, MessageCircle, Video, Timer } from "lucide-react"

export default function RoomInterface() {
  const params = useParams()
  const roomId = params?.id as string
  const [code, setCode] = useState("")
  const [language, setLanguage] = useState("javascript")
  const [experienceLevel, setExperienceLevel] = useState("junior")
  const [socket, setSocket] = useState<any>(null)
  const [isAIModalOpen, setIsAIModalOpen] = useState(false)
  const [timer, setTimer] = useState(0)
  const [isTimerRunning, setIsTimerRunning] = useState(true)
  const [participants, setParticipants] = useState<string[]>([])
  const { user, token } = useAuth()

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isTimerRunning])

  // Socket connection
  useEffect(() => {
    if (!user || !token || !roomId) return

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5001"
    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ["websocket"],
    })

    newSocket.on("connect", () => {
      console.log("Socket connected")
      newSocket.emit("joinRoom", {
        roomName: roomId,
        userId: user.id,
        username: user.username,
      })
    })

    newSocket.on("codeUpdate", ({ code: newCode }: { code: string }) => {
      setCode(newCode)
    })

    newSocket.on("languageChange", ({ language: newLanguage }: { language: string }) => {
      setLanguage(newLanguage)
    })

    newSocket.on("roomParticipants", ({ participants: roomParticipants }: { participants: string[] }) => {
      setParticipants(roomParticipants)
    })

    newSocket.on("connect_error", (err: any) => {
      console.error("Socket connection error:", err.message)
    })

    setSocket(newSocket)

    return () => {
      if (newSocket) {
        newSocket.emit("leaveRoom", {
          roomName: roomId,
          userId: user.id,
          username: user.username,
        })
        newSocket.disconnect()
      }
    }
  }, [roomId, user, token])

  const handleCodeChange = (newCode: string) => {
    setCode(newCode)

    if (socket) {
      socket.emit("codeChange", {
        roomName: roomId,
        code: newCode,
        language,
        userId: user?.id,
      })
    }
  }

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage)

    if (socket) {
      socket.emit("languageChange", {
        roomName: roomId,
        language: newLanguage,
        userId: user?.id,
      })
    }
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleTimerPause = () => {
    setIsTimerRunning(false)
  }

  const handleTimerResume = () => {
    setIsTimerRunning(true)
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">Room: {roomId}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>
                {participants.length} participant{participants.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4" />
              <span className="font-mono text-lg">{formatTime(timer)}</span>
            </div>

            <Select value={experienceLevel} onValueChange={setExperienceLevel}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="junior">Junior</SelectItem>
                <SelectItem value="mid">Mid-level</SelectItem>
                <SelectItem value="senior">Senior</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={() => setIsAIModalOpen(true)} variant="outline">
              <Brain className="h-4 w-4 mr-2" />
              AI Question
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Code Editor */}
        <div className="flex-1 p-4">
          <CodeEditor
            value={code}
            onChangeAction={handleCodeChange}
            language={language}
          />
        </div>

        {/* Right Panel - Tabs */}
        <div className="w-96 border-l">
          <Tabs defaultValue="chat" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2 m-4 mb-0">
              <TabsTrigger value="chat" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="video" className="flex items-center gap-2">
                <Video className="h-4 w-4" />
                Video
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 m-4 mt-2">
              <ChatPanel roomId={roomId} socket={socket} />
            </TabsContent>

            <TabsContent value="video" className="flex-1 m-4 mt-2">
              <VideoPanel roomId={roomId} userId={user?.id} socket={socket} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* AI Question Modal */}
      <AIQuestionModal
        isOpen={isAIModalOpen}
        onCloseAction={() => setIsAIModalOpen(false)}
        language={language}
        experienceLevel={experienceLevel}
        onTimerPauseAction={handleTimerPause}
        onTimerResumeAction={handleTimerResume}
      />
    </div>
  )
}
