import { useState, useEffect } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Alert } from "../ui/alert";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useInterview } from "../context/InterviewContext";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Skeleton } from "../ui/skeleton";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function RoomManager() {
  const { token, logout } = useAuth();
  const { interviewInfo } = useInterview();
  const [rooms, setRooms] = useState([]);
  const [roomName, setRoomName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(null);
  const navigate = useNavigate();

  // Fetch active rooms
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await axios.get("/api/rooms", {
          headers: { Authorization: `Bearer ${token}` }
        });
        setRooms(res.data.rooms || []);
      } catch (err) {
        setRooms([]);
      }
    };
    fetchRooms();
  }, [token]);

  // Create room
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!roomName.trim()) return;
    setJoiningRoom(roomName.trim());
    try {
      await axios.post(
        "/api/rooms",
        { name: roomName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRoomName("");
      setTimeout(() => {
        navigate(`/room/${roomName.trim()}`, { state: { interviewInfo } });
      }, 600);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create room");
    } finally {
      setJoiningRoom(null);
    }
  };

  // Join room
  const handleJoin = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await axios.post(
        "/api/rooms/join",
        { name: joinName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(`Joined room '${joinName}'!`);
      navigate(`/room/${encodeURIComponent(joinName)}`, { state: { interviewInfo } });
      setJoinName("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to join room");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold">Rooms</h2>
          <Button variant="ghost" size="sm" onClick={logout}>Logout</Button>
        </div>
        <form className="flex gap-2" onSubmit={handleCreate} autoComplete="off">
          <input
            className="flex-1 border rounded px-2 py-1"
            placeholder="New room name"
            value={roomName}
            onChange={e => setRoomName(e.target.value)}
            disabled={!!joiningRoom}
          />
          <Button type="submit" disabled={!roomName.trim() || !!joiningRoom}>
            {joiningRoom === roomName.trim() ? <Skeleton className="w-4 h-4 rounded-full animate-spin bg-gray-400" /> : "Create"}
          </Button>
        </form>
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center gap-2"><Skeleton className="w-6 h-6 rounded-full animate-spin bg-gray-400" /> Loading rooms...</div>
          ) : rooms.length === 0 ? (
            <div className="text-gray-500">No rooms found.</div>
          ) : (
            <ul className="space-y-2">
              {rooms.map((room) => (
                <li key={room.name} className="flex items-center gap-3 p-2 border rounded hover:bg-gray-50 transition">
                  <Avatar className="w-7 h-7">
                    <AvatarFallback>{getInitials(room.name)}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate">{room.name}</span>
                  <Button
                    size="sm"
                    onClick={() => setJoiningRoom(room.name)}
                    disabled={!!joiningRoom}
                  >
                    {joiningRoom === room.name ? <Skeleton className="w-4 h-4 rounded-full animate-spin bg-gray-400" /> : "Join"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {(error || success) && (
          <Alert variant={error ? "destructive" : "default"}>
            {error || success}
          </Alert>
        )}
      </div>
    </div>
  );
} 