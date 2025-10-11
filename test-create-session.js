#!/usr/bin/env node

/**
 * Test session creation first
 */

const axios = require('axios');

async function createSession() {
  try {
    console.log('🔍 Creating parameter session...');
    
    const response = await axios.post('http://localhost:5001/api/living-assessment/parameter-sessions', {
      language: 'python',
      experienceLevel: 'mid',
      userId: 'test-user'
    });
    
    console.log('✅ Session created:', response.data);
    return response.data.sessionId;
    
  } catch (error) {
    console.error('❌ Session creation failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);
    return null;
  }
}

createSession();
