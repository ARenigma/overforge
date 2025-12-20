/**
 * Dynamic Approach Detection System
 * Analyzes candidate code to identify specific implementation approaches
 * Production-ready with comprehensive pattern matching
 */

class ApproachDetector {
  
  /**
   * Detect the specific approach used by candidate from their code
   * @param {string} code - Candidate's code
   * @param {string} language - Programming language
   * @returns {Object} { type, confidence, details, problemType }
   */
  static detectApproach(code, language) {
    if (!code || typeof code !== 'string') {
      return { type: 'unknown', confidence: 0, details: {}, problemType: 'general' };
    }

    const codeNormalized = code.toLowerCase();
    const approaches = [];

    // =================================================================
    // UNIVERSAL DESIGN PATTERNS (ALL LANGUAGES)
    // =================================================================

    // Decorator Pattern (Python, JavaScript, Java, etc.)
    if (this.containsPatterns(codeNormalized, ['decorator']) || 
        (language === 'python' && this.containsPatterns(codeNormalized, ['def', '@'])) ||
        (language === 'javascript' && this.containsPatterns(codeNormalized, ['function', 'wrapper'])) ||
        (language === 'java' && this.containsPatterns(codeNormalized, ['@interface', 'annotation']))) {
      if (this.containsPatterns(codeNormalized, ['@wraps', 'wrapper', 'functools'])) {
        approaches.push({
          type: 'function_decorator',
          confidence: 0.9,
          details: {
            patterns: ['decorator pattern', 'wrapper function', 'functools usage'],
            characteristics: ['reusable', 'separation of concerns', 'function enhancement'],
            complexity: 'O(1) decorator overhead'
          },
          problemType: 'decorator_pattern'
        });
      }
      
      // Timing patterns across languages
      if (this.containsPatterns(codeNormalized, ['time.time', 'timing', 'start_time', 'end_time']) ||
          (language === 'javascript' && this.containsPatterns(codeNormalized, ['date.now', 'performance.now', 'console.time'])) ||
          (language === 'java' && this.containsPatterns(codeNormalized, ['system.currenttimemillis', 'system.nanotime']))) {
        approaches.push({
          type: 'timing_decorator',
          confidence: 0.95,
          details: {
            patterns: ['timing measurement', 'performance monitoring', 'decorator pattern'],
            characteristics: ['non-intrusive timing', 'reusable across functions', 'clean separation'],
            complexity: 'O(1) timing overhead'
          },
          problemType: 'timing_decorator'
        });
      }
    }

    // API Pattern Detection (REST, Express, Spring, etc.)
    if ((language === 'javascript' && this.containsPatterns(codeNormalized, ['express', 'app.get', 'app.post', 'router'])) ||
        (language === 'java' && this.containsPatterns(codeNormalized, ['@restcontroller', '@getmapping', '@postmapping', 'spring'])) ||
        (language === 'python' && this.containsPatterns(codeNormalized, ['flask', 'django', '@app.route', 'def get', 'def post']))) {
      approaches.push({
        type: 'rest_api',
        confidence: 0.9,
        details: {
          patterns: ['REST endpoints', 'HTTP methods', 'routing'],
          characteristics: ['stateless', 'resource-based', 'HTTP protocol'],
          complexity: 'O(1) per request'
        },
        problemType: 'rest_api'
      });
    }

    // Database Pattern Detection
    if (this.containsPatterns(codeNormalized, ['sql', 'select', 'insert', 'update', 'delete']) ||
        (language === 'python' && this.containsPatterns(codeNormalized, ['sqlalchemy', 'django.models', 'cursor.execute'])) ||
        (language === 'javascript' && this.containsPatterns(codeNormalized, ['mongoose', 'sequelize', 'knex'])) ||
        (language === 'java' && this.containsPatterns(codeNormalized, ['jpa', '@entity', 'hibernate', 'jdbc']))) {
      approaches.push({
        type: 'database_access',
        confidence: 0.85,
        details: {
          patterns: ['database queries', 'ORM usage', 'data persistence'],
          characteristics: ['data-driven', 'CRUD operations', 'persistence layer'],
          complexity: 'O(log n) for indexed queries'
        },
        problemType: 'database_integration'
      });
    }

    // =================================================================
    // DATA STRUCTURES APPROACHES
    // =================================================================

    // Binary Search Tree Approaches
    if (this.containsPatterns(codeNormalized, ['treenode', 'bst', 'binary', 'tree'])) {
      if (this.containsPatterns(codeNormalized, ['insertnode', 'this.insertnode', 'recursive'])) {
        approaches.push({
          type: 'recursive_bst',
          confidence: 0.95,
          details: {
            patterns: ['recursive insertion', 'tree traversal'],
            characteristics: ['clean code', 'potential stack overflow'],
            complexity: 'O(log n) average, O(n) worst case'
          },
          problemType: 'binary_search_tree'
        });
      }
      
      if (this.containsPatterns(codeNormalized, ['while', 'loop', 'iterative']) && 
          !this.containsPatterns(codeNormalized, ['insertnode', 'this.insertnode'])) {
        approaches.push({
          type: 'iterative_bst',
          confidence: 0.90,
          details: {
            patterns: ['iterative insertion', 'manual traversal'],
            characteristics: ['memory efficient', 'no stack overflow'],
            complexity: 'O(log n) average, O(n) worst case'
          },
          problemType: 'binary_search_tree'
        });
      }

      if (this.containsPatterns(codeNormalized, ['balance', 'avl', 'red', 'black', 'rotation'])) {
        approaches.push({
          type: 'balanced_bst',
          confidence: 0.98,
          details: {
            patterns: ['self-balancing', 'rotations', 'height maintenance'],
            characteristics: ['guaranteed O(log n)', 'complex implementation'],
            complexity: 'O(log n) guaranteed'
          },
          problemType: 'balanced_tree'
        });
      }
    }

    // Linked List Approaches
    if (this.containsPatterns(codeNormalized, ['listnode', 'node', 'next', 'head'])) {
      if (this.containsPatterns(codeNormalized, ['prev', 'previous', 'doubly'])) {
        approaches.push({
          type: 'doubly_linked_list',
          confidence: 0.92,
          details: {
            patterns: ['bidirectional traversal', 'prev/next pointers'],
            characteristics: ['flexible traversal', 'higher memory usage'],
            complexity: 'O(1) insertion/deletion'
          },
          problemType: 'linked_list'
        });
      } else {
        approaches.push({
          type: 'singly_linked_list',
          confidence: 0.88,
          details: {
            patterns: ['unidirectional traversal', 'next pointer only'],
            characteristics: ['memory efficient', 'forward traversal only'],
            complexity: 'O(1) insertion at head'
          },
          problemType: 'linked_list'
        });
      }
    }

    // =================================================================
    // WEB API APPROACHES
    // =================================================================

    // Spring Boot API
    if (this.containsPatterns(codeNormalized, ['@restcontroller', '@requestmapping', 'responseentity'])) {
      if (this.containsPatterns(codeNormalized, ['@autowired', '@service', '@repository'])) {
        approaches.push({
          type: 'spring_boot_layered',
          confidence: 0.95,
          details: {
            patterns: ['dependency injection', 'layered architecture', 'annotations'],
            characteristics: ['enterprise ready', 'testable', 'heavyweight'],
            complexity: 'High setup, scalable'
          },
          problemType: 'enterprise_api'
        });
      } else {
        approaches.push({
          type: 'spring_boot_simple',
          confidence: 0.88,
          details: {
            patterns: ['REST controller', 'HTTP mappings'],
            characteristics: ['quick setup', 'less separation'],
            complexity: 'Medium setup'
          },
          problemType: 'rest_api'
        });
      }
    }

    // Express.js API
    if (this.containsPatterns(codeNormalized, ['express', 'app.get', 'app.post', 'router'])) {
      if (this.containsPatterns(codeNormalized, ['middleware', 'cors', 'helmet', 'morgan'])) {
        approaches.push({
          type: 'express_production',
          confidence: 0.92,
          details: {
            patterns: ['middleware stack', 'security headers', 'logging'],
            characteristics: ['production ready', 'secure', 'well structured'],
            complexity: 'Medium complexity'
          },
          problemType: 'production_api'
        });
      } else {
        approaches.push({
          type: 'express_basic',
          confidence: 0.85,
          details: {
            patterns: ['basic routing', 'simple endpoints'],
            characteristics: ['quick development', 'minimal setup'],
            complexity: 'Low complexity'
          },
          problemType: 'rest_api'
        });
      }
    }

    // FastAPI Python
    if (this.containsPatterns(codeNormalized, ['fastapi', '@app.get', '@app.post', 'pydantic'])) {
      approaches.push({
        type: 'fastapi_modern',
        confidence: 0.90,
        details: {
          patterns: ['async/await', 'type hints', 'automatic validation'],
          characteristics: ['high performance', 'modern Python', 'auto docs'],
          complexity: 'Medium complexity'
        },
        problemType: 'async_api'
      });
    }

    // =================================================================
    // FRONTEND APPROACHES
    // =================================================================

    // React Approaches
    if (this.containsPatterns(codeNormalized, ['react', 'jsx', 'component'])) {
      if (this.containsPatterns(codeNormalized, ['usestate', 'useeffect', 'usecallback'])) {
        approaches.push({
          type: 'react_hooks',
          confidence: 0.95,
          details: {
            patterns: ['functional components', 'hooks API', 'modern React'],
            characteristics: ['clean code', 'reusable logic', 'learning curve'],
            complexity: 'Medium complexity'
          },
          problemType: 'react_component'
        });
      }

      if (this.containsPatterns(codeNormalized, ['class', 'componentdidmount', 'componentdidupdate'])) {
        approaches.push({
          type: 'react_class',
          confidence: 0.88,
          details: {
            patterns: ['class components', 'lifecycle methods', 'this.setState'],
            characteristics: ['traditional React', 'verbose', 'well understood'],
            complexity: 'Higher complexity'
          },
          problemType: 'react_component'
        });
      }

      if (this.containsPatterns(codeNormalized, ['redux', 'useselector', 'usedispatch', 'createstore'])) {
        approaches.push({
          type: 'react_redux',
          confidence: 0.93,
          details: {
            patterns: ['centralized state', 'actions/reducers', 'predictable updates'],
            characteristics: ['scalable state', 'debugging tools', 'boilerplate'],
            complexity: 'High complexity'
          },
          problemType: 'state_management'
        });
      }
    }

    // Vue.js Approaches
    if (this.containsPatterns(codeNormalized, ['vue', 'ref', 'reactive', 'computed'])) {
      if (this.containsPatterns(codeNormalized, ['script setup', 'composition api'])) {
        approaches.push({
          type: 'vue_composition',
          confidence: 0.92,
          details: {
            patterns: ['composition API', 'setup function', 'reactive refs'],
            characteristics: ['modern Vue', 'TypeScript friendly', 'reusable logic'],
            complexity: 'Medium complexity'
          },
          problemType: 'vue_component'
        });
      } else {
        approaches.push({
          type: 'vue_options',
          confidence: 0.85,
          details: {
            patterns: ['options API', 'data/methods/computed'],
            characteristics: ['traditional Vue', 'simple structure', 'less flexible'],
            complexity: 'Low complexity'
          },
          problemType: 'vue_component'
        });
      }
    }

    // =================================================================
    // DATABASE APPROACHES
    // =================================================================

    // ORM Approaches
    if (this.containsPatterns(codeNormalized, ['sequelize', 'findall', 'findone', 'create'])) {
      approaches.push({
        type: 'sequelize_orm',
        confidence: 0.88,
        details: {
          patterns: ['ORM abstraction', 'model definitions', 'query methods'],
          characteristics: ['database agnostic', 'migration support', 'performance overhead'],
          complexity: 'Medium complexity'
        },
        problemType: 'database_orm'
      });
    }

    if (this.containsPatterns(codeNormalized, ['prisma', 'prisma.', 'findmany', 'findunique'])) {
      approaches.push({
        type: 'prisma_orm',
        confidence: 0.92,
        details: {
          patterns: ['modern ORM', 'type-safe queries', 'schema-first'],
          characteristics: ['excellent TypeScript', 'great DX', 'newer ecosystem'],
          complexity: 'Medium complexity'
        },
        problemType: 'modern_orm'
      });
    }

    // Raw SQL
    if (this.containsPatterns(codeNormalized, ['select', 'insert', 'update', 'delete', 'from', 'where'])) {
      approaches.push({
        type: 'raw_sql',
        confidence: 0.85,
        details: {
          patterns: ['direct SQL queries', 'manual query building'],
          characteristics: ['full control', 'best performance', 'SQL injection risk'],
          complexity: 'High complexity'
        },
        problemType: 'database_raw'
      });
    }

    // =================================================================
    // ALGORITHM APPROACHES
    // =================================================================

    // Sorting Algorithms
    if (this.containsPatterns(codeNormalized, ['sort', 'compare', 'swap'])) {
      if (this.containsPatterns(codeNormalized, ['quicksort', 'pivot', 'partition'])) {
        approaches.push({
          type: 'quicksort',
          confidence: 0.90,
          details: {
            patterns: ['divide and conquer', 'pivot selection', 'partitioning'],
            characteristics: ['average O(n log n)', 'in-place', 'worst case O(n²)'],
            complexity: 'O(n log n) average'
          },
          problemType: 'sorting_algorithm'
        });
      }

      if (this.containsPatterns(codeNormalized, ['mergesort', 'merge', 'divide'])) {
        approaches.push({
          type: 'mergesort',
          confidence: 0.88,
          details: {
            patterns: ['divide and conquer', 'merge operation', 'stable sort'],
            characteristics: ['guaranteed O(n log n)', 'stable', 'extra space'],
            complexity: 'O(n log n) guaranteed'
          },
          problemType: 'sorting_algorithm'
        });
      }
    }

    // Search Algorithms
    if (this.containsPatterns(codeNormalized, ['search', 'find', 'binary'])) {
      if (this.containsPatterns(codeNormalized, ['binary search', 'mid', 'left', 'right'])) {
        approaches.push({
          type: 'binary_search',
          confidence: 0.92,
          details: {
            patterns: ['divide and conquer', 'sorted array requirement'],
            characteristics: ['O(log n) time', 'requires sorted data', 'efficient'],
            complexity: 'O(log n)'
          },
          problemType: 'search_algorithm'
        });
      }
    }

    // =================================================================
    // DATA STRUCTURE IMPLEMENTATIONS
    // =================================================================

    // Stack Data Structure
    if (this.containsPatterns(codeNormalized, ['stack', 'push', 'pop', 'peek'])) {
      if (this.containsPatterns(codeNormalized, ['class', 'stack']) || 
          this.containsPatterns(codeNormalized, ['public', 'void', 'push']) ||
          this.containsPatterns(codeNormalized, ['def', 'push']) ||
          this.containsPatterns(codeNormalized, ['function', 'push'])) {
        approaches.push({
          type: 'stack_implementation',
          confidence: 0.95,
          details: {
            patterns: ['LIFO structure', 'push/pop operations', 'error handling'],
            characteristics: ['Last In First Out', 'O(1) operations', 'can use array or linked list'],
            complexity: 'O(1) push/pop/peek'
          },
          problemType: 'data_structure'
        });
      }
    }

    // Queue Data Structure
    if (this.containsPatterns(codeNormalized, ['queue', 'enqueue', 'dequeue'])) {
      approaches.push({
        type: 'queue_implementation',
        confidence: 0.93,
        details: {
          patterns: ['FIFO structure', 'enqueue/dequeue operations'],
          characteristics: ['First In First Out', 'O(1) operations'],
          complexity: 'O(1) enqueue/dequeue'
        },
        problemType: 'data_structure'
      });
    }

    // Return the highest confidence approach, or unknown if none found
    if (approaches.length === 0) {
      return {
        type: 'unknown',
        confidence: 0,
        details: {},
        problemType: 'general_coding'
      };
    }

    // Sort by confidence and return the best match
    approaches.sort((a, b) => b.confidence - a.confidence);
    return approaches[0];
  }

  /**
   * Check if code contains specific patterns
   * @param {string} code - Normalized code
   * @param {string[]} patterns - Patterns to search for
   * @returns {boolean}
   */
  static containsPatterns(code, patterns) {
    return patterns.some(pattern => code.includes(pattern.toLowerCase()));
  }

  /**
   * Get all possible approaches for a given code
   * @param {string} code - Candidate's code
   * @param {string} language - Programming language
   * @returns {Array} All detected approaches sorted by confidence
   */
  static getAllApproaches(code, language) {
    const primary = this.detectApproach(code, language);
    // In a full implementation, this would return all detected approaches
    // For now, return the primary approach in an array
    return primary.type !== 'unknown' ? [primary] : [];
  }

  /**
   * Validate approach detection result
   * @param {Object} approach - Detected approach
   * @returns {boolean}
   */
  static isValidApproach(approach) {
    return approach && 
           approach.type !== 'unknown' && 
           approach.confidence > 0.5 &&
           approach.problemType !== 'general_coding';
  }
}

module.exports = ApproachDetector;

