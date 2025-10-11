/**
 * Approach-Aware Question Templates
 * Production-ready fallback questions based on detected approaches
 * Used when AI generation fails or for immediate responses
 */

class QuestionTemplates {
  
  /**
   * Approach-specific question templates organized by depth level
   */
  static APPROACH_TEMPLATES = {
    // =================================================================
    // DATA STRUCTURE APPROACHES
    // =================================================================
    recursive_bst: {
      approach: "I see you implemented a recursive BST. What made you choose recursion over an iterative approach for this tree structure?",
      tradeoffs: "Recursive solutions are elegant, but what about stack overflow risks with deep trees? How would an iterative approach compare in terms of memory usage?",
      scaling: "In a database index system handling millions of records, how would your recursive approach perform? What optimizations or changes would you consider for production?"
    },
    
    iterative_bst: {
      approach: "You chose an iterative approach for the BST implementation. What factors led you away from the more common recursive solution?",
      tradeoffs: "Your iterative solution avoids stack overflow, but the code is more complex. In what scenarios would you switch back to recursion?",
      scaling: "For a high-frequency trading system processing thousands of tree operations per second, how would your iterative approach handle the load?"
    },
    
    balanced_bst: {
      approach: "I notice you implemented a self-balancing tree. What drove the decision to use AVL/Red-Black over a simple BST?",
      tradeoffs: "Balanced trees guarantee O(log n), but they're more complex to implement. When would the extra complexity not be worth it?",
      scaling: "In a distributed database where tree operations happen across multiple nodes, how would you adapt your balancing strategy?"
    },
    
    singly_linked: {
      approach: "You implemented a singly linked list. What made you choose this over a doubly linked list or array-based solution?",
      tradeoffs: "Singly linked lists are memory efficient but only allow forward traversal. What are the main trade-offs compared to doubly linked lists?",
      scaling: "If this linked list needed to handle millions of nodes with frequent insertions and deletions, what modifications would you make?"
    },
    
    doubly_linked: {
      approach: "I see you used a doubly linked list with both next and prev pointers. What advantages does this provide for your use case?",
      tradeoffs: "Doubly linked lists offer bidirectional traversal but use more memory. When would a singly linked list be a better choice?",
      scaling: "For a browser's back/forward history system handling thousands of pages, how would your doubly linked approach perform?"
    },

    // =================================================================
    // PYTHON DESIGN PATTERNS
    // =================================================================
    timing_decorator: {
      approach: "I see you implemented a timing decorator using functools.wraps. What made you choose the decorator pattern over other approaches like context managers or direct timing calls?",
      tradeoffs: "Decorators provide clean separation but add function call overhead. How would you compare this approach to using a context manager or direct timing measurements?",
      scaling: "In a production system with hundreds of functions needing timing, how would you optimize your decorator approach? What about thread safety and performance impact?"
    },
    
    function_decorator: {
      approach: "You implemented a function decorator with a wrapper pattern. What advantages does this provide over modifying the original function directly?",
      tradeoffs: "Decorators add a layer of abstraction and slight performance overhead. When would you choose direct function modification instead?",
      scaling: "If this decorator needed to be applied to thousands of functions in a large codebase, how would you handle the performance and memory implications?"
    },

    rest_api: {
      approach: "I see you implemented a REST API with standard HTTP methods. What made you choose REST over GraphQL or other API architectures?",
      tradeoffs: "REST APIs are simple and cacheable, but can lead to over-fetching. How do you handle the trade-off between simplicity and efficiency?",
      scaling: "In a microservices architecture handling millions of requests, how would you optimize your REST API for performance and reliability?"
    },

    database_access: {
      approach: "You implemented database access with ORM/query patterns. What influenced your choice of data access strategy?",
      tradeoffs: "ORMs provide abstraction but can hide performance issues. When would you choose raw SQL over ORM methods?",
      scaling: "For a system handling millions of database transactions, how would you optimize your data access patterns and handle connection pooling?"
    },

    // =================================================================
    // ALGORITHM APPROACHES
    // =================================================================
    quicksort: {
      approach: "You implemented quicksort with pivot partitioning. What influenced your choice over other sorting algorithms like mergesort?",
      tradeoffs: "Quicksort is fast on average but has O(n²) worst case. How do you handle the trade-off between average performance and worst-case guarantees?",
      scaling: "In a big data processing system sorting terabytes of data, how would your quicksort approach need to be modified?"
    },
    
    mergesort: {
      approach: "I notice you chose mergesort for this sorting problem. What advantages do you see over quicksort or other algorithms?",
      tradeoffs: "Mergesort guarantees O(n log n) but requires extra space. When would you choose an in-place algorithm instead?",
      scaling: "For sorting massive datasets that don't fit in memory, how would you adapt your mergesort approach for external sorting?"
    },
    
    binary_search: {
      approach: "You implemented binary search for this problem. What requirements made binary search the right choice here?",
      tradeoffs: "Binary search is O(log n) but requires sorted data. What are the trade-offs when the data isn't pre-sorted?",
      scaling: "In a search engine indexing billions of documents, how would your binary search approach handle the scale?"
    },

    // =================================================================
    // WEB API APPROACHES
    // =================================================================
    express_basic: {
      approach: "You built this API with Express.js. What factors influenced your choice of Express over other Node.js frameworks?",
      tradeoffs: "Express is flexible but not the fastest framework. What are the main trade-offs compared to Fastify or native Node.js?",
      scaling: "If this API needed to handle 50,000 requests per minute, what changes would you make to your Express setup?"
    },
    
    express_production: {
      approach: "I see you set up Express with production middleware like CORS and security headers. What drove these architectural decisions?",
      tradeoffs: "Your production setup is robust but adds complexity. When would you strip back to a simpler Express configuration?",
      scaling: "For a startup expecting to scale from 1,000 to 1 million users, how would you evolve this Express architecture?"
    },
    
    fastify_api: {
      approach: "You chose Fastify over Express for this API. What specific advantages made Fastify the right choice here?",
      tradeoffs: "Fastify is faster but has a smaller ecosystem than Express. How do you weigh performance against community support?",
      scaling: "In a microservices architecture with dozens of APIs, how would your Fastify approach handle service-to-service communication?"
    },
    
    spring_boot_layered: {
      approach: "I notice you implemented a layered Spring Boot architecture with Controllers, Services, and Repositories. What benefits does this separation provide?",
      tradeoffs: "Layered architecture is clean but can be over-engineered for simple apps. When would you choose a simpler approach?",
      scaling: "For an enterprise system with hundreds of endpoints, how would you manage the complexity of your layered architecture?"
    },
    
    spring_boot_reactive: {
      approach: "You chose Spring WebFlux for reactive programming. What requirements made non-blocking I/O necessary here?",
      tradeoffs: "Reactive programming handles high concurrency but is harder to debug. What are the main trade-offs you considered?",
      scaling: "In a real-time chat application with millions of concurrent connections, how would your reactive approach handle the load?"
    },

    // =================================================================
    // FRONTEND APPROACHES
    // =================================================================
    react_hooks: {
      approach: "I see you used React Hooks instead of class components. What advantages do Hooks provide for this specific component?",
      tradeoffs: "Hooks enable logic reuse but can be tricky to optimize. When might class components still be preferable?",
      scaling: "In a large enterprise React app with complex state requirements, how would you scale beyond basic useState and useEffect?"
    },
    
    react_class: {
      approach: "You implemented this as a React class component. What factors led you to choose classes over the newer Hooks approach?",
      tradeoffs: "Class components have explicit lifecycle methods but more boilerplate. What are the main trade-offs with Hooks?",
      scaling: "If this component needed to be reused across multiple applications, how would you handle the logic sharing?"
    },
    
    react_redux: {
      approach: "I notice you connected this component to Redux for state management. What complexity justified adding Redux here?",
      tradeoffs: "Redux provides predictable state but adds boilerplate. When would local component state or Context API be sufficient?",
      scaling: "For a team of 20 developers working on this app, how does Redux help with maintainability and debugging?"
    },
    
    vue_composition: {
      approach: "You used Vue's Composition API for this component. What benefits does it provide over the Options API?",
      tradeoffs: "Composition API offers better TypeScript support but has a learning curve. When would you stick with Options API?",
      scaling: "In a large Vue application with many shared utilities, how would you organize your composable functions?"
    },
    
    vue_options: {
      approach: "I see you implemented this with Vue's Options API. What made you choose this over the newer Composition API?",
      tradeoffs: "Options API is simpler to understand but less flexible for logic reuse. What scenarios favor each approach?",
      scaling: "If this component's logic needed to be shared across multiple components, how would you refactor it?"
    },

    // =================================================================
    // DATABASE APPROACHES
    // =================================================================
    sequelize_orm: {
      approach: "You chose Sequelize ORM for database operations. What advantages does it provide over raw SQL queries?",
      tradeoffs: "ORMs abstract SQL complexity but can hurt performance. When would you drop down to raw SQL?",
      scaling: "In a high-traffic application with complex queries, how would you optimize your Sequelize setup for performance?"
    },
    
    prisma_orm: {
      approach: "I notice you used Prisma for database access. What made you choose Prisma over traditional ORMs like Sequelize?",
      tradeoffs: "Prisma offers great TypeScript support but is schema-first. What are the trade-offs with code-first approaches?",
      scaling: "For a team transitioning from SQL to Prisma, how would you handle the migration and learning curve?"
    },
    
    raw_sql: {
      approach: "You wrote raw SQL queries instead of using an ORM. What requirements made direct SQL the better choice?",
      tradeoffs: "Raw SQL gives full control but lacks type safety and abstraction. When would you introduce an ORM layer?",
      scaling: "In a system with hundreds of complex queries, how would you manage SQL maintainability without an ORM?"
    },

    // =================================================================
    // GENERIC FALLBACKS
    // =================================================================
    unknown: {
      approach: "Can you walk me through your approach to solving this problem? What was your thought process?",
      tradeoffs: "What alternative approaches did you consider, and why did you decide against them? What are the main trade-offs?",
      scaling: "How would your solution handle increased scale or changing requirements? What modifications would you make for production?"
    },
    
    general_coding: {
      approach: "I'd like to understand your problem-solving approach here. What led you to structure the solution this way?",
      tradeoffs: "What other approaches could work for this problem? How do the trade-offs compare?",
      scaling: "If the requirements changed significantly - different scale, performance needs, or constraints - how would you adapt your approach?"
    }
  };

