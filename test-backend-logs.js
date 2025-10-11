#!/usr/bin/env node

/**
 * Test backend by calling a simple endpoint and checking console logs
 */

const axios = require('axios');

async function testBackend() {
  console.log('🔍 Testing backend response...');
  
  try {
    // First test the health endpoint
    const health = await axios.get('http://localhost:5001/health');
    console.log('✅ Backend is responding');
    
    // Now test creating a parameter session to see if LHIS logs appear
    console.log('📋 Creating parameter session...');
    const response = await axios.post('http://localhost:5001/api/living-assessment/parameter-sessions', {
      language: 'python',
      experienceLevel: 'mid',
      userId: 'test-user'
    });
    
    if (response.status === 201) {
      console.log('✅ Parameter session created:', response.data.sessionId);
      
      // Check if the session exists in LHIS
      const sessionCheck = await axios.get(`http://localhost:5001/api/sessions/${response.data.sessionId}/status`);
      console.log('📊 Session status:', sessionCheck.data);
    }
    
  } catch (error) {
    console.error('❌ Backend test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    console.error('Full error:', error);
  }
}

testBackend();
