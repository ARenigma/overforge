const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { authenticateSupabase, optionalAuth } = require('../middleware/supabase-auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get all available core languages
router.get('/core-languages', optionalAuth, async (req, res) => {
  try {
    console.log('📋 Fetching core languages...');
    
    const { data, error } = await supabase
      .from('extracted_parameters')
      .select('technology_name, frameworks, frequency_count')
      .eq('category', 'core_language')
      .order('frequency_count', { ascending: false });

    if (error) throw error;

    const languages = data.map(lang => ({
      name: lang.technology_name,
      frameworks: lang.frameworks || [],
      popularity: lang.frequency_count
    }));

    console.log(`✅ Found ${languages.length} core languages`);
    
    res.json({
      success: true,
      data: languages
    });
  } catch (error) {
    console.error('❌ Error fetching core languages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch core languages'
    });
  }
});

// Get all available tech stacks by subcategory
router.get('/tech-stacks', optionalAuth, async (req, res) => {
  try {
    console.log('📋 Fetching tech stacks...');
    
    const { data, error } = await supabase
      .from('extracted_parameters')
      .select('technology_name, subcategory, frameworks, frequency_count')
      .eq('category', 'tech_stack')
      .order('subcategory', { ascending: true })
      .order('frequency_count', { ascending: false });

    if (error) throw error;

    // Group by subcategory
    const groupedStacks = data.reduce((acc, stack) => {
      const category = stack.subcategory || 'other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push({
        name: stack.technology_name,
        frameworks: stack.frameworks || [],
        popularity: stack.frequency_count
      });
      return acc;
    }, {});

    console.log(`✅ Found tech stacks in ${Object.keys(groupedStacks).length} categories`);
    
    res.json({
      success: true,
      data: groupedStacks
    });
  } catch (error) {
    console.error('❌ Error fetching tech stacks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tech stacks'
    });
  }
});

// Get popular technology combinations
router.get('/popular-combinations', optionalAuth, async (req, res) => {
  try {
    console.log('📋 Fetching popular technology combinations...');
    
    const { data, error } = await supabase
      .from('technology_combinations')
      .select('*')
      .eq('is_popular', true)
      .order('problem_count', { ascending: false });

    if (error) throw error;

    const combinations = data.map(combo => ({
      coreLanguage: combo.core_language,
      framework: combo.framework,
      techStack: combo.tech_stack,
      subcategory: combo.subcategory,
      problemCount: combo.problem_count
    }));

    console.log(`✅ Found ${combinations.length} popular combinations`);
    
    res.json({
      success: true,
      data: combinations
    });
  } catch (error) {
    console.error('❌ Error fetching popular combinations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch popular combinations'
    });
  }
});

// Get available problems for selected parameters
router.post('/available-problems', optionalAuth, async (req, res) => {
  try {
    const { coreLanguage, techStack, framework, seniorityLevel, subcategory } = req.body;
    
    console.log('🔍 Checking available problems for:', {
      coreLanguage, techStack, framework, seniorityLevel, subcategory
    });

    // Get core language problems
    let coreQuery = supabase
      .from('master_problems')
      .select('id, title, description, difficulty_level, time_estimate')
      .eq('category', 'core_language')
      .eq('technology', coreLanguage)
      .eq('seniority_level', seniorityLevel)
      .eq('is_active', true);

    if (framework) {
      coreQuery = coreQuery.eq('framework', framework);
    }

    const { data: coreProblems, error: coreError } = await coreQuery;
    if (coreError) throw coreError;

    // Get tech stack problems
    let techQuery = supabase
      .from('master_problems')
      .select('id, title, description, difficulty_level, time_estimate')
      .eq('category', 'tech_stack')
      .eq('technology', techStack)
      .eq('seniority_level', seniorityLevel)
      .eq('is_active', true);

    if (subcategory) {
      techQuery = techQuery.eq('subcategory', subcategory);
    }

    const { data: techProblems, error: techError } = await techQuery;
    if (techError) throw techError;

    console.log(`✅ Found ${coreProblems.length} core problems, ${techProblems.length} tech problems`);
    
    res.json({
      success: true,
      data: {
        coreLanguageProblems: coreProblems,
        techStackProblems: techProblems,
        totalProblems: coreProblems.length + techProblems.length
      }
    });
  } catch (error) {
    console.error('❌ Error fetching available problems:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available problems'
    });
  }
});

// Create new interview session with selected parameters
router.post('/create-session', authenticateSupabase, async (req, res) => {
  try {
    const { 
      sessionId, 
      candidateId, 
      coreLanguage, 
      coreFramework, 
      techStack, 
      techSubcategory, 
      seniorityLevel 
    } = req.body;

    console.log('🎯 Creating new interview session with parameters:', {
      sessionId, candidateId, coreLanguage, coreFramework, techStack, seniorityLevel
    });

    // Use the SQL function to create session and assign problems
    const { data, error } = await supabase.rpc('create_interview_session_with_problems', {
      p_session_id: sessionId,
      p_interviewer_id: req.user.id,
      p_candidate_id: candidateId,
      p_core_language: coreLanguage,
      p_tech_stack: techStack,
      p_core_framework: coreFramework,
      p_tech_subcategory: techSubcategory,
      p_seniority_level: seniorityLevel
    });

    if (error) throw error;

    console.log('✅ Interview session created successfully');
    
    res.json({
      success: true,
      data: {
        sessionId: data.session_id,
        coreLanguageProblem: {
          id: data.core_problem_id,
          title: data.core_problem_title
        },
        techStackProblem: {
          id: data.tech_problem_id,
          title: data.tech_problem_title
        }
      }
    });
  } catch (error) {
    console.error('❌ Error creating interview session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create interview session'
    });
  }
});

module.exports = router; 