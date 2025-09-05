import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { source_code, language_id, stdin } = await request.json()

    if (!source_code || typeof source_code !== "string") {
      return NextResponse.json({ message: "source_code is required" }, { status: 400 })
    }

    if (!language_id) {
      return NextResponse.json({ message: "language_id is required" }, { status: 400 })
    }

    // Forward the request to Judge0 or your backend
    const backendUrl = process.env.BACKEND_URL || "http://localhost:5001"

    const response = await fetch(`${backendUrl}/api/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ source_code, language_id, stdin }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json({ message: errorData.message || "Code execution failed" }, { status: response.status })
    }

    const result = await response.json()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Execute error:", error)
    return NextResponse.json({ message: "Failed to execute code" }, { status: 500 })
  }
}
