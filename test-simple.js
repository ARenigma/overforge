console.log('🔍 Testing parameter session creation...');

const axios = require('axios');

async function test() {
  try {
    const response = await axios.post('http://localhost:5001/api/living-assessment/parameter-sessions', {
      language: 'python',
      experienceLevel: 'mid',
      userId: 'test-user'
    });
    
    console.log('✅ Success:', response.data);
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
  }
}

test();
