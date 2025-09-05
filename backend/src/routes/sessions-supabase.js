const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateSupabase, optionalAuth } = require('../middleware/supabase-auth');
const SupabaseSessionService = require('../services/supabase-session');
const SupabaseUserService = require('../services/supabase-user');
const rateLimit = require('express-rate-limit');
const { supabase } = require('../config/supabase');

const router = express.Router();

// Rate limiting for session creation
const createSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each user to 10 sessions per windowMs
  message: {
    success: false,
    error: 'Too many sessions created. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation middleware for session creation
const validateSessionCreation = [
  body('title')
    .notEmpty()
    .withMessage('Session title is required')
    .isLength({ max: 200 })
    .withMessage('Title must be less than 200 characters'),
  
  body('jobDescription')
    .notEmpty()
    .withMessage('Job description is required')
    .isLength({ min: 50, max: 5000 })
    .withMessage('Job description must be between 50 and 5000 characters'),
  
  body('language')
    .isIn(['javascript', 'python', 'java', 'cpp', 'csharp', 'go', 'rust'])
    .withMessage('Invalid programming language'),
  
  body('experienceLevel')
    .isIn(['junior', 'mid', 'senior'])
    .withMessage('Invalid experience level'),
  
  body('maxDuration')
    .optional()
    .isInt({ min: 15, max: 180 })
    .withMessage('Duration must be between 15 and 180 minutes'),
];

// Create new interview session
router.post('/create', 
  authenticateSupabase,
  createSessionLimiter,
  validateSessionCreation,
  async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      title,
      jobDescription,
      language,
      experienceLevel,
      maxDuration = 60,
      isPublic = false,
      allowedCandidateEmails = [],
      notes,
      tags = []
    } = req.body;

    // Create session using Supabase service
    const session = await SupabaseSessionService.create({
      title,
      jobDescription,
      language,
      experienceLevel,
      maxDuration,
      isPublic,
      allowedCandidateEmails,
      notes,
      tags,
      interviewerId: req.user.id,
      status: 'created'
    });

    res.status(201).json({
      success: true,
      message: 'Interview session created successfully',
      data: session
    });

  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create session'
    });
  }
});

// Get all sessions for the authenticated user
router.get('/', authenticateSupabase, async (req, res) => {
  try {
    const { status, language, limit = 20, offset = 0 } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    if (language) filters.language = language;

    let sessions;
    if (req.user.role === 'interviewer' || req.user.role === 'admin') {
      sessions = await SupabaseSessionService.findByInterviewerId(req.user.id, filters);
    } else {
      sessions = await SupabaseSessionService.findByCandidateId(req.user.id, filters);
    }

    res.json({
      success: true,
      data: sessions.slice(offset, offset + parseInt(limit))
    });

  } catch (error) {
    console.error('Sessions fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch sessions'
    });
  }
});

// Get user's own sessions (frontend expects this specific endpoint)
router.get('/my-sessions', authenticateSupabase, async (req, res) => {
  try {
    const { status, language, limit = 20, offset = 0 } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    if (language) filters.language = language;

    let sessions;
    if (req.user.role === 'interviewer' || req.user.role === 'admin') {
      sessions = await SupabaseSessionService.findByInterviewerId(req.user.id, filters);
    } else {
      sessions = await SupabaseSessionService.findByCandidateId(req.user.id, filters);
    }

    res.json({
      success: true,
      data: {
        sessions: sessions.slice(offset, offset + parseInt(limit)),
        total: sessions.length
      }
    });

  } catch (error) {
    console.error('My sessions fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch user sessions'
    });
  }
});

// Simple test route for debugging (above the problems route)
router.get('/:sessionId/test', optionalAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`🧪 TEST ROUTE: ${sessionId}`);
    
    res.json({
      success: true,
      message: 'Test route working',
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test route error:', error);
    res.status(500).json({ success: false, error: 'Test route failed' });
  }
});

