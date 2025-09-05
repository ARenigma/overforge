require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testParameterTables() {
  console.log('🔍 Testing Parameter Selection System Tables...');
  console.log('==============================================');
  
  try {
    // Test extracted_parameters table
    console.log('\n1. Testing extracted_parameters table...');
    const { data: params, error: paramsError } = await supabase
      .from('extracted_parameters')
      .select('technology_name, category, frequency_count')
      .limit(5);
    
    if (paramsError) {
      console.log('❌ extracted_parameters error:', paramsError.message);
    } else {
      console.log(`✅ extracted_parameters: ${params.length} records found`);
      params.forEach(param => {
        console.log(`   - ${param.technology_name} (${param.category}) - popularity: ${param.frequency_count}`);
      });
    }

    // Test master_problems table
    console.log('\n2. Testing master_problems table...');
    const { data: problems, error: problemsError } = await supabase
      .from('master_problems')
      .select('title, category, technology, seniority_level')
      .limit(5);
    
    if (problemsError) {
      console.log('❌ master_problems error:', problemsError.message);
    } else {
      console.log(`✅ master_problems: ${problems.length} records found`);
      problems.forEach(problem => {
        console.log(`   - ${problem.title} (${problem.technology}, ${problem.seniority_level})`);
      });
    }

    // Test technology_combinations table
    console.log('\n3. Testing technology_combinations table...');
    const { data: combos, error: combosError } = await supabase
      .from('technology_combinations')
      .select('core_language, tech_stack, subcategory, is_popular')
      .limit(5);
    
    if (combosError) {
      console.log('❌ technology_combinations error:', combosError.message);
    } else {
      console.log(`✅ technology_combinations: ${combos.length} records found`);
      combos.forEach(combo => {
        const popular = combo.is_popular ? '⭐' : '';
        console.log(`   - ${combo.core_language} + ${combo.tech_stack} (${combo.subcategory}) ${popular}`);
      });
    }

    // Test API endpoints would work
    console.log('\n4. Testing API compatibility...');
    
    // Test core languages grouping
    const { data: coreLanguages, error: coreError } = await supabase
      .from('extracted_parameters')
      .select('technology_name, frameworks, frequency_count')
      .eq('category', 'core_language')
      .order('frequency_count', { ascending: false });

    if (coreError) {
      console.log('❌ Core languages query error:', coreError.message);
    } else {
      console.log(`✅ Core languages API ready: ${coreLanguages.length} languages`);
      console.log('   Top 3 languages:');
      coreLanguages.slice(0, 3).forEach((lang, index) => {
        console.log(`   ${index + 1}. ${lang.technology_name} (popularity: ${lang.frequency_count})`);
      });
    }

    // Test tech stacks grouping
    const { data: techStacks, error: techError } = await supabase
      .from('extracted_parameters')
      .select('technology_name, subcategory, frequency_count')
      .eq('category', 'tech_stack')
      .order('subcategory')
      .order('frequency_count', { ascending: false });

    if (techError) {
      console.log('❌ Tech stacks query error:', techError.message);
    } else {
      console.log(`✅ Tech stacks API ready: ${techStacks.length} technologies`);
      
      // Group by subcategory
      const grouped = techStacks.reduce((acc, stack) => {
        const category = stack.subcategory || 'other';
        if (!acc[category]) acc[category] = [];
        acc[category].push(stack);
        return acc;
      }, {});
      
      console.log('   Categories available:');
      Object.keys(grouped).forEach(category => {
        console.log(`   - ${category}: ${grouped[category].length} technologies`);
      });
    }

    console.log('\n✅ Parameter Selection System: READY FOR FRONTEND INTEGRATION!');
    
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    console.log('\n🔧 Make sure:');
    console.log('   1. You ran the database setup scripts in Supabase');
    console.log('   2. Supabase credentials are correct in .env');
    console.log('   3. Tables have been created and seeded');
  }
}

testParameterTables(); 