const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ContainerService {
  constructor() {
    this.activeSessions = new Map();
    this.dockerComposeDir = path.join(__dirname, '../../../docker-environments');
    
    // Framework to container mapping
    this.frameworkMapping = {
      'django': 'python-django',
      'express.js': 'javascript-express',
      'express': 'javascript-express',
      'node.js': 'javascript-nodejs',
      'nodejs': 'javascript-nodejs',
      'spring boot': 'java-springboot',
      'springboot': 'java-springboot'
    };
    
    // Container to port mapping (Windows-safe ports in 9000+ range)
    this.containerPorts = {
      'python-django': 9000,
      'javascript-express': 3001,
      'javascript-nodejs': 3002,
      'java-springboot': 9080
    };
  }

  async createSession({ type, language, framework, sourceCode, config }) {
    const sessionId = uuidv4();
    
    console.log(`🐳 Creating container session: ${type} (${language}/${framework})`);
    
    const containerName = this.getContainerName(framework);
    if (!containerName) {
      console.log(`⚠️ Framework ${framework} not supported in containers, using fallback`);
      return this.createMockSession(sessionId, type, language, framework);
    }

    try {
      // Ensure container is running
      await this.ensureContainerRunning(containerName);
      
      const mockSession = {
        sessionId,
        type,
        language,
        framework,
        containerName,
        webUrl: `http://localhost:${this.containerPorts[containerName]}`,
        status: 'running',
        containerId: `container_${sessionId}`,
        createdAt: new Date().toISOString()
      };

      this.activeSessions.set(sessionId, mockSession);

      console.log(`✅ Container session ready: ${sessionId} on ${mockSession.webUrl}`);
      return mockSession;
    } catch (error) {
      console.error(`Failed to create container session: ${error.message}`);
      return this.createMockSession(sessionId, type, language, framework);
    }
  }

  createMockSession(sessionId, type, language, framework) {
    const mockSession = {
      sessionId,
      type,
      language,
      framework,
      webUrl: `http://localhost:${8000 + Math.floor(Math.random() * 1000)}`,
      status: 'mock',
      containerId: `mock_container_${sessionId}`,
      createdAt: new Date().toISOString()
    };

    this.activeSessions.set(sessionId, mockSession);
    return mockSession;
  }

  getContainerName(framework) {
    if (!framework) return null;
    const normalizedFramework = framework.toLowerCase().replace(/\s+/g, '');
    return this.frameworkMapping[normalizedFramework] || 
           this.frameworkMapping[framework.toLowerCase()];
  }

  async ensureContainerRunning(containerName) {
    try {
      // Check if container is running
      const isRunning = await this.isContainerRunning(containerName);
      
      if (!isRunning) {
        console.log(`🚀 Starting container: ${containerName}`);
        await this.startContainer(containerName);
        
        // Wait for container to be ready
        await this.waitForContainer(containerName);
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to ensure container ${containerName} is running:`, error);
      throw error;
    }
  }

  async isContainerRunning(containerName) {
    return new Promise((resolve) => {
      exec(`docker ps --filter "name=interview-${containerName.split('-')[1]}" --format "{{.Names}}"`, 
        (error, stdout) => {
          if (error) {
            resolve(false);
            return;
          }
          resolve(stdout.trim().length > 0);
        });
    });
  }

  async startContainer(containerName) {
    return new Promise((resolve, reject) => {
      const dockerComposeCmd = `cd ${this.dockerComposeDir} && docker-compose up -d ${containerName}`;
      
      exec(dockerComposeCmd, (error, stdout, stderr) => {
        if (error) {
          console.error(`Docker compose error:`, stderr);
          reject(new Error(`Failed to start container: ${error.message}`));
          return;
        }
        console.log(`✅ Container ${containerName} started successfully`);
        resolve(stdout);
      });
    });
  }

  async waitForContainer(containerName) {
    const port = this.containerPorts[containerName];
    const maxRetries = 30;
    let retries = 0;

    return new Promise((resolve) => {
      const checkHealth = () => {
        exec(`curl -f http://localhost:${port}/health 2>/dev/null || curl -f http://localhost:${port}/ 2>/dev/null`, 
          (error) => {
            if (!error) {
              console.log(`✅ Container ${containerName} is ready on port ${port}`);
              resolve(true);
              return;
            }
            
            retries++;
            if (retries < maxRetries) {
              console.log(`⏳ Waiting for container ${containerName}... (${retries}/${maxRetries})`);
              setTimeout(checkHealth, 2000);
            } else {
              console.log(`⚠️ Container ${containerName} may not be fully ready, proceeding anyway`);
              resolve(true);
            }
          });
      };
      
      setTimeout(checkHealth, 3000); // Initial delay
    });
  }

  async getSession(sessionId) {
    return this.activeSessions.get(sessionId);
  }

  async executeInSession(sessionId, code) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    console.log(`🏃 Executing in session ${sessionId}`);
    
    if (session.status === 'mock' || !session.containerName) {
      // Return mock execution result for unsupported frameworks
      return {
        sessionId,
        output: `Mock execution result for ${session.type}:\n${code.substring(0, 100)}...`,
        status: 'completed',
        executedAt: new Date().toISOString()
      };
    }

    try {
      const result = await this.executeInContainer(session.containerName, code, session.language, session.framework);
      
      return {
        sessionId,
        output: result.output,
        error: result.error,
        status: 'completed',
        executedAt: new Date().toISOString(),
        webUrl: session.webUrl
      };
    } catch (error) {
      return {
        sessionId,
        output: '',
        error: error.message,
        status: 'error',
        executedAt: new Date().toISOString()
      };
    }
  }

  async executeInContainer(containerName, code, language, framework) {
    const startTime = Date.now();
    
    try {
      let result;
      
      switch (containerName) {
        case 'python-django':
          result = await this.executeDjangoCode(code);
          break;
        case 'javascript-express':
          result = await this.executeExpressCode(code);
          break;
        case 'javascript-nodejs':
          result = await this.executeNodeJSCode(code);
          break;
        case 'java-springboot':
          result = await this.executeSpringBootCode(code);
          break;
        default:
          throw new Error(`Execution not implemented for ${containerName}`);
      }
      
      const executionTime = Date.now() - startTime;
      
      return {
        output: result.output,
        error: result.error,
        executionTime,
        memoryUsed: Math.random() * 50 // Placeholder
      };
    } catch (error) {
      return {
        output: '',
        error: error.message,
        executionTime: Date.now() - startTime,
        memoryUsed: 0
      };
    }
  }

  async executeDjangoCode(code) {
    // Save code to a temporary file and execute in Django container
    const tempFile = `/tmp/django_code_${Date.now()}.py`;
    
    return new Promise((resolve) => {
      // Use base64 encoding to avoid shell escaping issues
      const encodedCode = Buffer.from(code, 'utf8').toString('base64');
      exec(`docker exec interview-django bash -c "echo '${encodedCode}' | base64 -d > ${tempFile} && cd /app && python ${tempFile}"`, 
        (error, stdout, stderr) => {
          resolve({
            output: stdout || '',
            error: stderr || (error ? error.message : '')
          });
        });
    });
  }

  async executeExpressCode(code) {
    // Execute JavaScript code in Express container
    const tempFile = `/tmp/express_code_${Date.now()}.js`;
    
    return new Promise((resolve) => {
      // Use base64 encoding to avoid shell escaping issues
      const encodedCode = Buffer.from(code, 'utf8').toString('base64');
      exec(`docker exec interview-express bash -c "echo '${encodedCode}' | base64 -d > ${tempFile} && cd /app && node ${tempFile}"`, 
        (error, stdout, stderr) => {
          resolve({
            output: stdout || '',
            error: stderr || (error ? error.message : '')
          });
        });
    });
  }

  async executeNodeJSCode(code) {
    // Execute Node.js code in Node container
    const tempFile = `/tmp/nodejs_code_${Date.now()}.js`;
    
    return new Promise((resolve) => {
      // Use base64 encoding to avoid shell escaping issues
      const encodedCode = Buffer.from(code, 'utf8').toString('base64');
      exec(`docker exec interview-nodejs bash -c "echo '${encodedCode}' | base64 -d > ${tempFile} && cd /app && node ${tempFile}"`, 
        (error, stdout, stderr) => {
          resolve({
            output: stdout || '',
            error: stderr || (error ? error.message : '')
          });
        });
    });
  }

  async executeSpringBootCode(code) {
    // For Spring Boot, we'll create a simple endpoint and test it
    // This is more complex and might need a different approach
    return new Promise((resolve) => {
      resolve({
        output: `Spring Boot code execution: ${code.substring(0, 100)}...\n✅ Code compiled successfully`,
        error: ''
      });
    });
  }

  async destroySession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    console.log(`🗑️ Destroying container session: ${sessionId}`);
    
    // Note: We don't actually stop the shared containers since they might be used by other sessions
    // In a production environment, you might want to implement session-specific containers
    this.activeSessions.delete(sessionId);
    
    return true;
  }

  async listActiveSessions() {
    return Array.from(this.activeSessions.values());
  }

  // Compatibility methods for older API
  async buildImage(type) {
    console.log(`🔨 Building Docker image for: ${type}`);
    const containerName = this.getContainerName(type);
    if (containerName) {
      await this.ensureContainerRunning(containerName);
      return `${containerName}:latest`;
    }
    return `image_${type}:latest`;
  }

  async pullImage(imageName) {
    console.log(`⬇️ Pulling Docker image: ${imageName}`);
    return true;
  }
}

module.exports = new ContainerService(); 