// Get session problems for room interface (must come before /:id route)
router.get('/:sessionId/problems', optionalAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log(`🔍 Fetching problems for session: ${sessionId}`);
    
    // Check both old session format and new parameter-based format
    let session = null;
    let isParameterSession = false;
    
    // First try interview_sessions_v2 (parameter-based) - Start with simple query
    console.log(`🔍 Trying simple query first...`);
    const { data: simpleSession, error: simpleError } = await supabase
      .from('interview_sessions_v2')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    
    console.log(`Simple query result:`, { data: simpleSession ? 'FOUND' : 'NOT FOUND', error: simpleError });
    
        if (simpleSession && !simpleError) {
      console.log(`🔍 Fetching related problems manually...`);
      
      // Fetch core problem manually
      let coreProblems = [];
      if (simpleSession.core_language_problem_id) {
        const { data: coreProblem, error: coreError } = await supabase
          .from('master_problems')
          .select('id, title, description, difficulty_level, time_estimate')
          .eq('id', simpleSession.core_language_problem_id)
          .single();
        
        if (coreProblem && !coreError) {
          coreProblems = [coreProblem];
        }
        console.log(`Core problem:`, coreProblem ? 'FOUND' : 'NOT FOUND', coreError?.message);
      }
      
      // Fetch tech problem manually
      let techProblems = [];
      if (simpleSession.tech_stack_problem_id) {
        const { data: techProblem, error: techError } = await supabase
          .from('master_problems')
          .select('id, title, description, difficulty_level, time_estimate')
          .eq('id', simpleSession.tech_stack_problem_id)
          .single();
        
        if (techProblem && !techError) {
          techProblems = [techProblem];
        }
        console.log(`Tech problem:`, techProblem ? 'FOUND' : 'NOT FOUND', techError?.message);
      }
      
      // Combine the session with the problems
      session = {
        ...simpleSession,
        core_problem: coreProblems,
        tech_problem: techProblems
      };
      isParameterSession = true;
      console.log(`✅ Found parameter-based session with ${coreProblems.length + techProblems.length} problems: ${sessionId}`);
    }
    
    // Note: No legacy table fallback since interview_sessions table doesn't exist
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    let problems = [];
    
    if (isParameterSession) {
      // Format problems from parameter-based session
      problems = [];
      
      if (session.core_problem && session.core_problem.length > 0) {
        const coreProblem = session.core_problem[0];
        problems.push({
          id: `core-${coreProblem.id}`,
          title: `${session.core_language} Problem`,
          description: coreProblem.description,
          language: session.core_language.toLowerCase(),
          category: 'core_language',
          difficulty: coreProblem.difficulty_level,
          timeEstimate: coreProblem.time_estimate
        });
      }
      
      if (session.tech_problem && session.tech_problem.length > 0) {
        const techProblem = session.tech_problem[0];
        problems.push({
          id: `tech-${techProblem.id}`,
          title: `${session.tech_stack} Problem`,
          description: techProblem.description,
          language: session.core_language.toLowerCase(), // Use core language for coding
          category: 'tech_stack',
          difficulty: techProblem.difficulty_level,
          timeEstimate: techProblem.time_estimate
        });
      }
      
      console.log(`📋 Loaded ${problems.length} problems from parameter session`);
    } else {
      // Handle legacy session format (if needed)
      console.log(`📋 Legacy session format - falling back to AI generation`);
    }
    
    res.json({
      success: true,
      data: {
        sessionId: sessionId,
        isParameterSession: isParameterSession,
        sessionType: isParameterSession ? 'parameter_based' : 'legacy',
        coreLanguage: session.core_language || session.language,
        techStack: session.tech_stack,
        seniorityLevel: session.seniority_level || session.experienceLevel,
        problems: problems,
        sessionData: session
      }
    });
    
  } catch (error) {
    console.error(`❌ Error fetching session problems for ${req.params.sessionId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session problems'
    });
  }
});

// Get session by ID
router.get('/:id', authenticateSupabase, async (req, res) => {
  try {
    const { id } = req.params;
    
    const session = await SupabaseSessionService.findById(id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Check if user has access to this session (admin has global access)
    // Handle both legacy and parameter-based session field names
    const interviewerId = session.interviewer_id || session.interviewerId;
    const candidateId = session.candidate_id || session.candidateId;
    const isPublic = session.is_public || session.isPublic;
    
    const hasAccess = 
      req.user.role === 'admin' ||
      interviewerId === req.user.id ||
      candidateId === req.user.id ||
      (isPublic && req.user.role === 'candidate');

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: session
    });

  } catch (error) {
    console.error('Session fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch session'
    });
  }
});

// Get session by session code
router.get('/code/:sessionCode', optionalAuth, async (req, res) => {
  try {
    const { sessionCode } = req.params;
    const session = await SupabaseSessionService.findBySessionCode(sessionCode);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Check access permissions
    if (!session.isPublic && !req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!session.isPublic && req.user) {
      const hasAccess = 
        session.interviewerId === req.user.id ||
        session.candidateId === req.user.id ||
        (session.allowedCandidateEmails && session.allowedCandidateEmails.includes(req.user.email));

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
    }

    res.json({
      success: true,
      data: session
    });

  } catch (error) {
    console.error('Session fetch by code error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch session'
    });
  }
});

// Update session
router.put('/:id', authenticateSupabase, async (req, res) => {
  try {
    const { id } = req.params;
    const session = await SupabaseSessionService.findById(id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Check if user owns this session
    if (session.interviewerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Only the session owner can update it'
      });
    }

    const allowedFields = [
      'title', 'jobDescription', 'language', 'experienceLevel',
      'maxDuration', 'isPublic', 'allowedCandidateEmails', 'notes', 'tags', 'status'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const updatedSession = await SupabaseSessionService.update(id, updateData);

    res.json({
      success: true,
      message: 'Session updated successfully',
      data: updatedSession
    });

  } catch (error) {
    console.error('Session update error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update session'
    });
  }
});

// Update session status
router.patch('/:id/status', authenticateSupabase, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['created', 'active', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    const session = await SupabaseSessionService.findById(id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Check permissions
    const canUpdate = 
      session.interviewerId === req.user.id ||
      (session.candidateId === req.user.id && ['active', 'completed'].includes(status));

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied'
      });
    }

    const updatedSession = await SupabaseSessionService.updateStatus(id, status);

    res.json({
      success: true,
      message: 'Session status updated successfully',
      data: updatedSession
    });

  } catch (error) {
    console.error('Session status update error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update session status'
    });
  }
});

// Join session as candidate
router.post('/:id/join', authenticateSupabase, async (req, res) => {
  try {
    const { id } = req.params;
    const session = await SupabaseSessionService.findById(id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Check if user is a candidate
    if (req.user.role !== 'candidate') {
      return res.status(403).json({
        success: false,
        error: 'Only candidates can join sessions'
      });
    }

    // Check if session is available
    if (session.status !== 'created') {
      return res.status(400).json({
        success: false,
        error: 'Session is not available for joining'
      });
    }

    // Check if candidate already assigned
    if (session.candidateId) {
      return res.status(400).json({
        success: false,
        error: 'Session already has a candidate'
      });
    }

    // Check access permissions
    if (!SupabaseSessionService.canCandidateJoin(session, req.user.email)) {
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to join this session'
      });
    }

    // Assign candidate to session
    const updatedSession = await SupabaseSessionService.assignCandidate(id, req.user.id);

    res.json({
      success: true,
      message: 'Successfully joined session',
      data: updatedSession
    });

  } catch (error) {
    console.error('Session join error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to join session'
    });
  }
});

// Get public sessions
router.get('/public/list', async (req, res) => {
  try {
    const { language, experienceLevel, limit = 20, offset = 0 } = req.query;
    
    const filters = { status: 'created' };
    if (language) filters.language = language;
    if (experienceLevel) filters.experienceLevel = experienceLevel;

    const sessions = await SupabaseSessionService.findPublicSessions(filters);

    res.json({
      success: true,
      data: sessions.slice(offset, offset + parseInt(limit))
    });

  } catch (error) {
    console.error('Public sessions fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch public sessions'
    });
  }
});

// Get public sessions (alternative endpoint for frontend compatibility)
router.get('/public/browse', async (req, res) => {
  try {
    console.log('📋 Public sessions browse endpoint called');
    const { language, experienceLevel, limit = 20, offset = 0 } = req.query;
    
    const filters = { status: 'created' };
    if (language) filters.language = language;
    if (experienceLevel) filters.experienceLevel = experienceLevel;

    console.log('🔍 Fetching public sessions with filters:', filters);
    const sessions = await SupabaseSessionService.findPublicSessions(filters);
    console.log(`✅ Found ${sessions.length} public sessions`);

    res.json({
      success: true,
      data: {
        sessions: sessions.slice(offset, offset + parseInt(limit)),
        total: sessions.length
      }
    });

  } catch (error) {
    console.error('❌ Public sessions browse error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch public sessions'
    });
  }
});

// Delete session
router.delete('/:id', authenticateSupabase, async (req, res) => {
  try {
    const { id } = req.params;
    const session = await SupabaseSessionService.findById(id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Check if user owns this session
    if (session.interviewerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Only the session owner can delete it'
      });
    }

    // Don't allow deletion of active sessions
    if (session.status === 'active') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete active session'
      });
    }

    await SupabaseSessionService.delete(id);

    res.json({
      success: true,
      message: 'Session deleted successfully'
    });

  } catch (error) {
    console.error('Session deletion error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete session'
    });
  }
});

// Get session statistics
router.get('/stats/overview', authenticateSupabase, async (req, res) => {
  try {
    let stats;
    
    if (req.user.role === 'interviewer') {
      stats = await SupabaseSessionService.getStatistics(req.user.id);
    } else {
      // For candidates, get their session stats
      const sessions = await SupabaseSessionService.findByCandidateId(req.user.id);
      stats = {
        total: sessions.length,
        created: sessions.filter(s => s.status === 'created').length,
        active: sessions.filter(s => s.status === 'active').length,
        completed: sessions.filter(s => s.status === 'completed').length,
        cancelled: sessions.filter(s => s.status === 'cancelled').length
      };
    }

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Session stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch session statistics'
    });
  }
});

module.exports = router; 