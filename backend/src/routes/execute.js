const express = require('express');
const router = express.Router();
const { authenticateSupabase } = require('../middleware/supabase-auth');
const { executeCode, submitCode, getSubmissionResult } = require('../services/judge0Service');

// POST /api/execute
router.post('/', authenticateSupabase, async (req, res) => {
  try {
    const { source_code, language_id, stdin } = req.body;
    if (!source_code || typeof source_code !== 'string' || source_code.length < 1 || source_code.length > 10000) {
      return res.status(400).json({ message: 'source_code must be 1-10000 characters.' });
    }
    if (!language_id || typeof language_id !== 'number') {
      return res.status(400).json({ message: 'language_id is required and must be a number.' });
    }
    if (stdin && typeof stdin === 'string' && stdin.length > 10000) {
      return res.status(400).json({ message: 'stdin too large.' });
    }
    // Submit code and return token
    const submission = await submitCode({ source_code, language_id, stdin, timeLimit: 5, outputLimit: 10000 });
    res.json({ token: submission.token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Code submission failed.' });
  }
});

// GET /api/execute/:token - fetch result for a submission token
router.get('/:token', authenticateSupabase, async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ message: 'Token is required.' });
    const result = await getSubmissionResult(token);
    res.json({ result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Failed to fetch submission result.' });
  }
});

module.exports = router; 