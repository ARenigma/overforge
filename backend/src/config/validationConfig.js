/**
 * Validation Configuration
 * Centralized configuration for all validation features
 */

require('dotenv').config();

class ValidationConfig {
  constructor() {
    // Core validation settings
    this.enableChampionValidation = true;
    
    // Code validation thresholds
    this.minCodeLength = 10; // Minimum code length to validate
    this.securityThreshold = 0.7; // Security score threshold (0-1)
    this.contextThreshold = 0.5; // Context relevance threshold (0-1)
  }

  /**
   * Load configuration from environment or config object
   */
  loadConfig(config = {}) {
    // Environment variable overrides
    if (process.env.ENABLE_CHAMPION_VALIDATION !== undefined) {
      this.enableChampionValidation = process.env.ENABLE_CHAMPION_VALIDATION === 'true';
    }

    if (process.env.MIN_CODE_LENGTH !== undefined) {
      this.minCodeLength = parseInt(process.env.MIN_CODE_LENGTH) || 10;
    }

    // Config object overrides
    if (config.enableChampionValidation !== undefined) {
      this.enableChampionValidation = config.enableChampionValidation;
    }

    if (config.minCodeLength !== undefined) {
      this.minCodeLength = config.minCodeLength;
  }

    // Log warning for disabled validation
    if (!this.enableChampionValidation) {
      console.warn('⚠️  Champion validation is disabled - code quality checks may be limited');
    }
  }

  /**
   * Check if champion validation is enabled
   */
  isChampionValidationEnabled() {
    return this.enableChampionValidation;
  }

  /**
   * Check if code validation is enabled (for compatibility)
   */
  isCodeValidationEnabled() {
    return true; // Basic validation is always enabled
  }

  /**
   * Get enabled features list
   */
  getEnabledFeatures() {
    const features = ['Basic-Validation'];
    if (this.enableChampionValidation) features.push('Champion-Validation');
    return features;
  }

  /**
   * Get validation thresholds
   */
  getThresholds() {
    return {
      minCodeLength: this.minCodeLength,
      securityThreshold: this.securityThreshold,
      contextThreshold: this.contextThreshold
    };
  }

  /**
   * Environment-specific config
   */
  applyEnvironmentConfig() {
    const env = process.env.NODE_ENV || 'development';
    
    switch (env) {
      case 'development':
        // More lenient in development
        this.securityThreshold = 0.5;
        this.contextThreshold = 0.3;
        break;
      case 'test':
        // Very permissive for testing
        this.securityThreshold = 0.3;
        this.contextThreshold = 0.2;
        break;
      case 'production':
        // Strict in production
        this.securityThreshold = 0.8;
        this.contextThreshold = 0.6;
        break;
    }
  }

  /**
   * Get current configuration summary
   */
  getConfigSummary() {
    return {
      environment: process.env.NODE_ENV || 'development',
      championValidation: this.enableChampionValidation,
      thresholds: this.getThresholds(),
      enabledFeatures: this.getEnabledFeatures()
    };
  }
}

module.exports = new ValidationConfig();