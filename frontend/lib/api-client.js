import { supabase } from './supabase'

/**
 * API Client with automatic token refresh for Supabase authentication
 * Handles token expiration, refresh, and retry logic
 */
class ApiClient {
  constructor(baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') {
    this.baseURL = baseURL.replace(/\/$/, '') // Remove trailing slash
    this.refreshing = false
    this.failedQueue = []
  }

  /**
   * Get current access token from Supabase
   */
  async getAccessToken() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Error getting session:', error)
        return null
      }

      return session?.access_token || null
    } catch (error) {
      console.error('Error getting access token:', error)
      return null
    }
  }

  /**
   * Check if token is expired or expiring soon
   */
  async isTokenExpired(bufferMinutes = 5) {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error || !session?.expires_at) {
        return true
      }

      const expiresAt = session.expires_at * 1000 // Convert to milliseconds
      const now = Date.now()
      const buffer = bufferMinutes * 60 * 1000

      return now >= (expiresAt - buffer)
    } catch (error) {
      console.error('Error checking token expiration:', error)
      return true
    }
  }

  /**
   * Refresh the current session token
   */
  async refreshToken() {
    if (this.refreshing) {
      // Wait for ongoing refresh
      return new Promise((resolve, reject) => {
        this.failedQueue.push({ resolve, reject })
      })
    }

    this.refreshing = true

    try {
      console.log('🔄 Refreshing token...')

      const { data, error } = await supabase.auth.refreshSession()

      if (error) {
        console.error('❌ Token refresh failed:', error)

        // Process failed queue
        this.failedQueue.forEach(({ reject }) => {
          reject(error)
        })
        this.failedQueue = []

        // Redirect to login or handle auth failure
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }

        throw error
      }

      console.log('✅ Token refreshed successfully')

      // Process successful queue
      this.failedQueue.forEach(({ resolve }) => {
        resolve(data.session?.access_token)
      })
      this.failedQueue = []

      return data.session?.access_token
    } catch (error) {
      console.error('Token refresh error:', error)
      throw error
    } finally {
      this.refreshing = false
    }
  }

  /**
   * Get fresh access token (refresh if needed)
   */
  async getFreshToken() {
    try {
      const isExpired = await this.isTokenExpired()

      if (isExpired) {
        return await this.refreshToken()
      }

      return await this.getAccessToken()
    } catch (error) {
      console.error('Error getting fresh token:', error)
      return null
    }
  }

  /**
   * Make authenticated API request
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`

    // Get fresh token
    const token = await this.getFreshToken()

    if (!token) {
      throw new Error('No valid authentication token available')
    }

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }

    // Prepare request options
    const requestOptions = {
      ...options,
      headers
    }

    try {
      console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`)

      const response = await fetch(url, requestOptions)

      // Handle token expiration
      if (response.status === 401) {
        const errorData = await response.json().catch(() => ({}))

        if (errorData.code === 'TOKEN_EXPIRED' || errorData.refresh_required) {
          console.log('🔄 Token expired, refreshing and retrying...')

          // Refresh token and retry once
          const newToken = await this.refreshToken()

          if (newToken) {
            const retryHeaders = {
              ...headers,
              'Authorization': `Bearer ${newToken}`
            }

            const retryResponse = await fetch(url, {
              ...requestOptions,
              headers: retryHeaders
            })

            return this.handleResponse(retryResponse)
          }
        }
      }

      return this.handleResponse(response)
    } catch (error) {
      console.error(`❌ API Request failed: ${options.method || 'GET'} ${url}`, error)
      throw error
    }
  }

  /**
   * Handle API response
   */
  async handleResponse(response) {
    const contentType = response.headers.get('content-type')
    const isJson = contentType && contentType.includes('application/json')

    let data
    try {
      data = isJson ? await response.json() : await response.text()
    } catch (error) {
      data = null
    }

    if (!response.ok) {
      const error = new Error(data?.message || `HTTP ${response.status}: ${response.statusText}`)
      error.status = response.status
      error.response = response
      error.data = data
      throw error
    }

    return data
  }

  /**
   * HTTP GET request
   */
  async get(endpoint, params = {}) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        searchParams.append(key, value.toString())
      }
    })

    const queryString = searchParams.toString()
    const url = queryString ? `${endpoint}?${queryString}` : endpoint

    return this.request(url, { method: 'GET' })
  }

  /**
   * HTTP POST request
   */
  async post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  /**
   * HTTP PUT request
   */
  async put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  }

  /**
   * HTTP PATCH request
   */
  async patch(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data)
    })
  }

  /**
   * HTTP DELETE request
   */
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' })
  }

  /**
   * Upload file with multipart/form-data
   */
  async upload(endpoint, formData) {
    const token = await this.getFreshToken()

    if (!token) {
      throw new Error('No valid authentication token available')
    }

    const url = `${this.baseURL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
        // Don't set Content-Type for FormData, let browser set it with boundary
      },
      body: formData
    })

    return this.handleResponse(response)
  }
}

// Create singleton instance
const apiClient = new ApiClient()

// Export both the class and instance
export { ApiClient }
export default apiClient

// Convenience methods for common API calls
export const api = {
  // Auth endpoints
  auth: {
    login: (email, password) => apiClient.post('/api/auth/login', { email, password }),
    register: (userData) => apiClient.post('/api/auth/register', userData),
    logout: () => apiClient.post('/api/auth/logout'),
    profile: () => apiClient.get('/api/auth/profile'),
    verify: () => apiClient.get('/api/auth/verify'),
    refresh: (refreshToken) => apiClient.post('/api/auth/refresh', { refresh_token: refreshToken })
  },

  // User endpoints
  users: {
    getProfile: (userId) => apiClient.get(`/api/users/${userId}`),
    updateProfile: (userId, data) => apiClient.put(`/api/users/${userId}`, data),
    getAllUsers: (params) => apiClient.get('/api/users', params)
  },

  // Interview sessions
  sessions: {
    create: (sessionData) => apiClient.post('/api/sessions', sessionData),
    get: (sessionId) => apiClient.get(`/api/sessions/${sessionId}`),
    update: (sessionId, data) => apiClient.put(`/api/sessions/${sessionId}`, data),
    delete: (sessionId) => apiClient.delete(`/api/sessions/${sessionId}`),
    join: (sessionCode) => apiClient.post(`/api/sessions/join`, { sessionCode }),
    getPublic: () => apiClient.get('/api/sessions/public'),
    getByUser: (userId) => apiClient.get(`/api/sessions/user/${userId}`)
  },

  // Assessment endpoints
  assessments: {
    create: (assessmentData) => apiClient.post('/api/assessments', assessmentData),
    get: (assessmentId) => apiClient.get(`/api/assessments/${assessmentId}`),
    update: (assessmentId, data) => apiClient.put(`/api/assessments/${assessmentId}`, data),
    submit: (assessmentId, answers) => apiClient.post(`/api/assessments/${assessmentId}/submit`, { answers }),
    getResults: (assessmentId) => apiClient.get(`/api/assessments/${assessmentId}/results`)
  },

  // AI endpoints
  ai: {
    generateQuestions: (params) => apiClient.post('/api/ai/generate-questions', params),
    analyzeCode: (code, language) => apiClient.post('/api/ai/analyze-code', { code, language }),
    generateFeedback: (sessionId) => apiClient.post(`/api/ai/generate-feedback/${sessionId}`)
  }
}
