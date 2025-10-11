-- =====================================================================
-- COMPREHENSIVE SOLUTION DATABASE FOR APPROACH-BASED QUESTIONING
-- Production-ready solutions with detailed trade-offs and comparisons
-- =====================================================================

-- Clear existing solutions (if any)
DELETE FROM problem_solutions WHERE problem_id IN (1, 2, 3, 10, 11, 20, 21, 30, 31, 40, 41);

-- =====================================================================
-- DATA STRUCTURES SOLUTIONS
-- =====================================================================

-- Binary Search Tree Solutions (Problem ID: 1)
INSERT INTO problem_solutions (
    problem_id, approach_key, title, summary, steps, pros, cons, 
    time_complexity, space_complexity, confidence, is_active
) VALUES 
(1, 'recursive_bst', 'Recursive BST Implementation', 
'Uses recursive function calls for insert, search, and delete operations. Natural tree traversal pattern.',
'["Define TreeNode class with val, left, right", "Implement recursive insert with base case", "Handle BST property: left < val < right", "Recursive search with early termination", "Delete with three cases: leaf, one child, two children"]',
'["Clean and intuitive code", "Natural tree structure mapping", "Easy to understand and debug", "Elegant base case handling", "Matches mathematical definition"]',
'["Stack overflow risk with deep trees", "Higher memory usage due to call stack", "Slower for unbalanced trees", "Not suitable for very large datasets", "Debugging can be tricky with deep recursion"]',
'O(log n) average, O(n) worst case', 'O(log n) for recursion stack', 0.9, true),

(1, 'iterative_bst', 'Iterative BST Implementation',
'Uses while loops and explicit parent tracking instead of recursion. Manual stack management.',
'["Use while loops for traversal", "Track parent nodes explicitly", "Maintain current pointer", "Handle edge cases manually", "Implement iterative insertion and search"]',
'["No stack overflow risk", "Better memory efficiency", "Faster for deep trees", "More predictable performance", "Suitable for embedded systems"]',
'["More complex code structure", "Manual state tracking required", "Less intuitive than recursive", "More prone to bugs", "Harder to maintain"]',
'O(log n) average, O(n) worst case', 'O(1) space complexity', 0.8, true),

(1, 'balanced_bst', 'Self-Balancing BST (AVL/Red-Black)',
'Maintains balance automatically through rotations. Guarantees O(log n) operations.',
'["Implement rotation operations", "Track height/color information", "Rebalance after insertions", "Handle complex delete cases", "Maintain balance invariants"]',
'["Guaranteed O(log n) performance", "Optimal for frequent operations", "Self-maintaining structure", "Production database quality", "Handles worst-case scenarios"]',
'["Complex implementation", "Higher constant factors", "More memory per node", "Rotation overhead", "Difficult to debug and maintain"]',
'O(log n) guaranteed', 'O(log n) with balance info', 0.95, true),

-- Linked List Solutions (Problem ID: 3)
INSERT INTO problem_solutions (
    problem_id, approach_key, title, summary, steps, pros, cons,
    time_complexity, space_complexity, confidence, is_active
) VALUES
(3, 'singly_linked', 'Singly Linked List',
'Basic linked list with next pointers only. Forward traversal.',
'["Define ListNode with val and next", "Implement insert at head/tail", "Handle traversal with while loop", "Manage edge cases (empty list)", "Implement delete with prev tracking"]',
'["Memory efficient", "Simple structure", "Dynamic size", "Fast insertion at head", "Cache-friendly sequential access"]',
'["No backward traversal", "O(n) access time", "No random access", "Difficult deletion", "Memory fragmentation"]',
'O(1) insertion, O(n) search', 'O(1) per node', 0.85, true),

(3, 'doubly_linked', 'Doubly Linked List',
'Linked list with both next and prev pointers. Bidirectional traversal.',
'["Define node with val, next, prev", "Maintain head and tail pointers", "Handle bidirectional links", "Implement efficient deletion", "Manage circular references"]',
'["Bidirectional traversal", "Efficient deletion", "Better for deques", "Easier reverse operations", "More flexible navigation"]',
'["Higher memory usage", "More complex pointer management", "Prone to circular reference bugs", "Cache overhead", "More maintenance complexity"]',
'O(1) insertion/deletion, O(n) search', 'O(1) per node + prev pointer', 0.80, true),

-- =====================================================================
-- ALGORITHM SOLUTIONS
-- =====================================================================

