"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/useAuth"
import { Plus, Users, ArrowRight, Loader2 } from "lucide-react"

interface Room {
  id: string
  name: string
  participants: number
  createdAt: string
}

export default function RoomManager() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomName, setRoomName] = useState("")
  const [joinName, setJoinName] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const router = useRouter()
  const { token } = useAuth()

  useEffect(() => {
    fetchRooms()
  }, [])

  const fetchRooms = async () => {
    try {
      const response = await fetch("/api/rooms", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setRooms(data.rooms || [])
      }
    } catch (err) {
      console.error("Failed to fetch rooms:", err)
    }
  }

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomName.trim()) return

    setCreating(true)
    setError("")
    setSuccess("")

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: roomName.trim() }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || "Failed to create room")
      }

      setSuccess(`Room '${roomName}' created successfully!`)
      setRoomName("")

      // Navigate to the room after a short delay
      setTimeout(() => {
        router.push(`/room/${encodeURIComponent(roomName.trim())}`)
      }, 1000)

      fetchRooms()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room")
    } finally {
      setCreating(false)
    }
  }

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!joinName.trim()) return

    setJoining(true)
    setError("")
    setSuccess("")

    try {
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: joinName.trim() }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || "Failed to join room")
      }

      setSuccess(`Joined room '${joinName}'!`)

      // Navigate to the room
      setTimeout(() => {
        router.push(`/room/${encodeURIComponent(joinName.trim())}`)
      }, 1000)

      setJoinName("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join room")
    } finally {
      setJoining(false)
    }
  }

  const joinExistingRoom = (roomName: string) => {
    router.push(`/room/${encodeURIComponent(roomName)}`)
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Room Manager</h1>
          <p className="text-muted-foreground mt-2">
            Create a new room or join an existing one to start your <span className="text-gray-900">over</span><span className="text-orange-500 font-bold">Forge</span> session
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Create Room */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Create New Room
              </CardTitle>
              <CardDescription>Start a new overForge session</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="roomName">Room Name</Label>
                  <Input
                    id="roomName"
                    type="text"
                    placeholder="Enter room name"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    disabled={creating}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Room
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Join Room */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5" />
                Join Existing Room
              </CardTitle>
              <CardDescription>Enter a room name to join an ongoing session</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="joinName">Room Name</Label>
                  <Input
                    id="joinName"
                    type="text"
                    placeholder="Enter room name to join"
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                    disabled={joining}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={joining}>
                  {joining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Join Room
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Active Rooms */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Active Rooms
            </CardTitle>
            <CardDescription>Click on any room to join</CardDescription>
          </CardHeader>
          <CardContent>
            {rooms.length > 0 ? (
              <div className="grid gap-3">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => joinExistingRoom(room.name)}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <h3 className="font-medium">{room.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          Created {new Date(room.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {room.participants} participant{room.participants !== 1 ? "s" : ""}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No active rooms found</p>
                <p className="text-sm">Create a new room to get started</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
