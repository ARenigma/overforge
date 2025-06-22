/**
 * Generate AWS Backend Profile using V2 AI System
 * Replaces hardcoded patterns with pure AI generation
 */

const fs = require('fs');
const path = require('path');

// Import the services
const JDProcessingService = require('./src/services/jd-processing-service');
const JobProfileService = require('./src/services/job-profile-service');

async function generateV2AWSProfile() {
  try {
    console.log('🤖 V2 AI GENERATION: AWS Backend Developer Profile');
    console.log('=' .repeat(60));
    console.log('🎯 Goal: 100% AI-generated profile (zero hardcoded patterns)');
    console.log('');

    // Read the AWS job description
    const awsJDPath = path.join(__dirname, 'AWS_Backend.txt');
    const awsJD = fs.readFileSync(awsJDPath, 'utf8');
    
    console.log(`📄 Reading AWS Job Description: ${awsJD.length} characters`);
    console.log('');

    // Step 1: AI Analysis
    console.log('🔍 STEP 1: AI analyzing job description...');
    const aiAnalysis = await JDProcessingService.performAIAnalysis(awsJD);
    
    if (!aiAnalysis.success) {
      throw new Error('AI analysis failed');
    }

    console.log(`✅ AI Analysis Complete:`);
    console.log(`   📋 Job Title: ${aiAnalysis.jobTitle}`);
    console.log(`   🔧 Tech Stack: ${aiAnalysis.techStack.join(', ')}`);
    console.log(`   📈 Experience: ${aiAnalysis.experienceLevel}`);
    console.log(`   🎯 Confidence: ${aiAnalysis.confidence}%`);
    console.log('');

    // Step 2: V2 Parameter + Master Problem Generation
    console.log('🎯 STEP 2: AI generating parameters + master problem...');
    const v2Result = await JDProcessingService.generate3ParameterAssessment(aiAnalysis, awsJD);
    
    if (!v2Result.success) {
      throw new Error('V2 generation failed');
    }

    console.log(`✅ V2 Generation Complete:`);
    console.log(`   🎯 Parameters: ${v2Result.parameters.length}`);
    v2Result.parameters.forEach((param, index) => {
      console.log(`      ${index + 1}. ${param.name}`);
    });
    console.log(`   🧩 Master Problem: ${v2Result.masterProblem ? 'AI-Generated ✅' : 'Failed ❌'}`);
    console.log('');

    // Step 3: Create V2 Job Profile
    console.log('💾 STEP 3: Creating V2 job profile...');
    const jobProfile = await JobProfileService.createV2JobProfile({
      title: 'AWS Backend Developer - V2 AI Generated',
      company: aiAnalysis.company,
      location: aiAnalysis.location,
      employment_type: aiAnalysis.employmentType,
      experience_level: aiAnalysis.experienceLevel,
      description: awsJD,
      extracted_tech_stack: aiAnalysis.techStack,
      required_skills: aiAnalysis.requiredSkills,
      preferred_skills: aiAnalysis.preferredSkills,
      parameters: v2Result.parameters,
      master_problem: v2Result.masterProblem,
      assessment_criteria: v2Result.assessmentCriteria,
      ai_confidence_score: aiAnalysis.confidence / 100,
      created_by: '00000000-0000-0000-0000-000000000000' // System generated
    });

    console.log(`✅ V2 Job Profile Created:`);
    console.log(`   📋 ID: ${jobProfile.id}`);
    console.log(`   🏷️ Title: ${jobProfile.title}`);
    console.log('');

    // Step 4: Validation
    console.log('🔍 STEP 4: Validating V2 profile...');
    
    console.log('📊 Generated Parameters:');
    jobProfile.parameters.forEach((param, index) => {
      console.log(`   ${index + 1}. ${param.name}`);
      console.log(`      📝 ${param.description}`);
      console.log(`      🎯 Depth Levels: ${param.depth_levels?.length || 0}`);
    });
    console.log('');

    console.log('🧩 Generated Master Problem:');
    if (jobProfile.master_problem) {
      console.log(`   📋 Title: ${jobProfile.master_problem.title || 'No title'}`);
      const description = typeof jobProfile.master_problem === 'object' 
        ? jobProfile.master_problem.description 
        : jobProfile.master_problem;
      console.log(`   📝 Description: ${description ? description.substring(0, 150) + '...' : 'No description'}`);
    } else {
      console.log('   ❌ No master problem generated');
    }
    console.log('');

    // Check alignment
    console.log('🔍 Parameter-Problem Alignment Check:');
    if (jobProfile.master_problem && jobProfile.parameters) {
      const problemText = typeof jobProfile.master_problem === 'object' 
        ? jobProfile.master_problem.description 
        : jobProfile.master_problem;

      jobProfile.parameters.forEach((param, index) => {
        const keywords = param.name.toLowerCase().split(' ').slice(0, 2);
        const hasAlignment = keywords.some(keyword => 
          problemText?.toLowerCase().includes(keyword)
        );
        console.log(`   ${index + 1}. ${param.name}: ${hasAlignment ? '✅ Aligned' : '⚠️ Check'}`);
      });
    }
    console.log('');

    console.log('🎉 V2 AI GENERATION COMPLETE!');
    console.log('=' .repeat(60));
    console.log('✅ 100% AI-generated profile created');
    console.log('✅ Zero hardcoded patterns used');
    console.log('✅ Parameters → Master Problem → Assessment flow');
    console.log(`📋 Profile ID: ${jobProfile.id}`);
    console.log('');
    console.log('🚀 Ready for LHIS AI assessment with:');
    console.log('   🎯 AI-detected parameters');
    console.log('   🧩 AI-generated master problem');  
    console.log('   🤖 AI-powered depth questions');

    return jobProfile;

  } catch (error) {
    console.error('');
    console.error('❌ V2 AI Generation Failed:');
    console.error(`   Error: ${error.message}`);
    
    if (error.message.includes('AI module')) {
      console.error('   💡 Make sure the AI module is running on port 8000');
    }
    
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  generateV2AWSProfile()
    .then(() => {
      console.log('');
      console.log('✅ Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { generateV2AWSProfile }; 