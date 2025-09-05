const express = require('express');
const { authenticateSupabase, requireRole } = require('../middleware/supabase-auth');
const SupabaseUserService = require('../services/supabase-user');
const SupabaseSessionService = require('../services/supabase-session');
const { supabase } = require('../config/supabase');
const timingConfig = require('../config/timingConfig');

const router = express.Router();

// Middleware to require admin access
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
};

// Apply auth middleware to all admin routes
router.use(authenticateSupabase);
router.use(requireAdmin);

// Get all users (admin only)
router.get('/users', async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching users:', error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    res.json({ users });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user by ID (admin only)
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await SupabaseUserService.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: SupabaseUserService.toSafeJSON(user)
    });

  } catch (error) {
    console.error('Admin get user error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch user'
    });
  }
});

// Update user by ID (admin only)
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data: user, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating user:', error);
      return res.status(500).json({ error: 'Failed to update user' });
    }

    res.json({ user });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user by ID (admin only)
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ Error deleting user:', error);
      return res.status(500).json({ error: 'Failed to delete user' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all sessions (admin only)
router.get('/sessions', async (req, res) => {
  try {
    const { status, language, limit = 50, offset = 0 } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    if (language) filters.language = language;

    // Admin can see all sessions
    const sessions = await SupabaseSessionService.findAll(filters);
    
    // Sort by creation date (newest first) and apply pagination
    const sortedSessions = sessions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: sortedSessions,
      meta: {
        total: sessions.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Admin get sessions error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch sessions'
    });
  }
});

// Delete session (admin only)
router.delete('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const session = await SupabaseSessionService.findById(id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    await SupabaseSessionService.delete(id);

    res.json({
      success: true,
      message: 'Session deleted successfully'
    });

  } catch (error) {
    console.error('Admin delete session error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete session'
    });
  }
});

