import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { io } from "socket.io-client";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

export default function VideoPanel({ roomName, userId }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let localStream;
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    const start = async () => {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      // Handle remote stream
      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("signal", { roomName, from: userId, to: "other", data: { candidate: event.candidate } });
        }
      };

      // Join room for signaling
      socket.emit("joinRoom", { roomName, userId });

      // Listen for signaling data
      socket.on("signal", async ({ from, data }) => {
        if (data.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          if (data.sdp.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("signal", { roomName, from: userId, to: from, data: { sdp: answer } });
          }
        } else if (data.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {}
        }
      });

      // Start call (offer)
      if (userId === "caller") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("signal", { roomName, from: userId, to: "other", data: { sdp: offer } });
      }
      setStarted(true);
    };
    start();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (pcRef.current) pcRef.current.close();
      if (socketRef.current) socketRef.current.disconnect();
    };
    // eslint-disable-next-line
  }, [roomName, userId]);

  return (
    <div className="flex gap-4 items-center p-2 bg-gray-100 rounded mb-4">
      <video ref={localVideoRef} autoPlay muted={muted} className="w-32 h-24 bg-black rounded" />
      <video ref={remoteVideoRef} autoPlay className="w-32 h-24 bg-black rounded" />
      <Button size="sm" onClick={() => setMuted(m => !m)}>{muted ? "Unmute" : "Mute"}</Button>
    </div>
  );
} 