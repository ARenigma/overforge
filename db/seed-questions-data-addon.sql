-- =====================================================
-- SEED DATA FOR QUESTIONS SYSTEM ADD-ON
-- =====================================================

-- 1. SEED EXTRACTED PARAMETERS
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
('Elasticsearch', 'tech_stack', 'search', '["Kibana", "Logstash", "Beats"]', 20)
ON CONFLICT (technology_name, category, subcategory) DO NOTHING;

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
('PHP', 'Laravel', 'MySQL', 'database', true, 4)
ON CONFLICT (core_language, framework, tech_stack, subcategory) DO NOTHING;

-- 3. SEED MASTER PROBLEMS

-- =====================================================
-- CORE LANGUAGE PROBLEMS (10-MINUTE SIMPLE PROBLEMS)
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
'["spring_boot", "rest_api", "validation"]'),

('Hash Map Counter',
'Count frequency of each character in a string using HashMap. Return the character that appears most frequently.',
'core_language', 'Java', NULL, 'junior', 2, 8,
'data_structure',
'"programming"',
'"g" (appears 2 times)',
'["Use HashMap<Character, Integer>", "Loop through string", "Track maximum count"]',
'["hashmap", "counting", "frequency"]'),

('Simple Calculator',
'Create a calculator class that can add, subtract, multiply, and divide two numbers. Handle division by zero.',
'core_language', 'Java', NULL, 'junior', 1, 6,
'basic_operations',
'Calculator calc = new Calculator(); calc.add(5, 3)',
'8',
'["Create separate methods for each operation", "Check for zero in division", "Return appropriate data types"]',
'["basic_math", "error_handling", "class_design"]'),

('Array Rotation',
'Rotate an array to the right by k steps. For example, rotating [1,2,3,4,5] by 2 steps gives [4,5,1,2,3].',
'core_language', 'Java', NULL, 'mid', 3, 9,
'algorithm',
'arr = [1,2,3,4,5], k = 2',
'[4,5,1,2,3]',
'["Use modulo for k larger than array length", "Consider multiple rotation approaches", "Handle edge cases"]',
'["arrays", "rotation", "algorithms"]'),

-- PYTHON PROBLEMS
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
'["django", "models", "database"]'),

('List Comprehension',
'Using list comprehension, create a list of squares of even numbers from 1 to 20.',
'core_language', 'Python', NULL, 'junior', 2, 6,
'syntax_feature',
'Numbers 1 to 20',
'[4, 16, 36, 64, 100, 144, 196, 256, 324, 400]',
'["Use range(1, 21)", "Filter even numbers with if condition", "Square each number"]',
'["list_comprehension", "filtering", "squares"]'),

('File Handler',
'Write a function that reads a text file and returns the number of words in it. Handle file not found errors.',
'core_language', 'Python', NULL, 'mid', 2, 8,
'file_operations',
'text_file.txt with content "Hello world Python programming"',
'4 words',
'["Use with open() for file handling", "Split text by spaces", "Use try-except for errors"]',
'["file_io", "error_handling", "text_processing"]'),

('Class Inheritance',
'Create a Vehicle base class and a Car subclass. Car should inherit from Vehicle and add specific car methods.',
'core_language', 'Python', NULL, 'mid', 3, 9,
'oop',
'Vehicle with start_engine(), Car with honk_horn()',
'Proper inheritance with method calls',
'["Define __init__ methods", "Use super() for inheritance", "Add specific methods to subclass"]',
'["oop", "inheritance", "classes"]'),

('Lambda Functions',
'Use lambda functions to sort a list of tuples by the second element of each tuple.',
'core_language', 'Python', NULL, 'junior', 2, 7,
'functional_programming',
'[(1, 3), (4, 1), (2, 2)]',
'[(4, 1), (2, 2), (1, 3)]',
'["Use sorted() function", "Lambda takes tuple as input", "Return tuple[1] for second element"]',
'["lambda", "sorting", "tuples"]'),

-- JAVASCRIPT/NODE.JS PROBLEMS
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
'["async", "promises", "error_handling"]'),

('String Template',
'Create a function that takes a template string and an object, and replaces placeholders with object values.',
'core_language', 'JavaScript', NULL, 'junior', 2, 8,
'string_manipulation',
'template: "Hello {name}, you are {age} years old", data: {name: "John", age: 25}',
'"Hello John, you are 25 years old"',
'["Use regular expressions", "Replace {key} with object[key]", "Handle missing keys"]',
'["strings", "templates", "regex"]'),

('Event Emitter',
'Implement a simple event emitter class with on(), emit(), and off() methods.',
'core_language', 'JavaScript', NULL, 'mid', 3, 10,
'design_pattern',
'emitter.on("test", callback); emitter.emit("test", data)',
'Callback executed with data',
'["Store events in object", "Use arrays for multiple listeners", "Loop through listeners on emit"]',
'["events", "callbacks", "design_patterns"]'),

('Array Flatten',
'Create a function that flattens a nested array of any depth into a single-level array.',
'core_language', 'JavaScript', NULL, 'mid', 3, 9,
'algorithm',
'[1, [2, 3], [4, [5, 6]]]',
'[1, 2, 3, 4, 5, 6]',
'["Use recursion", "Check if element is array", "Use Array.isArray()"]',
'["arrays", "recursion", "nested_data"]'),

('Debounce Function',
'Implement a debounce function that delays function execution until after a specified wait time.',
'core_language', 'JavaScript', NULL, 'mid', 3, 8,
'utility_function',
'debounce(func, 1000) - delays func execution by 1 second',
'Function executed only after 1 second of no calls',
'["Use setTimeout", "Clear previous timeout", "Return a wrapper function"]',
'["debounce", "timing", "utility"]'),

-- =====================================================
-- TECH STACK PROBLEMS (10-MINUTE SIMPLE PROBLEMS)
-- =====================================================

-- AWS PROBLEMS
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
'["s3", "file_upload", "presigned_urls"]'),

-- DOCKER PROBLEMS
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
'["docker_compose", "orchestration", "environment"]'),

-- DATABASE PROBLEMS
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

-- 4. SEED PROBLEM TAGS
INSERT INTO problem_tags (problem_id, tag_name, tag_category)
SELECT id, tag_name, 'general'
FROM master_problems,
LATERAL jsonb_array_elements_text(tags) AS tag_name
WHERE jsonb_array_length(tags) > 0;

-- Update problem counts in technology combinations
UPDATE technology_combinations SET problem_count = (
    SELECT COUNT(*) FROM master_problems 
    WHERE (technology = technology_combinations.core_language OR technology = technology_combinations.tech_stack)
    AND (framework = technology_combinations.framework OR framework IS NULL)
    AND is_active = true
); 