import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header from the request
    const authorization = request.headers.get('authorization')
    
    // Get the request body
    const body = await request.json()
    
    // Forward the request to the backend
    const backendUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/parameter-selection/create-session`
    
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
        { success: false, error: data.error || 'Failed to create session' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in create-session API route:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
} 