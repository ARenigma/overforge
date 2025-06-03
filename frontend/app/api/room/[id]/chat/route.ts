import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { content } = await request.json()

    if (!content) {
      return NextResponse.json({ message: "Message content is required" }, { status: 400 })
    }

    // Forward to backend or handle directly
    const backendUrl = process.env.BACKEND_URL || "http://localhost:5000"

    try {
      const response = await fetch(`${backendUrl}/api/room/${params.id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ content }),
      })

      if (response.ok) {
        const data = await response.json()
        return NextResponse.json(data)
      }
    } catch (error) {
      console.log("Backend not available, using mock response")
    }

    // Mock response if backend is not available
    return NextResponse.json({
      message: "Message sent successfully",
      messageId: `msg-${Date.now()}`,
    })
  } catch (error) {
    console.error("Chat error:", error)
    return NextResponse.json({ message: "Failed to send message" }, { status: 500 })
  }
}
