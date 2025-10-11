const express = require('express');
const { supabase } = require('../config/supabase');
const router = express.Router();

// Get solutions for a specific problem
router.get('/problems/:problemId/solutions', async (req, res) => {
  try {
    const { problemId } = req.params;
    
    console.log(`🔍 Fetching solutions for problem: ${problemId}`);
    
    const { data: solutions, error } = await supabase
      .from('problem_solutions')
      .select('*')
      .eq('problem_id', problemId)
      .eq('is_active', true)
      .order('confidence', { ascending: false });

    if (error) {
      console.error('❌ Error fetching solutions:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch solutions',
        details: error.message
      });
    }

    console.log(`✅ Found ${solutions?.length || 0} solutions for ${problemId}`);
    
    res.json({
      success: true,
      problemId,
      solutions: solutions || [],
      count: solutions?.length || 0
    });

  } catch (error) {
    console.error('❌ Solutions endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Get all solutions (for debugging)
router.get('/solutions', async (req, res) => {
  try {
    const { data: solutions, error } = await supabase
      .from('problem_solutions')
      .select('problem_id, approach_key, title, summary')
      .eq('is_active', true)
      .order('problem_id', { ascending: true });

    if (error) throw error;

    // Group by problem_id for easier viewing
    const grouped = {};
    solutions?.forEach(solution => {
      if (!grouped[solution.problem_id]) {
        grouped[solution.problem_id] = [];
      }
      grouped[solution.problem_id].push({
        approach: solution.approach_key,
        title: solution.title,
        summary: solution.summary
      });
    });

    res.json({
      success: true,
      solutions: grouped,
      totalCount: solutions?.length || 0
    });

  } catch (error) {
    console.error('❌ All solutions endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch all solutions',
      details: error.message
    });
  }
});

module.exports = router;
