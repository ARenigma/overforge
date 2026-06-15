const express = require('express');
const router = express.Router();
const productionContainerService = require('../services/productionContainerService');
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
    const { coreLanguage, frameworkLanguage, framework, techStack, seniorityLevel, subcategory } = req.body;
    
    console.log('🔍 Checking available problems for:', {
      coreLanguage, frameworkLanguage, framework, techStack, seniorityLevel, subcategory
    });

    let coreProblems = [];
    if (coreLanguage) {
      const { data, error } = await supabase
        .from('master_problems')
        .select('id, title, description, difficulty_level, time_estimate, framework')
        .eq('category', 'core_language')
        .eq('technology', coreLanguage)
        .eq('is_active', true)
        .is('framework', null);
      if (error) throw error;
      coreProblems = data || [];
    }
    
    let frameworkProblems = [];
    if (frameworkLanguage) {
        let frameworkQuery = supabase
        .from('master_problems')
        .select('id, title, description, difficulty_level, time_estimate, framework')
        .eq('category', 'core_language') // Frameworks are still 'core_language' category
        .eq('technology', frameworkLanguage)
        .eq('seniority_level', seniorityLevel)
        .eq('is_active', true)
        .not('framework', 'is', null);
        
        // If specific framework is provided, filter by it
        if (framework) {
            frameworkQuery = frameworkQuery.eq('framework', framework);
        }
        
        const { data, error } = await frameworkQuery;
        if (error) throw error;
        frameworkProblems = data || [];
    }

    // Get tech stack problems
    let techProblems = [];
    if (techStack) {
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
        const { data, error } = await techQuery;
        if (error) throw error;
        techProblems = data || [];
    }


    const allProblems = [...coreProblems, ...frameworkProblems];

    console.log(`✅ Found ${coreProblems.length} core, ${frameworkProblems.length} framework, ${techProblems.length} tech problems`);
    
    res.json({
      success: true,
      data: {
        coreLanguageProblems: allProblems,
        techStackProblems: techProblems,
        totalProblems: allProblems.length + techProblems.length
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
      coreLanguage, 
      coreFramework, 
      frameworkLanguage,
      techStack, 
      techSubcategory, 
      seniorityLevel,
      sessionType = 'parameter_based'
    } = req.body;

    // Generate a unique session ID
    const sessionId = `param-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log('🎯 Creating new parameter-based interview session:', {
      sessionId, 
      coreLanguage, 
      coreFramework, 
      frameworkLanguage,
      techStack, 
      techSubcategory, 
      seniorityLevel,
      sessionType,
      interviewerId: req.user.id
    });

    // First, check available problems for this combination
    let coreProblems = [];
    if (coreLanguage) {
        const { data, error } = await supabase
        .from('master_problems')
        .select('id, title, description, difficulty_level, time_estimate, framework')
        .eq('category', 'core_language')
        .eq('technology', coreLanguage)
        .eq('seniority_level', seniorityLevel)
        .eq('is_active', true)
        .is('framework', null);
      if (error) throw error;
      coreProblems = data || [];
    }

    let frameworkProblems = [];
    if (coreFramework && frameworkLanguage) {
      const { data, error } = await supabase
        .from('master_problems')
        .select('id, title, description, difficulty_level, time_estimate, framework')
        .eq('category', 'core_language')
        .eq('technology', frameworkLanguage)
        .eq('framework', coreFramework)
        .eq('seniority_level', seniorityLevel)
        .eq('is_active', true);
      if (error) throw error;
      frameworkProblems = data || [];
    }

    // Get tech stack problems
    let techProblems = [];
    if (techStack) {
        let techQuery = supabase
        .from('master_problems')
        .select('id, title, description, difficulty_level, time_estimate')
        .eq('category', 'tech_stack')
        .eq('technology', techStack)
        .eq('seniority_level', seniorityLevel)
        .eq('is_active', true);

        if (techSubcategory) {
            techQuery = techQuery.eq('subcategory', techSubcategory);
        }
        const { data, error } = await techQuery;
        if (error) throw error;
        techProblems = data || [];
    }


    if (coreProblems.length === 0 && frameworkProblems.length === 0 && techProblems.length === 0) {
        return res.status(400).json({
            success: false,
            error: `No problems available for the selected combination.`
        });
    }

    // Select random problems from available ones
    const selectedCoreProblem = coreProblems.length > 0 ? coreProblems[Math.floor(Math.random() * coreProblems.length)] : null;
    const selectedFrameworkProblem = frameworkProblems.length > 0 ? frameworkProblems[Math.floor(Math.random() * frameworkProblems.length)] : null;
    const selectedTechProblem = techProblems.length > 0 ? techProblems[Math.floor(Math.random() * techProblems.length)] : null;

    // Pre-warm container for CORE questions
    if (selectedCoreProblem) {
        console.log(`🔥 Pre-warming container for core problem: ${selectedCoreProblem.title}`);
        productionContainerService.createSession({
          sessionId: `core-${selectedCoreProblem.id}`,
          type: 'core_language',
          language: coreLanguage,
          framework: coreLanguage, // Pass the language itself as the "framework" for lookup
          sourceCode: '',
          config: { questionTitle: selectedCoreProblem.title }
        }).catch(err => {
            console.error(`🚨 Failed to pre-warm container for problem ${selectedCoreProblem.id}:`, err);
        });
    }

    // Pre-warm container for framework questions
    if (selectedFrameworkProblem) {
        console.log(`🔥 Pre-warming container for framework problem: ${selectedFrameworkProblem.title}`);
        productionContainerService.createSession({
          sessionId: `framework-${selectedFrameworkProblem.id}`, // Use a unique ID for the container session
          type: 'framework',
          language: frameworkLanguage,
          framework: coreFramework,
          sourceCode: '', // No initial code for pre-warming
          config: { questionTitle: selectedFrameworkProblem.title }
        }).catch(err => {
            console.error(`🚨 Failed to pre-warm container for problem ${selectedFrameworkProblem.id}:`, err);
        });
    }

    // Create the session record in interview_sessions_v2 table
    const { data: sessionData, error: sessionError } = await supabase
        .from('interview_sessions_v2')
        .insert({
            session_id: sessionId,
            interviewer_id: req.user.id,
            candidate_id: null, // Will be filled when candidate joins
            core_language: coreLanguage || frameworkLanguage, // Store a language
            core_framework: coreFramework,
            tech_stack: techStack,
            tech_subcategory: techSubcategory,
            seniority_level: seniorityLevel,
            core_language_problem_id: selectedCoreProblem ? selectedCoreProblem.id : null,
            framework_problem_id: selectedFrameworkProblem ? selectedFrameworkProblem.id : null,
            tech_stack_problem_id: selectedTechProblem ? selectedTechProblem.id : null,
            status: 'created',
            session_data: {
                sessionType,
                useNewSystem: true,
            }
        })
        .select()
        .single();

    if (sessionError) throw sessionError;

    console.log('✅ Parameter-based interview session created successfully');

    res.json({
        success: true,
        data: {
            sessionId: sessionId,
            coreLanguageProblem: selectedCoreProblem ? {
                id: selectedCoreProblem.id,
                title: selectedCoreProblem.title,
                description: selectedCoreProblem.description,
                difficulty: selectedCoreProblem.difficulty_level,
                timeEstimate: selectedCoreProblem.time_estimate
            } : null,
            frameworkProblem: selectedFrameworkProblem ? {
                id: selectedFrameworkProblem.id,
                title: selectedFrameworkProblem.title,
                description: selectedFrameworkProblem.description,
                difficulty: selectedFrameworkProblem.difficulty_level,
                timeEstimate: selectedFrameworkProblem.time_estimate
            } : null,
            techStackProblem: selectedTechProblem ? {
                id: selectedTechProblem.id,
                title: selectedTechProblem.title,
                description: selectedTechProblem.description,
                difficulty: selectedTechProblem.difficulty_level,
                timeEstimate: selectedTechProblem.time_estimate
            } : null,
            sessionData: sessionData
        }
    });
  } catch (error) {
    console.error('❌ Error creating parameter-based interview session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create interview session: ' + error.message
    });
  }
});

module.exports = router; 