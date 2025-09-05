import { type NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5001"

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader) {
      return NextResponse.json({ success: false, error: "Authorization required" }, { status: 401 })
    }

    const response = await fetch(`${BACKEND_URL}/api/admin/users/${params.id}`, {
      method: "DELETE",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Admin delete user API error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete user" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get("authorization")
    const body = await request.json()
    
    if (!authHeader) {
      return NextResponse.json({ success: false, error: "Authorization required" }, { status: 401 })
    }

    const response = await fetch(`${BACKEND_URL}/api/admin/users/${params.id}`, {
      method: "PATCH",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Admin update user API error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update user" },
      { status: 500 }
    )
  }
} 