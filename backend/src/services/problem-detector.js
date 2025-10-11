/**
 * Dynamic Problem Type Detection System
 * Identifies problem types from code patterns to assign appropriate problem IDs
 * Production-ready with comprehensive pattern matching
 */

class ProblemDetector {
  
  /**
   * Problem type mappings to database IDs
   * This should eventually be loaded from database configuration
   */
  static PROBLEM_TYPE_MAPPINGS = {
    // Data Structures
    'binary_search_tree': { id: 1, category: 'data_structures' },
    'balanced_tree': { id: 2, category: 'data_structures' },
    'linked_list': { id: 3, category: 'data_structures' },
    'hash_table': { id: 4, category: 'data_structures' },
    'graph': { id: 5, category: 'data_structures' },
    'heap': { id: 6, category: 'data_structures' },
    
    // Algorithms
    'sorting_algorithm': { id: 10, category: 'algorithms' },
    'search_algorithm': { id: 11, category: 'algorithms' },
    'dynamic_programming': { id: 12, category: 'algorithms' },
    'graph_algorithm': { id: 13, category: 'algorithms' },
    'string_algorithm': { id: 14, category: 'algorithms' },
    
    // Web Development
    'rest_api': { id: 20, category: 'web_development' },
    'enterprise_api': { id: 21, category: 'web_development' },
    'production_api': { id: 22, category: 'web_development' },
    'async_api': { id: 23, category: 'web_development' },
    'graphql_api': { id: 24, category: 'web_development' },
    
    // Frontend
    'react_component': { id: 30, category: 'frontend' },
    'vue_component': { id: 31, category: 'frontend' },
    'angular_component': { id: 32, category: 'frontend' },
    'state_management': { id: 33, category: 'frontend' },
    
    // Database
    'database_orm': { id: 40, category: 'database' },
    'modern_orm': { id: 41, category: 'database' },
    'database_raw': { id: 42, category: 'database' },
    'database_migration': { id: 43, category: 'database' },
    
    // System Design
    'microservices': { id: 50, category: 'system_design' },
    'caching': { id: 51, category: 'system_design' },
    'message_queue': { id: 52, category: 'system_design' },
    'authentication': { id: 53, category: 'system_design' },
    
    // Default fallback
    'general_coding': { id: 99, category: 'general' }
  };

