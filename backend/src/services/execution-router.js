const judge0Service = require('./judge0Service');
const containerService = require('./containerService');
const productionContainerService = require('./productionContainerService'); // To be implemented

class ExecutionRouter {
  constructor() {
    this.problemTypeMapping = {
      // Core language execution (adaptive containers)
      'python-core': 'container',
      'javascript-core': 'container',
      'java-core': 'container',
      
      // Lightweight execution for simple algorithms (Judge0)
      'algorithm': 'judge0',
      'data-structure': 'judge0', 
      'coding-challenge': 'judge0',
      'basic-python': 'judge0',
      'basic-javascript': 'judge0',
      
      // Framework-based execution (adaptive containers)
      'django-model': 'container',
      'django-view': 'container',
      'express-api': 'container',
      'node-api': 'container',
      'spring-boot': 'container',
      'fullstack': 'container',
      'database-query': 'container'
    };
    
    // Core language framework mapping
    this.coreLanguageMapping = {
      'python': 'python-core',
      'javascript': 'javascript-core', 
      'java': 'java-core'
    };
  }

  async executeCode({ problemType, language, sourceCode, stdin, framework, config = {} }) {
    const executionType = this.getExecutionType(problemType, language, framework);
    
    console.log(`🎯 Routing execution: ${problemType} -> ${executionType}`);
    
    try {
      if (executionType === 'judge0') {
        return await this.executeWithJudge0({ sourceCode, language, stdin });
      } else {
        // Use production container service if in production or explicitly requested
        const useProduction = config.production || process.env.NODE_ENV === 'production';
        
        if (useProduction) {
          return await this.executeWithProductionContainer({ 
            problemType, 
            language, 
            sourceCode, 
            framework, 
            config 
          });
        } else {
          return await this.executeWithContainer({ problemType, language, sourceCode, framework });
        }
      }
    } catch (error) {
      console.error(`Primary execution failed: ${error.message}`);
      
      // Enhanced fallback strategy
      if (executionType === 'container') {
        console.log('🔄 Container execution failed, trying alternatives...');
        
        // Try the other container service
        const useProduction = config.production || process.env.NODE_ENV === 'production';
        try {
          if (useProduction) {
            console.log('🔄 Trying basic container service...');
            return await this.executeWithContainer({ problemType, language, sourceCode, framework });
          } else {
            console.log('🔄 Trying production container service...');
            return await this.executeWithProductionContainer({ 
              problemType, 
              language, 
              sourceCode, 
              framework, 
              config 
            });
          }
        } catch (fallbackError) {
          console.log('🔄 Container fallback failed, using Judge0...');
          return await this.executeWithJudge0({ sourceCode, language, stdin });
        }
      } else {
        // If Judge0 fails, try container as fallback
        console.log('🔄 Judge0 failed, trying container fallback...');
        return await this.executeWithContainer({ 
          problemType: 'basic-' + language.toLowerCase(), 
          language, 
          sourceCode, 
          framework: framework || 'basic' 
        });
      }
    }
  }

  getExecutionType(problemType, language, framework) {
    // Direct mapping from problem type
    if (this.problemTypeMapping[problemType]) {
      return this.problemTypeMapping[problemType];
    }
    
    // Framework-based routing
    if (framework && ['django', 'express', 'spring-boot', 'react', 'vue', 'rails'].includes(framework)) {
      return 'container';
    }
    
    // Core language routing (when no framework specified or framework is "core")
    if (!framework || framework === 'core' || framework.endsWith('-core')) {
      if (this.coreLanguageMapping[language.toLowerCase()]) {
        return 'container';
      }
    }
    
    // Default to Judge0 for simple algorithm execution
    return 'judge0';
  }

  async executeWithJudge0({ sourceCode, language, stdin }) {
    try {
      // Use existing Judge0 service
      const languageMap = {
        'python': 71,
        'javascript': 63,
        'java': 62,
        'cpp': 54,
        // ... existing mappings
      };

      const languageId = languageMap[language.toLowerCase()];
      if (!languageId) {
        throw new Error(`Unsupported language for Judge0: ${language}`);
      }

      const submission = await judge0Service.submitCode({
        source_code: sourceCode,
        language_id: languageId,
        stdin: stdin || ''
      });

      return {
        type: 'judge0',
        token: submission.token,
        status: 'submitted'
      };
    } catch (error) {
      console.error('Judge0 execution failed:', error);
      throw error;
    }
  }

