const axios = require('axios');

const JUDGE0_API_URL = process.env.JUDGE0_API_URL || 'http://localhost:2358';

// Submit code to Judge0 and poll for result via RapidAPI
exports.executeCode = async ({ source_code, language_id, stdin, timeLimit = 5, outputLimit = 10000 }) => {
  // Submit code
  const submission = await axios.post(
    `${JUDGE0_API_URL}/submissions?base64_encoded=false&wait=false`,
    {
      source_code,
      language_id,
      stdin,
      cpu_time_limit: timeLimit,
      max_output_size: outputLimit
    },
    {
      headers: {
        'X-RapidAPI-Key': JUDGE0_API_KEY,
        'X-RapidAPI-Host': JUDGE0_API_HOST,
        'Content-Type': 'application/json'
      }
    }
  );
  const token = submission.data.token;

  // Poll for result
  let result;
  for (let i = 0; i < 20; i++) { // Poll up to 20 times
    await new Promise((r) => setTimeout(r, 1000)); // Wait 1s
    const res = await axios.get(
      `${JUDGE0_API_URL}/submissions/${token}?base64_encoded=false`,
      {
        headers: {
          'X-RapidAPI-Key': JUDGE0_API_KEY,
          'X-RapidAPI-Host': JUDGE0_API_HOST
        }
      }
    );
    if (res.data.status && res.data.status.id >= 3) {
      result = res.data;
      break;
    }
  }
  // Truncate output if too large
  if (result && result.stdout && result.stdout.length > outputLimit) {
    result.stdout = result.stdout.slice(0, outputLimit) + '\n...[truncated]';
  }
  if (result && result.stderr && result.stderr.length > outputLimit) {
    result.stderr = result.stderr.slice(0, outputLimit) + '\n...[truncated]';
  }
  return result;
};

// Fetch supported languages from Judge0 via RapidAPI
exports.getLanguages = async () => {
  const JUDGE0_API_URL = process.env.JUDGE0_API_URL || 'https://judge0-extra-ce.p.rapidapi.com';
  const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || '2015773021msh4c3257c9e31ed8bp1ef31cjsn0b97d69af598';
  const JUDGE0_API_HOST = process.env.JUDGE0_API_HOST || 'judge0-extra-ce.p.rapidapi.com';
  const res = await axios.get(
    `${JUDGE0_API_URL}/languages`,
    {
      headers: {
        'X-RapidAPI-Key': JUDGE0_API_KEY,
        'X-RapidAPI-Host': JUDGE0_API_HOST
      }
    }
  );
  return res.data;
}; 