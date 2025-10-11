const express = require('express');
const router = express.Router();
const livingAIInterviewer = require('../services/living-ai-interviewer');
const { body, validationResult } = require('express-validator');
const { authenticateSupabase } = require('../middleware/supabase-auth');

// Create parameter-based session (for testing and simple assessments)
router.post('/parameter-sessions', async (req, res) => {
  try {
    const { language, experienceLevel, userId } = req.body;
    
    if (!language || !experienceLevel || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: language, experienceLevel, userId'
      });
    }

    // Generate session ID
    const sessionId = `param-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🎯 Creating parameter session: ${sessionId}`);
    
    // Initialize parameter assessment
    const result = await livingAIInterviewer.initializeParameterAssessment(
      sessionId,
      userId,
      language,
      experienceLevel
    );

    if (result.success) {
      res.status(201).json({
        success: true,
        sessionId,
        message: 'Parameter session created successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to create parameter session'
      });
    }

  } catch (error) {
    console.error('❌ Parameter session creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create parameter session'
    });
  }
});

// Initialize assessment session with job profile
router.post('/initialize', authenticateSupabase, async (req, res) => {
  try {
    const { sessionId, jobProfileId, language, experienceLevel } = req.body;
    const candidateId = req.user.id;

    if (!sessionId || !jobProfileId || !language) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, jobProfileId, language'
      });
    }

    console.log(`🎯 Initializing living assessment for session ${sessionId}`);

    const result = await livingAIInterviewer.initializeAssessment(
      sessionId,
      candidateId,
      jobProfileId,
      language,
      experienceLevel || '2-5'
    );

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Assessment initialization error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initialize assessment'
    });
  }
});

// Process code change for real-time monitoring
router.post('/code-change', authenticateSupabase, async (req, res) => {
  try {
    const { sessionId, questionId, code, language } = req.body;

    if (!sessionId || !code || !language) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, code, language'
      });
    }

    // Monitor code change
    await livingAIInterviewer.monitorCodeChange(sessionId, questionId || 'main', code, language);

    res.json({
      success: true,
      message: 'Code change processed'
    });

  } catch (error) {
    console.error('❌ Code change processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process code change'
    });
  }
});

// Process candidate answer
router.post('/answer', authenticateSupabase, async (req, res) => {
  try {
    const { sessionId, answer } = req.body;

    if (!sessionId || !answer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, answer'
      });
    }

    console.log(`💬 Processing candidate answer for session ${sessionId}`);

    const result = await livingAIInterviewer.processAnswer(sessionId, answer.trim());

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Answer processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process answer'
    });
  }
});

// Get assessment status
router.get('/status/:sessionId', authenticateSupabase, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const status = livingAIInterviewer.getAssessmentStatus(sessionId);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Assessment session not found'
      });
    }

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('❌ Status retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get assessment status'
    });
  }
});

module.exports = router; 