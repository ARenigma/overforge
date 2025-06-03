"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Code, Plus, Users, Clock, LogOut, RefreshCwIcon as Refresh } from "lucide-react"

interface Room {
  id: string
  name: string
  participants: number
  maxParticipants: number
  language: string
  experienceLevel: string
  createdBy: string
  createdAt: string
  status: "waiting" | "active" | "completed"
}

export default function RoomManager() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [newRoomName, setNewRoomName] = useState("")
  const [joinRoomId, setJoinRoomId] = useState("")
  const [user, setUser] = useState<any>(null)
  const [selectedLanguage, setSelectedLanguage] = useState("")
  const [selectedExperience, setSelectedExperience] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem("token")
    const userData = localStorage.getItem("user")
    const language = localStorage.getItem("selectedLanguage")
    const experience = localStorage.getItem("selectedExperience")

    if (!token || !userData || !language || !experience) {
      router.push("/auth")
      return
    }

    setUser(JSON.parse(userData))
    setSelectedLanguage(language)
    setSelectedExperience(experience)
    fetchRooms()
  }, [router])

  const fetchRooms = async () => {
    try {
      const token = localStorage.getItem("token")
      const response = await fetch("/api/rooms", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setRooms(data.rooms)
      }
    } catch (error) {
      console.error("Failed to fetch rooms:", error)
    }
  }

  const createRoom = async () => {
    if (!newRoomName.trim()) return

    setIsLoading(true)
    setError("")

    try {
      const token = localStorage.getItem("token")
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newRoomName,
          language: selectedLanguage,
          experienceLevel: selectedExperience,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        router.push(`/room/${data.room.id}`)
      } else {
        setError(data.message || "Failed to create room")
      }
    } catch (error) {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const joinRoom = async (roomId: string) => {
    setIsLoading(true)
    setError("")

    try {
      const token = localStorage.getItem("token")
      const response = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (response.ok) {
        router.push(`/room/${roomId}`)
      } else {
        setError(data.message || "Failed to join room")
      }
    } catch (error) {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    localStorage.removeItem("selectedLanguage")
    localStorage.removeItem("selectedExperience")
    router.push("/auth")
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Code className="h-8 w-8 text-purple-600" />
            <span className="text-xl font-bold text-gray-900">CodeInterview</span>
          </div>

          <div className="flex items-center space-x-4">
            {user && (
              <div className="flex items-center space-x-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src="/placeholder.svg" />
                  <AvatarFallback>
                    {user.firstName[0]}
                    {user.lastName[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {user.firstName} {user.lastName}
                </span>
              </div>
            )}
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* User Preferences */}
          <Card>
            <CardHeader>
              <CardTitle>Your Interview Setup</CardTitle>
              <CardDescription>Current language and experience level preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4">
                <Badge variant="secondary">
                  {getLanguageIcon(selectedLanguage)} {selectedLanguage?.toUpperCase()}
                </Badge>
                <Badge variant="outline">{selectedExperience?.toUpperCase()} Level</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/language-selection")}
                  className="ml-auto"
                >
                  Change Preferences
                </Button>
              </div>
            </CardContent>
          </Card>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Create Room */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Plus className="h-5 w-5" />
                <span>Create New Room</span>
              </CardTitle>
              <CardDescription>Start a new coding interview session</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-2">
                <Input
                  placeholder="Enter room name"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && createRoom()}
                />
                <Button onClick={createRoom} disabled={isLoading || !newRoomName.trim()}>
                  {isLoading ? "Creating..." : "Create Room"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Join Room */}
          <Card>
            <CardHeader>
              <CardTitle>Join Existing Room</CardTitle>
              <CardDescription>Enter a room ID to join an ongoing interview</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-2">
                <Input
                  placeholder="Enter room ID"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && joinRoom(joinRoomId)}
                />
                <Button onClick={() => joinRoom(joinRoomId)} disabled={isLoading || !joinRoomId.trim()}>
                  {isLoading ? "Joining..." : "Join Room"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Active Rooms */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Active Rooms</CardTitle>
                  <CardDescription>Available interview rooms you can join</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchRooms}>
                  <Refresh className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {rooms.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No active rooms available</p>
                  <p className="text-sm">Create a new room to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {rooms.map((room) => (
                    <div key={room.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <h3 className="font-semibold">{room.name}</h3>
                            <Badge
                              variant={
                                room.status === "active"
                                  ? "default"
                                  : room.status === "waiting"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {room.status}
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-600">
                            <span className="flex items-center space-x-1">
                              <Users className="h-4 w-4" />
                              <span>
                                {room.participants}/{room.maxParticipants}
                              </span>
                            </span>
                            <span>
                              {getLanguageIcon(room.language)} {room.language}
                            </span>
                            <span>{room.experienceLevel} level</span>
                            <span className="flex items-center space-x-1">
                              <Clock className="h-4 w-4" />
                              <span>{new Date(room.createdAt).toLocaleTimeString()}</span>
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">Created by {room.createdBy}</p>
                        </div>
                        <Button
                          onClick={() => joinRoom(room.id)}
                          disabled={room.participants >= room.maxParticipants || room.status === "completed"}
                          size="sm"
                        >
                          Join
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
