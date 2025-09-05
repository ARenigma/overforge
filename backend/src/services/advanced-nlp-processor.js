const aiService = require('./aiService');

/**
 * Advanced Natural Language Processing for Candidate Answers
 * Provides sophisticated semantic understanding and evaluation
 */
class AdvancedNLPProcessor {
  constructor() {
    this.answerCache = new Map();
    this.candidateProfiles = new Map();
    this.conversationContext = new Map();
  }

  /**
   * Perform advanced NLP analysis on candidate answer
   */
  async analyzeAnswer(candidateAnswer, correctAnswer, assessmentCriteria, context = {}) {
    try {
      console.log('🔤 Performing advanced NLP analysis on candidate answer...');

      const cacheKey = this.generateCacheKey(candidateAnswer, correctAnswer, context);
      if (this.answerCache.has(cacheKey)) {
        console.log('📋 Returning cached NLP analysis');
        return this.answerCache.get(cacheKey);
      }

      // Multi-dimensional NLP analysis
      const [
        semanticAnalysis,
        linguisticAnalysis,
        conceptualAnalysis,
        contextualAnalysis,
        intentAnalysis
      ] = await Promise.all([
        this.performSemanticAnalysis(candidateAnswer, correctAnswer),
        this.performLinguisticAnalysis(candidateAnswer, context),
        this.performConceptualAnalysis(candidateAnswer, correctAnswer, assessmentCriteria),
        this.performContextualAnalysis(candidateAnswer, context),
        this.performIntentAnalysis(candidateAnswer, correctAnswer)
      ]);

      const combinedAnalysis = {
        semantic: semanticAnalysis,
        linguistic: linguisticAnalysis,
        conceptual: conceptualAnalysis,
        contextual: contextualAnalysis,
        intent: intentAnalysis,
        overallScore: this.calculateOverallScore([
          semanticAnalysis,
          linguisticAnalysis,
          conceptualAnalysis,
          contextualAnalysis,
          intentAnalysis
        ]),
        confidence: this.calculateConfidence([
          semanticAnalysis,
          linguisticAnalysis,
          conceptualAnalysis,
          contextualAnalysis,
          intentAnalysis
        ]),
        timestamp: new Date().toISOString()
      };

      // Cache the result
      this.answerCache.set(cacheKey, combinedAnalysis);
      
      console.log(`✅ Advanced NLP analysis completed with score: ${combinedAnalysis.overallScore}`);
      return combinedAnalysis;

    } catch (error) {
      console.error('❌ Advanced NLP analysis failed:', error);
      return this.getFallbackAnalysis();
    }
  }

  /**
   * Semantic similarity and meaning analysis
   */
  async performSemanticAnalysis(candidateAnswer, correctAnswer) {
    const prompt = `
Perform semantic similarity analysis between these two answers:

CANDIDATE ANSWER:
${candidateAnswer}

EXPECTED ANSWER:
${correctAnswer}

Analyze:
1. Semantic similarity (core meaning overlap)
2. Conceptual alignment
3. Key information coverage
4. Meaning preservation despite different wording
5. Understanding of core concepts

Respond in JSON:
{
  "semanticSimilarity": 0-100,
  "conceptualAlignment": 0-100,
  "keyCoveragePercentage": 0-100,
  "meaningPreservation": 0-100,
  "coreConceptUnderstanding": 0-100,
  "sharedConcepts": ["concept1", "concept2"],
  "missedConcepts": ["missed1", "missed2"],
  "additionalInsights": ["insight1", "insight2"],
  "confidence": 0-100
}
`;

    const analysis = await aiService.analyzeCode(candidateAnswer, 'text', prompt);
    return this.parseNLPResponse(analysis, {
      semanticSimilarity: 30,
      conceptualAlignment: 30,
      keyCoveragePercentage: 30,
      meaningPreservation: 30,
      coreConceptUnderstanding: 30,
      sharedConcepts: [],
      missedConcepts: [],
      additionalInsights: [],
      confidence: 50
    });
  }

