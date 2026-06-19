const express = require('express');
const router = express.Router();
const judge0Service = require('../services/judge0Service');

const POLL_INTERVAL_MS = 500;
const POLL_MAX_ATTEMPTS = 20; // up to 10 s

/**
 * POST /api/execute
 * Body: { language_id: number, source_code: string, stdin?: string }
 * Returns: { stdout, stderr, exit_code, status }
 */
router.post('/', async (req, res) => {
  const { language_id, source_code, stdin } = req.body;

  if (!language_id || !source_code) {
    return res.status(400).json({ error: 'language_id and source_code are required' });
  }

  try {
    // Submit to Judge0
    const submission = await judge0Service.submitCode({ source_code, language_id, stdin: stdin || '' });
    const token = submission.token;

    if (!token) {
      return res.status(502).json({ error: 'Judge0 did not return a submission token' });
    }

    // Poll until status is not "In Queue" (1) or "Processing" (2)
    let result = null;
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      result = await judge0Service.getSubmissionResult(token);
      const statusId = result.status && result.status.id;
      if (statusId !== 1 && statusId !== 2) {
        break;
      }
    }

    if (!result) {
      return res.status(504).json({ error: 'Execution timed out waiting for Judge0' });
    }

    return res.json({
      stdout: result.stdout || '',
      stderr: result.stderr || result.compile_output || '',
      exit_code: result.exit_code !== undefined ? result.exit_code : null,
      status: result.status ? result.status.description : 'Unknown'
    });
  } catch (error) {
    console.error('Execute route error:', error);
    return res.status(500).json({ error: error.message || 'Execution failed' });
  }
});

module.exports = router;
