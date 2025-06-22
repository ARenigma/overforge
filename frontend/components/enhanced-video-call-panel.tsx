"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Video, VideoOff, Mic, MicOff, Phone, PhoneOff, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

interface EnhancedVideoCallPanelProps {
  isExpanded: boolean
  onCloseAction: () => void
  isResizable?: boolean
  roomId?: string
  userId?: string
  socket?: any
}

export function EnhancedVideoCallPanel({ 
  isExpanded, 
  onCloseAction, 
  isResizable = false,
  roomId,
  userId,
  socket
}: EnhancedVideoCallPanelProps) {
  const [isVideoOn, setIsVideoOn] = useState(true)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isCallActive, setIsCallActive] = useState(true)
  const [width, setWidth] = useState(288)
  const [isResizing, setIsResizing] = useState(false)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  const resizeRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)

  const participants = [
    { id: "1", name: "Interviewer", role: "Host", avatar: "/placeholder.svg?height=40&width=40" },
    { id: "2", name: "You", role: "Candidate", avatar: "/placeholder.svg?height=40&width=40" },
  ]

  // Initialize media and WebRTC when component mounts
  useEffect(() => {
    if (roomId && userId && socket) {
      initializeWebRTC()
    }

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop())
      }
      if (pcRef.current) {
        pcRef.current.close()
      }
    }
  }, [roomId, userId, socket])

  const initializeWebRTC = async () => {
    try {
      setIsConnecting(true)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      setLocalStream(stream)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      })

      pcRef.current = pc

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0])
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0]
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc-signal", {
            roomId,
            from: userId,
            signal: { candidate: event.candidate },
          })
        }
      }

      setIsConnecting(false)
    } catch (error) {
      console.error("Error initializing WebRTC:", error)
      setIsConnecting(false)
    }
  }

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isResizable) return
      setIsResizing(true)
      e.preventDefault()
    },
    [isResizable],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !isResizable) return

      const panel = panelRef.current
      if (!panel) return

      const rect = panel.getBoundingClientRect()
      const newWidth = rect.right - e.clientX

      if (newWidth >= 250 && newWidth <= 500) {
        setWidth(newWidth)
      }
    },
    [isResizing, isResizable],
  )

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isResizable) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)

      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [handleMouseMove, handleMouseUp, isResizable])

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoOn(videoTrack.enabled)
      }
    }
  }

  const toggleMic = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMicOn(audioTrack.enabled)
      }
    }
  }

  const endCall = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
      setLocalStream(null)
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    setRemoteStream(null)
    setIsCallActive(false)

    if (socket) {
      socket.emit("leave-video-call", { roomId, userId })
    }
  }

  return (
    <div className="flex">
      {/* Resize Handle */}
      {isResizable && (
        <div
          ref={resizeRef}
          className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize flex-shrink-0 transition-colors"
          onMouseDown={handleMouseDown}
        />
      )}

      <Card
        ref={panelRef}
        className="border-l flex flex-col h-full"
        style={{ width: isResizable ? `${width}px` : "288px" }}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Video className="w-4 h-4" />
              Video Call
              <Badge variant={isCallActive ? "default" : "secondary"} className="text-xs">
                {isCallActive ? "Live" : "Ended"}
              </Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onCloseAction} className="h-6 w-6 p-0">
              <X className="w-3 h-3" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col gap-3 p-3">
          {/* Video Grid */}
          <div className="space-y-2">
            {/* Local Video */}
            <div className="relative">
              <div className="aspect-video bg-gray-900 rounded-md overflow-hidden relative">
                {isVideoOn && localStream ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                    <VideoOff className="w-6 h-6 text-gray-400" />
                  </div>
                )}

                <div className="absolute bottom-1 left-1 bg-black/70 text-white px-2 py-0.5 rounded text-xs">
                  You
                </div>

                <div className="absolute bottom-1 right-1 flex gap-1">
                  {!isMicOn && (
                    <div className="bg-red-500 p-0.5 rounded">
                      <MicOff className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Remote Video */}
            <div className="relative">
              <div className="aspect-video bg-gray-900 rounded-md overflow-hidden relative">
                {remoteStream ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src="/placeholder.svg" />
                      <AvatarFallback className="text-sm">IN</AvatarFallback>
                    </Avatar>
                  </div>
                )}

                <div className="absolute bottom-1 left-1 bg-black/70 text-white px-2 py-0.5 rounded text-xs">
                  Interviewer
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-1 mt-auto">
            <Button
              variant={isMicOn ? "default" : "destructive"}
              size="sm"
              onClick={toggleMic}
              className="flex-1 h-8"
            >
              {isMicOn ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
            </Button>

            <Button
              variant={isVideoOn ? "default" : "destructive"}
              size="sm"
              onClick={toggleVideo}
              className="flex-1 h-8"
            >
              {isVideoOn ? <Video className="w-3 h-3" /> : <VideoOff className="w-3 h-3" />}
            </Button>

            <Button
              variant={isCallActive ? "destructive" : "default"}
              size="sm"
              onClick={endCall}
              className="flex-1 h-8"
            >
              {isCallActive ? <PhoneOff className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
            </Button>
          </div>

          {isConnecting && (
            <div className="text-xs text-center text-gray-500">
              Connecting to video call...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 