// Export users data
router.get('/export/:type', async (req, res) => {
  try {
    const { type } = req.params;
    
    let data;
    let filename;
    
    switch (type) {
      case 'users':
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('*');
        
        if (usersError) throw usersError;
        data = users;
        filename = 'users_export.json';
        break;
        
      case 'sessions':
        const { data: sessions, error: sessionsError } = await supabase
          .from('assessment_sessions')
          .select('*');
        
        if (sessionsError) throw sessionsError;
        data = sessions;
        filename = 'sessions_export.json';
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(data);

  } catch (error) {
    console.error('❌ Export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// === TIMING CONFIGURATION MANAGEMENT ===

// Get current timing configuration
router.get('/timing-config', (req, res) => {
  try {
    const config = timingConfig.getConfigSummary();
    res.json({
      success: true,
      config,
      message: 'Current timing configuration retrieved'
    });
  } catch (error) {
    console.error('❌ Error getting timing config:', error);
    res.status(500).json({ error: 'Failed to get timing configuration' });
  }
});

// Get detailed timing configuration (all settings)
router.get('/timing-config/detailed', (req, res) => {
  try {
    const detailedConfig = {
      welcomeMessageDelay: timingConfig.welcomeMessageDelay,
      firstCheckInDelay: timingConfig.firstCheckInDelay,
      proactiveCheckInterval: timingConfig.proactiveCheckInterval,
      minEngagementInterval: timingConfig.minEngagementInterval,
      inactivityThresholds: timingConfig.inactivityThresholds,
      parameterAssessment: timingConfig.parameterAssessment,
      hints: timingConfig.hints,
      responses: timingConfig.responses,
      debounce: timingConfig.debounce,
      session: timingConfig.session,
      milestones: timingConfig.milestones,
      environment: process.env.NODE_ENV || 'development'
    };

    res.json({
      success: true,
      config: detailedConfig,
      message: 'Detailed timing configuration retrieved'
    });
  } catch (error) {
    console.error('❌ Error getting detailed timing config:', error);
    res.status(500).json({ error: 'Failed to get detailed timing configuration' });
  }
});

// Update timing configuration
router.put('/timing-config', (req, res) => {
  try {
    const newConfig = req.body;
    
    // Validate that timing values are numbers and reasonable
    const validateTiming = (value, min = 100, max = 3600000) => {
      return typeof value === 'number' && value >= min && value <= max;
    };

    // Validate core timings if provided
    if (newConfig.welcomeMessageDelay && !validateTiming(newConfig.welcomeMessageDelay, 0, 10000)) {
      return res.status(400).json({ error: 'Invalid welcomeMessageDelay (0-10000ms)' });
    }
    
    if (newConfig.firstCheckInDelay && !validateTiming(newConfig.firstCheckInDelay, 5000, 300000)) {
      return res.status(400).json({ error: 'Invalid firstCheckInDelay (5s-5min)' });
    }
    
    if (newConfig.minEngagementInterval && !validateTiming(newConfig.minEngagementInterval, 30000, 600000)) {
      return res.status(400).json({ error: 'Invalid minEngagementInterval (30s-10min)' });
    }

    // Update the configuration
    timingConfig.updateTimings(newConfig);
    
    res.json({
      success: true,
      config: timingConfig.getConfigSummary(),
      message: 'Timing configuration updated successfully'
    });

  } catch (error) {
    console.error('❌ Error updating timing config:', error);
    res.status(500).json({
      error: 'Failed to update timing configuration',
      details: error.message 
    });
  }
});

// Reset timing configuration to defaults
router.post('/timing-config/reset', (req, res) => {
  try {
    timingConfig.resetToDefaults();
    
    res.json({
      success: true,
      config: timingConfig.getConfigSummary(),
      message: 'Timing configuration reset to defaults'
    });
    
  } catch (error) {
    console.error('❌ Error resetting timing config:', error);
    res.status(500).json({ error: 'Failed to reset timing configuration' });
  }
});

// Apply environment-specific timing profile
router.post('/timing-config/apply-profile/:profile', (req, res) => {
  try {
    const { profile } = req.params;
    
    if (!['development', 'test', 'production'].includes(profile)) {
      return res.status(400).json({ error: 'Invalid profile. Use: development, test, or production' });
    }
    
    // Temporarily change NODE_ENV to apply profile
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = profile;
    timingConfig.applyEnvironmentProfile();
    process.env.NODE_ENV = originalEnv;
    
    res.json({
      success: true,
      profile,
      config: timingConfig.getConfigSummary(),
      message: `Applied ${profile} timing profile`
    });
    
  } catch (error) {
    console.error('❌ Error applying timing profile:', error);
    res.status(500).json({ error: 'Failed to apply timing profile' });
  }
});

// Get timing recommendations based on environment
router.get('/timing-config/recommendations', (req, res) => {
  try {
    const env = process.env.NODE_ENV || 'development';
    
    const recommendations = {
      development: {
        welcomeMessageDelay: 1000,
        firstCheckInDelay: 30000,
        inactivityThresholds: {
          withCode: 45000,
          noCode: 90000,
          stuckCheck: 60000
        },
        minEngagementInterval: 60000,
        description: 'Faster timings for development and testing'
      },
      test: {
        welcomeMessageDelay: 100,
        firstCheckInDelay: 5000,
        inactivityThresholds: {
          withCode: 10000,
          noCode: 20000,
          stuckCheck: 15000
        },
        minEngagementInterval: 15000,
        description: 'Very fast timings for automated testing'
      },
      production: {
        welcomeMessageDelay: 2000,
        firstCheckInDelay: 60000,
        inactivityThresholds: {
          withCode: 90000,
          noCode: 180000,
          stuckCheck: 150000
        },
        minEngagementInterval: 180000,
        description: 'Standard production timings for optimal user experience'
      }
    };

    res.json({
      success: true,
      currentEnvironment: env,
      recommendations,
      message: 'Timing recommendations retrieved'
    });

  } catch (error) {
    console.error('❌ Error getting timing recommendations:', error);
    res.status(500).json({ error: 'Failed to get timing recommendations' });
  }
});

// Export router
module.exports = router; 