  /**
   * Linguistic style and communication analysis
   */
  async performLinguisticAnalysis(candidateAnswer, context) {
    const prompt = `
Analyze the linguistic characteristics of this answer:

ANSWER:
${candidateAnswer}

CONTEXT: ${JSON.stringify(context)}

Evaluate:
1. Communication clarity and coherence
2. Technical vocabulary usage
3. Explanation structure and flow
4. Confidence level in expression
5. Professional communication style

Respond in JSON:
{
  "clarity": 0-100,
  "coherence": 0-100,
  "technicalVocabulary": 0-100,
  "structureFlow": 0-100,
  "confidenceLevel": 0-100,
  "professionalStyle": 0-100,
  "communicationStrengths": ["strength1", "strength2"],
  "improvementAreas": ["area1", "area2"],
  "tonalAnalysis": "confident|uncertain|enthusiastic|nervous|balanced",
  "confidence": 0-100
}
`;

    const analysis = await aiService.analyzeCode(candidateAnswer, 'text', prompt);
    return this.parseNLPResponse(analysis, {
      clarity: 50,
      coherence: 50,
      technicalVocabulary: 50,
      structureFlow: 50,
      confidenceLevel: 50,
      professionalStyle: 50,
      communicationStrengths: [],
      improvementAreas: [],
      tonalAnalysis: 'balanced',
      confidence: 50
    });
  }

  /**
   * Deep conceptual understanding analysis
   */
  async performConceptualAnalysis(candidateAnswer, correctAnswer, assessmentCriteria) {
    const prompt = `
Analyze the depth of conceptual understanding in this answer:

CANDIDATE ANSWER:
${candidateAnswer}

EXPECTED ANSWER:
${correctAnswer}

ASSESSMENT CRITERIA:
${assessmentCriteria.join(', ')}

Evaluate:
1. Depth of understanding (surface vs deep)
2. Practical vs theoretical knowledge
3. Real-world application awareness
4. Problem-solving approach
5. Critical thinking demonstration

Respond in JSON:
{
  "understandingDepth": "surface|functional|deep|expert",
  "practicalKnowledge": 0-100,
  "theoreticalKnowledge": 0-100,
  "realWorldAwareness": 0-100,
  "problemSolvingApproach": 0-100,
  "criticalThinking": 0-100,
  "knowledgeGaps": ["gap1", "gap2"],
  "strengthAreas": ["strength1", "strength2"],
  "nextLearningSteps": ["step1", "step2"],
  "confidence": 0-100
}
`;

    const analysis = await aiService.analyzeCode(candidateAnswer, 'text', prompt);
    return this.parseNLPResponse(analysis, {
      understandingDepth: 'functional',
      practicalKnowledge: 50,
      theoreticalKnowledge: 50,
      realWorldAwareness: 50,
      problemSolvingApproach: 50,
      criticalThinking: 50,
      knowledgeGaps: [],
      strengthAreas: [],
      nextLearningSteps: [],
      confidence: 50
    });
  }

  /**
   * Contextual relevance and alignment analysis
   */
  async performContextualAnalysis(candidateAnswer, context) {
    const prompt = `
Analyze how well this answer fits the specific context:

ANSWER:
${candidateAnswer}

CONTEXT:
${JSON.stringify(context)}

Evaluate:
1. Relevance to the specific question/parameter
2. Alignment with experience level expectations
3. Appropriateness for the domain/job role
4. Context-aware reasoning
5. Situation-specific insights

Respond in JSON:
{
  "questionRelevance": 0-100,
  "experienceLevelAlignment": 0-100,
  "domainAppropriateness": 0-100,
  "contextAwareReasoning": 0-100,
  "situationSpecificInsights": 0-100,
  "contextualStrengths": ["strength1", "strength2"],
  "contextualWeaknesses": ["weakness1", "weakness2"],
  "alignmentScore": 0-100,
  "confidence": 0-100
}
`;

    const analysis = await aiService.analyzeCode(candidateAnswer, 'text', prompt);
    return this.parseNLPResponse(analysis, {
      questionRelevance: 50,
      experienceLevelAlignment: 50,
      domainAppropriateness: 50,
      contextAwareReasoning: 50,
      situationSpecificInsights: 50,
      contextualStrengths: [],
      contextualWeaknesses: [],
      alignmentScore: 50,
      confidence: 50
    });
  }

