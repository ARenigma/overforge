const axios = require('axios');

const AI_MODULE_URL = process.env.AI_MODULE_URL || 'http://localhost:8000';

exports.analyzeCode = async (codeInput, languageInput, promptInput) => {
  try {
    let payload;
    
    // Handle different call patterns
    if (typeof codeInput === 'object' && codeInput !== null) {
      // New structured call: analyzeCode({ code, language, userId, roomName })
      payload = {
        code: codeInput.code || '',
        language: codeInput.language || null,
        userId: codeInput.userId ? parseInt(codeInput.userId) || null : null,
        roomName: codeInput.roomName || null
    };
    } else {
      // Legacy call: analyzeCode(code, language, prompt) - for text analysis
      payload = {
        code: codeInput || '',
        language: languageInput || null,
        userId: null,
        roomName: null
      };
      
      // For prompt-based analysis, append prompt to code
      if (promptInput) {
        payload.code = `${promptInput}\n\nCODE:\n${codeInput || ''}`;
      }
    }

    // Only log in debug mode or for errors
    if (process.env.DEBUG_AI_REQUESTS === 'true') {
      console.log('🤖 AI Request:', { 
        room: payload.roomName, 
        codeLength: payload.code?.length || 0, 
        language: payload.language 
      });
    }
    
    const res = await axios.post(`${AI_MODULE_URL}/analyze`, payload);
    
    if (process.env.DEBUG_AI_REQUESTS === 'true') {
      console.log('🤖 AI Response:', { 
        type: res.data?.type, 
        provider: res.data?.provider_used,
        model: res.data?.model_used 
      });
    }
    
    return res.data; // { question, type, context }
  } catch (err) {
    console.error('❌ AI module error:', err.message);
    if (err.response) {
      console.error('   Status:', err.response.status);
      console.error('   Data:', err.response.data);
    }
    return null;
  }
};

exports.fetchInitialRoomQuestions = async (language, experienceLevel) => {
  if (!language || !experienceLevel) {
    console.error('❌ AI Service: Language and experience level required');
    return null;
  }
  try {
    // First try the original endpoint
    console.log(`🎯 Fetching questions: ${language}, ${experienceLevel}`);
    try {
      // Include the improved prompt directive for more real-world questions
      const response = await axios.post(`${AI_MODULE_URL}/generate-room-questions`, {
        language,
        experienceLevel,
        promptDirective: `Generate thought-provoking coding questions that:
1. MUST include a real-world scenario or business context
2. Should explain WHY this problem matters in real software development
3. Are calibrated to the specified experience level
4. Should connect to practical applications developers face daily
5. Feel engaging and relevant to modern software development

FORMAT EACH QUESTION EXACTLY AS FOLLOWS:

Q1: [REAL-WORLD SCENARIO] A brief paragraph explaining the business context.
[PROBLEM] A clear problem statement with specific requirements.

Q2: [REAL-WORLD SCENARIO] A brief paragraph explaining the business context.
[PROBLEM] A clear problem statement with specific requirements.

Format the output strictly as follows:
Q1: [REAL-WORLD SCENARIO] followed by [PROBLEM]
Q2: [REAL-WORLD SCENARIO] followed by [PROBLEM]

Do not include any other text, greetings, or explanations.`
      });
      
      // Check if we have a valid response with questions
      if (response.data && Array.isArray(response.data)) {
        console.log(`✅ Generated ${response.data.length} questions`);
        return response.data; // Expected: [{ id, title, problem, initialCode, language }, ...]
      } 
      
      // NEW: Check if we have questions in the new format (with metadata)
      if (response.data && response.data.questions && Array.isArray(response.data.questions)) {
        console.log(`✅ Generated ${response.data.questions.length} questions`);
        return response.data.questions; // Return just the questions array
      }
      
      // If we got an error object instead of questions
      if (response.data && response.data.error) {
        console.error('❌ AI module error:', response.data.error);
        throw new Error(`Primary endpoint returned error: ${response.data.error}`);
      }
      
      console.warn('⚠️ Unexpected response format from primary endpoint');
      throw new Error('Unexpected response format from primary endpoint');
      
    } catch (primaryErr) {
      // If the first endpoint fails, try the JSON endpoint
      console.log(`🔄 Trying JSON endpoint...`);
      
      const jsonResponse = await axios.post(`${AI_MODULE_URL}/generate-room-questions-json`, {
        language,
        experienceLevel,
        promptDirective: `Generate thought-provoking coding questions that:
          1. Are tied to real-world problems or scenarios a developer might face
          2. Are calibrated to ${experienceLevel} experience level
          3. Are creative and different from typical algorithmic puzzles
          4. Encourage problem-solving beyond mere implementation
          5. Feel engaging and relevant to modern software development
          
          Each question should include a real-world context that explains why this problem matters.`
      });
      
      if (jsonResponse.data && Array.isArray(jsonResponse.data)) {
        console.log(`✅ Generated ${jsonResponse.data.length} questions (JSON endpoint)`);
        return jsonResponse.data;
      }
      
      // NEW: Check JSON endpoint for new format too
      if (jsonResponse.data && jsonResponse.data.questions && Array.isArray(jsonResponse.data.questions)) {
        console.log(`✅ Generated ${jsonResponse.data.questions.length} questions (JSON endpoint)`);
        return jsonResponse.data.questions; // Return just the questions array
      }
      
      if (jsonResponse.data && jsonResponse.data.error) {
        console.error('❌ JSON endpoint error:', jsonResponse.data.error);
        throw new Error(`JSON endpoint returned error: ${jsonResponse.data.error}`);
      }
      
      // If we reach here, both endpoints failed to return proper data
      console.error('❌ Both endpoints failed to return proper question data');
      return null;
    }
  } catch (err) {
    console.error('❌ AI question generation failed:', 
      err.response ? 
        `Status: ${err.response.status}` : 
        err.message
    );
    
    // No fallback questions - return null to force proper AI service usage
    console.error('❌ No questions generated - AI service must be working');
    return null;
    }
  };
  
/**
 * Main AI analysis method - performs AI analysis with structured prompts
 * This is the primary method for all AI analysis requests
 */
exports.performAIAnalysis = async (prompt) => {
  try {
    console.log('🔍 Requesting AI analysis');
    
    const payload = {
      code: prompt || 'Perform code analysis',
      language: 'text',
      userId: null,
      roomName: null,
      priority: 'high',
      timeout: 5000 // Short timeout for fallbacks
    };

    const res = await axios.post(`${AI_MODULE_URL}/analyze`, payload, {
      timeout: 6000 // Client-side timeout slightly longer than request timeout
    });
    
    if (res.data) {
      console.log('✅ AI analysis received');
      
      // Try to parse the response into a structured format
      try {
        if (typeof res.data === 'string') {
          // Try to extract JSON from string response
          const jsonMatch = res.data.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
          
          // Return simple object with the string response
          return {
            reasoning: res.data,
            confidence: 30,
            milestone: 'basic_implementation',
            implementationDetected: true
          };
        } else if (typeof res.data === 'object') {
          // Already an object, return it
          return res.data;
        }
      } catch (parseError) {
        console.error('❌ Error parsing AI analysis:', parseError.message);
      }
    }
    
    // Return a simple object if parsing failed
    return {
      confidence: 30,
      milestone: 'basic_implementation',
      reasoning: 'Analysis with limited information'
    };
    
  } catch (err) {
    console.error('❌ AI analysis error:', err.message);
    return null;
    }
  };
  
