import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// This is a simplified middleware that doesn't handle authentication
// Authentication is now handled directly in the components using localStorage
export function middleware(request: NextRequest) {
  // Just pass through all requests
  return NextResponse.next()
}

export const config = {
  matcher: []  // Empty matcher means middleware won't run
} 