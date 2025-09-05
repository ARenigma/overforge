-- =====================================================
-- SEED DATA FOR QUESTIONS SYSTEM
-- =====================================================

-- 1. SEED EXTRACTED PARAMETERS
-- Core Languages
INSERT INTO extracted_parameters (technology_name, category, subcategory, frameworks, frequency_count) VALUES
-- Programming Languages
('Java', 'core_language', 'programming', '["Spring Boot", "Spring MVC", "Spring Security", "Hibernate", "Maven", "Gradle"]', 50),
('Python', 'core_language', 'programming', '["Django", "Flask", "FastAPI", "Django REST", "Celery", "Pandas"]', 45),
('JavaScript', 'core_language', 'programming', '["Node.js", "Express.js", "React", "Vue.js", "Angular", "NestJS"]', 60),
('TypeScript', 'core_language', 'programming', '["Node.js", "Express.js", "React", "Angular", "NestJS"]', 35),
('C#', 'core_language', 'programming', '[".NET Core", ".NET Framework", "ASP.NET", "Entity Framework", "Blazor"]', 30),
('Go', 'core_language', 'programming', '["Gin", "Echo", "Fiber", "GORM"]', 20),
('PHP', 'core_language', 'programming', '["Laravel", "Symfony", "CodeIgniter", "WordPress"]', 25),
('Ruby', 'core_language', 'programming', '["Ruby on Rails", "Sinatra", "Hanami"]', 15),

-- Tech Stacks - Cloud Platforms
('AWS', 'tech_stack', 'cloud', '["Lambda", "API Gateway", "DynamoDB", "S3", "EC2", "RDS", "CloudFormation", "SQS", "SNS"]', 80),
('Azure', 'tech_stack', 'cloud', '["Functions", "App Service", "Cosmos DB", "Blob Storage", "SQL Database", "Service Bus"]', 40),
('Google Cloud', 'tech_stack', 'cloud', '["Cloud Functions", "App Engine", "Firestore", "Cloud Storage", "Cloud SQL", "Pub/Sub"]', 25),

-- Tech Stacks - Databases
('PostgreSQL', 'tech_stack', 'database', '["pgAdmin", "Prisma", "Sequelize", "TypeORM"]', 45),
('MySQL', 'tech_stack', 'database', '["MySQL Workbench", "Sequelize", "TypeORM", "Prisma"]', 50),
('MongoDB', 'tech_stack', 'database', '["Mongoose", "MongoDB Atlas", "Compass"]', 40),
('Redis', 'tech_stack', 'database', '["Redis CLI", "RedisInsight", "Jedis"]', 30),
('DynamoDB', 'tech_stack', 'database', '["AWS SDK", "DynamoDB Local"]', 25),

-- Tech Stacks - Containerization
('Docker', 'tech_stack', 'containerization', '["Docker Compose", "Dockerfile", "Docker Hub"]', 55),
('Kubernetes', 'tech_stack', 'containerization', '["kubectl", "Helm", "Minikube"]', 30),

-- Tech Stacks - Message Queues
('RabbitMQ', 'tech_stack', 'messaging', '["Management UI", "AMQP"]', 20),
('Apache Kafka', 'tech_stack', 'messaging', '["Kafka Connect", "Schema Registry"]', 25),

-- Tech Stacks - Search & Analytics
('Elasticsearch', 'tech_stack', 'search', '["Kibana", "Logstash", "Beats"]', 20);

-- 2. SEED TECHNOLOGY COMBINATIONS
INSERT INTO technology_combinations (core_language, framework, tech_stack, subcategory, is_popular, problem_count) VALUES
-- Popular Java Combinations
('Java', 'Spring Boot', 'AWS', 'cloud', true, 8),
('Java', 'Spring Boot', 'Docker', 'containerization', true, 6),
('Java', 'Spring Boot', 'PostgreSQL', 'database', true, 5),
('Java', 'Spring Boot', 'MongoDB', 'database', true, 4),

-- Popular Python Combinations  
('Python', 'Django', 'AWS', 'cloud', true, 7),
('Python', 'Flask', 'Docker', 'containerization', true, 5),
('Python', 'FastAPI', 'PostgreSQL', 'database', true, 6),
('Python', 'Django', 'Redis', 'database', true, 4),

