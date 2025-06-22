import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { token } = params

    if (!token) {
      return NextResponse.json({ message: "Token is required" }, { status: 400 })
    }

    // Forward the request to your backend
    const backendUrl = process.env.BACKEND_URL || "http://localhost:5000"

    const response = await fetch(`${backendUrl}/api/execute/${token}`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json({ message: errorData.message || "Failed to get execution result" }, { status: response.status })
    }

    const result = await response.json()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Execute result error:", error)
    return NextResponse.json({ message: "Failed to get execution result" }, { status: 500 })
  }
} 