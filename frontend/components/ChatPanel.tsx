import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { Lightbulb, MessageSquare, User } from 'lucide-react';

interface ChatMessage {
  id: string;
  content: string;
  sender: {
    id: string;
    name: string;
  };
  timestamp: string;
  questionContext?: {
    type: string;
    set: number;
    questionId?: string;
    title?: string;
  };
}

interface ChatPanelProps {
  roomId: string;
  socket?: Socket;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ roomId, socket }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    if (!socket) return;

    // Get user info from socket
    socket.emit('getUserInfo', (userInfo: { id: string, name: string }) => {
      if (userInfo) {
        setUserId(userInfo.id);
        setUserName(userInfo.name);
      }
    });

    socket.on('chatMessage', (message: ChatMessage) => {
      setMessages(prev => [...prev, message]);
      
      // Auto scroll to bottom on new message
      setTimeout(() => {
        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
      }, 100);
    });

    // Load chat history
    socket.emit('getChatHistory', roomId, (chatHistory: ChatMessage[]) => {
      setMessages(chatHistory);
      
      // Auto scroll to bottom when history loads
      setTimeout(() => {
        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
      }, 100);
    });

    return () => {
      socket.off('chatMessage');
    };
  }, [socket, roomId]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId || !socket) return;

    const messageData = {
      content: newMessage,
      roomId,
      sender: {
        id: userId,
        name: userName || 'Anonymous'
      }
    };

    socket.emit('sendChatMessage', messageData);
    setNewMessage('');
  };

  // Helper to determine if message is from interviewer AI
  const isInterviewerMessage = (message: ChatMessage) => {
    return message.sender?.id === 'interviewer-ai';
  };

  // Helper to format timestamp
  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow overflow-auto" ref={scrollAreaRef}>
        <div className="p-3 space-y-3">
          {messages.length > 0 ? (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender.id === userId ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    isInterviewerMessage(message)
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border border-blue-700'
                      : message.sender.id === userId
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                  }`}
                >
                  <div className="font-medium text-xs mb-1 flex items-center">
                    {isInterviewerMessage(message) ? (
                      <>
                        <Lightbulb className="h-3 w-3 mr-1" />
                        <span>{message.sender.name}</span>
                      </>
                    ) : message.sender.id === userId ? (
                      <>
                        <User className="h-3 w-3 mr-1" />
                        <span>You</span>
                      </>
                    ) : (
                      <>
                        <MessageSquare className="h-3 w-3 mr-1" />
                        <span>{message.sender.name}</span>
                      </>
                    )}
                    <span className="ml-auto text-xs opacity-70">
                      {formatTime(message.timestamp)}
                    </span>
                  </div>
                  
                  <div className="whitespace-pre-wrap">
                    {message.content}
                  </div>
                  
                  {message.questionContext && message.questionContext.type === 'counter_question' && (
                    <div className="mt-2 pt-1 border-t border-blue-400 text-xs opacity-80">
                      {message.questionContext.title ? (
                        <span>Re: {message.questionContext.title}</span>
                      ) : (
                        <span>Follow-up Question {message.questionContext.set} of 3</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500 text-sm p-4">
              No messages yet. Start the conversation!
            </div>
          )}
        </div>
      </div>
      <form onSubmit={sendMessage} className="p-2 border-t flex">
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="text-sm"
        />
        <Button type="submit" size="sm" className="ml-2" disabled={!newMessage.trim() || !socket}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
};

export default ChatPanel;