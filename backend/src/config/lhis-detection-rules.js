/**
 * LHIS Parameter Detection Configuration
 * Centralized settings for parameter detection behavior
 */
const parameterDetectionConfig = {
  // Code length requirements for parameter detection
  codeThresholds: {
    minimumCharacters: 200,        // Minimum characters before triggering parameter detection
    minimumMeaningfulLines: 5,     // Minimum non-empty, non-comment lines
    maximumCodeLength: 50000       // Maximum code length for processing
  },
  
  // Detection timing settings
  timing: {
    debounceDelay: 2000,          // Wait 2s after last keystroke before analysis
    minTimeBetweenDetections: 5000, // Minimum 5s between parameter detections
    analysisTimeout: 30000        // Maximum 30s for AI analysis
  },
  
  // Confidence and scoring settings
  confidence: {
    minimumThreshold: 70,         // Minimum confidence % to detect parameter
    highConfidenceThreshold: 85,  // High confidence threshold
    retryOnLowConfidence: true    // Retry analysis if confidence is borderline
  },
  
  // Quality filters
  qualityFilters: {
    skipBoilerplate: true,        // Skip template/generated code
    requireImplementation: true,  // Require actual implementation, not just imports
    maxBoilerplateRatio: 0.7     // Max 70% boilerplate allowed
  }
};

/**
 * LHIS Objective Detection Rules Configuration
 * Defines clear, measurable criteria for parameter detection
 */

const detectionRules = {
  // AWS Services Proficiency
  'AWS_SERVICES': {
    requiredIndicators: {
      // At least ONE of these must be present
      primary: [
        'AWS SDK usage (any language)',
        'AWS service client initialization',
        'Cloud resource configuration',
        'Serverless function implementation',
        'AWS-specific annotations or decorators'
      ],
      // Supporting indicators that increase confidence
      secondary: [
        'IAM role/policy references',
        'AWS resource ARNs',
        'Cloud formation templates',
        'Environment variables for AWS config',
        'AWS service method calls'
      ]
    },
    codePatterns: {
      // Objective patterns to detect
      serviceUsage: [
        'DynamoDB operations (put, get, query, scan)',
        'S3 operations (upload, download, list)',
        'Lambda function handlers',
        'SQS/SNS messaging',
        'API Gateway integration'
      ],
      configuration: [
        'AWS credentials setup',
        'Region configuration',
        'Service endpoint configuration',
        'Resource tagging',
        'Scaling policies'
      ]
    },
    minimumRequirements: {
      // Objective thresholds
      primaryIndicators: 1,
      totalIndicators: 2,
      confidenceThreshold: 60
    }
  },

  // Java & Spring Framework Expertise
  'SPRING_FRAMEWORK': {
    requiredIndicators: {
      primary: [
        'Spring annotations usage',
        'Dependency injection implementation',
        'Spring Bean configuration',
        'Spring Boot application setup',
        'REST controller implementation'
      ],
      secondary: [
        'Application properties/YAML config',
        'Spring profiles',
        'Transaction management',
        'Spring Data repositories',
        'Spring Security configuration'
      ]
    },
    codePatterns: {
      annotations: [
        '@SpringBootApplication',
        '@RestController/@Controller',
        '@Service/@Component/@Repository',
        '@Autowired/@Inject',
        '@RequestMapping and variants',
        '@Transactional',
        '@Configuration'
      ],
      concepts: [
        'Inversion of Control (IoC)',
        'Aspect-Oriented Programming (AOP)',
        'MVC pattern implementation',
        'RESTful service design',
        'Spring application context'
      ]
    },
    minimumRequirements: {
      primaryIndicators: 2,
      annotationCount: 3,
      confidenceThreshold: 70
    }
  },

  // System Integration & Data Management
  'SYSTEM_INTEGRATION': {
    requiredIndicators: {
      primary: [
        'Database connectivity implementation',
        'API endpoint creation or consumption',
        'Data transformation logic',
        'Message queue integration',
        'File/data import/export'
      ],
      secondary: [
        'Data validation logic',
        'Error handling for external systems',
        'Retry mechanisms',
        'Circuit breaker patterns',
        'Data synchronization logic'
      ]
    },
    codePatterns: {
      dataOperations: [
        'CRUD operations implementation',
        'Batch processing logic',
        'Data mapping/transformation',
        'Query building/execution',
        'Transaction handling'
      ],
      integrationPatterns: [
        'REST/SOAP client implementation',
        'Message publishing/consuming',
        'Event-driven architecture',
        'Webhook handling',
        'Data pipeline implementation'
      ]
    },
    minimumRequirements: {
      primaryIndicators: 1,
      dataOperationTypes: 2,
      confidenceThreshold: 65
    }
  }
};

