"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/hooks/useAuth"
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
        userId: String(user.id),
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
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-2 py-2">
          {messages.length === 0 ? (
            <p className="text-center text-muted-foreground text-xs py-4">No messages yet. Start the conversation!</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex flex-col ${message.userId === String(user?.id) ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-2 ${
                    message.userId === String(user?.id) ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  <p className="text-xs">{message.content}</p>
                </div>
                <div className="flex items-center mt-0.5 text-xs text-muted-foreground">
                  <span className="font-medium text-[10px]">{message.username}</span>
                  <span className="ml-1 text-[10px]">{new Date(message.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="p-2 border-t">
        <form onSubmit={handleSendMessage} className="flex gap-1">
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1 h-8 text-xs"
          />
          <Button type="submit" size="icon" disabled={!inputValue.trim() || isLoading} className="h-8 w-8">
            <Send className="h-3 w-3" />
          </Button>
        </form>
      </div>
    </div>
  )
}