-- Popular JavaScript/Node.js Combinations
('JavaScript', 'Node.js', 'AWS', 'cloud', true, 8),
('JavaScript', 'Express.js', 'MongoDB', 'database', true, 6),
('JavaScript', 'Node.js', 'Docker', 'containerization', true, 5),
('TypeScript', 'NestJS', 'PostgreSQL', 'database', true, 4),

-- Other Combinations
('C#', '.NET Core', 'Azure', 'cloud', true, 5),
('Go', NULL, 'Docker', 'containerization', true, 4),
('PHP', 'Laravel', 'MySQL', 'database', true, 4);

-- 3. SEED MASTER PROBLEMS

-- =====================================================
-- CORE LANGUAGE PROBLEMS
-- =====================================================

-- JAVA PROBLEMS
INSERT INTO master_problems (title, description, category, technology, framework, seniority_level, difficulty_level, time_estimate, problem_type, sample_input, sample_output, hints, tags) VALUES

('Array Element Finder', 
'Given an array of integers, find the second largest element. Handle edge cases like duplicate values and arrays with less than 2 elements.',
'core_language', 'Java', NULL, 'junior', 2, 8,
'algorithm',
'[12, 35, 1, 10, 34, 1]',
'34',
'["Consider sorting", "Track max and second max in one pass", "Handle duplicates carefully"]',
'["arrays", "sorting", "edge_cases"]'),

('String Manipulator',
'Implement a method that reverses words in a sentence while preserving the order of words. "hello world java" should become "olleh dlrow avaj".',
'core_language', 'Java', NULL, 'junior', 2, 7,
'string_manipulation',
'"hello world java"',
'"olleh dlrow avaj"',
'["Split by spaces", "Reverse each word individually", "Join back with spaces"]',
'["strings", "manipulation", "loops"]'),

('Number Pattern Generator',
'Create a method that generates the first n numbers in the Fibonacci sequence. Return as an array.',
'core_language', 'Java', NULL, 'mid', 2, 9,
'algorithm',
'n = 7',
'[0, 1, 1, 2, 3, 5, 8]',
'["Start with 0, 1", "Each next number is sum of previous two", "Use array or list to store"]',
'["algorithms", "sequences", "loops"]'),

('Data Structure Implementation',
'Implement a simple Stack class with push(), pop(), peek(), and isEmpty() methods. Include proper error handling.',
'core_language', 'Java', NULL, 'mid', 3, 10,
'data_structure',
'Stack operations: push(5), push(3), pop(), peek()',
'Stack: [5], peek() returns 5',
'["Use ArrayList or array internally", "Track top index", "Handle empty stack exceptions"]',
'["data_structures", "stack", "error_handling"]'),

('Spring Boot REST API',
'Create a REST controller that handles GET /users/{id} and POST /users endpoints. Include basic validation.',
'core_language', 'Java', 'Spring Boot', 'mid', 3, 10,
'api',
'GET /users/123, POST /users with JSON body',
'User object with id, name, email fields',
'["Use @RestController", "Add @GetMapping and @PostMapping", "Use @PathVariable and @RequestBody"]',
'["spring_boot", "rest_api", "validation"]');

-- PYTHON PROBLEMS
INSERT INTO master_problems (title, description, category, technology, framework, seniority_level, difficulty_level, time_estimate, problem_type, sample_input, sample_output, hints, tags) VALUES

('List Processor',
'Given a list of numbers, remove duplicates while preserving the original order. Return the cleaned list.',
'core_language', 'Python', NULL, 'junior', 2, 7,
'algorithm',
'[1, 2, 2, 3, 4, 4, 5]',
'[1, 2, 3, 4, 5]',
'["Use set to track seen elements", "Maintain order with new list", "Loop through original list"]',
'["lists", "duplicates", "algorithms"]'),

('Dictionary Operations',
'Count the frequency of each character in a string and return as a dictionary.',
'core_language', 'Python', NULL, 'junior', 2, 8,
'data_structure',
'"programming"',
'{"p": 1, "r": 2, "o": 1, "g": 2, "a": 1, "m": 2, "i": 1, "n": 1}',
'["Use dictionary to count", "Loop through each character", "Use get() method with default"]',
'["dictionaries", "strings", "counting"]'),

('Function Decorator',
'Create a simple timing decorator that measures and prints the execution time of any function.',
'core_language', 'Python', NULL, 'mid', 3, 9,
'advanced_feature',
'@timing_decorator\ndef slow_function(): time.sleep(1)',
'Function executed in 1.001 seconds',
'["Use functools.wraps", "Import time module", "Calculate time difference"]',
'["decorators", "functions", "timing"]'),

