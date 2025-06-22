const axios = require('axios');

const JUDGE0_API_URL = process.env.JUDGE0_API_URL || 'https://judge0-extra-ce.p.rapidapi.com';
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || '';
const JUDGE0_API_HOST = process.env.JUDGE0_API_HOST || 'judge0-extra-ce.p.rapidapi.com';

// Submit code to Judge0 and return the submission token
exports.submitCode = async ({ source_code, language_id, stdin, timeLimit = 5, outputLimit = 10000 }) => {
  try {
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
    return submission.data;
  } catch (err) {
    if (err.response) {
      throw new Error(err.response.data.message || 'Judge0 submission failed');
    }
    throw new Error('Judge0 submission failed');
  }
};

// Fetch result for a submission token
exports.getSubmissionResult = async (token) => {
  try {
    const res = await axios.get(
      `${JUDGE0_API_URL}/submissions/${token}?base64_encoded=false`,
      {
        headers: {
          'X-RapidAPI-Key': JUDGE0_API_KEY,
          'X-RapidAPI-Host': JUDGE0_API_HOST
        }
      }
    );
    return res.data;
  } catch (err) {
    if (err.response) {
      throw new Error(err.response.data.message || 'Judge0 result fetch failed');
    }
    throw new Error('Judge0 result fetch failed');
  }
};

// Fetch supported languages from Judge0 (optionally only active)
exports.getLanguages = async (activeOnly = false) => {
  try {
    const url = `${JUDGE0_API_URL}/languages${activeOnly ? '?active=true' : ''}`;
    const res = await axios.get(
      url,
      {
        headers: {
          'X-RapidAPI-Key': JUDGE0_API_KEY,
          'X-RapidAPI-Host': JUDGE0_API_HOST
        }
      }
    );
    return res.data;
  } catch (err) {
    if (err.response) {
      throw new Error(err.response.data.message || 'Judge0 languages fetch failed');
    }
    throw new Error('Judge0 languages fetch failed');
  }
}; 