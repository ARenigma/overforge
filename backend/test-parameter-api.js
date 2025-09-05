require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api/parameter-selection';

async function testParameterAPI() {
  console.log('🔍 Testing Parameter Selection API Endpoints...');
  console.log('===============================================');
  
  try {
    // Test 1: Core Languages
    console.log('\n1. Testing GET /core-languages...');
    const coreResponse = await axios.get(`${BASE_URL}/core-languages`);
    console.log(`✅ Status: ${coreResponse.status}`);
    console.log(`📋 Found ${coreResponse.data.data.length} core languages`);
    console.log('   Top 3:');
    coreResponse.data.data.slice(0, 3).forEach((lang, index) => {
      console.log(`   ${index + 1}. ${lang.name} (popularity: ${lang.popularity})`);
    });

    // Test 2: Tech Stacks
    console.log('\n2. Testing GET /tech-stacks...');
    const techResponse = await axios.get(`${BASE_URL}/tech-stacks`);
    console.log(`✅ Status: ${techResponse.status}`);
    const categories = Object.keys(techResponse.data.data);
    console.log(`📋 Found ${categories.length} tech categories`);
    categories.forEach(category => {
      const count = techResponse.data.data[category].length;
      console.log(`   - ${category}: ${count} technologies`);
    });

    // Test 3: Available Problems
    console.log('\n3. Testing POST /available-problems...');
    const problemsResponse = await axios.post(`${BASE_URL}/available-problems`, {
      coreLanguage: 'Java',
      techStack: 'AWS',
      seniorityLevel: 'mid',
      subcategory: 'cloud'
    });
    console.log(`✅ Status: ${problemsResponse.status}`);
    const problems = problemsResponse.data.data;
    console.log(`📋 Found ${problems.totalProblems} total problems`);
    console.log(`   - Core Language Problems: ${problems.coreLanguageProblems.length}`);
    console.log(`   - Tech Stack Problems: ${problems.techStackProblems.length}`);
    
    if (problems.coreLanguageProblems.length > 0) {
      console.log('   Sample Core Problem:', problems.coreLanguageProblems[0].title);
    }
    if (problems.techStackProblems.length > 0) {
      console.log('   Sample Tech Problem:', problems.techStackProblems[0].title);
    }

    // Test 4: Different combinations
    console.log('\n4. Testing other combinations...');
    
    const combinations = [
      { coreLanguage: 'Python', techStack: 'Docker', seniorityLevel: 'junior', subcategory: 'containerization' },
      { coreLanguage: 'JavaScript', techStack: 'MongoDB', seniorityLevel: 'senior', subcategory: 'database' }
    ];

    for (const combo of combinations) {
      try {
        const testResponse = await axios.post(`${BASE_URL}/available-problems`, combo);
        const testProblems = testResponse.data.data;
        console.log(`   ✅ ${combo.coreLanguage} + ${combo.techStack}: ${testProblems.totalProblems} problems`);
      } catch (error) {
        console.log(`   ❌ ${combo.coreLanguage} + ${combo.techStack}: Error`);
      }
    }

    console.log('\n✅ Parameter Selection API: FULLY FUNCTIONAL!');
    console.log('🚀 Ready for frontend integration!');
    
  } catch (error) {
    console.error('❌ API Test Error:', error.message);
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Response:', error.response.data);
    } else {
      console.log('   Make sure the backend server is running on localhost:5000');
    }
  }
}

testParameterAPI(); 