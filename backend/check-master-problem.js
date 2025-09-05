require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMasterProblem() {
  try {
    console.log('🎯 Checking Master Problem for AWS Backend Profile...');
    
    const { data: profile, error } = await supabase
      .from('job_profiles')
      .select('master_problem, parameters')
      .eq('id', '23d1e0fe-78d6-4e52-8d3c-847bbc21c299')
      .single();
    
    if (error) {
      console.error('❌ Error fetching profile:', error);
      return;
    }
    
    console.log('\n🎯 Current V2 Parameters:');
    console.log('=========================');
    if (profile.parameters && profile.parameters.length > 0) {
      profile.parameters.forEach((param, index) => {
        console.log(`${index + 1}. ${param.name}`);
        console.log(`   Description: ${param.description}`);
      });
    }
    
    console.log('\n🧩 Generated Master Problem:');
    console.log('============================');
    if (profile.master_problem) {
      console.log(`Title: ${profile.master_problem.title || 'No title'}`);
      console.log(`\nDescription:`);
      console.log(profile.master_problem.description || 'No description');
      
      if (profile.master_problem.requirements) {
        console.log(`\nRequirements:`);
        if (Array.isArray(profile.master_problem.requirements)) {
          profile.master_problem.requirements.forEach((req, index) => {
            console.log(`${index + 1}. ${req}`);
          });
        } else {
          console.log(profile.master_problem.requirements);
        }
      }
      
      if (profile.master_problem.starter_code) {
        console.log(`\nStarter Code:`);
        console.log('```');
        console.log(profile.master_problem.starter_code);
        console.log('```');
      }
      
      if (profile.master_problem.difficulty) {
        console.log(`\nDifficulty: ${profile.master_problem.difficulty}`);
      }
      
      if (profile.master_problem.estimated_time) {
        console.log(`Estimated Time: ${profile.master_problem.estimated_time}`);
      }
      
    } else {
      console.log('❌ No master problem found!');
    }
    
    console.log('\n📊 Analysis:');
    console.log('=============');
    const hasMasterProblem = !!profile.master_problem;
    const hasParameters = profile.parameters && profile.parameters.length > 0;
    
    console.log(`✅ V2 Parameters: ${hasParameters ? '✅ Present' : '❌ Missing'}`);
    console.log(`🧩 Master Problem: ${hasMasterProblem ? '✅ Generated' : '❌ Missing'}`);
    
    if (hasMasterProblem && hasParameters) {
      console.log('🎉 System working perfectly - V2 parameters with custom master problem!');
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error);
  }
}

checkMasterProblem(); 