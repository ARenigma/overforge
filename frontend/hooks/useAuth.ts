// Compatibility wrapper for the old useAuth hook
// This allows existing components to work without modification
// while using the new Supabase auth system under the hood

import { useSupabaseAuth } from '@/context/SupabaseAuthContext'

export function useAuth() {
  const supabaseAuth = useSupabaseAuth()
  
  // Create a compatible user object with username field for legacy components
  const compatibleUser = supabaseAuth.user ? {
    ...supabaseAuth.user,
    username: supabaseAuth.user.email?.split('@')[0] || 'user' // Generate username from email
  } : null
  
  // Return the same interface as the old useAuth hook
  return {
    user: compatibleUser,
    token: supabaseAuth.token,
    loading: supabaseAuth.loading,
    error: supabaseAuth.error,
    login: supabaseAuth.login,
    signup: supabaseAuth.signup,
    logout: supabaseAuth.logout
  }
} 