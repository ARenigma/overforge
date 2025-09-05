// app/api/room/[id]/route.ts

import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const backendUrl = process.env.BACKEND_URL || "http://localhost:5001"
    const { id } = params

    const response = await fetch(`${backendUrl}/api/rooms/${id}`, {
      method: "GET",
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
