import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useInterview } from "../context/InterviewContext";
import { useLanguages } from "../context/LanguageContext";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Skeleton } from "../ui/skeleton";
import CodeMirror from "@uiw/react-codemirror";
import { io } from "socket.io-client";
import axios from "axios";
import VideoPanel from "./VideoPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";
const TEST_DURATION = 5 * 60; // 5 minutes in seconds
const QUESTION_PAUSE = 60; // 1 minute in seconds
const AI_QUESTION_INTERVAL = 30; // 30 seconds
const MAX_QUESTIONS = 2;

function getInitials(name) {
  if (!name) return "?";
  const parts = name.split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function RoomPage() {
  const { roomName } = useParams();
  const { user, token, logout } = useAuth();
  const { interviewInfo } = useInterview();
  const { languages, extensionMap } = useLanguages();
  const location = useLocation();
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [aiQuestions, setAiQuestions] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [joining, setJoining] = useState(true);
  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const navigate = useNavigate();
  const [testTime, setTestTime] = useState(TEST_DURATION);
  const [timerActive, setTimerActive] = useState(true);
  const [questionModal, setQuestionModal] = useState(null); // {question, index}
  const [questionAnswer, setQuestionAnswer] = useState("");
  const [questionPause, setQuestionPause] = useState(0);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const aiQuestionTimeout = useRef(null);
  const aiQuestionInterval = useRef(null);
  const pauseTimeout = useRef(null);

  // Get interview info from navigation state or context
  const interview = location.state?.interviewInfo || interviewInfo;
  const selectedLanguage = languages.find(l => String(l.id) === String(interview?.language));
  const codeMirrorExt = selectedLanguage ? extensionMap[selectedLanguage.name] : undefined;

  // Real-time code sync, chat, AI questions, and presence
  useEffect(() => {
    setJoining(true);
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"]
    });
    socketRef.current = socket;
    socket.emit("joinRoom", { roomName, userId: user.id, username: user.username });
    socket.on("codeUpdate", ({ code: newCode }) => {
      setCode(newCode);
    });
    socket.on("chatMessage", (msg) => {
      setChat((prev) => [...prev, msg]);
    });
    socket.on("aiQuestion", (data) => {
      setAiQuestions((prev) => [{ ...data, timestamp: new Date().toISOString() }, ...prev]);
    });
    socket.on("userJoined", ({ userId, username }) => {
      setParticipants((prev) => Array.from(new Set([...prev, username || userId])));
    });
    socket.on("userLeft", ({ userId, username }) => {
      setParticipants((prev) => prev.filter((u) => u !== (username || userId)));
    });
    // On mount, send language/experience to backend/AI for question generation
    if (interview) {
      socket.emit("interviewInfo", {
        roomName,
        userId: user.id,
        username: user.username,
        languageId: interview.language,
        experience: interview.experience
      });
    }
    // Simulate join loading
    setTimeout(() => setJoining(false), 800);
    return () => {
      socket.emit("leaveRoom", { roomName, userId: user.id, username: user.username });
      socket.disconnect();
    };
    // eslint-disable-next-line
  }, [roomName, user.id, user.username, token, interview]);

  // Scroll chat to bottom on new message
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat]);

  // Emit code changes
  const handleCodeChange = (val) => {
    setCode(val);
    if (socketRef.current) {
      socketRef.current.emit("codeChange", {
        roomName,
        code: val,
        language: selectedLanguage?.name,
        userId: user.id
      });
    }
  };

  // Run code via Judge0
  const handleRun = async () => {
    setRunning(true);
    setOutput("");
    try {
      const res = await axios.post(
        "/api/execute",
        {
          source_code: code,
          language_id: selectedLanguage?.id,
          stdin: ""
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setOutput(res.data.result.stdout || res.data.result.stderr || "No output");
    } catch (err) {
      setOutput("Execution failed");
    } finally {
      setRunning(false);
    }
  };

  // Send chat message
  const handleChatSend = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit("chatMessage", {
      roomName,
      userId: user.id,
      username: user.username,
      message: chatInput.trim(),
      timestamp: new Date().toISOString()
    });
    setChatInput("");
  };

  // Leave room
  const handleLeave = () => {
    navigate("/app");
  };

  // Timer countdown
  useEffect(() => {
    if (!timerActive || testTime <= 0) return;
    const interval = setInterval(() => {
      setTestTime(t => t - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, testTime]);

  // End test if timer runs out
  useEffect(() => {
    if (testTime <= 0) setTimerActive(false);
  }, [testTime]);

  // AI question modal pause
  useEffect(() => {
    if (questionModal) {
      setTimerActive(false);
      setQuestionPause(QUESTION_PAUSE);
      // Start 1-min pause countdown
      pauseTimeout.current = setInterval(() => {
        setQuestionPause(p => {
          if (p <= 1) {
            handleQuestionModalClose();
            return 0;
          }
          return p - 1;
        });
      }, 1000);
    } else {
      setQuestionPause(0);
      if (pauseTimeout.current) clearInterval(pauseTimeout.current);
    }
    return () => {
      if (pauseTimeout.current) clearInterval(pauseTimeout.current);
    };
    // eslint-disable-next-line
  }, [questionModal]);

  // AI question emission logic (frontend only)
  const startAIQuestionInterval = useCallback(() => {
    if (aiQuestionInterval.current) clearInterval(aiQuestionInterval.current);
    if (questionsAsked >= MAX_QUESTIONS) return;
    aiQuestionInterval.current = setInterval(() => {
      if (questionsAsked < MAX_QUESTIONS && timerActive && !questionModal) {
        // Simulate AI question (in real app, backend should emit)
        const q = {
          question: `AI Question #${questionsAsked + 1}`,
          type: "ai",
          timestamp: new Date().toISOString(),
        };
        setAiQuestions(prev => [{ ...q }, ...prev]);
        setQuestionsAsked(qc => qc + 1);
        setQuestionModal({ ...q, index: questionsAsked });
        clearInterval(aiQuestionInterval.current);
      }
    }, AI_QUESTION_INTERVAL * 1000);
  }, [questionsAsked, timerActive, questionModal]);

  // Restart AI question interval on code change
  useEffect(() => {
    if (questionsAsked >= MAX_QUESTIONS) return;
    startAIQuestionInterval();
    return () => {
      if (aiQuestionInterval.current) clearInterval(aiQuestionInterval.current);
    };
    // eslint-disable-next-line
  }, [code, questionsAsked, timerActive, questionModal]);

  // When AI question is received from backend, show modal and pause timer
  useEffect(() => {
    if (aiQuestions.length > 0 && questionsAsked < MAX_QUESTIONS) {
      const latest = aiQuestions[0];
      if (!questionModal || questionModal.question !== latest.question) {
        setQuestionModal({ ...latest, index: questionsAsked });
        setQuestionsAsked(qc => qc + 1);
      }
    }
    // eslint-disable-next-line
  }, [aiQuestions]);

  // Modal close handler
  const handleQuestionModalClose = useCallback(() => {
    setQuestionModal(null);
    setQuestionAnswer("");
    setTimerActive(testTime > 0);
  }, [testTime]);

  // Modal submit handler
  const handleQuestionSubmit = (e) => {
    e.preventDefault();
    if (!questionAnswer.trim()) return;
    // Optionally: send answer to backend here
    handleQuestionModalClose();
  };

  // Modal skip handler
  const handleQuestionSkip = () => {
    handleQuestionModalClose();
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="p-4 border-b flex items-center justify-between bg-white shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-lg font-semibold">Room: {roomName}</h1>
          <span className="text-xs text-gray-500">({participants.length} online)</span>
          {selectedLanguage && (
            <span className="ml-4 text-xs text-blue-600">Language: {selectedLanguage.name}</span>
          )}
          {interview && (
            <span className="ml-2 text-xs text-green-600">Experience: {interview.experience} years</span>
          )}
          <span className="ml-4 text-xs font-bold text-red-600">Time Left: {Math.floor(testTime/60).toString().padStart(2, '0')}:{(testTime%60).toString().padStart(2, '0')}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleLeave}>
            Leave Room
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            Logout
          </Button>
        </div>
      </header>
      {/* Video Panel */}
      <div className="px-4 pt-4 bg-gray-50">
        <VideoPanel roomName={roomName} userId={user.id} />
      </div>
      {/* Main content */}
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* Code Editor */}
        <main className="flex-1 p-4 overflow-auto bg-gray-50">
          <div className="h-full border rounded-lg bg-white shadow p-4 flex flex-col">
            <div className="font-medium mb-2 flex items-center justify-between">
              <span>Code Editor</span>
              <Button onClick={handleRun} disabled={running} size="sm">
                {running ? <span className="flex items-center gap-1"><Skeleton className="w-4 h-4 rounded-full animate-spin bg-gray-400" /> Running...</span> : "Run"}
              </Button>
            </div>
            <div className="flex-1 min-h-[300px]">
              <CodeMirror
                value={code}
                height="300px"
                extensions={codeMirrorExt ? [codeMirrorExt()] : []}
                onChange={handleCodeChange}
                theme="light"
              />
            </div>
            <div className="mt-4">
              <div className="font-medium mb-1">Output</div>
              <pre className="bg-gray-100 rounded p-2 text-sm min-h-[40px]">{output}</pre>
            </div>
          </div>
        </main>
        {/* Sidebar: Chat & AI */}
        <aside className="w-full md:w-96 max-w-full border-l bg-white flex flex-col min-h-[300px]">
          <div className="flex-1 p-4 border-b overflow-auto">
            <div className="font-medium mb-2">AI Questions</div>
            <div className="space-y-2">
              {aiQuestions.length === 0 && <div className="text-gray-500">No questions yet.</div>}
              {aiQuestions.map((q, i) => (
                <div key={i} className="bg-gray-100 rounded p-2 text-sm border-l-4 border-blue-400">
                  <div className="font-semibold flex items-center gap-2">
                    <span>Q:</span> {q.question}
                    <span className="ml-auto text-xs text-gray-400">{new Date(q.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {q.insight && <div className="text-xs text-gray-600 mt-1">{q.insight}</div>}
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 flex-1 flex flex-col">
            <div className="font-medium mb-2 flex items-center justify-between">
              <span>Chat</span>
              <span className="text-xs text-gray-500">{participants.length} online</span>
            </div>
            <div className="flex-1 overflow-auto text-gray-700 space-y-1 mb-2">
              {chat.length === 0 && <div className="text-gray-500">No messages yet.</div>}
              {chat.map((msg, i) => (
                <div
                  key={i}
                  className={`text-sm flex items-end gap-2 ${msg.userId === user.id ? "text-blue-600 font-semibold justify-end" : ""}`}
                >
                  <Avatar className="w-6 h-6">
                    <AvatarFallback>{getInitials(msg.username || msg.userId)}</AvatarFallback>
                  </Avatar>
                  <span>{msg.message}</span>
                  <span className="text-xs text-gray-400">{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ""}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form className="mt-2 flex gap-2" onSubmit={handleChatSend} autoComplete="off">
              <input
                className="flex-1 border rounded px-2 py-1"
                placeholder="Type a message..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { handleChatSend(e); } }}
              />
              <Button type="submit" disabled={!chatInput.trim()}>
                Send
              </Button>
            </form>
          </div>
        </aside>
      </div>
      {/* AI Question Modal */}
      <Dialog open={!!questionModal} onOpenChange={v => !v && handleQuestionModalClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI Question</DialogTitle>
          </DialogHeader>
          <div className="mb-2 text-base font-medium">{questionModal?.question}</div>
          <form onSubmit={handleQuestionSubmit} className="space-y-2">
            <Input
              as="textarea"
              rows={3}
              value={questionAnswer}
              onChange={e => setQuestionAnswer(e.target.value)}
              placeholder="Type your answer..."
              disabled={questionPause === 0}
            />
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={!questionAnswer.trim() || questionPause === 0}>Submit</Button>
              <Button type="button" variant="outline" onClick={handleQuestionSkip} disabled={questionPause === 0}>Don't know</Button>
              <span className="ml-auto text-xs text-gray-500">{questionPause > 0 ? `Time to answer: ${questionPause}s` : ""}</span>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* Loading overlay for joining room */}
      {joining && (
        <div className="fixed inset-0 bg-white bg-opacity-70 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="w-12 h-12 rounded-full animate-spin bg-gray-400" />
            <div className="text-lg font-semibold text-gray-700">Joining room...</div>
          </div>
        </div>
      )}
    </div>
  );
} 