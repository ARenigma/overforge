import { type NextRequest, NextResponse } from "next/server"

interface RoomData {
  id: string;
  name: string;
  participants: number;
  maxParticipants: number;
  language: string;
  experienceLevel: string;
  createdBy: string;
  createdAt: string;
  status: string;
}

interface ErrorResponse {
  message?: string;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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
    
    console.log(`Join room API - Attempting to join room with ID: ${roomId} (original: ${id})`)

    // Forward the request to the actual backend
    const backendUrl = process.env.BACKEND_URL || "http://localhost:5000"
    
    // The correct endpoint for joining a room by ID in the backend
    const apiUrl = `${backendUrl}/api/rooms/${roomId}/join`
    
    console.log(`Join room API - Making request to: ${apiUrl}`)
    console.log(`Join room API - Auth header: ${authHeader.substring(0, 15)}...`)
    
    try {
      const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
          "Content-Type": "application/json"
      },
        // Adding an empty body to ensure proper POST request
        body: JSON.stringify({}),
    })

      console.log(`Join room API - Response status: ${response.status}`)

    if (!response.ok) {
        const errorText = await response.text()
        console.error(`Join room API - Error response: ${errorText}`)
        
        let errorData: ErrorResponse = {}
        try {
          errorData = JSON.parse(errorText) as ErrorResponse
        } catch (e) {
          console.error("Join room API - Failed to parse error response as JSON")
        }
        
        return NextResponse.json({ 
          message: errorData.message || `Failed to join room (Status: ${response.status})` 
        }, { status: response.status })
    }

    const data = await response.json()
      console.log(`Join room API - Success response: ${JSON.stringify(data).substring(0, 100)}...`)
    return NextResponse.json(data)
    } catch (error: unknown) {
      const fetchError = error as Error;
      console.error(`Join room API - Fetch error: ${fetchError.message || String(error)}`)
      throw new Error(`Failed to connect to backend: ${fetchError.message || String(error)}`)
    }
  } catch (error: unknown) {
    const errorObj = error as Error;
    console.error(`Join room API - Uncaught error: ${errorObj.message || String(error)}`)
    return NextResponse.json({ 
      message: "Failed to join room",
      error: errorObj.message || String(error) 
    }, { status: 500 })
  }
} 