/**
 * Objective scoring rubric for consistent evaluation
 */
const scoringRubric = {
  // How to calculate detection confidence
  confidenceCalculation: {
    primaryIndicatorWeight: 40,
    secondaryIndicatorWeight: 20,
    codePatternWeight: 25,
    integrationWeight: 15
  },

  // Minimum thresholds for detection
  detectionThresholds: {
    minimum: 50,      // Below this, not detected
    moderate: 65,     // Detected with low confidence
    high: 80,         // Detected with high confidence
    certain: 95       // Detected with certainty
  },

  // How to handle edge cases
  edgeCaseRules: {
    multipleParameters: 'Detect all that meet minimum requirements',
    ambiguousCode: 'Require higher confidence threshold (75%)',
    minimalCode: 'Require at least 50 lines of meaningful code',
    boilerplate: 'Ignore auto-generated or template code'
  }
};

/**
 * AI Prompt Templates for Objective Detection
 */
const detectionPromptTemplates = {
  // Template for parameter detection
  parameterDetection: (parameter, rules) => `
You are a code analyzer. Use these OBJECTIVE criteria to determine if the code implements ${parameter}.

REQUIRED INDICATORS (at least ${rules.minimumRequirements.primaryIndicators} needed):
${rules.requiredIndicators.primary.map(ind => `- ${ind}`).join('\n')}

SUPPORTING INDICATORS:
${rules.requiredIndicators.secondary.map(ind => `- ${ind}`).join('\n')}

SCORING:
- Each primary indicator found: +40 points
- Each secondary indicator found: +20 points
- Clear implementation pattern: +25 points
- Proper integration: +15 points

DETECTION THRESHOLD: ${rules.minimumRequirements.confidenceThreshold}%

Analyze the code and respond with:
{
  "detected": boolean,
  "confidence": number (0-100),
  "primaryIndicatorsFound": ["list of found indicators"],
  "secondaryIndicatorsFound": ["list of found indicators"],
  "score": number,
  "reasoning": "objective explanation based on indicators"
}`,

  // Template for code quality assessment
  codeQualityAssessment: () => `
Assess the code quality using these OBJECTIVE metrics:

1. STRUCTURE (0-25 points):
   - Proper separation of concerns
   - Modular design
   - Clear method/class organization

2. ERROR HANDLING (0-25 points):
   - Try-catch blocks where appropriate
   - Graceful error recovery
   - Proper logging

3. BEST PRACTICES (0-25 points):
   - Following language conventions
   - Efficient algorithms
   - Security considerations

4. DOCUMENTATION (0-25 points):
   - Meaningful variable/method names
   - Comments for complex logic
   - API documentation

Return total score out of 100.`
};

/**
 * Validation rules to ensure consistent behavior
 */
const validationRules = {
  // Minimum code requirements
  codeRequirements: {
    minLines: 10,
    minMeaningfulLines: 5,  // Excluding imports, empty lines
    maxBoilerplateRatio: 0.7 // Max 70% can be boilerplate
  },

  // Time-based rules
  timingRules: {
    minTimeBetweenDetections: 5000, // 5 seconds
    codeStabilityDelay: 2000, // Wait 2s after last keystroke
    maxDetectionAttempts: 3
  },

  // Consistency rules
  consistencyRules: {
    requireSameDetectionTwice: true, // Run detection twice to ensure consistency
    confidenceVarianceAllowed: 10, // Max 10% variance between runs
    cacheDetectionResults: true,
    cacheValidityDuration: 30000 // 30 seconds
  }
};

/**
 * LHIS Parameter Detection Rules
 * Objective criteria for detecting implementation of specific technical parameters
 */

module.exports = {
  detectionRules,
  scoringRubric,
  detectionPromptTemplates,
  validationRules,
  parameterDetectionConfig
}; 