-- Sorting Algorithm Solutions (Problem ID: 10)
INSERT INTO problem_solutions (
    problem_id, approach_key, title, summary, steps, pros, cons,
    time_complexity, space_complexity, confidence, is_active
) VALUES
(10, 'quicksort', 'Quick Sort Algorithm',
'Divide-and-conquer sorting using pivot partitioning.',
'["Choose pivot element", "Partition array around pivot", "Recursively sort left subarray", "Recursively sort right subarray", "Combine results"]',
'["Average O(n log n) performance", "In-place sorting", "Cache-efficient", "Good practical performance", "Widely used in libraries"]',
'["Worst case O(n²)", "Unstable sort", "Poor performance on sorted data", "Recursive stack usage", "Pivot selection affects performance"]',
'O(n log n) average, O(n²) worst', 'O(log n) recursion stack', 0.88, true),

(10, 'mergesort', 'Merge Sort Algorithm',
'Stable divide-and-conquer sorting with guaranteed O(n log n).',
'["Divide array into halves", "Recursively sort each half", "Merge sorted halves", "Handle base case", "Maintain stability"]',
'["Guaranteed O(n log n)", "Stable sorting", "Predictable performance", "Good for linked lists", "Parallelizable"]',
'["Requires extra space", "Not in-place", "Higher space complexity", "Slower than quicksort in practice", "More memory allocations"]',
'O(n log n) guaranteed', 'O(n) auxiliary space', 0.85, true),

-- =====================================================================
-- WEB API SOLUTIONS
-- =====================================================================

-- REST API Solutions (Problem ID: 20)
INSERT INTO problem_solutions (
    problem_id, approach_key, title, summary, steps, pros, cons,
    time_complexity, space_complexity, confidence, is_active
) VALUES
(20, 'express_basic', 'Basic Express.js API',
'Simple Express.js REST API with basic routing and middleware.',
'["Setup Express application", "Define route handlers", "Add basic middleware", "Implement CRUD operations", "Handle errors"]',
'["Quick development", "Large ecosystem", "Flexible middleware", "Easy to learn", "Great documentation"]',
'["Not the fastest framework", "Callback hell potential", "Manual validation needed", "Security requires extra setup", "Can become messy at scale"]',
'O(1) per request', 'O(1) base memory', 0.85, true),

(20, 'express_production', 'Production Express.js API',
'Enterprise-grade Express.js with security, validation, and monitoring.',
'["Setup with security middleware", "Add input validation", "Implement logging", "Error handling middleware", "Rate limiting and CORS"]',
'["Production ready", "Security built-in", "Comprehensive logging", "Scalable architecture", "Battle-tested"]',
'["More complex setup", "Higher learning curve", "More dependencies", "Potential over-engineering", "Configuration overhead"]',
'O(1) per request + middleware', 'O(1) + middleware memory', 0.92, true),

(20, 'fastify_api', 'Fastify High-Performance API',
'High-performance Node.js web framework with built-in validation.',
'["Setup Fastify application", "Define schemas", "Use plugin system", "Implement validation", "Add serialization"]',
'["Faster than Express", "Built-in validation", "TypeScript support", "JSON schema validation", "Lower overhead"]',
'["Smaller ecosystem", "Learning curve", "Less community resources", "Plugin compatibility", "Newer framework risks"]',
'O(1) per request, faster than Express', 'O(1) optimized memory', 0.78, true),

-- Enterprise API Solutions (Problem ID: 21)
INSERT INTO problem_solutions (
    problem_id, approach_key, title, summary, steps, pros, cons,
    time_complexity, space_complexity, confidence, is_active
) VALUES
(21, 'spring_boot_layered', 'Spring Boot Layered Architecture',
'Enterprise Java API with proper layering: Controller, Service, Repository.',
'["Setup Spring Boot project", "Define entity models", "Create repository layer", "Implement service layer", "Build REST controllers"]',
'["Enterprise patterns", "Dependency injection", "Testable architecture", "Spring ecosystem", "Production ready"]',
'["Heavy framework", "Learning curve", "Over-engineering for simple apps", "XML/annotation complexity", "Slower startup"]',
'O(1) per request + framework overhead', 'High memory footprint', 0.90, true),

(21, 'spring_boot_reactive', 'Spring Boot Reactive API',
'Non-blocking reactive API using Spring WebFlux.',
'["Setup WebFlux dependencies", "Use Mono/Flux types", "Implement reactive repositories", "Handle backpressure", "Non-blocking operations"]',
'["High throughput", "Non-blocking I/O", "Reactive streams", "Backpressure handling", "Modern async patterns"]',
'["Complex debugging", "Steep learning curve", "Different mental model", "Limited ecosystem", "Stack trace complexity"]',
'O(1) non-blocking', 'Lower memory per request', 0.75, true),

-- =====================================================================
-- FRONTEND SOLUTIONS
-- =====================================================================

