const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Use service role key to bypass RLS policies for admin operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function initializeAWSProfile() {
  const awsProfile = {
    title: "AWS Backend Developer",
    description: "Backend Engineer with expertise in AWS, Java, and scalable system design",
    experience_level: "5+ Years",
    parameters: [
      {
        id: 1,
        name: "AWS Services Proficiency",
        description: "DynamoDB, Lambda, S3 integration and hands-on implementation",
        code_keywords: ["lambda", "dynamodb", "s3", "aws", "serverless", "boto3", "aws-sdk"],
        semantic_patterns: [
          "lambda function creation",
          "dynamodb table operations", 
          "s3 bucket interactions",
          "aws service configuration",
          "serverless architecture"
        ],
        milestones: [
          "Basic AWS service initialization",
          "Service integration implementation", 
          "Error handling and optimization"
        ],
        depth_questions: [
          {
            depth: 1,
            question: "I see you've started implementing AWS services. Can you explain your choice of DynamoDB for this use case and how it fits into your overall architecture?",
            correct_answer: "DynamoDB is chosen for its serverless nature, automatic scaling, and seamless integration with Lambda. It provides consistent performance for the product catalog with flexible schema design.",
            assessment_criteria: ["understanding of NoSQL benefits", "serverless architecture knowledge", "basic AWS service selection reasoning"]
          },
          {
            depth: 2, 
            question: "How would you handle eventual consistency in your DynamoDB queries, especially for critical operations like inventory updates?",
            correct_answer: "Use strongly consistent reads for critical operations, implement optimistic locking with version numbers, consider DynamoDB Streams for real-time updates, and design idempotent operations.",
            assessment_criteria: ["consistency model understanding", "conflict resolution strategies", "advanced DynamoDB features", "system reliability thinking"]
          },
          {
            depth: 3,
            question: "What would be your strategy for optimizing DynamoDB costs while maintaining performance at scale, and how would you monitor and troubleshoot performance issues?",
            correct_answer: "Implement on-demand vs provisioned capacity analysis, use GSI efficiently, implement data archiving strategies, leverage DynamoDB Accelerator (DAX) for caching, monitor with CloudWatch metrics, and use X-Ray for distributed tracing.",
            assessment_criteria: ["cost optimization expertise", "performance monitoring", "advanced troubleshooting", "enterprise-scale thinking", "monitoring and observability"]
          }
        ]
      },
      {
        id: 2,
        name: "Spring Framework Architecture", 
        description: "Spring Boot framework patterns, dependency injection, and annotation-based development",
        code_keywords: ["spring", "restcontroller", "@autowired", "@service", "@component", "springboot", "@requestmapping"],
        semantic_patterns: [
          "spring boot application setup",
          "rest api endpoint creation",
          "dependency injection usage",
          "service layer implementation",
          "data access layer design"
        ],
        milestones: [
            "Spring Boot application initialization with annotations",
            "Dependency injection and component configuration",
            "Framework-specific patterns and advanced features"
        ],
        depth_questions: [
          {
            depth: 1,
            question: "I notice you're using Spring Boot for your API. Can you walk me through your controller design and explain how you're handling request validation and response formatting?",
            correct_answer: "Using @RestController with proper HTTP methods, implementing @Valid for request validation, using ResponseEntity for consistent response structure, and following REST conventions for endpoint design.",
            assessment_criteria: ["Spring Boot fundamentals", "REST API best practices", "validation understanding", "HTTP protocol knowledge"]
          },
          {
            depth: 2,
            question: "How are you managing transactions across multiple service calls, and what's your approach to handling distributed transactions in a microservices environment?",
            correct_answer: "Using @Transactional for local transactions, implementing saga pattern for distributed transactions, considering eventual consistency, using compensating actions, and implementing circuit breaker patterns for resilience.",
            assessment_criteria: ["transaction management", "distributed systems understanding", "microservices patterns", "error handling strategies", "system resilience"]
          },
          {
            depth: 3,
            question: "Explain your strategy for API versioning, backward compatibility, and how you would handle breaking changes in a production environment with multiple client applications?",
            correct_answer: "Implement semantic versioning, use header-based or URL-based versioning, maintain backward compatibility through deprecation strategies, implement feature toggles, use API gateways for routing, and establish clear communication protocols for breaking changes.",
            assessment_criteria: ["API lifecycle management", "production deployment strategies", "client compatibility", "enterprise integration", "change management"]
          }
        ]
      },
      {
        id: 3,
        name: "Database Schema Design",
        description: "JPA entity modeling, repository patterns, and data persistence implementation", 
                  code_keywords: ["@entity", "@table", "@id", "@column", "jparepository", "hibernate", "entity", "@repository"],
        semantic_patterns: [
            "jpa entity definition",
            "database table mapping",
            "repository interface creation", 
            "entity relationship modeling",
            "data persistence patterns"
        ],
        milestones: [
            "JPA entity definition with proper annotations",
            "Repository interface implementation and queries",
            "Advanced entity relationships and persistence optimization"
        ],
        depth_questions: [
          {
            depth: 1,
            question: "I see you've designed your data model. Can you explain your approach to database schema design and how you're handling relationships between entities?",
            correct_answer: "Using JPA entities with proper annotations, implementing appropriate relationships (OneToMany, ManyToOne), considering database normalization, using proper indexing strategies, and implementing soft deletes where needed.",
            assessment_criteria: ["database design principles", "ORM understanding", "relationship modeling", "data integrity concepts"]
          },
          {
            depth: 2,
            question: "How would you handle data migration from a legacy system while ensuring zero downtime and data consistency during the transition?",
            correct_answer: "Implement blue-green deployment strategy, use database migration tools like Flyway, implement dual-write pattern during transition, perform data validation and reconciliation, use feature flags for gradual rollout, and maintain rollback capabilities.",
            assessment_criteria: ["migration strategies", "zero-downtime deployment", "data consistency", "risk mitigation", "production deployment experience"]
          },
          {
            depth: 3,
            question: "Design a strategy for handling high-volume data processing, including batch processing, real-time streaming, and how you would ensure data quality and monitoring across the pipeline?",
            correct_answer: "Implement event-driven architecture with Kafka/SQS, use batch processing with Spring Batch, implement data validation at multiple stages, use dead letter queues for error handling, implement comprehensive monitoring with metrics and alerting, and design for horizontal scaling.",
            assessment_criteria: ["high-volume data processing", "event-driven architecture", "data quality assurance", "monitoring and alerting", "scalability design", "enterprise-level thinking"]
          }
        ]
      }
    ],
    master_problem: {
      title: "Serverless Product Catalog API",
      description: `
        <h2>Build a Serverless Product Catalog System</h2>
        <p>You need to create a backend system for an e-commerce platform that manages product catalogs with the following requirements:</p>
        
        <h3>Core Requirements:</h3>
        <ul>
          <li><strong>Product Management:</strong> Create, read, update, and delete products</li>
          <li><strong>Inventory Tracking:</strong> Real-time inventory updates with consistency</li>
          <li><strong>Search & Filtering:</strong> Support product search by category, price range, and availability</li>
          <li><strong>File Management:</strong> Handle product images and documents</li>
        </ul>
        
        <h3>Technical Specifications:</h3>
        <ul>
          <li>Use <strong>AWS Lambda</strong> for serverless compute</li>
          <li>Use <strong>DynamoDB</strong> for product data storage</li>
          <li>Use <strong>S3</strong> for file storage</li>
          <li>Implement <strong>Spring Boot</strong> with proper REST API design</li>
          <li>Include proper error handling and validation</li>
          <li>Consider scalability and performance optimization</li>
        </ul>
        
        <h3>Expected Implementation:</h3>
        <ol>
          <li><strong>Setup Phase:</strong> Configure AWS services and Spring Boot project structure</li>
          <li><strong>API Development:</strong> Implement REST endpoints with proper validation</li>
          <li><strong>Data Layer:</strong> Design database schema and implement data access patterns</li>
          <li><strong>Integration:</strong> Connect all services with proper error handling</li>
        </ol>
        
        <p><strong>Focus Areas:</strong> Your solution will be evaluated on AWS service integration, Java/Spring implementation quality, and system design decisions.</p>
      `,
      starter_code: {
        java: `// Spring Boot Application Structure
@SpringBootApplication
public class ProductCatalogApplication {
    public static void main(String[] args) {
        SpringApplication.run(ProductCatalogApplication.class, args);
    }
}

// TODO: Implement Product entity
// TODO: Implement ProductController with REST endpoints  
// TODO: Implement ProductService with business logic
// TODO: Configure AWS services (DynamoDB, S3, Lambda)
// TODO: Add proper error handling and validation`,
        
        python: `# AWS Lambda Function Structure
import json
import boto3
from typing import Dict, Any

# TODO: Initialize AWS services
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

def lambda_handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Main Lambda handler for product catalog operations
    """
    # TODO: Implement routing logic
    # TODO: Add product CRUD operations
    # TODO: Implement S3 file operations
    # TODO: Add proper error handling
    
    return {
        'statusCode': 200,
        'body': json.dumps('Hello from Product Catalog API!')
    }`
      },
      code_completion_milestones: {
        parameter1: {
          description: "AWS Services Setup and Basic Integration",
          patterns: [
            "AWS service initialization (DynamoDB, S3, Lambda)",
            "Basic service configuration",
            "Connection establishment"
          ]
        },
        parameter2: {
          description: "Spring Boot API Implementation", 
          patterns: [
            "Controller endpoints creation",
            "Service layer implementation",
            "Request/Response handling"
          ]
        },
        parameter3: {
          description: "Data Management and Integration",
          patterns: [
            "Entity/Model definition",
            "Repository/DAO implementation", 
            "Error handling and validation"
          ]
        }
      }
    },
    assessment_criteria: {
      coding: {
        weight: 0.25,
        factors: ["syntax correctness", "code structure", "best practices", "efficiency"]
      },
      thinking: {
        weight: 0.20,
        factors: ["problem analysis", "solution approach", "trade-off considerations", "scalability thinking"]
      },
      approach: {
        weight: 0.15,
        factors: ["systematic methodology", "incremental development", "testing mindset", "debugging skills"]
      },
      clarity: {
        weight: 0.15,
        factors: ["code readability", "naming conventions", "documentation", "explanation quality"]
      },
      speed: {
        weight: 0.10,
        factors: ["implementation pace", "decision making speed", "problem solving efficiency"]
      },
      knowledge: {
        weight: 0.15,
        factors: ["technical depth", "best practices awareness", "tool proficiency", "domain expertise"]
      }
    },
    is_active: true
  };

  try {
    console.log('🚀 Initializing AWS Backend Developer profile...');
    console.log('🔑 Using service role key:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // Check if profile already exists
    const { data: existingProfile, error: fetchError } = await supabase
      .from('job_profiles')
      .select('*')
      .eq('title', 'AWS Backend Developer')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('❌ Error checking existing profile:', fetchError);
      throw fetchError;
    }

    if (existingProfile) {
      console.log('📝 Updating existing AWS Backend Developer profile...');
      // Update existing profile
      const { data, error } = await supabase
        .from('job_profiles')
        .update(awsProfile)
        .eq('id', existingProfile.id)
        .select()
        .single();

      if (error) {
        console.error('❌ Error updating profile:', error);
        throw error;
      }
      
      console.log('✅ AWS Backend Developer profile updated successfully!');
      console.log('📋 Profile ID:', data.id);
    } else {
      console.log('🆕 Creating new AWS Backend Developer profile...');
      // Create new profile
      const { data, error } = await supabase
        .from('job_profiles')
        .insert([awsProfile])
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating profile:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        throw error;
      }
      
      console.log('✅ AWS Backend Developer profile created successfully!');
      console.log('📋 Profile ID:', data.id);
    }

    console.log('\n🎯 Profile includes:');
    console.log('- ✅ 3 Progressive Parameters with depth questions');
    console.log('- ✅ Comprehensive master problem (Serverless Product Catalog)');
    console.log('- ✅ Human-like assessment criteria');
    console.log('- ✅ Code completion milestones');
    console.log('- ✅ Semantic pattern detection');
    
    console.log('\n🚀 Next steps:');
    console.log('1. Start the backend server: npm start');
    console.log('2. Test job profile selection in frontend');
    console.log('3. Ready for Phase 2 implementation!');
    
  } catch (error) {
    console.error('❌ Error initializing AWS profile:', error);
    
    if (error.code === '42501') {
      console.log('\n🔧 RLS Policy Issue - Try this fix:');
      console.log('Run this SQL in Supabase SQL Editor:');
      console.log(`
-- Temporarily disable RLS for initialization
ALTER TABLE public.job_profiles DISABLE ROW LEVEL SECURITY;

-- Re-enable after initialization
-- ALTER TABLE public.job_profiles ENABLE ROW LEVEL SECURITY;
      `);
    }
    
    process.exit(1);
  }
}

// Run the initialization
initializeAWSProfile(); 