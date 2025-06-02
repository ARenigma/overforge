const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { executeCode } = require('../services/judge0Service');

// POST /api/execute
router.post('/', auth, async (req, res) => {
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
    // Pass time/output limits
    const result = await executeCode({ source_code, language_id, stdin, timeLimit: 5, outputLimit: 10000 });
    res.json({ result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Code execution failed.' });
  }
});

module.exports = router; 