  /**
   * Intent and purpose analysis
   */
  async performIntentAnalysis(candidateAnswer, correctAnswer) {
    const prompt = `
Analyze the intent and purpose behind this answer:

CANDIDATE ANSWER:
${candidateAnswer}

EXPECTED ANSWER:
${correctAnswer}

Determine:
1. What is the candidate trying to communicate?
2. How well does their intent align with the question?
3. Are they demonstrating understanding or guessing?
4. What's their problem-solving strategy?
5. Level of confidence in their approach

Respond in JSON:
{
  "primaryIntent": "explanation of main intent",
  "intentAlignment": 0-100,
  "understandingVsGuessing": 0-100,
  "problemSolvingStrategy": "systematic|intuitive|trial_and_error|unclear",
  "approachConfidence": 0-100,
  "communicationGoal": "teach|demonstrate|explore|clarify",
  "intentClarity": 0-100,
  "strategicThinking": 0-100,
  "confidence": 0-100
}
`;

    const analysis = await aiService.analyzeCode(candidateAnswer, 'text', prompt);
    return this.parseNLPResponse(analysis, {
      primaryIntent: 'Unknown intent',
      intentAlignment: 50,
      understandingVsGuessing: 50,
      problemSolvingStrategy: 'unclear',
      approachConfidence: 50,
      communicationGoal: 'demonstrate',
      intentClarity: 50,
      strategicThinking: 50,
      confidence: 50
    });
  }

  /**
   * Generate intelligent feedback based on NLP analysis
   */
  async generateIntelligentFeedback(nlpAnalysis, candidateAnswer, correctAnswer) {
    try {
      const prompt = `
Based on this comprehensive NLP analysis, generate personalized feedback:

CANDIDATE ANSWER:
${candidateAnswer}

EXPECTED ANSWER:
${correctAnswer}

NLP ANALYSIS SUMMARY:
- Overall Score: ${nlpAnalysis.overallScore}/100
- Semantic Similarity: ${nlpAnalysis.semantic?.semanticSimilarity || 0}/100
- Understanding Depth: ${nlpAnalysis.conceptual?.understandingDepth || 'unknown'}
- Communication Clarity: ${nlpAnalysis.linguistic?.clarity || 0}/100
- Context Alignment: ${nlpAnalysis.contextual?.alignmentScore || 0}/100
- Intent Clarity: ${nlpAnalysis.intent?.intentClarity || 0}/100

Generate constructive, encouraging feedback that:
1. Acknowledges what they got right
2. Gently points out key missing elements
3. Provides actionable improvement suggestions
4. Maintains a supportive, human-like tone
5. Encourages further learning

Keep feedback conversational and under 3 sentences.
`;

      const feedback = await aiService.analyzeCode(candidateAnswer, 'text', prompt);
      return typeof feedback === 'string' ? feedback : 
        feedback.response || 'Good effort! Consider exploring the key concepts more deeply for a complete understanding.';

    } catch (error) {
      console.error('❌ Intelligent feedback generation failed:', error);
      return 'Your answer shows understanding of the topic. Consider elaborating on the key concepts for a more complete response.';
    }
  }

  /**
   * Update candidate profile for personalized learning
   */
  updateCandidateProfile(sessionId, nlpAnalysis) {
    if (!this.candidateProfiles.has(sessionId)) {
      this.candidateProfiles.set(sessionId, {
        answers: [],
        patterns: {
          communicationStyle: 'balanced',
          strengthAreas: new Set(),
          improvementAreas: new Set(),
          learningTrends: []
        },
        preferences: {},
        progressionHistory: []
      });
    }

    const profile = this.candidateProfiles.get(sessionId);
    
    // Add this analysis to history
    profile.answers.push({
      timestamp: new Date().toISOString(),
      analysis: nlpAnalysis
    });

    // Update communication patterns
    if (nlpAnalysis.linguistic?.tonalAnalysis) {
      profile.patterns.communicationStyle = nlpAnalysis.linguistic.tonalAnalysis;
    }

    // Accumulate strengths and areas for improvement
    if (nlpAnalysis.conceptual?.strengthAreas) {
      nlpAnalysis.conceptual.strengthAreas.forEach(strength => 
        profile.patterns.strengthAreas.add(strength)
      );
    }

    if (nlpAnalysis.conceptual?.knowledgeGaps) {
      nlpAnalysis.conceptual.knowledgeGaps.forEach(gap => 
        profile.patterns.improvementAreas.add(gap)
      );
    }

    // Track learning progression
    profile.progressionHistory.push({
      timestamp: new Date().toISOString(),
      overallScore: nlpAnalysis.overallScore,
      understandingDepth: nlpAnalysis.conceptual?.understandingDepth || 'unknown'
    });

    console.log(`👤 Updated candidate profile for session ${sessionId}`);
  }

