const axios = require('axios');

const AI_MODULE_URL = process.env.AI_MODULE_URL || 'http://localhost:8000';

exports.analyzeCode = async ({ code, language, userId, roomName }) => {
  try {
    const res = await axios.post(`${AI_MODULE_URL}/analyze`, {
      code,
      language,
      userId,
      roomName
    });
    return res.data; // { question, type, context }
  } catch (err) {
    console.error('AI module error:', err.message);
    return null;
  }
}; 