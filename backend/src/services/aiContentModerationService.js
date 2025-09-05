const axios = require('axios');

// AI Content Moderation Service - Acts like "10 humans watching"
class AIContentModerationService {
  constructor() {
    this.aiModuleUrl = process.env.AI_MODULE_URL || 'http://localhost:8000';
    this.validationCache = new Map(); // Cache recent validations
    this.severityLevels = {
      CRITICAL: 'critical',     // Block execution
      HIGH: 'high',            // Strong warning
      MEDIUM: 'medium',        // Warning
      LOW: 'low',             // Mild warning
      INFO: 'info'            // Just information
    };
  }

  /**
   * MAIN VALIDATION ENTRY POINT
   * Comprehensive AI analysis of any content (code, chat, etc.)
   */
  async validateContent(content, context = {}) {
    const {
      type = 'code',           // 'code', 'chat', 'comment'
      language = null,         // Programming language
      questionContext = '',    // Current coding question
      userId = null,
      roomName = null
    } = context;

    console.log(`🔍 AI Content Moderation: Analyzing ${type} content (${content.length} chars)`);

    try {
      // NEW: Use the dedicated validation endpoint for comprehensive analysis
      const aiAnalysis = await this.validateContentWithNewEndpoint(content, context);
      
      // Handle errors from AI service
      if (aiAnalysis.error) {
        console.warn('AI validation returned error:', aiAnalysis.error);
        // Use fallback analysis if available
        if (aiAnalysis.fallback_analysis) {
          return this.convertAIAnalysisToResults(aiAnalysis.fallback_analysis, content.length);
        }
        throw new Error(aiAnalysis.error);
      }

      // Convert AI analysis to our expected format
      return this.convertAIAnalysisToResults(aiAnalysis, content.length);

    } catch (error) {
      console.error('AI Content Moderation Error:', error.message);
      
      // Fallback to legacy individual analysis approach
      console.log('🔄 Falling back to individual AI analyses...');
      return await this.validateContentLegacy(content, context);
    }
  }

  /**
   * Convert new AI analysis format to our expected results format
   */
  convertAIAnalysisToResults(aiAnalysis, contentLength) {
    const results = {
      shouldBlock: false,
      warnings: [],
      errors: [],
      flags: {
        malicious: false,
        inappropriate: false,
        nonContextual: false,
        nonCoding: false,
        spam: false
      },
      confidence: 85, // High confidence from dedicated endpoint
      analysisDetails: aiAnalysis
    };

    // Process security analysis
    if (aiAnalysis.security_analysis?.is_malicious) {
      results.shouldBlock = true;
      results.flags.malicious = true;
      results.errors.push({
        type: 'security_threat',
        severity: this.severityLevels.CRITICAL,
        message: `Security threats detected: ${aiAnalysis.security_analysis.threats?.join(', ')}`,
        details: aiAnalysis.security_analysis.threats || [],
        blockExecution: true
      });
    }

    // Process content appropriateness
    if (!aiAnalysis.content_analysis?.is_appropriate) {
      results.flags.inappropriate = true;
      const severity = aiAnalysis.content_analysis?.severity === 'high' ? 
        this.severityLevels.HIGH : this.severityLevels.MEDIUM;
      
      results.warnings.push({
        type: 'inappropriate_content',
        severity: severity,
        message: `Inappropriate content detected: ${aiAnalysis.content_analysis.issues?.join(', ')}`,
        details: aiAnalysis.content_analysis.issues || [],
        blockExecution: false
      });
    }

    // Process relevance analysis
    if (!aiAnalysis.relevance_analysis?.is_relevant) {
      results.flags.nonContextual = true;
      results.warnings.push({
        type: 'context_mismatch',
        severity: this.severityLevels.MEDIUM,
        message: `Content appears to be off-topic or irrelevant`,
        details: [aiAnalysis.relevance_analysis?.detected_content_type || 'unknown'],
        blockExecution: false
      });
    }

    // Check if content is coding-related
    if (!aiAnalysis.relevance_analysis?.is_coding_related) {
      results.flags.nonCoding = true;
      results.warnings.push({
        type: 'non_coding_content',
        severity: this.severityLevels.MEDIUM,
        message: `Content detected as: ${aiAnalysis.relevance_analysis?.detected_content_type || 'non-coding'}`,
        details: [aiAnalysis.relevance_analysis?.detected_content_type || 'unknown'],
        blockExecution: false
      });
    }

    // Process spam detection
    if (aiAnalysis.spam_analysis?.is_spam) {
      results.flags.spam = true;
      results.warnings.push({
        type: 'spam_content',
        severity: this.severityLevels.HIGH,
        message: `Spam or nonsense content detected: ${aiAnalysis.spam_analysis.spam_indicators?.join(', ')}`,
        details: aiAnalysis.spam_analysis.spam_indicators || [],
        blockExecution: false
      });
    }

    // Use overall assessment for final blocking decision
    if (aiAnalysis.overall_assessment?.should_block) {
      results.shouldBlock = true;
    }

    console.log(`✅ AI Content Moderation Complete: Block=${results.shouldBlock}, Warnings=${results.warnings.length}, Flags=${Object.keys(results.flags).filter(k => results.flags[k]).join(',')}`);
    return results;
  }

