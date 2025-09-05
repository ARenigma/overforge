import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header from the request
    const authorization = request.headers.get('authorization')
    
    if (!authorization) {
      return NextResponse.json(
        { success: false, error: 'Authorization required' },
        { status: 401 }
      )
    }

    // Get the form data from the request
    const formData = await request.formData()

    // Forward the request to the backend
    const backendUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/jd-upload`
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Authorization': authorization,
        // Note: Don't set Content-Type for FormData - let fetch set it with boundary
      },
      body: formData
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data.error || 'Failed to upload JD' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in jd-upload API route:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
} 