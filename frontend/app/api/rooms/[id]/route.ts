import { type NextRequest, NextResponse } from "next/server"

interface RoomData {
  id: string;
  name: string;
  participants: Array<{
    id: string;
    name: string;
    avatar?: string;
    role: "interviewer" | "candidate";
  }>;
  language: string;
  experienceLevel: string;
  status: "waiting" | "active" | "completed";
  createdAt: string;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { id } = params
    // Make sure id is a string before using replace
    const idStr = String(id)
    // Extract digits only from the ID and convert to integer
    const roomId = parseInt(idStr.replace(/[^\d]/g, ''), 10)
    
    if (isNaN(roomId)) {
      return NextResponse.json({ message: "Invalid room ID format" }, { status: 400 })
    }
    
    console.log(`Get room API - Fetching room with ID: ${roomId} (original: ${id})`)

    // Forward the request to the actual backend
    const backendUrl = process.env.BACKEND_URL || "http://localhost:5001"

    const response = await fetch(`${backendUrl}/api/rooms/${roomId}`, {
      headers: {
        Authorization: authHeader,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json({ message: errorData.message || "Failed to fetch room" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Fetch room error:", error)
    return NextResponse.json({ message: "Failed to fetch room" }, { status: 500 })
  }
} 