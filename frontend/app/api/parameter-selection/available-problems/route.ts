import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header from the request
    const authorization = request.headers.get('authorization')
    
    // Get the request body
    const body = await request.json()
    
    // Forward the request to the backend
    const backendUrl = `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/parameter-selection/available-problems`
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization && { 'Authorization': authorization }),
      },
      body: JSON.stringify(body)
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data.error || 'Failed to fetch available problems' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in available-problems API route:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
} 