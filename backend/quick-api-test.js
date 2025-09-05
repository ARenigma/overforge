const axios = require('axios');

async function quickTest() {
  console.log('🔍 Quick API Test...');
  
  try {
    const response = await axios.get('http://localhost:5000/api/parameter-selection/core-languages');
    console.log('✅ Core Languages API working');
    console.log('Languages found:', response.data.data.length);
    
    const techResponse = await axios.get('http://localhost:5000/api/parameter-selection/tech-stacks');
    console.log('✅ Tech Stacks API working');
    console.log('Categories found:', Object.keys(techResponse.data.data).length);
    
    console.log('🚀 Parameter Selection APIs are ready!');
    
  } catch (error) {
    console.error('❌ API Error:', error.message);
  }
}

quickTest(); 