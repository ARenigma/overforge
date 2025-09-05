import React, { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth-context'
import { api } from '../lib/api-client'

const AuthExample = () => {
  const {
    user,
    session,
    loading,
    error: authError,
    signIn,
    signOut,
    isTokenExpired,
    getFreshToken
  } = useAuth()

  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [apiData, setApiData] = useState(null)
  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [tokenInfo, setTokenInfo] = useState(null)

  // Update token info when session changes
  useEffect(() => {
    if (session) {
      setTokenInfo({
        expiresAt: new Date(session.expires_at * 1000).toLocaleString(),
        isExpired: Date.now() >= (session.expires_at * 1000)
      })
    } else {
      setTokenInfo(null)
    }
  }, [session])

  // Handle login form submission
  const handleLogin = async (e) => {
    e.preventDefault()

    if (!loginForm.email || !loginForm.password) {
      alert('Please fill in all fields')
      return
    }

    try {
      const { error } = await signIn(loginForm.email, loginForm.password)

      if (error) {
        console.error('Login failed:', error)
      } else {
        setLoginForm({ email: '', password: '' })
        console.log('Login successful!')
      }
    } catch (err) {
      console.error('Login error:', err)
    }
  }

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut()
      setApiData(null)
      setApiError(null)
      console.log('Logged out successfully')
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  // Test authenticated API call
  const testApiCall = async () => {
    setApiLoading(true)
    setApiError(null)

    try {
      // Example: Get user profile
      const profileData = await api.auth.profile()
      setApiData(profileData)
      console.log('API call successful:', profileData)
    } catch (err) {
      setApiError(err.message)
      console.error('API call failed:', err)
    } finally {
      setApiLoading(false)
    }
  }

  // Test token refresh
  const testTokenRefresh = async () => {
    try {
      const freshToken = await getFreshToken()
      console.log('Fresh token obtained:', freshToken ? 'Success' : 'Failed')

      // Update token info
      if (session) {
        setTokenInfo({
          expiresAt: new Date(session.expires_at * 1000).toLocaleString(),
          isExpired: await isTokenExpired()
        })
      }
    } catch (err) {
      console.error('Token refresh failed:', err)
    }
  }

  // Check token expiration status
  const checkTokenStatus = async () => {
    if (!session) return

    const expired = await isTokenExpired()
    const expiringSoon = await isTokenExpired(1) // 1 minute buffer

    console.log('Token status:', {
      expired,
      expiringSoon,
      expiresAt: new Date(session.expires_at * 1000).toLocaleString()
    })
  }

  if (loading) {
    return (
      <div className="auth-example">
        <div className="loading">
          <p>Loading authentication state...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-example">
      <h2>Authentication Example</h2>

      {/* Authentication Error Display */}
      {authError && (
        <div className="error-banner">
          <h3>Authentication Error</h3>
          <p>{authError}</p>
        </div>
      )}

      {/* Login Form (shown when not authenticated) */}
      {!user && (
        <div className="login-section">
          <h3>Login</h3>
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="email">Email:</label>
              <input
                type="email"
                id="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="Enter your email"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password:</label>
              <input
                type="password"
                id="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Enter your password"
                required
              />
            </div>

            <button type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      )}

      {/* User Info (shown when authenticated) */}
      {user && (
        <div className="user-section">
          <h3>User Information</h3>
          <div className="user-info">
            <p><strong>ID:</strong> {user.id}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Name:</strong> {user.firstName} {user.lastName}</p>
            <p><strong>Role:</strong> {user.role}</p>
            <p><strong>Username:</strong> {user.username}</p>
          </div>

          {/* Token Information */}
          {tokenInfo && (
            <div className="token-info">
              <h4>Token Information</h4>
              <p><strong>Expires At:</strong> {tokenInfo.expiresAt}</p>
              <p><strong>Status:</strong>
                <span className={tokenInfo.isExpired ? 'expired' : 'valid'}>
                  {tokenInfo.isExpired ? ' Expired' : ' Valid'}
                </span>
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="action-buttons">
            <button onClick={handleLogout}>
              Sign Out
            </button>

            <button onClick={testApiCall} disabled={apiLoading}>
              {apiLoading ? 'Testing API...' : 'Test API Call'}
            </button>

            <button onClick={testTokenRefresh}>
              Refresh Token
            </button>

            <button onClick={checkTokenStatus}>
              Check Token Status
            </button>
          </div>

          {/* API Test Results */}
          <div className="api-section">
            <h4>API Test Results</h4>

            {apiLoading && <p>Making API call...</p>}

            {apiError && (
              <div className="api-error">
                <p><strong>API Error:</strong> {apiError}</p>
              </div>
            )}

            {apiData && (
              <div className="api-success">
                <p><strong>API Response:</strong></p>
                <pre>{JSON.stringify(apiData, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Debugging Info */}
      <div className="debug-section">
        <h4>Debug Information</h4>
        <details>
          <summary>Raw Session Data</summary>
          <pre>{JSON.stringify(session, null, 2)}</pre>
        </details>

        <details>
          <summary>Raw User Data</summary>
          <pre>{JSON.stringify(user, null, 2)}</pre>
        </details>
      </div>

      <style jsx>{`
        .auth-example {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          font-family: Arial, sans-serif;
        }

        .loading {
          text-align: center;
          padding: 40px;
        }

        .error-banner {
          background-color: #fee;
          border: 1px solid #fcc;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
        }

        .error-banner h3 {
          color: #c33;
          margin-top: 0;
        }

        .login-section {
          background-color: #f9f9f9;
          padding: 20px;
          border-radius: 5px;
          margin-bottom: 20px;
        }

        .form-group {
          margin-bottom: 15px;
        }

        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }

        .form-group input {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 3px;
          box-sizing: border-box;
        }

        .user-section {
          background-color: #f0f8ff;
          padding: 20px;
          border-radius: 5px;
          margin-bottom: 20px;
        }

        .user-info {
          background-color: white;
          padding: 15px;
          border-radius: 3px;
          margin: 15px 0;
        }

        .token-info {
          background-color: #fff9e6;
          padding: 15px;
          border-radius: 3px;
          margin: 15px 0;
        }

        .expired {
          color: #c33;
          font-weight: bold;
        }

        .valid {
          color: #3c3;
          font-weight: bold;
        }

        .action-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin: 20px 0;
        }

        .action-buttons button {
          padding: 10px 15px;
          border: none;
          border-radius: 3px;
          background-color: #007cba;
          color: white;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .action-buttons button:hover {
          background-color: #005a8b;
        }

        .action-buttons button:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }

        .api-section {
          background-color: #f5f5f5;
          padding: 15px;
          border-radius: 3px;
          margin: 15px 0;
        }

        .api-error {
          color: #c33;
          background-color: #fee;
          padding: 10px;
          border-radius: 3px;
          margin: 10px 0;
        }

        .api-success {
          color: #3c3;
          background-color: #efe;
          padding: 10px;
          border-radius: 3px;
          margin: 10px 0;
        }

        .debug-section {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
        }

        details {
          margin: 10px 0;
        }

        summary {
          cursor: pointer;
          font-weight: bold;
          padding: 5px;
        }

        pre {
          background-color: #f5f5f5;
          padding: 10px;
          border-radius: 3px;
          overflow-x: auto;
          font-size: 12px;
        }
      `}</style>
    </div>
  )
}

export default AuthExample
