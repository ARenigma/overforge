"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  role: string
  experience?: string
  preferredLanguage?: string
  organization?: string
  department?: string
}

interface AuthContextType {
  user: User | null
  supabaseUser: any | null
  token: string | null
  loading: boolean
  error: string | null
  login: (credentials: LoginCredentials) => Promise<boolean>
  signup: (userData: SignupData) => Promise<boolean>
  logout: () => void
  getAuthHeaders: () => { [key: string]: string }
}

interface LoginCredentials {
  email: string
  password: string
}

interface SignupData {
  email: string
  password: string
  firstName: string
  lastName: string
  role: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [supabaseUser, setSupabaseUser] = useState<any | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initialize auth state and listen for changes
  useEffect(() => {
    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Supabase auth - Error getting session:', error)
          setLoading(false)
          return
        }

        if (session?.user) {
          console.log('Supabase auth - Initial session found:', session.user.id)
          await handleAuthUser(session.user, session.access_token)
        } else {
          console.log('Supabase auth - No initial session found')
        }
      } catch (error) {
        console.error('Supabase auth - Error initializing:', error)
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Supabase auth - State change:', event, session?.user?.id)
      
      if (event === 'SIGNED_IN' && session?.user) {
        await handleAuthUser(session.user, session.access_token)
      } else if (event === 'SIGNED_OUT') {
        handleSignOut()
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        console.log('Supabase auth - Token refreshed')
        setToken(session.access_token)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleAuthUser = async (supabaseUser: any, accessToken: string) => {
    try {
      setSupabaseUser(supabaseUser)
      setToken(accessToken)

      // Try to get user data from Users table
      const { data: userData, error: userError } = await supabase
        .from('Users')
        .select('*')
        .eq('id', supabaseUser.id)
        .single()

      if (userError) {
        console.log('Supabase auth - User not found in Users, creating profile...')
        
        // Create user profile if it doesn't exist
        const newUser = {
          id: supabaseUser.id,
          email: supabaseUser.email,
          firstName: supabaseUser.user_metadata?.firstName || 'User',
          lastName: supabaseUser.user_metadata?.lastName || '',
          role: supabaseUser.user_metadata?.role || 'interviewer',
          organization: supabaseUser.user_metadata?.organization || '',
          department: supabaseUser.user_metadata?.department || '',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        const { error: insertError } = await supabase
          .from('Users')
          .insert([newUser])

        if (insertError) {
          console.error('Supabase auth - Error creating user profile:', insertError)
        } else {
          console.log('Supabase auth - User profile created successfully')
          setUser(newUser)
        }
      } else {
        console.log('Supabase auth - User found in Users:', userData.email)
        setUser(userData)
      }
    } catch (error) {
      console.error('Supabase auth - Error handling auth user:', error)
      setError('Failed to load user profile')
    }
  }

  const handleSignOut = () => {
    console.log('Supabase auth - Signing out')
    setUser(null)
    setSupabaseUser(null)
    setToken(null)
    setError(null)
  }

  const login = async ({ email, password }: LoginCredentials) => {
    setLoading(true)
    setError(null)

    try {
      console.log('SupabaseAuth - Attempting login for:', email)
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      console.log('SupabaseAuth - Raw Supabase response:', { data, error })

      if (error) {
        console.error('SupabaseAuth - Login error:', error.message)
        setError(error.message)
        return false
      }

      if (data.user) {
        console.log('SupabaseAuth - Login successful:', data.user.id)
        console.log('SupabaseAuth - Session data:', data.session)
        // handleAuthUser will be called automatically by the auth state change listener
        return true
      }

      console.log('SupabaseAuth - No user in response')
      return false
    } catch (err) {
      console.error('SupabaseAuth - Login exception:', err)
      setError(err instanceof Error ? err.message : 'Login failed')
      return false
    } finally {
      setLoading(false)
    }
  }

  const signup = async (userData: SignupData) => {
    setLoading(true)
    setError(null)

    try {
      console.log('Supabase auth - Attempting signup for:', userData.email)
      
      const { data, error } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            firstName: userData.firstName,
            lastName: userData.lastName,
            role: userData.role
          }
        }
      })

      if (error) {
        console.error('Supabase auth - Signup error:', error.message)
        setError(error.message)
        return false
      }

      if (data.user) {
        console.log('Supabase auth - Signup successful:', data.user.id)
        // If email confirmation is required, the user won't be automatically logged in
        if (!data.session) {
          setError('Please check your email to confirm your account')
        }
        return true
      }

      return false
    } catch (err) {
      console.error('Supabase auth - Signup exception:', err)
      setError(err instanceof Error ? err.message : 'Signup failed')
      return false
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    console.log('Supabase auth - Logging out')
    setLoading(true)
    
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Supabase auth - Logout error:', error)
      }
    } catch (error) {
      console.error('Supabase auth - Logout exception:', error)
    } finally {
      setLoading(false)
    }
  }

  const getAuthHeaders = (): { [key: string]: string } => {
    if (!token) {
      return {}
    }
    
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      supabaseUser, 
      token, 
      loading, 
      error, 
      login, 
      signup, 
      logout, 
      getAuthHeaders 
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useSupabaseAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useSupabaseAuth must be used within a SupabaseAuthProvider")
  }
  return context
}

// Export supabase client for direct use if needed
export { supabase } 