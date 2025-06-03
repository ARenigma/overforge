import { type NextRequest, NextResponse } from "next/server"

// Mock user profile data
const userProfile = {
  id: "1",
  name: "Demo User",
  email: "demo@example.com",
  firstName: "Demo",
  lastName: "User",
  avatar: "/placeholder.svg?height=40&width=40",
  role: "Admin",
  department: "Engineering",
  joinDate: "2023-01-15",
}

export async function GET(request: NextRequest) {
  try {
    // In production, verify JWT token and get user ID
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    return NextResponse.json(userProfile)
  } catch (error) {
    console.error("Profile API error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}
