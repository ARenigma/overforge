"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/context/auth-context"
import { Send, MessageCircle } from "lucide-react"

interface Message {
  id: string
  userId: string
  username: string
  content: string
  timestamp: string
}

interface ChatPanelProps {
  roomId: string
  socket?: any
}

export default function ChatPanel({ roomId, socket }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { user, token } = useAuth()

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Listen for socket messages
  useEffect(() => {
    if (socket) {
      socket.on("newMessage", (message: Message) => {
        setMessages((prev) => [...prev, message])
      })

      return () => {
        socket.off("newMessage")
      }
    }
  }, [socket])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!inputValue.trim() || !user || !token) return

    setIsLoading(true)

    try {
      const response = await fetch(`/api/room/${roomId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: inputValue.trim() }),
      })

      if (!response.ok) {
        throw new Error("Failed to send message")
      }

      const data = await response.json()

      // Create a new message object
      const newMessage: Message = {
        id: data.messageId,
        userId: user.id,
        username: user.username,
        content: inputValue.trim(),
        timestamp: new Date().toISOString(),
      }

      // Add to local state
      setMessages((prev) => [...prev, newMessage])

      // Emit via socket for real-time updates
      if (socket) {
        socket.emit("sendMessage", {
          roomId,
          message: newMessage,
        })
      }

      // Clear input
      setInputValue("")
    } catch (error) {
      console.error("Error sending message:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Chat
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-4 pb-4">
            {messages.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">No messages yet. Start the conversation!</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex flex-col ${message.userId === user?.id ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.userId === user?.id ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                  </div>
                  <div className="flex items-center mt-1 text-xs text-muted-foreground">
                    <span className="font-medium">{message.username}</span>
                    <span className="ml-2">{new Date(message.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type a message..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={!inputValue.trim() || isLoading}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
