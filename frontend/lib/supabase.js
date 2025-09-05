import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.')
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Auth helpers
export const auth = {
  // Sign up with email and password
  signUp: async (email, password, userData = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData
      }
    })
    return { data, error }
  },

  // Sign in with email and password
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    return { data, error }
  },

  // Sign out
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // Get current user
  getCurrentUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  // Get current session
  getCurrentSession: async () => {
    const { data: { session }, error } = await supabase.auth.getSession()
    return { session, error }
  },

  // Listen to auth changes
  onAuthStateChange: (callback) => {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// Database helpers
export const db = {
  // Users
  users: {
    getById: async (id) => {
      const { data, error } = await supabase
        .from('Users')
        .select('*')
        .eq('id', id)
        .single()
      return { data, error }
    },

    getByEmail: async (email) => {
      const { data, error } = await supabase
        .from('Users')
        .select('*')
        .eq('email', email)
        .single()
      return { data, error }
    },

    create: async (userData) => {
      const { data, error } = await supabase
        .from('Users')
        .insert([userData])
        .select()
        .single()
      return { data, error }
    },

    update: async (id, updates) => {
      const { data, error } = await supabase
        .from('Users')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      return { data, error }
    }
  },

  // Interview Sessions
  sessions: {
    getById: async (id) => {
      const { data, error } = await supabase
        .from('interview_sessions')
        .select(`
          *,
          interviewer:Users!interviewerId(*),
          candidate:Users!candidateId(*)
        `)
        .eq('id', id)
        .single()
      return { data, error }
    },

    getByCode: async (sessionCode) => {
      const { data, error } = await supabase
        .from('interview_sessions')
        .select(`
          *,
          interviewer:Users!interviewerId(*),
          candidate:Users!candidateId(*)
        `)
        .eq('sessionCode', sessionCode)
        .single()
      return { data, error }
    },

    getByInterviewer: async (interviewerId) => {
      const { data, error } = await supabase
        .from('interview_sessions')
        .select(`
          *,
          interviewer:Users!interviewerId(*),
          candidate:Users!candidateId(*)
        `)
        .eq('interviewerId', interviewerId)
        .order('createdAt', { ascending: false })
      return { data, error }
    },

    getByCandidate: async (candidateId) => {
      const { data, error } = await supabase
        .from('interview_sessions')
        .select(`
          *,
          interviewer:Users!interviewerId(*),
          candidate:Users!candidateId(*)
        `)
        .eq('candidateId', candidateId)
        .order('createdAt', { ascending: false })
      return { data, error }
    },

    getPublic: async () => {
      const { data, error } = await supabase
        .from('interview_sessions')
        .select(`
          *,
          interviewer:Users!interviewerId(firstName, lastName, organization)
        `)
        .eq('isPublic', true)
        .eq('status', 'created')
        .order('createdAt', { ascending: false })
      return { data, error }
    },

    create: async (sessionData) => {
      const { data, error } = await supabase
        .from('interview_sessions')
        .insert([sessionData])
        .select()
        .single()
      return { data, error }
    },

    update: async (id, updates) => {
      const { data, error } = await supabase
        .from('interview_sessions')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      return { data, error }
    },

    delete: async (id) => {
      const { error } = await supabase
        .from('interview_sessions')
        .delete()
        .eq('id', id)
      return { error }
    }
  }
}

// Real-time helpers
export const realtime = {
  // Subscribe to session updates
  subscribeToSession: (sessionId, callback) => {
    return supabase
      .channel(`session-${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'interview_sessions',
        filter: `id=eq.${sessionId}`
      }, callback)
      .subscribe()
  },

  // Subscribe to user sessions
  subscribeToUserSessions: (userId, callback) => {
    return supabase
      .channel(`user-sessions-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'interview_sessions',
        filter: `interviewerId=eq.${userId}`
      }, callback)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'interview_sessions',
        filter: `candidateId=eq.${userId}`
      }, callback)
      .subscribe()
  },

  // Unsubscribe from channel
  unsubscribe: (subscription) => {
    return supabase.removeChannel(subscription)
  }
}

export default supabase 