#!/usr/bin/env node

/**
 * Debug session structure to understand the parameter progress issue
 */

const axios = require('axios');

const BACKEND_URL = 'http://localhost:5001';

async function debugSessionStructure() {
  console.log('🔍 Debugging Session Structure...\n');

  try {
    // Create a parameter session
    console.log('📋 Creating parameter session...');
    const response = await axios.post(`${BACKEND_URL}/api/parameter-sessions`, {
      language: 'python',
      experienceLevel: 'mid',
      userId: 'debug-user'
    });

    if (response.status === 201) {
      const sessionId = response.data.sessionId;
      console.log(`✅ Session created: ${sessionId}`);
      console.log(`📊 Response data:`, JSON.stringify(response.data, null, 2));
    } else {
      console.log(`❌ Failed to create session: ${response.status}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

debugSessionStructure();