  /**
   * Legacy validation method (fallback)
   */
  async validateContentLegacy(content, context) {
    const results = {
      shouldBlock: false,
      warnings: [],
      errors: [],
      flags: {
        malicious: false,
        inappropriate: false,
        nonContextual: false,
        nonCoding: false,
        spam: false
      },
      confidence: 0,
      analysisDetails: {}
    };

    try {
      // Run parallel AI analyses (original approach)
      const analyses = await Promise.allSettled([
        this.analyzeSecurityThreats(content, context.language),
        this.analyzeContentAppropriateness(content),
        this.analyzeContextualRelevance(content, context.questionContext, context.language),
        this.analyzeIntentAndPurpose(content, context.type),
        this.detectSpamAndNonSense(content)
      ]);

      // Process security analysis
      if (analyses[0].status === 'fulfilled') {
        const securityResult = analyses[0].value;
        if (securityResult.isMalicious) {
          results.shouldBlock = true;
          results.flags.malicious = true;
          results.errors.push({
            type: 'security_threat',
            severity: this.severityLevels.CRITICAL,
            message: securityResult.reason,
            details: securityResult.threats,
            blockExecution: true
          });
        }
      }

      // Calculate overall confidence
      const successfulAnalyses = analyses.filter(a => a.status === 'fulfilled').length;
      results.confidence = (successfulAnalyses / analyses.length) * 100;

      console.log(`✅ Legacy AI Content Moderation Complete: Block=${results.shouldBlock}, Warnings=${results.warnings.length}, Confidence=${results.confidence}%`);
      return results;

    } catch (error) {
      console.error('Legacy AI Content Moderation Error:', error);
      return {
        shouldBlock: false,
        warnings: [{
          type: 'validation_error',
          severity: this.severityLevels.INFO,
          message: 'Content validation temporarily unavailable',
          blockExecution: false
        }],
        errors: [],
        flags: {},
        confidence: 0
      };
    }
  }

  /**
   * SECURITY THREAT ANALYSIS
   * Detect malicious code, security vulnerabilities, harmful intent
   */
  async analyzeSecurityThreats(content, language) {
    const prompt = `
SECURITY THREAT ANALYSIS:

Analyze this content for security threats and malicious intent:

CONTENT:
${content}

LANGUAGE: ${language || 'unknown'}

Evaluate for:
1. Malicious code (system commands, file operations, network calls)
2. Security vulnerabilities (injection attacks, unsafe operations)
3. Harmful intent (data theft, system damage, unauthorized access)
4. Exploit attempts (privilege escalation, sandbox escape)
5. Social engineering or deceptive content

Respond with JSON:
{
  "isMalicious": boolean,
  "threats": ["array of specific threats found"],
  "severity": "critical|high|medium|low",
  "reason": "Brief explanation of findings",
  "confidence": number (0-100)
}
`;

    try {
      const response = await this.callAI(prompt);
      return this.parseAIResponse(response, {
        isMalicious: false,
        threats: [],
        severity: 'low',
        reason: 'No threats detected',
        confidence: 0
      });
    } catch (error) {
      console.error('Security analysis failed:', error);
      return { isMalicious: false, threats: [], reason: 'Analysis failed' };
    }
  }