  /**
   * Get personalized insights for a candidate
   */
  getCandidateInsights(sessionId) {
    const profile = this.candidateProfiles.get(sessionId);
    if (!profile) return null;

    return {
      totalAnswers: profile.answers.length,
      communicationStyle: profile.patterns.communicationStyle,
      strengthAreas: Array.from(profile.patterns.strengthAreas),
      improvementAreas: Array.from(profile.patterns.improvementAreas),
      averageScore: this.calculateAverageScore(profile.answers),
      learningTrend: this.analyzeLearningTrend(profile.progressionHistory),
      lastAnalysis: profile.answers[profile.answers.length - 1]?.analysis
    };
  }

  /**
   * Helper methods
   */
  parseNLPResponse(response, fallback) {
    try {
      if (typeof response === 'string') {
        return JSON.parse(response);
      }
      return response || fallback;
    } catch (error) {
      console.warn('⚠️ Failed to parse NLP response, using fallback');
      return fallback;
    }
  }

  generateCacheKey(candidateAnswer, correctAnswer, context) {
    const hash = require('crypto')
      .createHash('md5')
      .update(candidateAnswer + correctAnswer + JSON.stringify(context))
      .digest('hex');
    return `nlp_${hash}`;
  }

  calculateOverallScore(analyses) {
    const scores = [
      analyses[0]?.semanticSimilarity || 0,
      analyses[1]?.clarity || 0,
      analyses[2]?.practicalKnowledge || 0,
      analyses[3]?.alignmentScore || 0,
      analyses[4]?.intentAlignment || 0
    ];

    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }

  calculateConfidence(analyses) {
    const confidences = analyses
      .map(analysis => analysis.confidence || 50)
      .filter(conf => conf > 0);
    
    return confidences.length > 0 
      ? Math.round(confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length)
      : 50;
  }

  calculateAverageScore(answers) {
    if (answers.length === 0) return 0;
    
    const sum = answers.reduce((total, answer) => 
      total + (answer.analysis?.overallScore || 0), 0
    );
    
    return Math.round(sum / answers.length);
  }

  analyzeLearningTrend(progressionHistory) {
    if (progressionHistory.length < 2) return { trend: 'insufficient_data' };

    const recent = progressionHistory.slice(-3);
    const scores = recent.map(p => p.overallScore);
    
    const improving = scores.every((score, i) => 
      i === 0 || score >= scores[i - 1]
    );
    
    const declining = scores.every((score, i) => 
      i === 0 || score <= scores[i - 1]
    );

    return {
      trend: improving ? 'improving' : declining ? 'declining' : 'stable',
      averageScore: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
      dataPoints: progressionHistory.length
    };
  }

  getFallbackAnalysis() {
    return {
      semantic: { confidence: 0, semanticSimilarity: 30 },
      linguistic: { confidence: 0, clarity: 50 },
      conceptual: { confidence: 0, understandingDepth: 'functional' },
      contextual: { confidence: 0, alignmentScore: 50 },
      intent: { confidence: 0, intentAlignment: 50 },
      overallScore: 30,
      confidence: 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear cache for memory management
   */
  clearCache() {
    this.answerCache.clear();
    console.log('🧹 Advanced NLP processor cache cleared');
  }
}

module.exports = new AdvancedNLPProcessor(); 