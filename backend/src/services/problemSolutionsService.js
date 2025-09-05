const { supabase } = require('../config/supabase');

class ProblemSolutionsService {
  static async fetchActiveApproachesByProblemId(problemId) {
    if (!problemId) return [];
    try {
      const { data, error } = await supabase
        .from('problem_solutions')
        .select('*')
        .eq('problem_id', problemId)
        .eq('is_active', true)
        .order('confidence', { ascending: false });

      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('❌ ProblemSolutionsService: fetchActiveApproachesByProblemId failed:', err.message);
      return [];
    }
  }
}

module.exports = ProblemSolutionsService;


