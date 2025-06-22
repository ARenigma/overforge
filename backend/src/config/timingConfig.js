/**
 * LHIS Timing Configuration
 * Centralized configuration for all Living Human-like Interview System timing
 */

require('dotenv').config();

class TimingConfig {
  constructor() {
    // === CORE ENGAGEMENT TIMINGS ===
    this.welcomeMessageDelay = 2000; // 2 seconds after initialization
    this.firstCheckInDelay = 60000; // 1 minute for initial check-in
    
    // === PROACTIVE ENGAGEMENT TIMINGS ===
    this.proactiveCheckInterval = 60000; // Check every 60 seconds for engagement opportunities
    this.minEngagementInterval = 180000; // Minimum 3 minutes between engagements
    this.inactivityThresholds = {
      withCode: 90000,    // 1.5 minutes if candidate is coding
      noCode: 180000,     // 3 minutes if no code written yet
      stuckCheck: 150000  // 2.5 minutes for "stuck" detection
    };
    
    // === ASSESSMENT DEPTH QUESTION TIMINGS ===
    this.parameterAssessment = {
      triggerDelay: 2000,        // Natural pause before asking depth questions
      retryDelay: 2000,          // Delay before retry guidance
      nextParameterDelay: 2000   // Delay before moving to next parameter
    };
    

    
    // === RESPONSE GENERATION TIMINGS ===
    this.responses = {
      aiResponseTimeout: 10000,      // 10 seconds max for AI response generation
      humanLikePauseMin: 1000,       // Minimum 1 second human-like pause
      humanLikePauseMax: 3000,       // Maximum 3 seconds human-like pause
      typingSimulationDelay: 100     // Simulate typing speed (per character)
    };
    
    // === DEBOUNCE AND THROTTLING ===
    this.debounce = {
      assessmentInitialization: 2000, // 2 seconds for assessment init
      codeChangeDebounce: 500,        // 500ms for code change events
      socketConnectionDebounce: 1000   // 1 second for socket connections
    };
    
    // === SESSION LIFECYCLE TIMINGS ===
    this.session = {
      cleanupInterval: 300000,        // Clean up stale sessions every 5 minutes
      sessionTimeoutWarning: 1800000, // 30 minutes - warn about timeout
      maxSessionDuration: 3600000,    // 60 minutes - maximum session length
      heartbeatInterval: 30000        // 30 seconds heartbeat check
    };
    
    // === MILESTONE-BASED ENGAGEMENT ===
    this.milestones = {
      noCodeAfter1Min: 60000,         // Check if no code after 1 minute
      noCodeAfter3Min: 180000,        // More urgent check after 3 minutes
      progressCheckAfter2Min: 120000,  // Check progress after 2 minutes of coding
      encouragementInterval: 300000   // Periodic encouragement every 5 minutes
    };

    // Load environment-specific overrides
    this.loadEnvironmentConfig();
  }

  /**
   * Load timing configuration from environment variables
   */
  loadEnvironmentConfig() {
    // Core engagement timings
    if (process.env.LHIS_WELCOME_DELAY) {
      this.welcomeMessageDelay = parseInt(process.env.LHIS_WELCOME_DELAY) || this.welcomeMessageDelay;
    }
    
    if (process.env.LHIS_FIRST_CHECKIN_DELAY) {
      this.firstCheckInDelay = parseInt(process.env.LHIS_FIRST_CHECKIN_DELAY) || this.firstCheckInDelay;
    }
    
    // Inactivity thresholds
    if (process.env.LHIS_INACTIVITY_WITH_CODE) {
      this.inactivityThresholds.withCode = parseInt(process.env.LHIS_INACTIVITY_WITH_CODE) || this.inactivityThresholds.withCode;
    }
    
    if (process.env.LHIS_INACTIVITY_NO_CODE) {
      this.inactivityThresholds.noCode = parseInt(process.env.LHIS_INACTIVITY_NO_CODE) || this.inactivityThresholds.noCode;
    }
    
    // Engagement intervals
    if (process.env.LHIS_MIN_ENGAGEMENT_INTERVAL) {
      this.minEngagementInterval = parseInt(process.env.LHIS_MIN_ENGAGEMENT_INTERVAL) || this.minEngagementInterval;
    }
    
    if (process.env.LHIS_PROACTIVE_CHECK_INTERVAL) {
      this.proactiveCheckInterval = parseInt(process.env.LHIS_PROACTIVE_CHECK_INTERVAL) || this.proactiveCheckInterval;
    }
    
    // Session limits
    if (process.env.LHIS_MAX_SESSION_DURATION) {
      this.session.maxSessionDuration = parseInt(process.env.LHIS_MAX_SESSION_DURATION) || this.session.maxSessionDuration;
    }
  }