  /**
   * Comprehensive pattern definitions for problem type detection
   */
  static PROBLEM_PATTERNS = {
    // Data Structure Patterns
    binary_search_tree: {
      required: ['tree', 'node'],
      optional: ['bst', 'binary', 'insert', 'search', 'left', 'right'],
      weight: 0.9
    },
    
    balanced_tree: {
      required: ['tree', 'balance'],
      optional: ['avl', 'red', 'black', 'rotation', 'height'],
      weight: 0.95
    },
    
    linked_list: {
      required: ['node', 'next'],
      optional: ['head', 'tail', 'prev', 'listnode', 'linked'],
      weight: 0.85
    },
    
    hash_table: {
      required: ['hash'],
      optional: ['map', 'bucket', 'collision', 'hashmap', 'dictionary'],
      weight: 0.85
    },
    
    graph: {
      required: ['graph', 'vertex'],
      optional: ['edge', 'adjacent', 'neighbor', 'dfs', 'bfs'],
      weight: 0.9
    },
    
    heap: {
      required: ['heap'],
      optional: ['priority', 'heapify', 'parent', 'child', 'max', 'min'],
      weight: 0.9
    },

    // Algorithm Patterns
    sorting_algorithm: {
      required: ['sort'],
      optional: ['compare', 'swap', 'merge', 'quick', 'bubble', 'insertion'],
      weight: 0.85
    },
    
    search_algorithm: {
      required: ['search'],
      optional: ['binary', 'linear', 'find', 'target', 'index'],
      weight: 0.8
    },
    
    dynamic_programming: {
      required: ['dp', 'memo'],
      optional: ['dynamic', 'programming', 'cache', 'subproblem', 'optimal'],
      weight: 0.9
    },
    
    graph_algorithm: {
      required: ['graph'],
      optional: ['dijkstra', 'bellman', 'floyd', 'shortest', 'path', 'cycle'],
      weight: 0.9
    },

    // Web Development Patterns
    rest_api: {
      required: ['api'],
      optional: ['rest', 'http', 'get', 'post', 'put', 'delete', 'endpoint'],
      weight: 0.8
    },
    
    enterprise_api: {
      required: ['@restcontroller', 'api'],
      optional: ['spring', 'boot', 'enterprise', 'service', 'repository'],
      weight: 0.9
    },
    
    production_api: {
      required: ['api', 'middleware'],
      optional: ['cors', 'helmet', 'security', 'logging', 'validation'],
      weight: 0.85
    },
    
    async_api: {
      required: ['async', 'api'],
      optional: ['await', 'promise', 'fastapi', 'asyncio'],
      weight: 0.85
    },
    
    graphql_api: {
      required: ['graphql'],
      optional: ['resolver', 'schema', 'query', 'mutation', 'subscription'],
      weight: 0.95
    },

    // Frontend Patterns
    react_component: {
      required: ['react'],
      optional: ['component', 'jsx', 'usestate', 'useeffect', 'props'],
      weight: 0.85
    },
    
    vue_component: {
      required: ['vue'],
      optional: ['component', 'template', 'script', 'ref', 'reactive'],
      weight: 0.85
    },
    
    state_management: {
      required: ['state'],
      optional: ['redux', 'vuex', 'pinia', 'zustand', 'store', 'dispatch'],
      weight: 0.8
    },

    // Database Patterns
    database_orm: {
      required: ['model', 'database'],
      optional: ['orm', 'sequelize', 'typeorm', 'eloquent', 'active'],
      weight: 0.8
    },
    
    modern_orm: {
      required: ['prisma'],
      optional: ['schema', 'client', 'findmany', 'findunique'],
      weight: 0.9
    },
    
    database_raw: {
      required: ['select', 'from'],
      optional: ['insert', 'update', 'delete', 'where', 'join', 'sql'],
      weight: 0.75
    }
  };

  /**
   * Detect problem type from candidate code
   * @param {string} code - Candidate's code
   * @param {string} language - Programming language
   * @returns {Object} { problemType, problemId, confidence, category, details }
   */
  static detectProblemType(code, language) {
    if (!code || typeof code !== 'string') {
      return this.getDefaultProblem();
    }

    const codeNormalized = code.toLowerCase();
    const detectedProblems = [];

    // Analyze each problem pattern
    for (const [problemType, pattern] of Object.entries(this.PROBLEM_PATTERNS)) {
      const score = this.calculatePatternScore(codeNormalized, pattern);
      
      if (score > 0.3) { // Minimum threshold for consideration
        const mapping = this.PROBLEM_TYPE_MAPPINGS[problemType] || this.PROBLEM_TYPE_MAPPINGS.general_coding;
        
        detectedProblems.push({
          problemType,
          problemId: mapping.id,
          confidence: score,
          category: mapping.category,
          details: {
            patterns: this.getMatchedPatterns(codeNormalized, pattern),
            weight: pattern.weight
          }
        });
      }
    }

    // If no patterns matched, return default
    if (detectedProblems.length === 0) {
      return this.getDefaultProblem();
    }

    // Sort by confidence and return the best match
    detectedProblems.sort((a, b) => b.confidence - a.confidence);
    return detectedProblems[0];
  }

