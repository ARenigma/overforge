/**
 * Centralized Logging Configuration
 * Controls verbosity across the entire system
 */

require('dotenv').config();

class LoggingConfig {
  constructor() {
    // Core debugging flags
    this.debugValidation = this.parseBoolean(process.env.DEBUG_VALIDATION, false);
    this.debugAssessment = this.parseBoolean(process.env.DEBUG_ASSESSMENT, false);
    this.debugAI = this.parseBoolean(process.env.DEBUG_AI_REQUESTS, false);
    this.debugSockets = this.parseBoolean(process.env.DEBUG_SOCKETS, false);
    
    // Set environment variables if not already set
    if (!process.env.DEBUG_VALIDATION) {
      process.env.DEBUG_VALIDATION = this.debugValidation.toString();
    }
    if (!process.env.DEBUG_ASSESSMENT) {
      process.env.DEBUG_ASSESSMENT = this.debugAssessment.toString();
    }
    if (!process.env.DEBUG_AI_REQUESTS) {
      process.env.DEBUG_AI_REQUESTS = this.debugAI.toString();
    }
    if (!process.env.DEBUG_SOCKETS) {
      process.env.DEBUG_SOCKETS = this.debugSockets.toString();
    }
  }

  parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null) return defaultValue;
    const lowerValue = value.toString().toLowerCase();
    return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
  }

  isDebugEnabled(category) {
    switch (category) {
      case 'validation': return this.debugValidation;
      case 'assessment': return this.debugAssessment;
      case 'ai': return this.debugAI;
      case 'sockets': return this.debugSockets;
      default: return false;
    }
  }

  getLogLevel() {
    if (process.env.NODE_ENV === 'development') return 'debug';
    if (process.env.NODE_ENV === 'test') return 'warn';
    return 'info';
  }

  // Log level icons for better visibility
  getIcons() {
    return {
      'validation': '🔍',
      'assessment': '📊',
      'ai': '🤖',
      'sockets': '📡',
      'system': '⚙️',
      'error': '❌',
      'success': '✅',
      'warning': '⚠️'
    };
  }

  // Logging helper methods
  debug(category, message) {
    if (this.isDebugEnabled(category)) {
      const icon = this.getIcons()[category] || '🔧';
      console.log(`${icon} [DEBUG:${category.toUpperCase()}] ${message}`);
    }
  }

  info(category, message) {
    const icon = this.getIcons()[category] || 'ℹ️';
    console.log(`${icon} [INFO:${category.toUpperCase()}] ${message}`);
  }

  success(category, message) {
    const icon = this.getIcons()['success'];
    console.log(`${icon} [SUCCESS:${category.toUpperCase()}] ${message}`);
  }

  warning(category, message) {
    const icon = this.getIcons()['warning'];
    console.warn(`${icon} [WARNING:${category.toUpperCase()}] ${message}`);
  }

  error(category, message, error = null) {
    const icon = this.getIcons()['error'];
    console.error(`${icon} [ERROR:${category.toUpperCase()}] ${message}`);
    if (error && this.isDebugEnabled(category)) {
      console.error('Stack trace:', error);
    }
  }

  // Assessment-specific logging
  assessmentInitialized(sessionId, jobProfile) {
    this.success('assessment', `Assessment session ${sessionId} initialized with job profile: ${jobProfile}`);
  }

  assessmentError(sessionId, error) {
    this.error('assessment', `Assessment error in session ${sessionId}: ${error}`);
  }

  // AI-specific logging
  aiRequestSent(endpoint, params) {
    this.debug('ai', `AI request sent to ${endpoint}: ${JSON.stringify(params)}`);
  }

  aiResponseReceived(endpoint, responseType) {
    this.debug('ai', `AI response received from ${endpoint}: ${responseType}`);
  }

  // Socket-specific logging
  socketConnected(socketId) {
    this.debug('sockets', `Socket connected: ${socketId}`);
  }

  socketDisconnected(socketId) {
    this.debug('sockets', `Socket disconnected: ${socketId}`);
  }

  // Configuration summary
  getConfigSummary() {
    return {
      environment: process.env.NODE_ENV || 'development',
      logLevel: this.getLogLevel(),
      debugging: {
        validation: this.debugValidation,
        assessment: this.debugAssessment,
        ai: this.debugAI,
        sockets: this.debugSockets
      }
    };
  }
}

module.exports = new LoggingConfig();