  /**
   * Apply environment-specific timing profiles
   */
  applyEnvironmentProfile() {
    const env = process.env.NODE_ENV || 'development';
    
    switch (env) {
      case 'development':
        // Faster timings for development testing
        this.welcomeMessageDelay = 1000;
        this.firstCheckInDelay = 30000; // 30 seconds
        this.inactivityThresholds.withCode = 45000; // 45 seconds
        this.inactivityThresholds.noCode = 90000; // 1.5 minutes
        this.minEngagementInterval = 60000; // 1 minute
        break;
        
      case 'test':
        // Very fast timings for automated testing
        this.welcomeMessageDelay = 100;
        this.firstCheckInDelay = 5000; // 5 seconds
        this.inactivityThresholds.withCode = 10000; // 10 seconds
        this.inactivityThresholds.noCode = 20000; // 20 seconds
        this.minEngagementInterval = 15000; // 15 seconds
        this.proactiveCheckInterval = 5000; // Check every 5 seconds
        break;
        
      case 'production':
        // Standard production timings (use defaults)
        // Could be made slightly more conservative
        this.session.maxSessionDuration = 5400000; // 90 minutes in production
        break;
    }
  }

  /**
   * Get timing for specific engagement type
   */
  getEngagementTiming(engagementType, hasCode = false) {
    switch (engagementType) {
      case 'welcome':
        return this.welcomeMessageDelay;
      case 'first_checkin':
        return this.firstCheckInDelay;
      case 'inactivity':
        return hasCode ? this.inactivityThresholds.withCode : this.inactivityThresholds.noCode;
      case 'stuck_check':
        return this.inactivityThresholds.stuckCheck;
      default:
        return this.minEngagementInterval;
    }
  }

  /**
   * Get assessment timing for specific action
   */
  getAssessmentTiming(action) {
    switch (action) {
      case 'parameter_question':
        return this.parameterAssessment.triggerDelay;
      case 'retry_guidance':
        return this.parameterAssessment.retryDelay;
      case 'next_parameter':
        return this.parameterAssessment.nextParameterDelay;
      default:
        return 2000; // Default 2 second delay
    }
  }

  /**
   * Get human-like response delay
   */
  getHumanLikeDelay(messageLength = 0) {
    const baseDelay = Math.random() * 
      (this.responses.humanLikePauseMax - this.responses.humanLikePauseMin) + 
      this.responses.humanLikePauseMin;
    
    // Add typing simulation based on message length
    const typingDelay = messageLength * this.responses.typingSimulationDelay;
    
    return Math.floor(baseDelay + typingDelay);
  }

  /**
   * Get debounce timing for specific action
   */
  getDebounceTiming(action) {
    switch (action) {
      case 'assessment_init':
        return this.debounce.assessmentInitialization;
      case 'code_change':
        return this.debounce.codeChangeDebounce;
      case 'socket_connection':
        return this.debounce.socketConnectionDebounce;
      default:
        return 1000;
    }
  }

  /**
   * Get milestone timing
   */
  getMilestoneTiming(milestone) {
    return this.milestones[milestone] || 60000;
  }

  /**
   * Get session management timing
   */
  getSessionTiming(action) {
    switch (action) {
      case 'cleanup_interval':
        return this.session.cleanupInterval;
      case 'timeout_warning':
        return this.session.sessionTimeoutWarning;
      case 'max_duration':
        return this.session.maxSessionDuration;
      case 'heartbeat':
        return this.session.heartbeatInterval;
      default:
        return 30000;
    }
  }

  /**
   * Check if enough time has passed for specific action
   */
  canPerformAction(lastActionTime, actionType, hasCode = false) {
    if (!lastActionTime) return true;
    
    const timeSinceAction = Date.now() - lastActionTime;
    const requiredInterval = this.getEngagementTiming(actionType, hasCode);
    
    return timeSinceAction >= requiredInterval;
  }

  /**
   * Get configuration summary for debugging
   */
  getConfigSummary() {
    return {
      environment: process.env.NODE_ENV || 'development',
      engagementTimings: {
        welcome: `${this.welcomeMessageDelay / 1000}s`,
        firstCheckIn: `${this.firstCheckInDelay / 1000}s`,
        minEngagementInterval: `${this.minEngagementInterval / 1000}s`,
        proactiveCheckInterval: `${this.proactiveCheckInterval / 1000}s`
      },
      inactivityThresholds: {
        withCode: `${this.inactivityThresholds.withCode / 1000}s`,
        noCode: `${this.inactivityThresholds.noCode / 1000}s`,
        stuckCheck: `${this.inactivityThresholds.stuckCheck / 1000}s`
      },
      sessionLimits: {
        maxDuration: `${this.session.maxSessionDuration / 60000}min`,
        timeoutWarning: `${this.session.sessionTimeoutWarning / 60000}min`
      }
    };
  }

  /**
   * Update timing configuration at runtime
   */
  updateTimings(newConfig) {
    // Deep merge new configuration
    Object.keys(newConfig).forEach(key => {
      if (typeof newConfig[key] === 'object' && newConfig[key] !== null) {
        this[key] = { ...this[key], ...newConfig[key] };
      } else {
        this[key] = newConfig[key];
      }
    });
  }

  /**
   * Reset to default timings
   */
  resetToDefaults() {
    const TimingConfigClass = require('./timingConfig');
    const defaultConfig = new TimingConfigClass();
    Object.assign(this, defaultConfig);
  }
}

// Create singleton instance
const timingConfig = new TimingConfig();

// Apply environment profile on initialization
timingConfig.applyEnvironmentProfile();

module.exports = timingConfig; 