('Django Model Setup',
'Create a Django model for a Blog with fields: title, content, author, created_at. Include proper field types.',
'core_language', 'Python', 'Django', 'mid', 2, 8,
'framework',
'Blog model with title, content, author, created_at',
'Django model class with proper fields',
'["Import from django.db", "Use CharField, TextField, DateTimeField", "Add __str__ method"]',
'["django", "models", "database"]');

-- JAVASCRIPT/NODE.JS PROBLEMS
INSERT INTO master_problems (title, description, category, technology, framework, seniority_level, difficulty_level, time_estimate, problem_type, sample_input, sample_output, hints, tags) VALUES

('Array Merger',
'Merge two sorted arrays into one sorted array without using built-in sort methods.',
'core_language', 'JavaScript', NULL, 'junior', 2, 8,
'algorithm',
'arr1 = [1, 3, 5], arr2 = [2, 4, 6]',
'[1, 2, 3, 4, 5, 6]',
'["Use two pointers", "Compare elements", "Handle remaining elements"]',
'["arrays", "sorting", "algorithms"]'),

('Object Processor',
'Given an array of objects representing users, find all users above a certain age and return their names.',
'core_language', 'JavaScript', NULL, 'junior', 2, 7,
'data_manipulation',
'[{name: "John", age: 25}, {name: "Jane", age: 17}], minAge: 18',
'["John"]',
'["Use filter method", "Access object properties", "Use map to extract names"]',
'["objects", "arrays", "filtering"]'),

('Express Route Handler',
'Create an Express.js route that accepts user data via POST, validates required fields, and returns appropriate responses.',
'core_language', 'JavaScript', 'Express.js', 'mid', 3, 9,
'api',
'POST /users with {name: "John", email: "john@email.com"}',
'Success: 201 with user data, Error: 400 with validation message',
'["Use app.post()", "Check req.body fields", "Return proper HTTP status codes"]',
'["express", "validation", "rest_api"]'),

('Async Function Handler',
'Create an async function that fetches data from multiple URLs concurrently and returns combined results.',
'core_language', 'JavaScript', 'Node.js', 'mid', 3, 10,
'async_programming',
'URLs: ["url1", "url2", "url3"]',
'Combined data from all URLs',
'["Use Promise.all()", "Use fetch or axios", "Handle errors properly"]',
'["async", "promises", "error_handling"]');

-- =====================================================
-- TECH STACK PROBLEMS  
-- =====================================================

-- AWS PROBLEMS
INSERT INTO master_problems (title, description, category, technology, subcategory, seniority_level, difficulty_level, time_estimate, problem_type, sample_input, sample_output, hints, tags) VALUES

('Lambda JSON Processor',
'Create a Lambda function that receives a JSON event with an array of numbers and returns the sum and count.',
'tech_stack', 'AWS', 'cloud', 'junior', 2, 8,
'serverless',
'{"numbers": [1, 2, 3, 4, 5]}',
'{"sum": 15, "count": 5}',
'["Use event parameter", "Parse JSON data", "Return proper response format"]',
'["lambda", "json", "serverless"]'),

('DynamoDB User Manager',
'Write functions to store and retrieve user data from DynamoDB table. Include error handling.',
'tech_stack', 'AWS', 'cloud', 'mid', 3, 10,
'database',
'User: {id: "user123", name: "John", email: "john@email.com"}',
'Successful put/get operations with error handling',
'["Use AWS SDK", "Use put/get operations", "Handle exceptions properly"]',
'["dynamodb", "aws_sdk", "error_handling"]'),

('S3 File Handler',
'Create a function to upload a file to S3 bucket and generate a presigned URL for download.',
'tech_stack', 'AWS', 'cloud', 'mid', 3, 9,
'storage',
'File upload with bucket name and file data',
'Successful upload response with presigned URL',
'["Use S3 client", "Configure bucket permissions", "Generate presigned URL"]',
'["s3", "file_upload", "presigned_urls"]');

-- DOCKER PROBLEMS
INSERT INTO master_problems (title, description, category, technology, subcategory, seniority_level, difficulty_level, time_estimate, problem_type, sample_input, sample_output, hints, tags) VALUES

