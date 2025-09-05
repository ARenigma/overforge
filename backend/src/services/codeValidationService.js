const { analyzeCode } = require('./aiService');
const validationConfig = require('../config/validationConfig');
const axios = require('axios');

// Security patterns for different languages
const SECURITY_PATTERNS = {
  // Dangerous system operations
  system: {
    python: [
      /import\s+os(?:\s|$|\.)/i,
      /import\s+subprocess(?:\s|$|\.)/i,
      /import\s+sys(?:\s|$|\.)/i,
      /import\s+socket(?:\s|$|\.)/i,
      /import\s+urllib(?:\s|$|\.)/i,
      /import\s+requests(?:\s|$|\.)/i,
      /os\.(system|popen|remove|rmdir|mkdir|listdir|chmod|chown)/i,
      /subprocess\.(run|call|check_output|Popen)/i,
      /eval\s*\(/i,
      /exec\s*\(/i,
      /__import__\s*\(/i,
      /open\s*\([^)]*['"][wr]/i, // File write operations
    ],
    javascript: [
      /require\s*\(\s*['"]fs['"]\s*\)/i,
      /require\s*\(\s*['"]child_process['"]\s*\)/i,
      /require\s*\(\s*['"]http['"]\s*\)/i,
      /require\s*\(\s*['"]https['"]\s*\)/i,
      /require\s*\(\s*['"]net['"]\s*\)/i,
      /fs\.(readFile|writeFile|unlink|mkdir|rmdir)/i,
      /eval\s*\(/i,
      /Function\s*\(/i,
      /document\.(write|createElement)/i,
      /window\.(location|open)/i,
      /localStorage\./i,
      /sessionStorage\./i,
    ],
    java: [
      /import\s+java\.io\./i,
      /import\s+java\.net\./i,
      /import\s+java\.nio\./i,
      /import\s+java\.lang\.Runtime/i,
      /Runtime\.getRuntime\(\)/i,
      /ProcessBuilder/i,
      /FileWriter|FileReader|FileInputStream|FileOutputStream/i,
      /Socket|ServerSocket|URL|URLConnection/i,
      /Class\.forName/i,
      /System\.(exit|getProperty|setProperty)/i,
    ],
    cpp: [
      /#include\s*<fstream>/i,
      /#include\s*<iostream>/i, // Only if accessing files
      /#include\s*<cstdlib>/i,
      /#include\s*<windows\.h>/i,
      /#include\s*<unistd\.h>/i,
      /system\s*\(/i,
      /fopen|fwrite|fread|remove|rename/i,
      /exec|fork|CreateProcess/i,
      /malloc|calloc|realloc|free/i, // Memory operations (moderate risk)
    ]
  },

  // Code injection patterns
  injection: {
    all: [
      /;\s*\/\*.*?\*\/\s*;/s, // Comment injection
      /'\s*;\s*[a-zA-Z]/i, // SQL injection style
      /"\s*;\s*[a-zA-Z]/i,
      /\$\{.*?\}/g, // Template injection
      /`.*?\$\{.*?\}.*?`/g, // Template literals with injection
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, // Iframe tags
      /javascript:/i, // JavaScript protocol
      /data:text\/html/i, // Data URLs
    ]
  },

  // Inappropriate content patterns
  inappropriate: {
    all: [
      /\b(?:fuck|shit|damn|hell|bitch|bastard|crap)\b/i,
      /\b(?:kill|murder|death|suicide|bomb|terrorist|weapon)\b/i,
      /\b(?:hack|crack|exploit|backdoor|malware|virus)\b/i,
      /\b(?:porn|sex|xxx|nude|nsfw)\b/i,
      /\b(?:steal|pirate|illegal|fraud|scam)\b/i,
    ]
  }
};

// Non-contextual patterns (unrelated to coding problems)
const NON_CONTEXTUAL_PATTERNS = [
  // Common copy-paste from other sources
  /console\.log\s*\(\s*['"]hello\s+world['"]\s*\)/i,
  /print\s*\(\s*['"]hello\s+world['"]\s*\)/i,
  /System\.out\.println\s*\(\s*['"]hello\s+world['"]\s*\)/i,
  
  // Simple counting/numbering patterns that don't address problems
  /for\s*\([^)]*i\s*=\s*0[^)]*\+\+i[^)]*\)\s*\{[^}]*(?:cout|print|printf|System\.out)[^}]*i[^}]*\}/i,
  /for\s*\([^)]*\)\s*\{[^}]*(?:cout|print|printf)[^}]*<<\s*i\s*<<[^}]*\}/i,
  /while\s*\([^)]*i\s*<[^)]*\)\s*\{[^}]*(?:cout|print|printf)[^}]*i[^}]*\+\+[^}]*\}/i,
  
  // Basic Hello World variations
  /(?:cout|print|printf|System\.out)[^;]*['"]hello['"]/i,
  /(?:cout|print|printf|System\.out)[^;]*['"]hi['"]/i,
  
  // Academic dishonesty patterns
  /\/\*.*?(?:copied|plagiarized|stackoverflow|github|chegg).*?\*\//is,
  /\/\/.*?(?:copied|plagiarized|stackoverflow|github|chegg)/i,
  /#.*?(?:copied|plagiarized|stackoverflow|github|chegg)/i,
  
  // Unrelated functionality
  /class\s+Main\s*\{/i, // Generic main classes
  /function\s+test\s*\(/i, // Test functions
  /def\s+test_/i, // Python test functions
  
  // Gaming/entertainment code
  /(?:game|player|score|level|enemy|weapon|character)/i,
  /(?:music|song|audio|video|movie|entertainment)/i,
  
  // Social media references
  /(?:facebook|twitter|instagram|tiktok|youtube|linkedin)/i,
  /(?:like|share|comment|post|tweet|follow)/i,
  
  // Generic test/example patterns
  /for.*print.*\d+/i, // Simple loops printing numbers
  /int\s+main\s*\(\s*\)\s*\{[^}]*for[^}]*(?:cout|print|printf)[^}]*\d+[^}]*\}/i, // C++ main with simple number printing
  /std::cout\s*<<\s*i\s*<<\s*['"]\s/i, // C++ cout with iterator printing
];

// Validation severity levels
const SEVERITY = {
  CRITICAL: 'critical',   // Blocks execution
  HIGH: 'high',          // Strong warning
  MEDIUM: 'medium',      // Warning
  LOW: 'low',           // Info/suggestion
  INFO: 'info'          // Just information
};

class CodeValidationService {
  constructor() {
    this.validationRules = this.initializeRules();
  }

  initializeRules() {
    return {
      // Security validation rules
      security: {
        systemCalls: {
          severity: SEVERITY.CRITICAL,
          message: 'System calls and OS operations are not allowed in this environment',
          blockExecution: true
        },
        fileOperations: {
          severity: SEVERITY.CRITICAL,
          message: 'File system operations are restricted for security reasons',
          blockExecution: true
        },
        networkOperations: {
          severity: SEVERITY.CRITICAL,
          message: 'Network operations are not permitted',
          blockExecution: true
        },
        codeInjection: {
          severity: SEVERITY.CRITICAL,
          message: 'Potential code injection detected',
          blockExecution: true
        }
      },

      // Content validation rules
      content: {
        inappropriateLanguage: {
          severity: SEVERITY.HIGH,
          message: 'Please use professional language in your code',
          blockExecution: false
        },
        suspiciousContent: {
          severity: SEVERITY.HIGH,
          message: 'Code contains potentially inappropriate content',
          blockExecution: false
        }
      },

      // Context validation rules
      context: {
        nonRelevant: {
          severity: SEVERITY.MEDIUM,
          message: 'Code appears unrelated to the given problem',
          blockExecution: false
        },
        copyPaste: {
          severity: SEVERITY.HIGH,
          message: 'Code appears to be copied from external sources',
          blockExecution: false
        },
        placeholder: {
          severity: SEVERITY.LOW,
          message: 'Consider replacing placeholder code with your solution',
          blockExecution: false
        }
      },

      // Quality validation rules
      quality: {
        emptyFunction: {
          severity: SEVERITY.INFO,
          message: 'Function body is empty or contains only placeholder code',
          blockExecution: false
        },
        syntaxError: {
          severity: SEVERITY.HIGH,
          message: 'Code contains syntax errors',
          blockExecution: false
        }
      }
    };
  }

  /**
   * Main validation function
   * @param {string} code - Code to validate
   * @param {string} language - Programming language
   * @param {string} questionContext - Context about the coding problem
   * @param {object} options - Additional validation options
   * @returns {object} Validation results
   */
  async validateCode(code, language, questionContext = '', options = {}) {
    // 🔧 CHECK: Return early if validation is disabled
    if (!validationConfig.isCodeValidationEnabled()) {
      console.log('⏭️  Code validation disabled in config - returning basic valid result');
      return {
        isValid: true,
        shouldBlock: false,
        warnings: [],
        errors: [],
        suggestions: [],
        securityScore: 100,
        contextScore: 100,
        metadata: {
          codeLength: code.length,
          language,
          timestamp: new Date().toISOString(),
          validationDisabled: true
        }
      };
    }
    
    const results = {
      isValid: true,
      shouldBlock: false,
      warnings: [],
      errors: [],
      suggestions: [],
      securityScore: 100, // 0-100, lower is more concerning
      contextScore: 100,  // 0-100, lower means less relevant
      metadata: {
        codeLength: code.length,
        language,
        timestamp: new Date().toISOString()
      }
    };

    try {
      // 1. Basic sanitization
      const sanitizedCode = this.sanitizeCode(code);
      
      // 2. Security validation
      const securityResults = this.validateSecurity(sanitizedCode, language);
      results.warnings.push(...securityResults.warnings);
      results.errors.push(...securityResults.errors);
      results.securityScore = securityResults.score;
      results.shouldBlock = results.shouldBlock || securityResults.shouldBlock;

      // 3. Content validation (traditional)
      const contentResults = this.validateContent(sanitizedCode);
      results.warnings.push(...contentResults.warnings);
      results.errors.push(...contentResults.errors);

      // 4. CHAMPION VALIDATION (Comprehensive AI Analysis)
      // NOTE: Champion validation handles security, content, spam, AND relevance analysis
      if (validationConfig.isChampionValidationEnabled()) {
        console.log('🏆 Running Champion Validation (comprehensive AI analysis)...');
        
        // Champion validation will be called separately in socket handlers for counter questions
        // Here we just note that Champion validation is available
        results.metadata.championValidationAvailable = true;
        
        console.log('🏆 Champion validation available for relevance checking');
      } else {
        console.log('⏭️  Champion validation disabled in config - only basic security validation');
        results.metadata.championValidationDisabled = true;
      }

      // 5. Context validation (if question context provided)
      if (questionContext) {
        const contextResults = await this.validateContext(sanitizedCode, questionContext, language);
        results.warnings.push(...contextResults.warnings);
        results.suggestions.push(...contextResults.suggestions);
        results.contextScore = contextResults.score;
      }

      // 5. Quality validation
      const qualityResults = this.validateQuality(sanitizedCode, language);
      results.suggestions.push(...qualityResults.suggestions);

      // 6. Overall validation status
      results.isValid = results.errors.length === 0;

      return results;

    } catch (error) {
      console.error('Code validation error:', error);
      results.isValid = false;
      results.errors.push({
        type: 'validation_error',
        severity: SEVERITY.HIGH,
        message: 'An error occurred during code validation',
        details: error.message
      });
      return results;
    }
  }

  /**
   * Sanitize code - remove potentially harmful content
   */
  sanitizeCode(code) {
    if (!code || typeof code !== 'string') return '';
    
    // Remove null bytes and other control characters
    let sanitized = code.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Limit code length
    const maxLength = 50000; // 50KB limit
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Validate security - check for dangerous patterns
   */
  validateSecurity(code, language) {
    const results = { warnings: [], errors: [], score: 100, shouldBlock: false };
    const langKey = language.toLowerCase();
    let deductions = 0;

    // Check system operation patterns
    const systemPatterns = SECURITY_PATTERNS.system[langKey] || [];
    systemPatterns.forEach(pattern => {
      if (pattern.test(code)) {
        const rule = this.validationRules.security.systemCalls;
        results.errors.push({
          type: 'security_violation',
          severity: rule.severity,
          message: rule.message,
          pattern: pattern.toString(),
          blockExecution: rule.blockExecution
        });
        results.shouldBlock = results.shouldBlock || rule.blockExecution;
        deductions += 30;
      }
    });

    // Check injection patterns
    const injectionPatterns = SECURITY_PATTERNS.injection.all;
    injectionPatterns.forEach(pattern => {
      if (pattern.test(code)) {
        const rule = this.validationRules.security.codeInjection;
        results.errors.push({
          type: 'injection_risk',
          severity: rule.severity,
          message: rule.message,
          pattern: pattern.toString(),
          blockExecution: rule.blockExecution
        });
        results.shouldBlock = results.shouldBlock || rule.blockExecution;
        deductions += 40;
      }
    });

    results.score = Math.max(0, 100 - deductions);
    return results;
  }

  /**
   * Validate content - check for inappropriate content
   */
  validateContent(code) {
    const results = { warnings: [], errors: [] };

    // Check inappropriate language
    const inappropriatePatterns = SECURITY_PATTERNS.inappropriate.all;
    inappropriatePatterns.forEach(pattern => {
      if (pattern.test(code)) {
        const rule = this.validationRules.content.inappropriateLanguage;
        results.warnings.push({
          type: 'inappropriate_content',
          severity: rule.severity,
          message: rule.message,
          blockExecution: rule.blockExecution
        });
      }
    });

    return results;
  }

  /**
   * Validate context - check if code is relevant to the problem
   */
  async validateContext(code, questionContext, language) {
    const results = { warnings: [], suggestions: [], score: 100 };
    let deductions = 0;

    // Primary AI-based context analysis (if available)
    try {
      const aiAnalysis = await this.analyzeCodeContext(code, questionContext, language);
      if (aiAnalysis) {
        // Use AI analysis as primary context score
        results.score = aiAnalysis.contextScore || 100;
        
        if (aiAnalysis.contextScore < 70) {
          results.warnings.push({
            type: 'ai_context_warning',
            severity: SEVERITY.MEDIUM,
            message: aiAnalysis.reasoning || 'AI analysis suggests this code may not fully address the given problem',
            details: aiAnalysis.reasoning,
            blockExecution: false
          });
        }

        // Add AI suggestions
        if (aiAnalysis.suggestions && aiAnalysis.suggestions.length > 0) {
          results.suggestions.push(...aiAnalysis.suggestions.map(suggestion => ({
            type: 'ai_context_suggestion',
            severity: SEVERITY.INFO,
            message: suggestion,
            blockExecution: false
          })));
        }

        console.log(`🤖 AI Context Analysis: Score=${aiAnalysis.contextScore}, Relevant=${aiAnalysis.isRelevant}`);
        
        // If AI analysis is successful and confident, trust it primarily
        if (aiAnalysis.contextScore !== undefined) {
          return results;
        }
      }
    } catch (error) {
      console.warn('AI context analysis failed, falling back to pattern matching:', error.message);
    }

    // Fallback: Use pattern matching only when AI analysis fails
    console.log('🔄 Using pattern-based context validation as fallback');
    
    NON_CONTEXTUAL_PATTERNS.forEach(pattern => {
      if (pattern.test(code)) {
        const rule = this.validationRules.context.nonRelevant;
        results.warnings.push({
          type: 'context_mismatch',
          severity: rule.severity,
          message: rule.message,
          blockExecution: rule.blockExecution
        });
        deductions += 20; // Smaller deduction since this is fallback
      }
    });

    // Only apply pattern-based deductions if AI analysis wasn't available
    results.score = Math.max(0, 100 - deductions);
    return results;
  }

  /**
   * Use AI module for context analysis
   */
  async analyzeCodeContext(code, questionContext, language) {
    try {
      const prompt = `
Analyze this code submission for relevance to the given problem:

PROBLEM CONTEXT:
${questionContext}

SUBMITTED CODE (${language}):
${code}

Please evaluate:
1. Does the code attempt to solve the given problem?
2. Are the variable names and function names relevant?
3. Does the approach make sense for this type of problem?
4. Is this likely copied from elsewhere or genuinely solving this problem?

Respond with a JSON object:
{
  "contextScore": number (0-100, where 100 is perfectly relevant),
  "isRelevant": boolean,
  "reasoning": "Brief explanation of the analysis",
  "suggestions": ["array of suggestions for improvement"]
}
`;

      const aiResult = await analyzeCode({
        code: prompt,
        language: language,
        userId: null,
        roomName: null,
        questionId: null,
        questionContext: questionContext
      });
      
      if (aiResult && aiResult.insight) {
        try {
          const parsed = JSON.parse(aiResult.insight);
          return parsed;
        } catch (parseError) {
          console.warn('Failed to parse AI context analysis:', parseError);
        }
      }
    } catch (error) {
      console.warn('AI context analysis error:', error);
    }
    
    return null;
  }

  /**
   * Validate code quality
   */
  validateQuality(code, language) {
    const results = { suggestions: [] };

    // Check for empty functions
    const emptyFunctionPatterns = {
      python: /def\s+\w+\s*\([^)]*\)\s*:\s*(?:pass\s*)?$/gm,
      javascript: /function\s+\w+\s*\([^)]*\)\s*\{\s*\}/gm,
      java: /\w+\s+\w+\s*\([^)]*\)\s*\{\s*\}/gm,
      cpp: /\w+\s+\w+\s*\([^)]*\)\s*\{\s*\}/gm
    };

    const langKey = language.toLowerCase();
    const emptyPattern = emptyFunctionPatterns[langKey];
    if (emptyPattern && emptyPattern.test(code)) {
      const rule = this.validationRules.quality.emptyFunction;
      results.suggestions.push({
        type: 'quality_suggestion',
        severity: rule.severity,
        message: rule.message,
        blockExecution: rule.blockExecution
      });
    }

    return results;
  }

  /**
   * Real-time validation for client-side warnings
   */
  getQuickValidation(code, language) {
    const results = {
      hasSecurityIssues: false,
      hasContentIssues: false,
      isEmpty: !code || code.trim().length === 0,
      warnings: []
    };

    // Quick security check
    const langKey = language.toLowerCase();
    const systemPatterns = SECURITY_PATTERNS.system[langKey] || [];
    const hasSystemCalls = systemPatterns.some(pattern => pattern.test(code));
    
    if (hasSystemCalls) {
      results.hasSecurityIssues = true;
      results.warnings.push('Security warning: System operations detected');
    }

    // Quick content check
    const inappropriatePatterns = SECURITY_PATTERNS.inappropriate.all;
    const hasInappropriateContent = inappropriatePatterns.some(pattern => pattern.test(code));
    
    if (hasInappropriateContent) {
      results.hasContentIssues = true;
      results.warnings.push('Content warning: Please use professional language');
    }

    return results;
  }
}

module.exports = new CodeValidationService(); 