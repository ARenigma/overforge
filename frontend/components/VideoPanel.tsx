import React, { useEffect, useRef, useState } from 'react';
import { Video, VideoOff, Mic, MicOff, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Socket } from 'socket.io-client';

interface VideoPanelProps {
  roomId: string;
  userId?: string;
  socket?: Socket;
}

const VideoPanel: React.FC<VideoPanelProps> = ({ roomId, userId, socket }) => {
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hasRemoteUser, setHasRemoteUser] = useState(false);
  const [waitingForPartner, setWaitingForPartner] = useState(true);

  // This is a placeholder component
  // In a real implementation, you would add WebRTC logic here
  
  const toggleVideo = () => {
    setVideoEnabled(!videoEnabled);
  };

  const toggleAudio = () => {
    setAudioEnabled(!audioEnabled);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-2 gap-2 flex-grow p-2">
        {/* Local video */}
        <div className="relative bg-gray-800 rounded overflow-hidden flex items-center justify-center">
          {videoEnabled ? (
            <video
              ref={localVideoRef}
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400 h-full w-full">
              <VideoOff className="h-6 w-6 mb-2" />
              <span className="text-xs">Camera off</span>
            </div>
          )}
          <div className="absolute bottom-1 left-1 text-xs bg-black bg-opacity-50 text-white px-1 rounded">
            You
          </div>
        </div>

        {/* Remote video or waiting state */}
        <div className="relative bg-gray-800 rounded overflow-hidden flex items-center justify-center">
          {hasRemoteUser ? (
            videoEnabled ? (
              <video
                ref={remoteVideoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-gray-400 h-full w-full">
                <VideoOff className="h-6 w-6 mb-2" />
                <span className="text-xs">Partner's camera off</span>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400 h-full w-full">
              <div className="animate-pulse">
                <Video className="h-6 w-6 mb-2" />
              </div>
              <span className="text-xs text-center">
                {waitingForPartner ? "Waiting for partner..." : "No one joined yet"}
              </span>
            </div>
          )}
          {hasRemoteUser && (
            <div className="absolute bottom-1 left-1 text-xs bg-black bg-opacity-50 text-white px-1 rounded">
              Partner
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-center space-x-2 p-2 border-t">
        <Button
          size="sm"
          variant={videoEnabled ? "default" : "outline"}
          onClick={toggleVideo}
          className="w-10 h-10 p-0 rounded-full"
        >
          {videoEnabled ? (
            <Video className="h-4 w-4" />
          ) : (
            <VideoOff className="h-4 w-4" />
          )}
        </Button>
        <Button
          size="sm"
          variant={audioEnabled ? "default" : "outline"}
          onClick={toggleAudio}
          className="w-10 h-10 p-0 rounded-full"
        >
          {audioEnabled ? (
            <Mic className="h-4 w-4" />
          ) : (
            <MicOff className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
};

export default VideoPanel; 