  async executeWithContainer({ problemType, language, sourceCode, framework }) {
    try {
      // Route to container service (to be implemented)
      const containerConfig = this.getContainerConfig(problemType, language, framework);
      
      const result = await containerService.createSession({
        type: problemType,
        language,
        framework,
        sourceCode,
        config: containerConfig
      });

      return {
        type: 'container',
        sessionId: result.sessionId,
        webUrl: result.webUrl,
        status: 'running'
      };
    } catch (error) {
      console.error('Container execution failed:', error);
      throw error;
    }
  }

  async executeWithProductionContainer({ problemType, language, sourceCode, framework, config }) {
    try {
      console.log(`🚀 Using production container for ${problemType} (${language}/${framework})`);
      
      // Create session-specific container with resource limits
      const result = await productionContainerService.createSession({
        sessionId: config.sessionId,
        type: problemType,
        language,
        framework,
        sourceCode,
        config: {
          ...config,
          resourceLimits: this.getResourceLimits(problemType, language, framework)
        }
      });

      // If immediate execution is requested, execute the code
      if (config.execute !== false) {
        const execution = await productionContainerService.executeInSession(
          result.sessionId, 
          sourceCode
        );
        
        return {
          type: 'production-container',
          sessionId: result.sessionId,
          webUrl: result.webUrl,
          status: 'completed',
          output: execution.output,
          error: execution.error,
          executionTime: execution.executionTime,
          resourceLimits: result.resourceLimits
        };
      }

      return {
        type: 'production-container',
        sessionId: result.sessionId,
        webUrl: result.webUrl,
        status: 'ready',
        resourceLimits: result.resourceLimits
      };
    } catch (error) {
      console.error('Production container execution failed:', error);
      throw error;
    }
  }

  getContainerConfig(problemType, language, framework) {
    const configs = {
      'django-model': {
        image: 'codeinterview/django:5.0',
        ports: [8000],
        volumes: ['/workspace:/app'],
        environment: {
          DJANGO_SETTINGS_MODULE: 'interview.settings'
        },
        presetFiles: {
          'models.py': '# Django model implementation here',
          'tests.py': '# Test cases for your model'
        }
      },
      'react-component': {
        image: 'codeinterview/react:18.2',
        ports: [3000],
        volumes: ['/workspace:/app'],
        presetFiles: {
          'Component.jsx': '// React component implementation',
          'Component.test.js': '// Component tests'
        }
      }
    };

    return configs[problemType] || configs['default'];
  }

  getResourceLimits(problemType, language, framework) {
    // Define resource limits based on problem type and language
    const resourceConfigs = {
      'algorithm': { cpus: '0.5', memory: '128m', timeout: 15000 },
      'django-model': { cpus: '1.0', memory: '512m', timeout: 30000 },
      'django-view': { cpus: '1.0', memory: '512m', timeout: 30000 },
      'react-component': { cpus: '0.75', memory: '256m', timeout: 20000 },
      'node-api': { cpus: '0.75', memory: '256m', timeout: 20000 },
      'fullstack': { cpus: '1.5', memory: '768m', timeout: 45000 },
      'database-query': { cpus: '1.0', memory: '512m', timeout: 30000 }
    };

    // Language-specific adjustments
    const languageMultipliers = {
      'java': { cpus: 1.5, memory: 1.5 },
      'python': { cpus: 1.0, memory: 1.2 },
      'javascript': { cpus: 0.8, memory: 0.9 },
      'cpp': { cpus: 0.7, memory: 0.8 }
    };

    const baseConfig = resourceConfigs[problemType] || resourceConfigs['algorithm'];
    const multiplier = languageMultipliers[language.toLowerCase()] || { cpus: 1.0, memory: 1.0 };

    return {
      cpus: (parseFloat(baseConfig.cpus) * multiplier.cpus).toFixed(2),
      memory: Math.round(parseInt(baseConfig.memory) * multiplier.memory) + 'm',
      timeout: baseConfig.timeout
    };
  }

  // Session management methods
  async getSessionStatus(sessionId) {
    try {
      const session = await productionContainerService.getSession(sessionId);
      return session ? {
        sessionId: session.sessionId,
        status: session.status,
        framework: session.framework,
        webUrl: session.webUrl,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity
      } : null;
    } catch (error) {
      console.error('Failed to get session status:', error);
      return null;
    }
  }

  async destroySession(sessionId) {
    try {
      return await productionContainerService.destroySession(sessionId);
    } catch (error) {
      console.error('Failed to destroy session:', error);
      return false;
    }
  }

  async listActiveSessions() {
    try {
      return await productionContainerService.listActiveSessions();
    } catch (error) {
      console.error('Failed to list sessions:', error);
      return [];
    }
  }
}

module.exports = new ExecutionRouter(); 
module.exports = new ExecutionRouter(); 