('Node.js App Container',
'Create a Dockerfile for a simple Node.js Express application with proper optimization.',
'tech_stack', 'Docker', 'containerization', 'junior', 2, 8,
'containerization',
'Node.js app with package.json and app.js',
'Working Dockerfile with optimized layers',
'["Use node:alpine base", "Copy package.json first", "Use EXPOSE for port"]',
'["dockerfile", "nodejs", "optimization"]'),

('Multi-Stage Build',
'Create a multi-stage Dockerfile that builds an application and creates a minimal production image.',
'tech_stack', 'Docker', 'containerization', 'mid', 3, 10,
'optimization',
'Application with build dependencies',
'Optimized multi-stage Dockerfile',
'["Use AS for naming stages", "Copy only necessary files", "Use different base images"]',
'["multi_stage", "optimization", "production"]'),

('Docker Compose Setup',
'Create a docker-compose.yml for an app with database, including environment variables and networking.',
'tech_stack', 'Docker', 'containerization', 'mid', 3, 9,
'orchestration',
'Web app + PostgreSQL database',
'Working docker-compose configuration',
'["Define services", "Set up environment variables", "Configure networks and volumes"]',
'["docker_compose", "orchestration", "environment"]');

-- DATABASE PROBLEMS
INSERT INTO master_problems (title, description, category, technology, subcategory, seniority_level, difficulty_level, time_estimate, problem_type, sample_input, sample_output, hints, tags) VALUES

('PostgreSQL Query Builder',
'Write SQL queries to find users who have posted more than 5 articles in the last month.',
'tech_stack', 'PostgreSQL', 'database', 'mid', 3, 9,
'query',
'Users table, Posts table with user_id and created_at',
'List of users with post counts > 5',
'["Use JOIN between tables", "Use COUNT and GROUP BY", "Use DATE functions"]',
'["sql", "joins", "aggregation"]'),

('MongoDB Collection Manager',
'Create operations to insert, find, and update documents in a MongoDB users collection.',
'tech_stack', 'MongoDB', 'database', 'junior', 2, 8,
'nosql',
'User documents with name, email, age fields',
'CRUD operations with proper error handling',
'["Use insertOne/insertMany", "Use find with filters", "Use updateOne with $set"]',
'["mongodb", "crud", "nosql"]'),

('Redis Cache Implementation',
'Implement a caching layer using Redis for frequently accessed user data with expiration.',
'tech_stack', 'Redis', 'database', 'mid', 3, 10,
'caching',
'User data that needs caching with TTL',
'Cache operations with get/set and expiration',
'["Use SET with EX for expiration", "Check if key exists", "Handle cache misses"]',
'["redis", "caching", "expiration"]');

-- More problems can be added following this pattern...

-- 4. SEED PROBLEM TAGS
INSERT INTO problem_tags (problem_id, tag_name, tag_category) VALUES
-- Java problems tags
(1, 'arrays', 'data_structure'),
(1, 'sorting', 'algorithm_type'),
(1, 'edge_cases', 'concept'),
(2, 'strings', 'data_structure'),
(2, 'manipulation', 'concept'),
(3, 'algorithms', 'concept'),
(3, 'sequences', 'algorithm_type'),
(4, 'data_structures', 'concept'),
(4, 'stack', 'data_structure'),
(5, 'spring_boot', 'framework'),
(5, 'rest_api', 'concept'),

-- Python problems tags  
(6, 'lists', 'data_structure'),
(6, 'duplicates', 'concept'),
(7, 'dictionaries', 'data_structure'),
(7, 'counting', 'concept'),
(8, 'decorators', 'advanced_feature'),
(8, 'functions', 'concept'),
(9, 'django', 'framework'),
(9, 'models', 'concept'),

-- JavaScript problems tags
(10, 'arrays', 'data_structure'),
(10, 'sorting', 'algorithm_type'),
(11, 'objects', 'data_structure'),
(11, 'filtering', 'concept'),
(12, 'express', 'framework'),
(12, 'validation', 'concept'),
(13, 'async', 'advanced_feature'),
(13, 'promises', 'concept');

-- Update problem counts in technology_combinations
UPDATE technology_combinations SET problem_count = (
    SELECT COUNT(*) FROM master_problems 
    WHERE (technology = technology_combinations.core_language OR technology = technology_combinations.tech_stack)
    AND (framework = technology_combinations.framework OR framework IS NULL)
); 