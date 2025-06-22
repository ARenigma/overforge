import { type NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Check auth headers
    const authHeader = request.headers.get("authorization")
    const cookieHeader = request.headers.get("cookie")
    
    // Extract auth_token from cookie header if present
    let cookieToken = null
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim())
      const authCookie = cookies.find(c => c.startsWith('auth_token='))
      if (authCookie) {
        cookieToken = authCookie.split('=')[1]
      }
    }
    
    // Get cookies directly from the request
    const authCookie = request.cookies.get('auth_token')
    
    return NextResponse.json({
      message: "Debug information",
      headers: {
        authorization: authHeader ? "Present" : "Not present",
        cookie: cookieHeader ? "Present" : "Not present",
      },
      cookies: {
        auth_token: {
          fromHeader: cookieToken ? "Present" : "Not present",
          fromRequest: authCookie ? "Present" : "Not present",
          value: authCookie ? authCookie.value.substring(0, 10) + "..." : null,
        }
      },
      url: {
        pathname: request.nextUrl.pathname,
        searchParams: Object.fromEntries(request.nextUrl.searchParams.entries()),
      }
    })
  } catch (error) {
    console.error("Debug API error:", error)
    return NextResponse.json({ message: "Error in debug endpoint", error: String(error) }, { status: 500 })
  }
} 