  /**
   * Calculate pattern matching score
   * @param {string} code - Normalized code
   * @param {Object} pattern - Pattern definition
   * @returns {number} Score between 0 and 1
   */
  static calculatePatternScore(code, pattern) {
    let score = 0;
    let totalWeight = 0;

    // Check required patterns (higher weight)
    const requiredMatches = pattern.required.filter(keyword => 
      code.includes(keyword.toLowerCase())
    ).length;
    
    const requiredWeight = requiredMatches / pattern.required.length;
    score += requiredWeight * 0.7; // Required patterns are 70% of score
    totalWeight += 0.7;

    // Check optional patterns (lower weight)
    const optionalMatches = pattern.optional.filter(keyword => 
      code.includes(keyword.toLowerCase())
    ).length;
    
    const optionalWeight = optionalMatches / pattern.optional.length;
    score += optionalWeight * 0.3; // Optional patterns are 30% of score
    totalWeight += 0.3;

    // Apply pattern-specific weight
    score *= pattern.weight;

    // Ensure we have at least one required pattern match
    if (requiredMatches === 0) {
      return 0;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Get matched patterns for debugging/logging
   * @param {string} code - Normalized code
   * @param {Object} pattern - Pattern definition
   * @returns {Array} Matched keywords
   */
  static getMatchedPatterns(code, pattern) {
    const matched = [];
    
    pattern.required.forEach(keyword => {
      if (code.includes(keyword.toLowerCase())) {
        matched.push(`required:${keyword}`);
      }
    });
    
    pattern.optional.forEach(keyword => {
      if (code.includes(keyword.toLowerCase())) {
        matched.push(`optional:${keyword}`);
      }
    });
    
    return matched;
  }

  /**
   * Get default problem when no patterns match
   * @returns {Object}
   */
  static getDefaultProblem() {
    const mapping = this.PROBLEM_TYPE_MAPPINGS.general_coding;
    return {
      problemType: 'general_coding',
      problemId: mapping.id,
      confidence: 0.1,
      category: mapping.category,
      details: {
        patterns: [],
        reason: 'No specific patterns detected'
      }
    };
  }

  /**
   * Get all possible problem types for given code
   * @param {string} code - Candidate's code
   * @param {string} language - Programming language
   * @returns {Array} All detected problems sorted by confidence
   */
  static getAllPossibleProblems(code, language) {
    if (!code || typeof code !== 'string') {
      return [this.getDefaultProblem()];
    }

    const codeNormalized = code.toLowerCase();
    const detectedProblems = [];

    // Analyze each problem pattern
    for (const [problemType, pattern] of Object.entries(this.PROBLEM_PATTERNS)) {
      const score = this.calculatePatternScore(codeNormalized, pattern);
      
      if (score > 0.2) { // Lower threshold for multiple results
        const mapping = this.PROBLEM_TYPE_MAPPINGS[problemType] || this.PROBLEM_TYPE_MAPPINGS.general_coding;
        
        detectedProblems.push({
          problemType,
          problemId: mapping.id,
          confidence: score,
          category: mapping.category,
          details: {
            patterns: this.getMatchedPatterns(codeNormalized, pattern),
            weight: pattern.weight
          }
        });
      }
    }

    // Sort by confidence
    detectedProblems.sort((a, b) => b.confidence - a.confidence);
    
    return detectedProblems.length > 0 ? detectedProblems : [this.getDefaultProblem()];
  }

  /**
   * Validate problem detection result
   * @param {Object} problem - Detected problem
   * @returns {boolean}
   */
  static isValidProblem(problem) {
    return problem && 
           problem.problemType && 
           problem.problemId && 
           problem.confidence > 0.3;
  }

  /**
   * Get problem category statistics
   * @param {string} code - Candidate's code
   * @param {string} language - Programming language
   * @returns {Object} Category breakdown
   */
  static getProblemCategoryStats(code, language) {
    const allProblems = this.getAllPossibleProblems(code, language);
    const categoryStats = {};

    allProblems.forEach(problem => {
      if (!categoryStats[problem.category]) {
        categoryStats[problem.category] = {
          count: 0,
          totalConfidence: 0,
          problems: []
        };
      }
      
      categoryStats[problem.category].count++;
      categoryStats[problem.category].totalConfidence += problem.confidence;
      categoryStats[problem.category].problems.push(problem);
    });

    // Calculate average confidence per category
    Object.keys(categoryStats).forEach(category => {
      categoryStats[category].averageConfidence = 
        categoryStats[category].totalConfidence / categoryStats[category].count;
    });

    return categoryStats;
  }
}

module.exports = ProblemDetector;