  /**
   * Get question for specific approach and depth level
   * @param {string} approachType - Detected approach type
   * @param {number} depthLevel - Question depth (0=approach, 1=tradeoffs, 2=scaling)
   * @returns {string} Question template
   */
  static getQuestionForApproach(approachType, depthLevel) {
    const template = this.APPROACH_TEMPLATES[approachType] || this.APPROACH_TEMPLATES.unknown;
    const depthKeys = ['approach', 'tradeoffs', 'scaling'];
    const depthKey = depthKeys[depthLevel] || 'approach';
    
    return template[depthKey] || template.approach;
  }

  /**
   * Get all questions for an approach
   * @param {string} approachType - Detected approach type
   * @returns {Object} All three question levels
   */
  static getAllQuestionsForApproach(approachType) {
    return this.APPROACH_TEMPLATES[approachType] || this.APPROACH_TEMPLATES.unknown;
  }

  /**
   * Check if we have templates for a specific approach
   * @param {string} approachType - Approach type to check
   * @returns {boolean} True if templates exist
   */
  static hasTemplatesForApproach(approachType) {
    return approachType in this.APPROACH_TEMPLATES;
  }

  /**
   * Get a contextualized question by replacing placeholders
   * @param {string} approachType - Detected approach type
   * @param {number} depthLevel - Question depth level
   * @param {Object} context - Context for placeholders
   * @returns {string} Contextualized question
   */
  static getContextualizedQuestion(approachType, depthLevel, context = {}) {
    let question = this.getQuestionForApproach(approachType, depthLevel);
    
    // Replace common placeholders
    if (context.problemType) {
      question = question.replace(/this problem/g, `this ${context.problemType} problem`);
    }
    
    if (context.language) {
      question = question.replace(/your solution/g, `your ${context.language} solution`);
    }
    
    if (context.framework) {
      question = question.replace(/your approach/g, `your ${context.framework} approach`);
    }
    
    return question;
  }