  /**
   * CONTENT APPROPRIATENESS ANALYSIS
   * Detect inappropriate, offensive, NSFW, or unprofessional content
   */
  async analyzeContentAppropriateness(content) {
    const prompt = `
CONTENT APPROPRIATENESS ANALYSIS:

Analyze this content for appropriateness in a professional coding environment:

CONTENT:
${content}

Evaluate for:
1. Profanity and offensive language (beyond basic swear words)
2. NSFW content or sexual references
3. Discriminatory or hateful language
4. Violent or threatening content
5. Unprofessional or inappropriate content
6. Religious, political, or controversial content that's unrelated to coding
7. Personal attacks or harassment

Consider context - some words might be acceptable in variable names or comments if they're not offensive.

Respond with JSON:
{
  "isInappropriate": boolean,
  "issues": ["array of specific issues found"],
  "severity": "critical|high|medium|low",
  "reason": "Brief explanation",
  "confidence": number (0-100),
  "categories": ["profanity", "nsfw", "discrimination", "violence", "other"]
}
`;

    try {
      const response = await this.callAI(prompt);
      return this.parseAIResponse(response, {
        isInappropriate: false,
        issues: [],
        severity: 'low',
        reason: 'Content appears appropriate',
        confidence: 0
      });
    } catch (error) {
      console.error('Content appropriateness analysis failed:', error);
      return { isInappropriate: false, issues: [], reason: 'Analysis failed' };
    }
  }

  /**
   * CONTEXTUAL RELEVANCE ANALYSIS
   * Check if content is relevant to the coding question/task
   */
  async analyzeContextualRelevance(content, questionContext, language) {
    if (!questionContext) {
      return { isRelevant: true, reason: 'No question context to compare against' };
    }

    const prompt = `
CONTEXTUAL RELEVANCE ANALYSIS:

Question/Task Context:
${questionContext}

Expected Language: ${language || 'any'}

Submitted Content:
${content}

Analyze if the content is relevant to solving the given coding problem:

1. Does it attempt to solve the stated problem?
2. Are the functions/variables related to the problem domain?
3. Is the approach reasonable for this type of problem?
4. Is this content actually trying to solve a coding problem?

Respond with JSON:
{
  "isRelevant": boolean,
  "relevanceScore": number (0-100),
  "reason": "Explanation of relevance or lack thereof",
  "analysis": "Detailed analysis of what the content contains vs what's expected",
  "suggestions": ["suggestions for making it more relevant"]
}
`;

    try {
      const response = await this.callAI(prompt);
      return this.parseAIResponse(response, {
        isRelevant: true,
        relevanceScore: 100,
        reason: 'Analysis unavailable',
        analysis: '',
        suggestions: []
      });
    } catch (error) {
      console.error('Contextual relevance analysis failed:', error);
      return { isRelevant: true, reason: 'Analysis failed' };
    }
  }

  /**
   * INTENT AND PURPOSE ANALYSIS
   * Determine if content is actually coding-related or something else entirely
   */
  async analyzeIntentAndPurpose(content, contentType) {
    const prompt = `
INTENT AND PURPOSE ANALYSIS:

Content Type: ${contentType}
Content:
${content}

Analyze what this content actually is and its purpose:

1. Is this coding/programming related content?
2. What type of content is this? (code, prose, poetry, lyrics, religious text, random text, etc.)
3. What is the apparent intent/purpose?
4. Is this appropriate for a coding assessment environment?

Detect non-coding content like:
- Song lyrics or poetry
- Religious or spiritual texts
- Personal stories or diary entries
- Random gibberish or spam
- Copy-pasted content from unrelated sources
- Academic papers or essays unrelated to coding
- News articles or blog posts
- Social media content

Respond with JSON:
{
  "isCodingRelated": boolean,
  "contentType": "code|prose|lyrics|religious|academic|news|social|gibberish|other",
  "intent": "Brief description of apparent intent",
  "reason": "Why this is or isn't coding-related",
  "detectedContent": ["specific types of non-coding content found"],
  "confidence": number (0-100)
}
`;

    try {
      const response = await this.callAI(prompt);
      return this.parseAIResponse(response, {
        isCodingRelated: true,
        contentType: 'code',
        intent: 'Coding',
        reason: 'Analysis unavailable',
        detectedContent: [],
        confidence: 0
      });
    } catch (error) {
      console.error('Intent analysis failed:', error);
      return { isCodingRelated: true, reason: 'Analysis failed' };
    }
  }

