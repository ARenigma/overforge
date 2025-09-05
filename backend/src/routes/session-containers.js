const express = require('express');
const router = express.Router();
const productionContainerService = require('../services/productionContainerService');
const { authenticateSupabase } = require('../middleware/supabase-auth');

// Create a new session container
router.post('/create', authenticateSupabase, async (req, res) => {
  try {
    const { 
      sessionId, 
      type, 
      language, 
      framework, 
      sourceCode, 
      config = {} 
    } = req.body;

    if (!type || !language || !framework) {
      return res.status(400).json({
        error: 'Missing required fields: type, language, framework'
      });
    }

    console.log(`📋 Creating session container for user ${req.user?.id}:`, {
      sessionId,
      type,
      language,
      framework
    });

    const session = await productionContainerService.createSession({
      sessionId,
      type,
      language,
      framework,
      sourceCode,
      config: {
        ...config,
        userId: req.user?.id,
        userEmail: req.user?.email
      }
    });

    res.json({
      success: true,
      session,
      message: `Session container created successfully`
    });

  } catch (error) {
    console.error('Failed to create session container:', error);
    res.status(500).json({
      error: 'Failed to create session container',
      message: error.message
    });
  }
});

// Get session information
router.get('/:sessionId', authenticateSupabase, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await productionContainerService.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      session
    });

  } catch (error) {
    console.error('Failed to get session:', error);
    res.status(500).json({
      error: 'Failed to get session',
      message: error.message
    });
  }
});

// Execute code in session container
router.post('/:sessionId/execute', authenticateSupabase, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        error: 'Code is required'
      });
    }

    console.log(`🏃 Executing code in session ${sessionId} for user ${req.user?.id}`);

    // Check if session exists, if not, try to handle it as a shared container
    let session = await productionContainerService.getSession(sessionId);
    
    if (!session) {
      console.log(`⚠️ Session ${sessionId} not found, checking if it's a shared container request`);
      
      // Extract framework from sessionId (format: param-TIMESTAMP-ID)
      const framework = req.body.framework || 'django'; // Default to django if not specified
      
      // Create a temporary session for this request
      console.log(`🔄 Creating temporary session for ${sessionId} with framework ${framework}`);
      
      // Register a mock session for this room
      session = productionContainerService.createMockSession(
        sessionId,
        'framework',
        'python', // Default language
        framework
      );
      
      console.log(`✅ Temporary session created for ${sessionId}`);
    }

    const result = await productionContainerService.executeInSession(sessionId, code);

    res.json({
      success: true,
      result
    });

  } catch (error) {
    console.error('Failed to execute code:', error);
    res.status(500).json({
      error: 'Failed to execute code',
      message: error.message
    });
  }
});

// Destroy session container
router.delete('/:sessionId', authenticateSupabase, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log(`🗑️ Destroying session ${sessionId} for user ${req.user?.id}`);
    
    const destroyed = await productionContainerService.destroySession(sessionId);
    
    if (!destroyed) {
      return res.status(404).json({
        error: 'Session not found or already destroyed'
      });
    }

    res.json({
      success: true,
      message: 'Session container destroyed successfully'
    });

  } catch (error) {
    console.error('Failed to destroy session:', error);
    res.status(500).json({
      error: 'Failed to destroy session',
      message: error.message
    });
  }
});

// List all active sessions (admin only)
router.get('/', authenticateSupabase, async (req, res) => {
  try {
    // Basic admin check - you might want to enhance this
    if (!req.user?.email?.includes('admin')) {
      return res.status(403).json({
        error: 'Admin access required'
      });
    }

    const sessions = await productionContainerService.listActiveSessions();
    const stats = await productionContainerService.getSessionStats();

    res.json({
      success: true,
      sessions,
      stats
    });

  } catch (error) {
    console.error('Failed to list sessions:', error);
    res.status(500).json({
      error: 'Failed to list sessions',
      message: error.message
    });
  }
});

// Get system stats (admin only)
router.get('/admin/stats', authenticateSupabase, async (req, res) => {
  try {
    // Basic admin check
    if (!req.user?.email?.includes('admin')) {
      return res.status(403).json({
        error: 'Admin access required'
      });
    }

    const stats = await productionContainerService.getSessionStats();
    const sessions = await productionContainerService.listActiveSessions();

    // Add additional system info
    const systemInfo = {
      ...stats,
      sessionDetails: sessions,
      systemHealth: {
        timestamp: new Date().toISOString(),
        containerService: 'running',
        portRange: { start: 9000, end: 9999 },
        maxConcurrentSessions: 100 // Configurable
      }
    };

    res.json({
      success: true,
      stats: systemInfo
    });

  } catch (error) {
    console.error('Failed to get system stats:', error);
    res.status(500).json({
      error: 'Failed to get system stats',
      message: error.message
    });
  }
});

// Health check endpoint
router.get('/health/check', async (req, res) => {
  try {
    const stats = await productionContainerService.getSessionStats();
    
    res.json({
      success: true,
      status: 'healthy',
      stats: {
        activeSessions: stats.totalSessions,
        resourceUsage: stats.totalResourceUsage,
        portsUsed: stats.portsUsed
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Cleanup inactive sessions (admin endpoint)
router.post('/admin/cleanup', authenticateSupabase, async (req, res) => {
  try {
    // Basic admin check
    if (!req.user?.email?.includes('admin')) {
      return res.status(403).json({
        error: 'Admin access required'
      });
    }

    console.log(`🧹 Manual cleanup triggered by admin ${req.user.email}`);
    
    // Get sessions before cleanup
    const sessionsBefore = await productionContainerService.listActiveSessions();
    
    // Run cleanup
    await productionContainerService.cleanupInactiveSessions();
    
    // Get sessions after cleanup
    const sessionsAfter = await productionContainerService.listActiveSessions();
    
    const cleaned = sessionsBefore.length - sessionsAfter.length;

    res.json({
      success: true,
      message: `Cleanup completed. ${cleaned} sessions cleaned up.`,
      stats: {
        sessionsBefore: sessionsBefore.length,
        sessionsAfter: sessionsAfter.length,
        cleaned
      }
    });

  } catch (error) {
    console.error('Failed to run cleanup:', error);
    res.status(500).json({
      error: 'Failed to run cleanup',
      message: error.message
    });
  }
});

module.exports = router; 
 
// DEV-ONLY: helper routes (no auth) to create/get sessions quickly
if (process.env.NODE_ENV !== 'production') {
  router.post('/dev/create', async (req, res) => {
    try {
      const { sessionId, type = 'algorithm', language, framework, sourceCode = '', config = {} } = req.body || {};
      if (!language || !framework) {
        return res.status(400).json({ error: 'language and framework required' });
      }
      const session = await productionContainerService.createSession({ sessionId, type, language, framework, sourceCode, config });
      return res.json({ success: true, session });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  router.get('/dev/:sessionId', async (req, res) => {
    try {
      const s = await productionContainerService.getSession(req.params.sessionId);
      if (!s) return res.status(404).json({ error: 'not found' });
      return res.json({ success: true, session: s });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });
}