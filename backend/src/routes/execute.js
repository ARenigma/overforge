const express = require('express');
const router = express.Router();
const productionContainerService = require('../services/productionContainerService');

router.post('/', async (req, res) => {
  console.log('🎯 Execute route called');
  console.log('🎯 Request body:', req.body);
  console.log('🎯 Request headers:', req.headers);
  
  const { sessionId, code, language, framework, questionId } = req.body;

  console.log('🎯 Extracted parameters:', { sessionId, code: code ? `${code.length} chars` : 'undefined', language, framework, questionId });

  if (!sessionId || !code) {
    console.log('❌ Missing required parameters:', { sessionId: !!sessionId, code: !!code });
    return res.status(400).json({ error: 'Session ID and code are required' });
  }

  try {
    console.log('🎯 Looking for session:', sessionId);
    const session = await productionContainerService.getSession(sessionId);
    
    if (!session) {
      console.log('❌ Session not found:', sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }

    console.log('✅ Session found:', session);
    console.log('🎯 Executing in container:', session.containerId);
    
    const result = await productionContainerService.executeInContainer(session.containerId, code, language, framework);
    
    console.log('✅ Execution result:', result);
    
    // Shape the final response payload for the frontend
    const responsePayload = {
      success: result.success !== false, // Default to true if success is not explicitly false
      session: session,
      output: result.output,
      error: result.error,
      executionTime: result.executionTime,
    };

    // If the execution was a console program, it won't have a webUrl.
    // Nullify the session's webUrl to prevent the preview tab from opening.
    if (!result.webUrl) {
      responsePayload.session.webUrl = null;
    }
    
    res.json(responsePayload);
  } catch (error) {
    console.error(`❌ Execution error for session ${sessionId}:`, error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to execute code in container', 
      details: error.message 
    });
  }
});

module.exports = router;