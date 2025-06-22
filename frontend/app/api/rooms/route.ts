import { type NextRequest, NextResponse } from "next/server"

// Mock room data
const mockRooms = [
  {
    id: "r1",
    name: "JavaScript Algorithms Interview",
    participants: 1,
    maxParticipants: 2,
    language: "javascript",
    experienceLevel: "2-5",
    createdBy: "Demo User",
    createdAt: "2023-05-15T10:30:00Z",
    status: "waiting",
  },
  {
    id: "r2",
    name: "Python Data Structures",
    participants: 1,
    maxParticipants: 2,
    language: "python",
    experienceLevel: "0-2",
    createdBy: "John Doe",
    createdAt: "2023-05-16T09:15:00Z",
    status: "waiting",
  },
  {
    id: "r3",
    name: "Senior Java Backend Interview",
    participants: 2,
    maxParticipants: 3,
    language: "java",
    experienceLevel: "5+",
    createdBy: "Jane Smith",
    createdAt: "2023-05-16T14:45:00Z",
    status: "active",
  },
]

export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    // Forward the request to the actual backend
    const backendUrl = process.env.BACKEND_URL || "http://localhost:5000"
    console.log(`Rooms API - Connecting to backend at: ${backendUrl}/api/rooms`)

    const response = await fetch(`${backendUrl}/api/rooms`, {
      headers: {
        Authorization: authHeader,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json({ message: errorData.message || "Failed to fetch rooms" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Rooms API error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    // Parse request body
    const requestData = await request.json()
    const { name, language, experienceLevel } = requestData

    if (!name || !language || !experienceLevel) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 })
    }

    // Forward the request to the actual backend
    const backendUrl = process.env.BACKEND_URL || "http://localhost:5000"
    console.log(`Create Room API - Connecting to backend at: ${backendUrl}/api/rooms`)

    const response = await fetch(`${backendUrl}/api/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(requestData),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json({ message: errorData.message || "Failed to create room" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Create room API error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}
