import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { useSupabaseAuth } from '../context/SupabaseAuthContext';

interface SessionContainer {
  sessionId: string;
  type: string;
  language: string;
  framework: string;
  containerName?: string;
  containerId?: string;
  webUrl: string;
  status: 'creating' | 'running' | 'ready' | 'error' | 'mock';
  createdAt: Date;
  lastActivity: Date;
  port?: number;
  resourceLimits?: {
    cpus: string;
    memory: string;
    timeout: number;
  };
}

interface ExecutionResult {
  sessionId: string;
  output: string;
  error?: string;
  status: 'completed' | 'error';
  executedAt: string;
  webUrl?: string;
  executionTime?: number;
}

interface UseSessionContainerReturn {
  container: SessionContainer | null;
  isCreating: boolean;
  isExecuting: boolean;
  error: string | null;
  createSession: (params: {
    type: string;
    language: string;
    framework: string;
    sourceCode?: string;
  }) => Promise<SessionContainer | null>;
  executeCode: (code: string) => Promise<ExecutionResult | null>;
  destroySession: () => Promise<boolean>;
  getSessionStatus: () => Promise<void>;
  setContainer: (container: SessionContainer | null) => void;
}

export const useSessionContainer = (initialSessionId?: string): UseSessionContainerReturn => {
  const { user } = useAuth();
  const { getAuthHeaders } = useSupabaseAuth();
  const [container, setContainer] = useState<SessionContainer | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ensure baseUrl always has /api suffix
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
  const baseUrl = apiBase.endsWith('/api') ? apiBase : `${apiBase}/api`;

  // Create a new session container
  const createSession = useCallback(async (params: {
    type: string;
    language: string;
    framework: string;
    sourceCode?: string;
  }): Promise<SessionContainer | null> => {
    if (!user) {
      setError('User must be authenticated to create session');
      return null;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`${baseUrl}/session-containers/create`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: initialSessionId,
          ...params,
          config: {
            production: process.env.NODE_ENV === 'production',
            userId: user.id,
            userEmail: user.email
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create session' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.session) {
        setContainer(data.session);
        console.log('✅ Session container created:', data.session.sessionId);
        return data.session;
      } else {
        throw new Error(data.error || 'Failed to create session');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('❌ Failed to create session container:', errorMessage);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [user, baseUrl, getAuthHeaders, initialSessionId]);

  // Execute code in the session container
  const executeCode = useCallback(async (code: string): Promise<ExecutionResult | null> => {
    if (!container) {
      setError('No active session container');
      return null;
    }

    setIsExecuting(true);
    setError(null);

    try {
      const response = await fetch(`${baseUrl}/session-containers/${container.sessionId}/execute`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          code,
          framework: container.framework // Send framework info to help with session creation
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Execution failed' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.result) {
        // Update container last activity
        setContainer(prev => prev ? {
          ...prev,
          lastActivity: new Date()
        } : null);
        
        console.log('✅ Code executed successfully');
        // Manually add webUrl to the result object from the container state
        return {
          ...data.result,
          webUrl: container.webUrl
        };
      } else {
        throw new Error(data.error || 'Execution failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Execution error';
      setError(errorMessage);
      console.error('❌ Code execution failed:', errorMessage);
      return null;
    } finally {
      setIsExecuting(false);
    }
  }, [container, baseUrl, getAuthHeaders]);

  // Get session status
  const getSessionStatus = useCallback(async (): Promise<void> => {
    if (!container) return;

    try {
      const response = await fetch(`${baseUrl}/session-containers/${container.sessionId}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.session) {
          setContainer(data.session);
        }
      }
    } catch (err) {
      console.error('Failed to get session status:', err);
    }
  }, [container, baseUrl, getAuthHeaders]);

  // Destroy session container
  const destroySession = useCallback(async (): Promise<boolean> => {
    if (!container) return false;

    try {
      const response = await fetch(`${baseUrl}/session-containers/${container.sessionId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setContainer(null);
          console.log('✅ Session container destroyed');
          return true;
        }
      }
      
      return false;
    } catch (err) {
      console.error('Failed to destroy session:', err);
      return false;
    }
  }, [container, baseUrl, getAuthHeaders]);

  // Auto-refresh session status
  useEffect(() => {
    if (container && container.status === 'running') {
      const interval = setInterval(getSessionStatus, 30000); // Every 30 seconds
      return () => clearInterval(interval);
    }
  }, [container, getSessionStatus]);

  // Load existing session if sessionId provided
  useEffect(() => {
    if (initialSessionId && !container) {
      getSessionStatus();
    }
  }, [initialSessionId, container, getSessionStatus]);

  return {
    container,
    isCreating,
    isExecuting,
    error,
    createSession,
    executeCode,
    destroySession,
    getSessionStatus,
    setContainer
  };
}; 