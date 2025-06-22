"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
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
      socket.on("webrtc-signal", async ({ from, signal }: { from: string; signal: any }) => {
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
      socket.on("user-joined-video", async ({ userId: remoteUserId }: { userId: string }) => {
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
    <div className="w-full h-full flex flex-col">
      {/* Status */}
      {(isConnected || isConnecting) && (
        <div className="flex justify-end text-[10px]">
          {isConnected && <span className="text-green-600 font-medium">Connected</span>}
          {isConnecting && <span className="text-yellow-600 font-medium">Connecting...</span>}
        </div>
      )}

      {/* Video grid */}
      <div className="grid grid-cols-2 gap-1 flex-grow">
        {/* Local Video */}
        <div className="relative bg-muted rounded-lg overflow-hidden aspect-video">
          <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          <div className="absolute bottom-1 left-1 bg-black/50 text-white px-1 py-0.5 rounded text-[10px]">You</div>
          {!isVideoEnabled && (
            <div className="absolute inset-0 bg-muted/80 flex items-center justify-center">
              <VideoOff className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Remote Video */}
        <div className="relative bg-muted rounded-lg overflow-hidden aspect-video">
          {remoteStream ? (
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Video className="h-4 w-4 mx-auto mb-1" />
                <p className="text-[10px]">Waiting...</p>
              </div>
            </div>
          )}
          {remoteStream && (
            <div className="absolute bottom-1 left-1 bg-black/50 text-white px-1 py-0.5 rounded text-[10px]">
              Peer
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-1">
        {!localStream ? (
          <Button onClick={initializeWebRTC} disabled={isConnecting} size="sm" className="h-6 text-[10px] py-0">
            <Phone className="h-3 w-3 mr-0.5" />
            {isConnecting ? "Connecting..." : "Join Call"}
          </Button>
        ) : (
          <>
            <Button 
              variant={isVideoEnabled ? "default" : "destructive"} 
              size="sm" 
              onClick={toggleVideo}
              className="h-5 w-5 p-0"
            >
              {isVideoEnabled ? <Video className="h-2.5 w-2.5" /> : <VideoOff className="h-2.5 w-2.5" />}
            </Button>
            <Button 
              variant={isAudioEnabled ? "default" : "destructive"} 
              size="sm" 
              onClick={toggleAudio}
              className="h-5 w-5 p-0"
            >
              {isAudioEnabled ? <Mic className="h-2.5 w-2.5" /> : <MicOff className="h-2.5 w-2.5" />}
            </Button>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={endCall}
              className="h-5 w-5 p-0"
            >
              <PhoneOff className="h-2.5 w-2.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
