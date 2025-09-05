import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get the authorization header from the request
    const authorization = request.headers.get('authorization')
    
    if (!authorization) {
      return NextResponse.json(
        { success: false, error: 'Authorization required' },
        { status: 401 }
      )
    }

    const jobProfileId = params.id

    // Forward the request to the backend
    const backendUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/jd-upload/profile/${jobProfileId}`
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data.error || 'Failed to fetch job profile' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in jd-upload profile API route:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
} 