  /**
   * SPAM AND NONSENSE DETECTION
   * Detect spam, gibberish, repetitive content, or meaningless text
   */
  async detectSpamAndNonSense(content) {
    const prompt = `
SPAM AND NONSENSE DETECTION:

Content:
${content}

Analyze for spam and nonsense patterns:

1. Repetitive or gibberish text
2. Random character sequences
3. Excessive whitespace or formatting abuse
4. Copy-pasted boilerplate without substance
5. Marketing or promotional content
6. Phishing or scam content
7. Bot-generated or automated content
8. Meaningless placeholder text

Respond with JSON:
{
  "isSpam": boolean,
  "spamType": "repetitive|gibberish|promotional|phishing|bot|placeholder|other",
  "patterns": ["specific spam patterns detected"],
  "reason": "Brief explanation",
  "confidence": number (0-100)
}
`;

    try {
      const response = await this.callAI(prompt);
      return this.parseAIResponse(response, {
        isSpam: false,
        spamType: 'none',
        patterns: [],
        reason: 'No spam detected',
        confidence: 0
      });
    } catch (error) {
      console.error('Spam detection failed:', error);
      return { isSpam: false, patterns: [], reason: 'Analysis failed' };
    }
  }

  /**
   * NEW: Use dedicated content validation endpoint with optimized error handling
   */
  async validateContentWithNewEndpoint(content, context) {
    try {
      const response = await axios.post(`${this.aiModuleUrl}/validate-content`, {
        content: content,
        content_type: context.type || 'code',
        language: context.language || null,
        context: context.questionContext || 'User submission in coding platform',
        user_id: context.userId || null,
        room_name: context.roomName || null
      }, {
        timeout: 8000, // Reduced timeout for faster responses
        headers: { 'Content-Type': 'application/json' },
        validateStatus: (status) => status < 500 // Accept 4xx errors as valid responses
      });

      return response.data;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.error('AI validation timeout - using fast fallback');
      } else {
        console.error('New validation endpoint failed:', error.message);
      }
      throw error;
    }
  }

  /**
   * Call AI service with prompt (legacy fallback)
   */
  async callAI(prompt) {
    const response = await axios.post(`${this.aiModuleUrl}/generate-room-questions`, {
      language: 'analysis',
      experienceLevel: 'expert',
      promptDirective: prompt
    }, { timeout: 10000 });

    return response.data;
  }

  /**
   * Parse AI response safely
   */
  parseAIResponse(response, fallback) {
    try {
      if (response && response.questions && response.questions.length > 0) {
        const content = response.questions[0].problem || '';
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
      return fallback;
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return fallback;
    }
  }

  /**
   * Real-time validation for immediate feedback
   */
  async validateRealTime(content, context) {
    // Create a more precise cache key that includes content hash to avoid false positives
    const contentHash = this.hashContent(content);
    const cacheKey = `${contentHash}-${context.questionId || 'unknown'}`;
    
    if (this.validationCache.has(cacheKey)) {
      console.log(`📋 Using cached validation for content hash: ${contentHash.substring(0, 8)}...`);
      return this.validationCache.get(cacheKey);
    }

    const result = await this.validateContent(content, context);
    
    // Cache for only 30 seconds to ensure fresh validation while preventing API abuse
    this.validationCache.set(cacheKey, result);
    setTimeout(() => this.validationCache.delete(cacheKey), 30 * 1000); // Reduced from 5 minutes to 30 seconds
    
    console.log(`📋 Fresh validation cached for content hash: ${contentHash.substring(0, 8)}...`);
    return result;
  }

  /**
   * Create a simple hash of content to detect actual changes
   */
  hashContent(content) {
    let hash = 0;
    const str = content.trim();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Clear validation cache for a specific question or all cache
   */
  clearValidationCache(questionId = null) {
    if (questionId) {
      // Clear cache entries for a specific question
      const keysToDelete = [];
      for (const key of this.validationCache.keys()) {
        if (key.endsWith(`-${questionId}`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.validationCache.delete(key));
      console.log(`📋 Cleared validation cache for question: ${questionId} (${keysToDelete.length} entries)`);
    } else {
      // Clear all validation cache
      const cacheSize = this.validationCache.size;
      this.validationCache.clear();
      console.log(`📋 Cleared all validation cache (${cacheSize} entries)`);
    }
  }
}

module.exports = new AIContentModerationService(); 