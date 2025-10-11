const { supabase } = require('../config/supabase');

class ProblemSolutionsService {
  /**
   * Fetch solutions by problem ID
   * @param {number} problemId - Problem ID from database
   * @returns {Array} Array of solution objects
   */
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

  /**
   * Fetch solutions by problem type (for dynamic detection)
   * @param {string} problemType - Problem type from ProblemDetector
   * @returns {Array} Array of solution objects
   */
  static async fetchActiveApproachesByProblemType(problemType) {
    if (!problemType) return [];
    
    // Map problem types to problem IDs
    const PROBLEM_TYPE_MAPPINGS = {
      'binary_search_tree': 1,
      'balanced_tree': 1, // Same solutions as BST
      'linked_list': 3,
      'sorting_algorithm': 10,
      'search_algorithm': 11,
      'rest_api': 20,
      'enterprise_api': 21,
      'production_api': 20, // Same as rest_api
      'react_component': 30,
      'vue_component': 31,
      'database_orm': 40,
      'modern_orm': 41,
      'general_coding': 99
    };

    const problemId = PROBLEM_TYPE_MAPPINGS[problemType];
    if (!problemId) {
      console.log(`⚠️ ProblemSolutionsService: No problem ID mapping for type: ${problemType}`);
      return [];
    }

    return this.fetchActiveApproachesByProblemId(problemId);
  }

  /**
   * Get all available solution statistics
   * @returns {Object} Statistics about stored solutions
   */
  static async getSolutionStats() {
    try {
      const { data, error } = await supabase
        .from('problem_solutions')
        .select('problem_id, approach_key, confidence')
        .eq('is_active', true);

      if (error) throw error;

      const stats = {
        totalSolutions: data.length,
        problemIds: [...new Set(data.map(s => s.problem_id))],
        approaches: [...new Set(data.map(s => s.approach_key))],
        avgConfidence: data.reduce((sum, s) => sum + s.confidence, 0) / data.length
      };

      return stats;
    } catch (err) {
      console.error('❌ ProblemSolutionsService: getSolutionStats failed:', err.message);
      return { totalSolutions: 0, problemIds: [], approaches: [], avgConfidence: 0 };
    }
  }

  /**
   * Check if solutions exist for a problem type
   * @param {string} problemType - Problem type to check
   * @returns {boolean} True if solutions exist
   */
  static async hasSolutionsForProblemType(problemType) {
    const solutions = await this.fetchActiveApproachesByProblemType(problemType);
    return solutions.length > 0;
  }

  /**
   * Get the most confident approach for a problem type
   * @param {string} problemType - Problem type
   * @returns {Object|null} Highest confidence solution
   */
  static async getBestApproachForProblemType(problemType) {
    const solutions = await this.fetchActiveApproachesByProblemType(problemType);
    return solutions.length > 0 ? solutions[0] : null; // Already sorted by confidence desc
  }
}

module.exports = ProblemSolutionsService;


