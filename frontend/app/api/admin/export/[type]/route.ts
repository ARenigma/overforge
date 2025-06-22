import { type NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000"

export async function GET(
  request: NextRequest,
  { params }: { params: { type: string } }
) {
  try {
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader) {
      return NextResponse.json({ success: false, error: "Authorization required" }, { status: 401 })
    }

    if (!['users', 'sessions'].includes(params.type)) {
      return NextResponse.json({ success: false, error: "Invalid export type" }, { status: 400 })
    }

    const response = await fetch(`${BACKEND_URL}/api/admin/export/${params.type}`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
      },
    })

    if (!response.ok) {
      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    }

    // Forward the CSV response
    const csvData = await response.text()
    
    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${params.type}_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error) {
    console.error("Admin export API error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to export data" },
      { status: 500 }
    )
  }
} 