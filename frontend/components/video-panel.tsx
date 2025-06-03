"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Video, VideoOff, Mic, MicOff, Phone, PhoneOff } from "lucide-react"

interface VideoPanelProps {
  roomId: string
  userId?: string
  socket?: any
}

export default function VideoPanel({ roomId, userId, socket }: VideoPanelProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop())
      }
      if (pcRef.current) {
        pcRef.current.close()
      }
    }
  }, [localStream])

  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      setLocalStream(stream)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }

      return stream
    } catch (error) {
      console.error("Error accessing media devices:", error)
      throw error
    }
  }

  const initializeWebRTC = async () => {
    if (!socket || !userId) return

    setIsConnecting(true)

    try {
      const stream = await initializeMedia()

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
      })

      pcRef.current = pc

      // Add local stream tracks to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })

      // Handle remote stream
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0])
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0]
        }
      }

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc-signal", {
            roomId,
            from: userId,
            signal: { candidate: event.candidate },
          })
        }
      }

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        setIsConnected(pc.connectionState === "connected")
        if (pc.connectionState === "failed") {
          setIsConnecting(false)
        }
      }

      // Listen for WebRTC signals
      socket.on("webrtc-signal", async ({ from, signal }) => {
        if (from === userId) return // Ignore own signals

        try {
          if (signal.offer) {
            await pc.setRemoteDescription(signal.offer)
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            socket.emit("webrtc-signal", {
              roomId,
              from: userId,
              signal: { answer },
            })
          } else if (signal.answer) {
            await pc.setRemoteDescription(signal.answer)
          } else if (signal.candidate) {
            await pc.addIceCandidate(signal.candidate)
          }
        } catch (error) {
          console.error("Error handling WebRTC signal:", error)
        }
      })

      // Join video call
      socket.emit("join-video-call", { roomId, userId })

      // Listen for other users joining
      socket.on("user-joined-video", async ({ userId: remoteUserId }) => {
        if (remoteUserId !== userId) {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socket.emit("webrtc-signal", {
            roomId,
            from: userId,
            signal: { offer },
          })
        }
      })

      setIsConnecting(false)
    } catch (error) {
      console.error("Error initializing WebRTC:", error)
      setIsConnecting(false)
    }
  }

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoEnabled(videoTrack.enabled)
      }
    }
  }

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsAudioEnabled(audioTrack.enabled)
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
    setIsConnected(false)
    setIsConnecting(false)

    if (socket) {
      socket.emit("leave-video-call", { roomId, userId })
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span>Video Conference</span>
          <div className="flex items-center gap-2">
            {isConnected && <span className="text-sm text-green-600 font-medium">Connected</span>}
            {isConnecting && <span className="text-sm text-yellow-600 font-medium">Connecting...</span>}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Local Video */}
          <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">You</div>
            {!isVideoEnabled && (
              <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                <VideoOff className="h-8 w-8 text-gray-400" />
              </div>
            )}
          </div>

          {/* Remote Video */}
          <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
            {remoteStream ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Video className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">Waiting for participant...</p>
                </div>
              </div>
            )}
            {remoteStream && (
              <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
                Participant
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2">
          {!localStream ? (
            <Button onClick={initializeWebRTC} disabled={isConnecting}>
              <Phone className="h-4 w-4 mr-2" />
              {isConnecting ? "Connecting..." : "Join Call"}
            </Button>
          ) : (
            <>
              <Button variant={isVideoEnabled ? "default" : "destructive"} size="icon" onClick={toggleVideo}>
                {isVideoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              </Button>
              <Button variant={isAudioEnabled ? "default" : "destructive"} size="icon" onClick={toggleAudio}>
                {isAudioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </Button>
              <Button variant="destructive" size="icon" onClick={endCall}>
                <PhoneOff className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