-- React Component Solutions (Problem ID: 30)
INSERT INTO problem_solutions (
    problem_id, approach_key, title, summary, steps, pros, cons,
    time_complexity, space_complexity, confidence, is_active
) VALUES
(30, 'react_hooks', 'React Functional Components with Hooks',
'Modern React using functional components and hooks API.',
'["Define functional component", "Use useState for state", "Use useEffect for lifecycle", "Custom hooks for logic", "Optimize with useMemo/useCallback"]',
'["Modern React approach", "Reusable logic", "Cleaner code", "Better performance", "Easier testing"]',
'["Learning curve", "Hook rules complexity", "Closure traps", "Re-render optimization needed", "Debugging challenges"]',
'O(1) per render + hooks', 'O(1) per hook', 0.92, true),

(30, 'react_class', 'React Class Components',
'Traditional React class components with lifecycle methods.',
'["Extend React.Component", "Define constructor and state", "Implement lifecycle methods", "Handle this binding", "Use setState for updates"]',
'["Well understood", "Explicit lifecycle", "This context clear", "Mature patterns", "Extensive documentation"]',
'["More verbose", "This binding issues", "Harder to reuse logic", "Performance overhead", "Legacy approach"]',
'O(1) per render + lifecycle', 'O(1) per instance', 0.75, true),

(30, 'react_redux', 'React with Redux State Management',
'React components connected to Redux store for global state.',
'["Setup Redux store", "Define actions and reducers", "Connect components", "Use selectors", "Handle async with middleware"]',
'["Predictable state", "Time travel debugging", "Centralized state", "Great dev tools", "Scalable architecture"]',
'["Lots of boilerplate", "Learning curve", "Over-engineering for simple apps", "Action/reducer verbosity", "Performance considerations"]',
'O(1) per action dispatch', 'O(1) store + selectors', 0.85, true),

-- =====================================================================
-- DATABASE SOLUTIONS
-- =====================================================================

-- ORM Solutions (Problem ID: 40)
INSERT INTO problem_solutions (
    problem_id, approach_key, title, summary, steps, pros, cons,
    time_complexity, space_complexity, confidence, is_active
) VALUES
(40, 'sequelize_orm', 'Sequelize ORM',
'Traditional ORM with model definitions and query methods.',
'["Define models with attributes", "Setup associations", "Use query methods", "Handle migrations", "Implement validations"]',
'["Database agnostic", "Migration support", "Association handling", "Validation built-in", "Active Record pattern"]',
'["Performance overhead", "Complex queries difficult", "Learning curve", "Magic methods", "N+1 query problems"]',
'O(1) per query + ORM overhead', 'O(1) + model cache', 0.80, true),

(40, 'typeorm', 'TypeORM',
'TypeScript-first ORM with decorator-based models.',
'["Define entities with decorators", "Setup repositories", "Use query builder", "Handle relations", "TypeScript integration"]',
'["TypeScript support", "Decorator syntax", "Active Record/Data Mapper", "Migration support", "Good documentation"]',
'["TypeScript dependency", "Decorator overhead", "Complex configuration", "Performance issues", "Breaking changes"]',
'O(1) per query + ORM overhead', 'O(1) + type info', 0.78, true),

-- Modern ORM Solutions (Problem ID: 41)
INSERT INTO problem_solutions (
    problem_id, approach_key, title, summary, steps, pros, cons,
    time_complexity, space_complexity, confidence, is_active
) VALUES
(41, 'prisma_orm', 'Prisma Modern ORM',
'Schema-first ORM with excellent TypeScript support and client generation.',
'["Define Prisma schema", "Generate client", "Use type-safe queries", "Handle relations", "Implement migrations"]',
'["Excellent TypeScript", "Type-safe queries", "Great developer experience", "Auto-completion", "Modern approach"]',
'["Newer ecosystem", "Schema-first learning curve", "Limited customization", "Generated client dependency", "Migration limitations"]',
'O(1) per query, optimized', 'O(1) + generated types', 0.88, true),

(41, 'drizzle_orm', 'Drizzle ORM',
'Lightweight TypeScript ORM with SQL-like syntax.',
'["Define schema with drizzle", "Use SQL-like queries", "Type-safe operations", "Minimal runtime", "Direct SQL access"]',
'["Lightweight", "SQL-like syntax", "Great performance", "TypeScript first", "No magic"]',
'["Newer framework", "Smaller community", "Limited documentation", "Learning curve", "Less features"]',
'O(1) per query, minimal overhead', 'O(1) minimal memory', 0.75, true);

-- =====================================================================
-- VERIFICATION QUERY
-- =====================================================================
SELECT 
    problem_id,
    COUNT(*) as solution_count,
    STRING_AGG(approach_key, ', ') as approaches
FROM problem_solutions 
WHERE is_active = true 
GROUP BY problem_id 
ORDER BY problem_id;

