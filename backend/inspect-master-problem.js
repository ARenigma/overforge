require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectMasterProblem() {
  try {
    console.log('🔍 Inspecting Master Problem Data Structure...');
    
    const { data: profile, error } = await supabase
      .from('job_profiles')
      .select('master_problem, parameters')
      .eq('id', '23d1e0fe-78d6-4e52-8d3c-847bbc21c299')
      .single();
    
    if (error) {
      console.error('❌ Error fetching profile:', error);
      return;
    }
    
    console.log('\n📊 Raw Master Problem Data:');
    console.log('============================');
    console.log(JSON.stringify(profile.master_problem, null, 2));
    
    console.log('\n🎯 V2 Parameters:');
    console.log('==================');
    profile.parameters.forEach((param, index) => {
      console.log(`${index + 1}. ${param.name}`);
    });
    
    console.log('\n📈 Data Type Analysis:');
    console.log('======================');
    console.log(`Master Problem Type: ${typeof profile.master_problem}`);
    console.log(`Is Object: ${typeof profile.master_problem === 'object'}`);
    console.log(`Is Null: ${profile.master_problem === null}`);
    console.log(`Has Keys: ${profile.master_problem ? Object.keys(profile.master_problem).length : 0}`);
    
    if (profile.master_problem && typeof profile.master_problem === 'object') {
      console.log(`Keys: ${Object.keys(profile.master_problem).join(', ')}`);
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error);
  }
}

inspectMasterProblem(); 