  /**
   * Get business scenario questions for scaling depth
   * @param {string} approachType - Detected approach type
   * @param {string} problemType - Problem domain
   * @returns {string} Business-focused scaling question
   */
  static getBusinessScenarioQuestion(approachType, problemType) {
    const businessScenarios = {
      binary_search_tree: "database indexing system processing millions of queries",
      rest_api: "e-commerce platform during Black Friday traffic spikes",
      react_component: "social media app with millions of active users",
      sorting_algorithm: "big data analytics platform processing terabytes",
      database_orm: "fintech application with strict compliance requirements"
    };

    const scenario = businessScenarios[problemType] || "high-scale production environment";
    const baseQuestion = this.getQuestionForApproach(approachType, 2);
    
    return baseQuestion.replace(/production/g, `a ${scenario}`);
  }

  /**
   * Get available approach types
   * @returns {Array} List of all available approach types
   */
  static getAvailableApproachTypes() {
    return Object.keys(this.APPROACH_TEMPLATES);
  }

  /**
   * Get template statistics
   * @returns {Object} Statistics about available templates
   */
  static getTemplateStats() {
    const approaches = Object.keys(this.APPROACH_TEMPLATES);
    const totalQuestions = approaches.length * 3; // 3 questions per approach
    
    return {
      totalApproaches: approaches.length,
      totalQuestions: totalQuestions,
      approaches: approaches,
      categories: {
        dataStructures: approaches.filter(a => a.includes('bst') || a.includes('linked')).length,
        algorithms: approaches.filter(a => a.includes('sort') || a.includes('search')).length,
        webApis: approaches.filter(a => a.includes('express') || a.includes('spring')).length,
        frontend: approaches.filter(a => a.includes('react') || a.includes('vue')).length,
        database: approaches.filter(a => a.includes('orm') || a.includes('sql')).length
      }
    };
  }
}

module.exports = QuestionTemplates;

