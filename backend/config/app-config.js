/**
 * Streamlined Application Configuration
 * 
 * Simple, clear configuration with NODE_ENV-based defaults.
 * Manual overrides only when explicitly needed.
 */

module.exports = {
  // ===========================================
  // COUNTER QUESTION CONFIGURATION
  // ===========================================
  counterQuestions: {
    // DISABLED: Legacy counter question system
    enabled: false,
    
    // Get intervals based on NODE_ENV with optional manual overrides
    getIntervals() {
      const env = process.env.NODE_ENV || 'development';
      
      // Define clear intervals per environment
      const envDefaults = {
        development: { first: 30000, second: 60000, third: 90000 },    // 30s, 1min, 1.5min
        test: { first: 15000, second: 30000, third: 45000 },           // 15s, 30s, 45s  
        production: { first: 120000, second: 240000, third: 360000 }   // 2min, 4min, 6min
      };
      
      const defaults = envDefaults[env] || envDefaults.development;
      
      // Allow manual overrides only if explicitly set
      return {
        first: process.env.COUNTER_Q1_INTERVAL ? parseInt(process.env.COUNTER_Q1_INTERVAL) : defaults.first,
        second: process.env.COUNTER_Q2_INTERVAL ? parseInt(process.env.COUNTER_Q2_INTERVAL) : defaults.second,
        third: process.env.COUNTER_Q3_INTERVAL ? parseInt(process.env.COUNTER_Q3_INTERVAL) : defaults.third,
      };
    },
    
    // How many counter questions per session
    maxQuestions: parseInt(process.env.COUNTER_Q_MAX) || 3,
    
    // Minimum code length before triggering counter questions
    minCodeLength: parseInt(process.env.COUNTER_Q_MIN_CODE_LENGTH) || 50,
    
    // Skip counter question if code hasn't changed significantly
    skipIfNoSignificantChange: process.env.COUNTER_Q_SKIP_UNCHANGED !== 'false',
  },

  // ===========================================
  // CODE ANALYSIS & DEBOUNCING
  // ===========================================
  codeAnalysis: {
    // Debounce time for code analysis (milliseconds)
    debounceTime: parseInt(process.env.CODE_ANALYSIS_DEBOUNCE) || 1500,
    
    // Throttle time for code updates broadcast (milliseconds) 
    updateThrottleTime: parseInt(process.env.CODE_UPDATE_THROTTLE) || (10 * 1000), // 10 seconds
    
    // Maximum code length for analysis
    maxCodeLength: parseInt(process.env.MAX_CODE_LENGTH) || 10000,
  },

  // ===========================================
  // AI MODULE CONFIGURATION
  // ===========================================
  ai: {
    // AI module URL
    baseUrl: process.env.AI_MODULE_URL || 'http://localhost:8000',
    
    // Timeout for AI requests (milliseconds)
    requestTimeout: parseInt(process.env.AI_REQUEST_TIMEOUT) || (30 * 1000), // 30 seconds
    
    // Retry attempts for AI requests
    maxRetries: parseInt(process.env.AI_MAX_RETRIES) || 3,
    
    // Retry delay between attempts (milliseconds)
    retryDelay: parseInt(process.env.AI_RETRY_DELAY) || 2000,
  },

  // ===========================================
  // SOCKET.IO CONFIGURATION
  // ===========================================
  socket: {
    // Port for Socket.IO server
    port: parseInt(process.env.SOCKET_PORT) || 5000,
    
    // Socket.IO timeout (milliseconds)
    timeout: parseInt(process.env.SOCKET_TIMEOUT) || (30 * 1000),
    
    // Connection retry attempts
    maxRetries: parseInt(process.env.SOCKET_MAX_RETRIES) || 5,
    
    // Ping timeout (milliseconds)
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT) || (60 * 1000),
    
    // Ping interval (milliseconds)
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL) || (25 * 1000),
  },

  // ===========================================
  // ROOM/SESSION CONFIGURATION
  // ===========================================
  room: {
    // Maximum participants per room
    maxParticipants: parseInt(process.env.ROOM_MAX_PARTICIPANTS) || 10,
    
    // Room cleanup timeout after last participant leaves (milliseconds)
    cleanupDelay: parseInt(process.env.ROOM_CLEANUP_DELAY) || (5 * 60 * 1000), // 5 minutes
    
    // Maximum room lifetime (milliseconds) - auto-cleanup after this time
    maxLifetime: parseInt(process.env.ROOM_MAX_LIFETIME) || (24 * 60 * 60 * 1000), // 24 hours
  },

  // ===========================================
  // MESSAGE & CHAT CONFIGURATION
  // ===========================================
  chat: {
    // Maximum message length
    maxMessageLength: parseInt(process.env.CHAT_MAX_MESSAGE_LENGTH) || 500,
    
    // Message rate limiting (messages per minute per user)
    rateLimitPerMinute: parseInt(process.env.CHAT_RATE_LIMIT) || 30,
    
    // History length to keep in memory
    historyLength: parseInt(process.env.CHAT_HISTORY_LENGTH) || 100,
  },

  // ===========================================
  // QUESTION GENERATION CONFIGURATION
  // ===========================================
  questions: {
    // Default number of initial questions per session
    defaultInitialCount: parseInt(process.env.QUESTIONS_INITIAL_COUNT) || 2,
    
    // Maximum questions that can be generated
    maxQuestions: parseInt(process.env.QUESTIONS_MAX_COUNT) || 10,
    
    // Timeout for question generation (milliseconds)
    generationTimeout: parseInt(process.env.QUESTIONS_GENERATION_TIMEOUT) || (30 * 1000),
    
    // Fallback questions if AI fails
    enableFallback: process.env.QUESTIONS_ENABLE_FALLBACK !== 'false',
  },

  // ===========================================
  // TESTING CONFIGURATION
  // ===========================================
  testing: {
    // E2E test intervals (milliseconds)
    e2e: {
      counterQuestionInterval: parseInt(process.env.TEST_COUNTER_Q_INTERVAL) || (15 * 1000), // 15 seconds for testing
      maxCounterQuestions: parseInt(process.env.TEST_MAX_COUNTER_Q) || 3,
      connectionTimeout: parseInt(process.env.TEST_CONNECTION_TIMEOUT) || (15 * 1000),
      questionGenerationTimeout: parseInt(process.env.TEST_QUESTION_TIMEOUT) || (30 * 1000),
      totalTestTimeout: parseInt(process.env.TEST_TOTAL_TIMEOUT) || (5 * 60 * 1000), // 5 minutes
    },
    
    // Test mode - uses different timing when enabled
    enabled: process.env.NODE_ENV === 'test' || process.env.ENABLE_TEST_MODE === 'true',
  },

  // ===========================================
  // PERFORMANCE & LIMITS
  // ===========================================
  performance: {
    // Memory cleanup intervals (milliseconds)
    memoryCleanupInterval: parseInt(process.env.MEMORY_CLEANUP_INTERVAL) || (10 * 60 * 1000), // 10 minutes
    
    // Maximum concurrent rooms
    maxConcurrentRooms: parseInt(process.env.MAX_CONCURRENT_ROOMS) || 1000,
    
    // Request rate limiting (requests per minute per IP)
    rateLimitPerIP: parseInt(process.env.RATE_LIMIT_PER_IP) || 100,
  },

  // ===========================================
  // LOGGING CONFIGURATION
  // ===========================================
  logging: {
    // Log level: 'error', 'warn', 'info', 'debug'
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    
    // Enable detailed Socket.IO logging
    socketDebug: process.env.SOCKET_DEBUG === 'true' || process.env.NODE_ENV === 'development',
    
    // Enable AI request/response logging
    aiDebug: process.env.AI_DEBUG === 'true' || process.env.NODE_ENV === 'development',
    
    // Log file path (optional)
    filePath: process.env.LOG_FILE_PATH || null,
  },

  // ===========================================
  // UTILITY METHODS
  // ===========================================
  
  /**
   * Get merged configuration (simplified)
   * @returns {object} Current configuration
   */
  getMergedConfig() {
    // Get current intervals
    const intervals = this.counterQuestions.getIntervals();
    
    return {
      ...this,
      counterQuestions: {
        ...this.counterQuestions,
        intervals
      }
    };
  },

  /**
   * Get counter question intervals based on current environment
   * @returns {array} Array of intervals in milliseconds
   */
  getCounterQuestionIntervals() {
    const intervals = this.counterQuestions.getIntervals();
    return [intervals.first, intervals.second, intervals.third];
  },

  /**
   * Check if test mode is enabled
   * @returns {boolean} True if test mode is enabled
   */
  isTestMode() {
    return this.testing.enabled;
  },

  /**
   * Get current configuration as string for logging
   * @returns {string} Configuration summary
   */
  getConfigSummary() {
    const intervals = this.counterQuestions.getIntervals();
    const env = process.env.NODE_ENV || 'development';
    
    return `
🚀 Overforge Backend (${env})
   Counter Questions: ${intervals.first}ms, ${intervals.second}ms, ${intervals.third}ms
   Code Analysis Debounce: ${this.codeAnalysis.debounceTime}ms
   AI Timeout: ${this.ai.requestTimeout}ms
   Test Mode: ${this.testing.enabled ? 'ENABLED' : 'DISABLED'}
    `.trim();
  }
}; 