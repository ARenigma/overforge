import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const refreshingRef = useRef(false)
  const refreshTimeoutRef = useRef(null)

  // Initialize auth state
  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      try {
        // Get initial session
        const { data: { session: initialSession }, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Error getting initial session:', error)
          setError(error.message)
        } else if (initialSession && mounted) {
          setSession(initialSession)
          setUser(initialSession.user)
          scheduleTokenRefresh(initialSession)
        }
      } catch (err) {
        console.error('Auth initialization error:', err)
        setError(err.message)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initializeAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        console.log('Auth state changed:', event, session?.user?.email)

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setSession(session)
          setUser(session?.user || null)
          setError(null)

          if (session) {
            scheduleTokenRefresh(session)
          }
        } else if (event === 'SIGNED_OUT') {
          setSession(null)
          setUser(null)
          setError(null)
          clearRefreshTimeout()
        } else if (event === 'PASSWORD_RECOVERY') {
          // Handle password recovery if needed
          console.log('Password recovery event')
        }

        setLoading(false)
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
      clearRefreshTimeout()
    }
  }, [])

  // Schedule automatic token refresh
  const scheduleTokenRefresh = (session) => {
    if (!session?.expires_at) return

    clearRefreshTimeout()

    // Calculate time until token expires (refresh 5 minutes before expiry)
    const expiresAt = session.expires_at * 1000 // Convert to milliseconds
    const now = Date.now()
    const timeUntilRefresh = expiresAt - now - (5 * 60 * 1000) // 5 minutes before expiry

    if (timeUntilRefresh > 0) {
      refreshTimeoutRef.current = setTimeout(() => {
        refreshToken()
      }, timeUntilRefresh)

      console.log(`Token refresh scheduled in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`)
    } else {
      // Token is already expired or expires very soon, refresh immediately
      refreshToken()
    }
  }

  // Clear refresh timeout
  const clearRefreshTimeout = () => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = null
    }
  }

  // Refresh token function
  const refreshToken = async () => {
    if (refreshingRef.current) {
      console.log('Token refresh already in progress')
      return
    }

    refreshingRef.current = true

    try {
      console.log('Refreshing token...')
      const { data, error } = await supabase.auth.refreshSession()

      if (error) {
        console.error('Token refresh failed:', error)
        setError('Session expired. Please log in again.')
        signOut()
      } else if (data.session) {
        console.log('Token refreshed successfully')
        setSession(data.session)
        setUser(data.session.user)
        setError(null)
        scheduleTokenRefresh(data.session)
      }
    } catch (err) {
      console.error('Token refresh error:', err)
      setError('Session expired. Please log in again.')
      signOut()
    } finally {
      refreshingRef.current = false
    }
  }

  // Sign in function
  const signIn = async (email, password) => {
    try {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        setError(error.message)
        return { error }
      }

      return { data }
    } catch (err) {
      setError(err.message)
      return { error: err }
    } finally {
      setLoading(false)
    }
  }

  // Sign up function
  const signUp = async (email, password, userData = {}) => {
    try {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData
        }
      })

      if (error) {
        setError(error.message)
        return { error }
      }

      return { data }
    } catch (err) {
      setError(err.message)
      return { error: err }
    } finally {
      setLoading(false)
    }
  }

  // Sign out function
  const signOut = async () => {
    try {
      setLoading(true)
      clearRefreshTimeout()

      const { error } = await supabase.auth.signOut()

      if (error) {
        console.error('Sign out error:', error)
      }

      setSession(null)
      setUser(null)
      setError(null)
    } catch (err) {
      console.error('Sign out error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Get current access token
  const getAccessToken = () => {
    return session?.access_token || null
  }

  // Check if token is expired or expiring soon
  const isTokenExpired = (bufferMinutes = 5) => {
    if (!session?.expires_at) return true

    const expiresAt = session.expires_at * 1000
    const now = Date.now()
    const buffer = bufferMinutes * 60 * 1000

    return now >= (expiresAt - buffer)
  }

  // Get fresh token (refresh if needed)
  const getFreshToken = async () => {
    if (!session) return null

    if (isTokenExpired()) {
      await refreshToken()
    }

    return session?.access_token || null
  }

  // API request wrapper with automatic token refresh
  const apiRequest = async (url, options = {}) => {
    const token = await getFreshToken()

    if (!token) {
      throw new Error('No valid token available')
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }

    const response = await fetch(url, {
      ...options,
      headers
    })

    // If token is expired, try to refresh and retry once
    if (response.status === 401 && !options._retry) {
      console.log('Token expired, refreshing and retrying request...')
      await refreshToken()

      const freshToken = await getFreshToken()
      if (freshToken) {
        return apiRequest(url, { ...options, _retry: true })
      }
    }

    return response
  }

  const value = {
    user,
    session,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    refreshToken,
    getAccessToken,
    getFreshToken,
    isTokenExpired,
    apiRequest
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthContext
