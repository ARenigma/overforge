const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const templateGeneratorService = require('./templateGeneratorService');

class ProductionContainerService {
  constructor() {
    this.activeSessions = new Map();
    this.dockerComposeDir = path.join(__dirname, '../../docker-environments');
    
    // Framework to base image mapping
    this.frameworkMapping = {
      // Framework-based containers
      'django': 'python-django',
      'express.js': 'javascript-express',
      'express': 'javascript-express',
      'node.js': 'javascript-nodejs',
      'nodejs': 'javascript-nodejs',
      'spring boot': 'java-springboot',
      'springboot': 'java-springboot',
      
      // Core language containers
      'python-core': 'python-core',
      'javascript-core': 'javascript-core', 
      'java-core': 'java-core',
      'python': 'python-core',     // Map core Python to python-core
      'javascript': 'javascript-core', // Map core JavaScript to javascript-core  
      'java': 'java-core'          // Map core Java to java-core
    };
    
    // Resource limits per framework type
    this.resourceLimits = {
      // Framework containers
      'python-django': {
        cpus: '1.0',
        memory: '512m',
        timeout: 30000 // 30 seconds
      },
      'javascript-express': {
        cpus: '0.75',
        memory: '256m',
        timeout: 20000 // 20 seconds
      },
      'javascript-nodejs': {
        cpus: '0.75',
        memory: '256m',
        timeout: 20000 // 20 seconds
      },
      'java-springboot': {
        cpus: '1.5',
        memory: '768m',
        timeout: 45000 // 45 seconds
      },
      
      // Core language containers
      'python-core': {
        cpus: '0.75',
        memory: '256m',
        timeout: 25000 // 25 seconds
      },
      'javascript-core': {
        cpus: '0.5',
        memory: '192m',
        timeout: 15000 // 15 seconds
      },
      'java-core': {
        cpus: '1.0',
        memory: '512m',
        timeout: 30000 // 30 seconds
      }
    };

    // Port range for session-specific containers
    this.portRange = { start: 9000, end: 9999 };
    this.usedPorts = new Set();

    // Cleanup interval (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 5 * 60 * 1000);
  }

  async createSession({ sessionId, type, language, framework, sourceCode, config = {} }) {
    const uniqueSessionId = sessionId || uuidv4();
    
    console.log(`🐳 Creating production container session: ${uniqueSessionId} (${language}/${framework})`);
    
    const containerName = this.getContainerName(framework);
    if (!containerName) {
      console.log(`⚠️ Framework ${framework} not supported in containers, using fallback`);
      return this.createMockSession(uniqueSessionId, type, language, framework);
    }

    try {
      // 🎯 SMART TEMPLATE DEPLOYMENT
      await this.deployQuestionTemplate(framework, config.questionTitle || 'default', uniqueSessionId);
      
      // Instead of creating new containers, use existing shared containers
      console.log(`🔗 Using existing shared container: ${containerName}`);
      
      // Check if the shared container is running
      const isRunning = await this.isContainerRunning(containerName);
      
      if (!isRunning) {
        throw new Error(`Shared container ${containerName} is not running`);
      }

      // Get the port for the shared container
      const sharedPort = this.getSharedContainerPort(containerName);
      
      const session = {
        sessionId: uniqueSessionId,
        type,
        language,
        framework,
        containerName: `interview-${containerName}`,
        containerId: `shared-${containerName}`,
        webUrl: `http://localhost:${sharedPort}`,
        status: 'running',
        createdAt: new Date(),
        lastActivity: new Date(),
        port: sharedPort,
        isShared: true, // Flag to indicate this is using shared container
        templateType: config.questionTitle || 'default'
      };

      this.activeSessions.set(uniqueSessionId, session);

      console.log(`✅ Session ready using shared container: ${uniqueSessionId} on port ${sharedPort}`);
      return session;
    } catch (error) {
      console.error(`Failed to create session container: ${error.message}`);
      return this.createMockSession(uniqueSessionId, type, language, framework);
    }
  }

  // Helper method to check if container is running
  async isContainerRunning(containerName) {
    const fullContainerName = `interview-${containerName}`;
    return new Promise((resolve) => {
      exec(`docker ps --filter "name=${fullContainerName}" --format "{{.Names}}"`, (error, stdout) => {
        if (error) {
          resolve(false);
        } else {
          resolve(stdout.trim().includes(fullContainerName));
        }
      });
    });
  }

  // Get port for shared containers (Windows-safe ports in 9000+ range)
  getSharedContainerPort(baseImage) {
    const portMap = {
      // Framework containers
      'python-django': 9000,
      'javascript-express': 3001,
      'javascript-nodejs': 3002,
      'java-springboot': 9080,
      
      // Core language containers
      'python-core': 9003,
      'javascript-core': 3003,
      'java-core': 9004
    };
    return portMap[baseImage] || 9000;
  }

  // 🎯 Smart Template Deployment
  async deployQuestionTemplate(framework, questionTitle, sessionId) {
    console.log(`🎨 Deploying template for question: "${questionTitle}" (${framework})`);
    
    try {
      // Initialize templates if not done yet
      await templateGeneratorService.initializeTemplates();
      
      // Get the appropriate template type for this question
      const templateType = await templateGeneratorService.getQuestionTemplate(questionTitle, framework);
      
      if (templateType) {
        const containerName = this.getContainerName(framework);
        console.log(`📋 Using template: ${templateType} for ${containerName}`);
        
        // Deploy template to workspace
        await templateGeneratorService.deployTemplate(templateType, containerName);
        
        // For Django, also update the main project's URL configuration
        if (containerName === 'python-django') {
          await this.updateDjangoMainUrls(containerName);
        }
        
        console.log(`✅ Template deployed successfully: ${templateType}`);
      } else {
        console.log(`📝 No specific template found for "${questionTitle}", using base setup`);
      }
    } catch (error) {
      console.error(`❌ Error deploying template: ${error.message}`);
      // Don't fail the session creation if template deployment fails
    }
  }

  async updateDjangoMainUrls(containerName) {
    const workspaceDir = path.join(this.dockerComposeDir, 'workspace', containerName);
    const mainUrlsPath = path.join(workspaceDir, 'interview_project', 'urls.py');
    
    const mainUrlsContent = `from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('interview_app.urls')),  # Include app URLs
]
`;

    try {
      await fs.writeFile(mainUrlsPath, mainUrlsContent);
      console.log(`✅ Updated Django main URLs to include app routes`);
    } catch (error) {
      console.error(`Error updating Django URLs: ${error.message}`);
    }
  }

  async createSessionContainer({ sessionId, baseImage, port, limits, framework, sourceCode }) {
    const containerName = `interview-${baseImage}-${sessionId.substring(0, 8)}`;
    const imageName = `docker-environments-${baseImage}`;
    
    // Create Docker run command with resource limits and security options
    const dockerRunCmd = [
      'docker', 'run', '-d',
      '--name', containerName,
      '--cpus', limits.cpus,
      '--memory', limits.memory,
      '--memory-swap', limits.memory, // Disable swap
      '--pids-limit', '100', // Limit number of processes
      '--ulimit', 'nofile=1024:1024', // Limit file descriptors
      '--ulimit', 'nproc=64:64', // Limit processes
      '--security-opt', 'no-new-privileges:true',
      '--read-only=false', // Allow writes to specific directories
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=100m',
      '--network', 'docker-environments_interview-network',
      '-p', `${port}:${this.getInternalPort(baseImage)}`,
      '-e', `SESSION_ID=${sessionId}`,
      '-e', `FRAMEWORK=${framework}`,
      '--restart', 'no', // Don't restart automatically
      imageName
    ].join(' ');

    return new Promise((resolve, reject) => {
      exec(dockerRunCmd, (error, stdout, stderr) => {
        if (error) {
          console.error(`Failed to create session container: ${stderr}`);
          reject(new Error(`Container creation failed: ${error.message}`));
          return;
        }
        
        const containerId = stdout.trim();
        console.log(`✅ Session container created: ${containerName} (${containerId})`);
        
        resolve({
          containerName,
          containerId
        });
      });
    });
  }

  getInternalPort(baseImage) {
    const portMap = {
      'python-django': 8000,
      'javascript-express': 3000,
      'javascript-nodejs': 3000,
      'java-springboot': 8080
    };
    return portMap[baseImage] || 3000;
  }

  async allocatePort() {
    for (let port = this.portRange.start; port <= this.portRange.end; port++) {
      if (!this.usedPorts.has(port)) {
        // Check if port is actually available
        const isAvailable = await this.isPortAvailable(port);
        if (isAvailable) {
          this.usedPorts.add(port);
          return port;
        }
      }
    }
    throw new Error('No available ports for new session');
  }

  async isPortAvailable(port) {
    return new Promise((resolve) => {
      exec(`lsof -i :${port}`, (error) => {
        // If lsof returns error, port is likely available
        resolve(!!error);
      });
    });
  }

  releasePort(port) {
    this.usedPorts.delete(port);
  }

  getContainerName(framework) {
    if (!framework) return null;
    const normalizedFramework = framework.toLowerCase().replace(/\s+/g, '');
    return this.frameworkMapping[normalizedFramework] || 
           this.frameworkMapping[framework.toLowerCase()];
  }

  async getSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }

  async executeInSession(sessionId, code) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found for ID: ${sessionId}`);
    }
  
    session.lastActivity = new Date();
    console.log(`📝 Writing code to session ${sessionId} for framework ${session.framework}`);
  
    const workspaceDir = path.join(this.dockerComposeDir, 'workspace', this.getContainerName(session.framework));
    const targetFile = this.getTargetFilePath(session.framework, session.language);
  
    if (!targetFile) {
      throw new Error(`Framework ${session.framework} does not have a configured file path for live updates.`);
    }
  
    const fullPath = path.join(workspaceDir, targetFile);
  
    try {
      await fs.writeFile(fullPath, code, 'utf8');
      console.log(`✅ Code written to ${fullPath}`);
  
      // The hot-reloader in the container will handle the rest.
      // This function now returns a success message instead of command output.
      return {
        sessionId,
        output: `Code successfully updated in ${targetFile}. Preview should refresh.`,
        status: 'completed',
        executedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error(`❌ Failed to write file for session ${sessionId}:`, error);
      throw new Error(`Failed to write code to file: ${error.message}`);
    }
  }

  getTargetFilePath(framework, language) {
    const baseDir = 'src/main/java/com/overforge/interview';
    
    // Core Java has a simple, flat structure
    if (framework.toLowerCase().includes('java')) {
      return 'src/main/java/Main.java';
    }
    
    // Frameworks have nested structures
    switch (framework) {
      case 'spring boot':
      case 'springboot':
        return path.join(baseDir, 'controller', 'MainController.java');
      case 'django':
        // For Django, the target is a view file
        return path.join('interview_app', 'views.py');
      case 'express':
      case 'express.js':
      case 'node.js':
      case 'nodejs':
        // For Node-based frameworks, the main file is usually at the root
        return 'app.js';
      default:
        // Default for other languages
        return 'app.js'; 
    }
  }

  async executeInContainer(containerId, code, language, framework) {
    console.warn('DEPRECATED: executeInContainer is being phased out in favor of file-based live reloading for web frameworks.');
    const startTime = Date.now();
    
    try {
      let result;
      const containerName = this.getContainerName(framework);
      
      // For shared containers, use the actual container name.
      // The `containerName` is the base name (e.g., 'python-django'),
      // and we prepend 'interview-' to match the docker-compose setup.
      const actualContainerName = containerId.startsWith('shared-')
        ? `interview-${containerName}`
        : containerId;
      
      console.log(`🎯 Executing in container: ${actualContainerName}`);
      
      switch (containerName) {
        case 'python-django':
          result = await this.executeDjangoCode(actualContainerName, code);
          break;
        case 'javascript-express':
          result = await this.executeExpressCode(actualContainerName, code);
          break;
        case 'javascript-nodejs':
          result = await this.executeNodeJSCode(actualContainerName, code);
          break;
        case 'java-springboot':
          result = await this.executeSpringBootCode(actualContainerName, code);
          break;
        case 'python-core':
          result = await this.executePythonCoreCode(actualContainerName, code);
          break;
        case 'javascript-core':
          result = await this.executeJavaScriptCoreCode(actualContainerName, code);
          break;
        case 'java-core':
          result = await this.executeJavaCoreCode(actualContainerName, code);
          break;
        default:
          throw new Error(`Execution not implemented for ${containerName}`);
      }
      
      const executionTime = Date.now() - startTime;
      
      // Pass the full result from the specific execution method
      return {
        ...result,
        executionTime
      };
    } catch (error) {
      return {
        output: '',
        error: error.message,
        executionTime: Date.now() - startTime,
        success: false
      };
    }
  }

  async executeDjangoCode(containerName, code) {
    // 🎯 WRITE USER CODE TO WORKSPACE (for live-reloading with templates)
    const targetFile = '/app/interview_app/models.py';  // Write to the proper Django app structure
    
    // Prepare Django model code with app_label
    let processedCode = code;
    if (code.includes('class ') && code.includes('models.Model')) {
      const lines = code.split('\n');
      const modifiedLines = [];
      let inClass = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        modifiedLines.push(line);
        
        if (line.trim().startsWith('class ') && line.includes('models.Model')) {
          inClass = true;
          // Look ahead to see if Meta class already exists
          let hasMetaClass = false;
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim().startsWith('class Meta:')) {
              hasMetaClass = true;
              break;
            }
            if (lines[j].trim().startsWith('class ') && j > i + 1) {
              break; // Found another class, stop looking
            }
          }
          
          if (!hasMetaClass) {
            // Add Meta class after the class definition
            modifiedLines.push('    class Meta:');
            modifiedLines.push('        app_label = "interview_app"');
            modifiedLines.push('');
          }
        }
      }
      processedCode = modifiedLines.join('\n');
    }

    // Base64 encode to handle special characters
    const encodedCode = Buffer.from(processedCode, 'utf8').toString('base64');

    // Command to write the new model file
    const writeCmd = `echo '${encodedCode}' | base64 -d > ${targetFile}`;
    
    // Commands to create and apply database migrations
    const makemigrationsCmd = 'python manage.py makemigrations interview_app';
    const migrateCmd = 'python manage.py migrate';

    // Command to trigger the Django development server's reloader
    const reloadCmd = `touch /app/interview_project/wsgi.py`;
    
    // Execute all commands in sequence
    const fullCmd = `${writeCmd} && ${makemigrationsCmd} && ${migrateCmd} && ${reloadCmd}`;

    return new Promise((resolve) => {
      exec(`docker exec ${containerName} sh -c "${fullCmd}"`, { timeout: 20000 }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            output: '',
            error: `Failed to write code: ${error.message}`
          });
        } else {
          resolve({
            output: `✅ Model code written to ${targetFile}. Check the preview panel to see your Django model in action!`,
            error: stderr || ''
          });
        }
      });
    });
  }

  async executeExpressCode(sessionId, userCode, language) {
    try {
      console.log(`🚀 Adaptive Express execution started for session ${sessionId}`);
      
      const containerName = 'javascript-express';
      const workspacePath = `/Users/amit.ranjan/overforge/backend/docker-environments/workspace/${containerName}`;
      
      // Ensure workspace exists
      await fs.mkdir(workspacePath, { recursive: true });
      
      // Write user code to models.js for adaptive system to analyze
      const modelsPath = path.join(workspacePath, 'models.js');
      await fs.writeFile(modelsPath, userCode);
      console.log(`📝 User code written to: ${modelsPath}`);
      
      // Install dependencies
      console.log('📦 Installing Express dependencies...');
      const installResult = await this.executeCommand(containerName, 'cd /app && npm install', 30000);
      
      if (installResult.exitCode !== 0) {
        console.warn('⚠️ npm install had issues:', installResult.stderr);
      }
      
      // Start adaptive Express server
      console.log('🚀 Starting adaptive Express server...');
      const startCommand = 'cd /app && npm start';
      
      // Kill any existing server process
      await this.executeCommand(containerName, 'pkill -f "node adaptive-app.js" || pkill -f "node app.js" || true', 5000);
      
      // Start server in background
      const serverProcess = this.executeCommand(containerName, startCommand, 60000, true);
      
      // Wait for adaptive server to start and analyze user code
      await this.delay(5000);
      
      // Test adaptive server and get analysis
      const testResult = await this.executeCommand(containerName, 'curl -s http://localhost:3001/ || echo "Server not ready"', 10000);
      
      let serverStatus = 'Starting...';
      let analysisInfo = null;
      
      if (testResult.stdout && !testResult.stdout.includes('Server not ready')) {
        try {
          analysisInfo = JSON.parse(testResult.stdout);
          serverStatus = `Running - ${analysisInfo.analysis?.models?.length || 0} models detected`;
        } catch (e) {
          serverStatus = 'Running - Analysis pending';
        }
      }
      
      return {
        success: true,
        output: `🚀 Adaptive Express.js Server Status: ${serverStatus}

📊 Code Analysis Results:
${analysisInfo?.analysis ? `
🎯 Detected Models: ${analysisInfo.analysis.models?.length || 0}
🛣️  User Routes: ${analysisInfo.analysis.routes?.length || 0} 
🔧 Middleware: ${analysisInfo.analysis.middleware?.length || 0}
📡 Auto-Generated Endpoints: ${analysisInfo.endpoints?.length || 0}
⚙️  Code Structure: ${analysisInfo.analysis.structure?.hasExpress ? 'Express detected' : 'Pure JavaScript'}
🌐 Web Interface: http://localhost:3001

📋 Available Endpoints:
${analysisInfo.endpoints?.slice(0, 8).map(ep => `   ${ep.method} ${ep.path} - ${ep.description}`).join('\n') || '   Loading...'}

📖 Full Documentation: http://localhost:3001/api/docs
🔍 Code Analysis: http://localhost:3001/api/analysis
💚 Health Check: http://localhost:3001/health
🔄 Reload Code: POST http://localhost:3001/api/reload
` : `
⏳ Adaptive server is starting up...
🌐 Access at: http://localhost:3001
📋 The system will automatically analyze your code structure
🔄 Refresh in a few seconds to see analysis results
`}

💡 Adaptive Features:
• Automatically detects your code patterns and models
• Generates CRUD APIs for any detected classes/objects  
• Creates documentation based on your code structure
• Adapts to different coding styles and frameworks
• Live code reloading with analysis updates`,
        executionTime: Date.now(),
        language: 'express',
        framework: 'adaptive-express',
        analysisInfo: analysisInfo
      };
      
    } catch (error) {
      console.error('❌ Adaptive Express execution failed:', error);
      return {
        success: false,
        output: `❌ Adaptive Express execution failed: ${error.message}`,
        error: error.message,
        executionTime: Date.now(),
        language: 'express'
      };
    }
  }

  async executeNodeJSCode(sessionId, userCode, language) {
    try {
      console.log(`🚀 Adaptive Node.js execution started for session ${sessionId}`);
      
      const containerName = 'javascript-nodejs';
      const workspacePath = `/Users/amit.ranjan/overforge/backend/docker-environments/workspace/${containerName}`;
      
      // Ensure workspace exists
      await fs.mkdir(workspacePath, { recursive: true });
      
      // Write user code to app.js for adaptive system to analyze
      const appPath = path.join(workspacePath, 'app.js');
      await fs.writeFile(appPath, userCode);
      console.log(`📝 User code written to: ${appPath}`);
      
      // Install dependencies (minimal for Node.js)
      console.log('📦 Installing Node.js dependencies...');
      const installResult = await this.executeCommand(containerName, 'cd /app && npm install', 30000);
      
      if (installResult.exitCode !== 0) {
        console.warn('⚠️ npm install had issues:', installResult.stderr);
      }
      
      // Start adaptive Node.js server
      console.log('🚀 Starting adaptive Node.js server...');
      const startCommand = 'cd /app && npm start';
      
      // Kill any existing server process
      await this.executeCommand(containerName, 'pkill -f "node adaptive-app.js" || pkill -f "node app.js" || true', 5000);
      
      // Start server in background
      const serverProcess = this.executeCommand(containerName, startCommand, 60000, true);
      
      // Wait for adaptive server to start and analyze user code
      await this.delay(5000);
      
      // Test adaptive server and get analysis
      const testResult = await this.executeCommand(containerName, 'curl -s http://localhost:3002/ || echo "Server not ready"', 10000);
      
      let serverStatus = 'Starting...';
      let analysisInfo = null;
      
      if (testResult.stdout && !testResult.stdout.includes('Server not ready')) {
        try {
          analysisInfo = JSON.parse(testResult.stdout);
          serverStatus = `Running - ${analysisInfo.analysis?.functions?.length || 0} functions, ${analysisInfo.analysis?.classes?.length || 0} classes detected`;
        } catch (e) {
          serverStatus = 'Running - Analysis pending';
        }
      }
      
      return {
        success: true,
        output: `🚀 Adaptive Node.js Server Status: ${serverStatus}

📊 Code Analysis Results:
${analysisInfo?.analysis ? `
🔧 Detected Functions: ${analysisInfo.analysis.functions?.length || 0}
🎯 Detected Classes: ${analysisInfo.analysis.classes?.length || 0}
📦 Detected Modules: ${analysisInfo.analysis.modules?.length || 0}
🛠️  APIs Found: ${analysisInfo.analysis.apis?.length || 0}
📡 Auto-Generated Endpoints: ${analysisInfo.endpoints?.length || 0}
⚙️  Code Features: ${analysisInfo.analysis.structure?.hasHTTP ? 'HTTP detected' : 'Pure Node.js'} | ${analysisInfo.analysis.structure?.hasAsync ? 'Async' : 'Sync'} | ${analysisInfo.analysis.structure?.moduleType || 'CommonJS'}
🌐 Web Interface: http://localhost:3002

📋 Available Endpoints:
${analysisInfo.endpoints?.slice(0, 8).map(ep => `   ${ep.method} ${ep.path} - ${ep.description}`).join('\n') || '   Loading...'}

📖 Full Documentation: http://localhost:3002/api/docs
🔍 Code Analysis: http://localhost:3002/api/analysis
🔧 Functions API: http://localhost:3002/api/functions
🎯 Classes API: http://localhost:3002/api/classes
💚 Health Check: http://localhost:3002/health
🔄 Reload Code: POST http://localhost:3002/api/reload
` : `
⏳ Adaptive server is starting up...
🌐 Access at: http://localhost:3002
📋 The system will automatically analyze your Node.js code
🔄 Refresh in a few seconds to see analysis results
`}

💡 Adaptive Features:
• Automatically detects functions, classes, and modules
• Creates HTTP endpoints for your functions and classes
• Analyzes code complexity and structure
• Supports both ES6 and CommonJS modules
• Live code analysis and documentation generation`,
        executionTime: Date.now(),
        language: 'nodejs',
        framework: 'adaptive-nodejs',
        analysisInfo: analysisInfo
      };
      
    } catch (error) {
      console.error('❌ Adaptive Node.js execution failed:', error);
      return {
        success: false,
        output: `❌ Adaptive Node.js execution failed: ${error.message}`,
        error: error.message,
        executionTime: Date.now(),
        language: 'nodejs'
      };
    }
  }

  async executeSpringBootCode(sessionId, userCode, language) {
    try {
      console.log(`🚀 Adaptive Spring Boot execution started for session ${sessionId}`);
      
      const containerName = 'java-springboot';
      const workspacePath = `/Users/amit.ranjan/overforge/backend/docker-environments/workspace/${containerName}`;
      
      // Ensure workspace exists
      await fs.mkdir(workspacePath, { recursive: true });
      
      // Create controller directory for user models
      const controllerDir = path.join(workspacePath, 'src/main/java/com/overforge/interview/controller');
      await fs.mkdir(controllerDir, { recursive: true });
      
      // Write user code to a Java file for adaptive analysis
      const className = this.extractJavaClassName(userCode) || 'UserModel';
      const javaFilePath = path.join(controllerDir, `${className}.java`);
      await fs.writeFile(javaFilePath, userCode);
      console.log(`📝 User code written to: ${javaFilePath}`);
      
      // Kill any existing Spring Boot process
      await this.executeCommand(containerName, 'pkill -f "spring-boot:run" || true', 5000);
      
      // Start adaptive Spring Boot application
      console.log('🚀 Starting adaptive Spring Boot application...');
      const startCommand = 'cd /app && mvn spring-boot:run -Dspring-boot.run.fork=false';
      
      // Start server in background
      const serverProcess = this.executeCommand(containerName, startCommand, 120000, true);
      
      // Wait for Spring Boot to start and analyze user code
      await this.delay(15000); // Spring Boot takes longer to start
      
      // Test adaptive Spring Boot server and get analysis
      const testResult = await this.executeCommand(containerName, 'curl -s http://localhost:8080/ || echo "Server not ready"', 10000);
      
      let serverStatus = 'Starting...';
      let analysisInfo = null;
      let webInterface = 'http://localhost:8002'; // External port mapping
      
      if (testResult.stdout && !testResult.stdout.includes('Server not ready')) {
        try {
          analysisInfo = JSON.parse(testResult.stdout);
          serverStatus = `Running - ${analysisInfo.analysis?.models?.length || 0} models, ${analysisInfo.analysis?.controllers?.length || 0} controllers detected`;
        } catch (e) {
          serverStatus = 'Running - Analysis pending';
        }
      }
      
      return {
        success: true,
        output: `🚀 Adaptive Spring Boot Application Status: ${serverStatus}

📊 Code Analysis Results:
${analysisInfo?.analysis ? `
🎯 Detected Models: ${analysisInfo.analysis.models?.length || 0}
🎮 Controllers: ${analysisInfo.analysis.controllers?.length || 0}
🔧 Services: ${analysisInfo.analysis.services?.length || 0}
📦 Repositories: ${analysisInfo.analysis.repositories?.length || 0}
📡 Auto-Generated Endpoints: ${analysisInfo.endpoints?.length || 0}
⚙️  Framework Features: ${analysisInfo.analysis.structure?.hasJPA ? 'JPA enabled' : 'No JPA'} | ${analysisInfo.analysis.structure?.hasWeb ? 'Web layer' : 'Core only'}
🌐 Web Interface: ${webInterface}

📋 Available Endpoints:
${analysisInfo.endpoints?.slice(0, 8).map(ep => `   ${ep.method} ${ep.path} - ${ep.description}`).join('\n') || '   Loading...'}

📖 Full Documentation: ${webInterface}/api/docs
🔍 Code Analysis: ${webInterface}/api/analysis
🎯 Models API: ${webInterface}/api/models
💚 Health Check: ${webInterface}/health
🔄 Reload Code: POST ${webInterface}/api/reload
` : `
⏳ Adaptive Spring Boot application is starting up...
🌐 Access at: ${webInterface}
📋 The system will automatically analyze your Java code structure
🔄 Refresh in 10-15 seconds to see analysis results
`}

💡 Adaptive Features:
• Automatically detects Spring Boot annotations and patterns
• Generates REST endpoints for your model classes
• Analyzes JPA entities, controllers, and services
• Creates comprehensive API documentation
• Supports any Spring Boot code structure and naming conventions
• Live code analysis with Spring Boot context awareness`,
        executionTime: Date.now(),
        language: 'java',
        framework: 'adaptive-spring-boot',
        webUrl: webInterface,
        className: className,
        analysisInfo: analysisInfo
      };
      
    } catch (error) {
      console.error('❌ Adaptive Spring Boot execution failed:', error);
      return {
        success: false,
        output: `❌ Adaptive Spring Boot execution failed: ${error.message}`,
        error: error.message,
        executionTime: Date.now(),
        language: 'java',
        framework: 'spring-boot'
      };
    }
  }

  extractJavaClassName(code) {
    // Extract class name from Java code
    const classMatch = code.match(/public\s+class\s+(\w+)/);
    return classMatch ? classMatch[1] : null;
  }

  async executePythonCoreCode(sessionId, userCode, language) {
    try {
      console.log(`🚀 Adaptive Python Core execution started for session ${sessionId}`);
      
      const containerName = 'python-core';
      const workspacePath = `/Users/amit.ranjan/overforge/backend/docker-environments/workspace/${containerName}`;
      
      // Ensure workspace exists
      await fs.mkdir(workspacePath, { recursive: true });
      
      // Write user code to app.py for adaptive system to analyze
      const appPath = path.join(workspacePath, 'app.py');
      await fs.writeFile(appPath, userCode);
      console.log(`📝 User code written to: ${appPath}`);
      
      // Install dependencies
      console.log('📦 Installing Python dependencies...');
      const installResult = await this.executeCommand(containerName, 'cd /app && pip install -r requirements.txt', 30000);
      
      if (installResult.exitCode !== 0) {
        console.warn('⚠️ pip install had issues:', installResult.stderr);
      }
      
      // Start adaptive Python server
      console.log('🚀 Starting adaptive Python server...');
      const startCommand = 'cd /app && python adaptive-app.py';
      
      // Kill any existing server process
      await this.executeCommand(containerName, 'pkill -f "python adaptive-app.py" || pkill -f "python app.py" || true', 5000);
      
      // Start server in background
      const serverProcess = this.executeCommand(containerName, startCommand, 60000, true);
      
      // Wait for adaptive server to start and analyze user code
      await this.delay(5000);
      
      // Test adaptive server and get analysis
      const testResult = await this.executeCommand(containerName, 'curl -s http://localhost:8003/ || echo "Server not ready"', 10000);
      
      let serverStatus = 'Starting...';
      let analysisInfo = null;
      let webInterface = 'http://localhost:8003';
      
      if (testResult.stdout && !testResult.stdout.includes('Server not ready')) {
        try {
          analysisInfo = JSON.parse(testResult.stdout);
          serverStatus = `Running - ${analysisInfo.analysis?.classes?.length || 0} classes, ${analysisInfo.analysis?.functions?.length || 0} functions detected`;
        } catch (e) {
          serverStatus = 'Running - Analysis pending';
        }
      }
      
      return {
        success: true,
        output: `🚀 Adaptive Python Core Application Status: ${serverStatus}

📊 Code Analysis Results:
${analysisInfo?.analysis ? `
🎯 Detected Classes: ${analysisInfo.analysis.classes?.length || 0}
🔧 Functions: ${analysisInfo.analysis.functions?.length || 0}
📦 Imports: ${analysisInfo.analysis.imports?.length || 0}
🔢 Variables: ${analysisInfo.analysis.variables?.length || 0}
📈 Complexity Score: ${analysisInfo.analysis.complexity_score || 0}
🎨 Code Style: ${analysisInfo.analysis.code_style || 'unknown'}
🔮 Patterns: ${analysisInfo.analysis.detected_patterns?.join(', ') || 'none'}
📡 Auto-Generated Endpoints: ${analysisInfo.endpoints?.length || 0}
🌐 Web Interface: ${webInterface}

📋 Available Endpoints:
${analysisInfo.endpoints?.slice(0, 8).map(ep => `   ${ep.method} ${ep.path} - ${ep.description}`).join('\n') || '   Loading...'}

📖 Full Documentation: ${webInterface}/api/docs
🔍 Code Analysis: ${webInterface}/api/analysis
🎯 Classes API: ${webInterface}/api/classes
🔧 Functions API: ${webInterface}/api/functions
💚 Health Check: ${webInterface}/health
🔄 Reload Code: POST ${webInterface}/api/reload
` : `
⏳ Adaptive Python Core application is starting up...
🌐 Access at: ${webInterface}
📋 The system will automatically analyze your Python code structure
🔄 Refresh in 5-10 seconds to see analysis results
`}

💡 Adaptive Features:
• Automatically detects classes, functions, and patterns
• Creates HTTP endpoints for your functions and classes
• Analyzes code complexity and structure
• Supports any Python code structure and naming conventions
• Live code analysis and documentation generation
• Interactive code execution capabilities`,
        executionTime: Date.now(),
        language: 'python',
        framework: 'adaptive-python-core',
        webUrl: webInterface,
        analysisInfo: analysisInfo
      };
      
    } catch (error) {
      console.error('❌ Adaptive Python Core execution failed:', error);
      return {
        success: false,
        output: `❌ Adaptive Python Core execution failed: ${error.message}`,
        error: error.message,
        executionTime: Date.now(),
        language: 'python'
      };
    }
  }

  async executeJavaScriptCoreCode(sessionId, userCode, language) {
    try {
      console.log(`🚀 Adaptive JavaScript Core execution started for session ${sessionId}`);
      
      const containerName = 'javascript-core';
      const workspacePath = `/Users/amit.ranjan/overforge/backend/docker-environments/workspace/${containerName}`;
      
      // Ensure workspace exists
      await fs.mkdir(workspacePath, { recursive: true });
      
      // Write user code to app.js for adaptive system to analyze
      const appPath = path.join(workspacePath, 'app.js');
      await fs.writeFile(appPath, userCode);
      console.log(`📝 User code written to: ${appPath}`);
      
      // Install dependencies (minimal for core JS)
      console.log('📦 Installing Node.js dependencies...');
      const installResult = await this.executeCommand(containerName, 'cd /app && npm install', 30000);
      
      if (installResult.exitCode !== 0) {
        console.warn('⚠️ npm install had issues:', installResult.stderr);
      }
      
      // Start adaptive JavaScript server
      console.log('🚀 Starting adaptive JavaScript server...');
      const startCommand = 'cd /app && npm start';
      
      // Kill any existing server process
      await this.executeCommand(containerName, 'pkill -f "node adaptive-app.js" || pkill -f "node app.js" || true', 5000);
      
      // Start server in background
      const serverProcess = this.executeCommand(containerName, startCommand, 60000, true);
      
      // Wait for adaptive server to start and analyze user code
      await this.delay(5000);
      
      // Test adaptive server and get analysis
      const testResult = await this.executeCommand(containerName, 'curl -s http://localhost:3003/ || echo "Server not ready"', 10000);
      
      let serverStatus = 'Starting...';
      let analysisInfo = null;
      let webInterface = 'http://localhost:3003';
      
      if (testResult.stdout && !testResult.stdout.includes('Server not ready')) {
        try {
          analysisInfo = JSON.parse(testResult.stdout);
          serverStatus = `Running - ${analysisInfo.analysis?.classes?.length || 0} classes, ${analysisInfo.analysis?.functions?.length || 0} functions detected`;
        } catch (e) {
          serverStatus = 'Running - Analysis pending';
        }
      }
      
      return {
        success: true,
        output: `🚀 Adaptive JavaScript Core Application Status: ${serverStatus}

📊 Code Analysis Results:
${analysisInfo?.analysis ? `
🎯 Detected Classes: ${analysisInfo.analysis.classes?.length || 0}
🔧 Functions: ${analysisInfo.analysis.functions?.length || 0}
📦 Imports: ${analysisInfo.analysis.imports?.length || 0}
📤 Exports: ${analysisInfo.analysis.exports?.length || 0}
🔢 Variables: ${analysisInfo.analysis.variables?.length || 0}
📈 Complexity Score: ${analysisInfo.analysis.complexity_score || 0}
🎨 Code Style: ${analysisInfo.analysis.code_style || 'unknown'}
🔮 Patterns: ${analysisInfo.analysis.detected_patterns?.join(', ') || 'none'}
📡 Auto-Generated Endpoints: ${analysisInfo.endpoints?.length || 0}
🌐 Web Interface: ${webInterface}

📋 Available Endpoints:
${analysisInfo.endpoints?.slice(0, 8).map(ep => `   ${ep.method} ${ep.path} - ${ep.description}`).join('\n') || '   Loading...'}

📖 Full Documentation: ${webInterface}/api/docs
🔍 Code Analysis: ${webInterface}/api/analysis
🎯 Classes API: ${webInterface}/api/classes
🔧 Functions API: ${webInterface}/api/functions
💚 Health Check: ${webInterface}/health
🔄 Reload Code: POST ${webInterface}/api/reload
` : `
⏳ Adaptive JavaScript Core application is starting up...
🌐 Access at: ${webInterface}
📋 The system will automatically analyze your JavaScript code structure
🔄 Refresh in 5-10 seconds to see analysis results
`}

💡 Adaptive Features:
• Automatically detects functions, classes, and modules
• Creates HTTP endpoints for your functions and classes
• Analyzes code complexity and structure
• Supports both ES6 and CommonJS modules
• Live code analysis and documentation generation
• Interactive code execution capabilities`,
        executionTime: Date.now(),
        language: 'javascript',
        framework: 'adaptive-javascript-core',
        webUrl: webInterface,
        analysisInfo: analysisInfo
      };
      
    } catch (error) {
      console.error('❌ Adaptive JavaScript Core execution failed:', error);
      return {
        success: false,
        output: `❌ Adaptive JavaScript Core execution failed: ${error.message}`,
        error: error.message,
        executionTime: Date.now(),
        language: 'javascript'
      };
    }
  }

  async executeJavaCoreCode(sessionId, userCode, language) {
    try {
      console.log(`🚀 Java Core console execution started for session ${sessionId}`);
      
      const containerName = 'interview-java-core';
      
      // Extract class name from the user code
      const className = this.extractJavaClassName(userCode) || 'Main';
      console.log(`📝 Detected class name: ${className}`);
      
      // Check if the code has a main method (console program) or is a class definition
      const hasMainMethod = userCode.includes('public static void main');
      
      if (hasMainMethod) {
        // This is a console program - compile and run it directly
        return await this.executeJavaConsoleProgram(containerName, userCode, className);
      } else {
        // This is a class definition - use the adaptive web approach
        return await this.executeJavaAdaptiveApplication(containerName, userCode, className, sessionId);
      }
      
    } catch (error) {
      console.error('❌ Java Core execution failed:', error);
      return {
        success: false,
        output: `❌ Java execution failed: ${error.message}`,
        error: error.message,
        executionTime: Date.now(),
        language: 'java'
      };
    }
  }

  async executeJavaConsoleProgram(containerName, userCode, className) {
    console.log(`🎯 Executing Java console program: ${className}`);
    
    // Write the Java file to /tmp for compilation and execution
    const javaFile = `/tmp/${className}.java`;
    const classFile = `/tmp/${className}.class`;
    
    // Base64 encode the code to handle special characters
    const encodedCode = Buffer.from(userCode, 'utf8').toString('base64');
    
    // Command to write, compile, and run the Java program
    const commands = [
      `echo '${encodedCode}' | base64 -d > ${javaFile}`,
      `cd /tmp && javac ${className}.java`,
      `cd /tmp && timeout 30s java ${className}`
    ];
    
    const fullCommand = commands.join(' && ');
    
    return new Promise((resolve) => {
      exec(`docker exec ${containerName} sh -c "${fullCommand}"`, { timeout: 35000 }, (error, stdout, stderr) => {
        const executionTime = Date.now();
        
        if (error) {
          // Check if it's a compilation error
          if (stderr.includes('error:') || stderr.includes('cannot find symbol')) {
            resolve({
              success: false,
              output: `Compilation Error:\n${stderr}`,
              error: `Compilation failed: ${stderr}`,
              executionTime
            });
          } else if (error.code === 124) { // Timeout
            resolve({
              success: false,
              output: `Execution timed out after 30 seconds`,
              error: 'Execution timeout',
              executionTime
            });
          } else {
            resolve({
              success: false,
              output: `Execution Error:\n${stderr || error.message}`,
              error: error.message,
              executionTime
            });
          }
        } else {
          resolve({
            success: true,
            output: stdout || '(No output)',
            error: stderr ? `Warning: ${stderr}` : undefined,
            executionTime,
            language: 'java',
            className: className
          });
        }
      });
    });
  }

  async executeJavaAdaptiveApplication(containerName, userCode, className, sessionId) {
    try {
      console.log(`🚀 Adaptive Java Core execution started for session ${sessionId}`);
      
      const workspacePath = `/Users/amit.ranjan/overforge/backend/docker-environments/workspace/java-core`;
      
      // Ensure workspace exists
      await fs.mkdir(workspacePath, { recursive: true });
      
      // Create controller directory for user models
      const controllerDir = path.join(workspacePath, 'src/main/java/com/overforge/interview/controller');
      await fs.mkdir(controllerDir, { recursive: true });
      
      // Write user code to a Java file for adaptive analysis
      const javaFilePath = path.join(controllerDir, `${className}.java`);
      await fs.writeFile(javaFilePath, userCode);
      console.log(`📝 User code written to: ${javaFilePath}`);
      
      // Kill any existing Java process
      await this.executeCommand(containerName, 'pkill -f "java" || true', 5000);
      
      // Start adaptive Java application
      console.log('🚀 Starting adaptive Java application...');
      const startCommand = 'cd /app && mvn spring-boot:run -Dspring-boot.run.fork=false';
      
      // Start server in background
      const serverProcess = this.executeCommand(containerName, startCommand, 120000, true);
      
      // Wait for Java to start and analyze user code
      await this.delay(15000); // Java takes longer to start
      
      // Test adaptive Java server and get analysis
      const testResult = await this.executeCommand(containerName, 'curl -s http://localhost:8080/ || echo "Server not ready"', 10000);
      
      let serverStatus = 'Starting...';
      let analysisInfo = null;
      let webInterface = 'http://localhost:8004';
      
      if (testResult.stdout && !testResult.stdout.includes('Server not ready')) {
        try {
          analysisInfo = JSON.parse(testResult.stdout);
          serverStatus = `Running - ${analysisInfo.analysis?.classes?.length || 0} classes, ${analysisInfo.analysis?.methods?.length || 0} methods detected`;
        } catch (e) {
          serverStatus = 'Running - Analysis pending';
        }
      }
      
      return {
        success: true,
        output: `🚀 Adaptive Java Core Application Status: ${serverStatus}

📊 Code Analysis Results:
${analysisInfo?.analysis ? `
🎯 Detected Classes: ${analysisInfo.analysis.classes?.length || 0}
🔧 Methods: ${analysisInfo.analysis.methods?.length || 0}
📦 Imports: ${analysisInfo.analysis.imports?.length || 0}
🔢 Fields: ${analysisInfo.analysis.fields?.length || 0}
📈 Complexity Score: ${analysisInfo.analysis.complexity_score || 0}
🎨 Code Style: ${analysisInfo.analysis.code_style || 'unknown'}
🔮 Patterns: ${analysisInfo.analysis.detected_patterns?.join(', ') || 'none'}
📡 Auto-Generated Endpoints: ${analysisInfo.endpoints?.length || 0}
🌐 Web Interface: ${webInterface}

📋 Available Endpoints:
${analysisInfo.endpoints?.slice(0, 8).map(ep => `   ${ep.method} ${ep.path} - ${ep.description}`).join('\n') || '   Loading...'}

📖 Full Documentation: ${webInterface}/api/docs
🔍 Code Analysis: ${webInterface}/api/analysis
🎯 Classes API: ${webInterface}/api/classes
🔧 Methods API: ${webInterface}/api/methods
💚 Health Check: ${webInterface}/health
🔄 Reload Code: POST ${webInterface}/api/reload
` : `
⏳ Adaptive Java Core application is starting up...
🌐 Access at: ${webInterface}
📋 The system will automatically analyze your Java code structure
🔄 Refresh in 10-15 seconds to see analysis results
`}

💡 Adaptive Features:
• Automatically detects classes, methods, and patterns
• Creates HTTP endpoints for your classes and methods
• Analyzes code complexity and structure
• Supports any Java code structure and naming conventions
• Live code analysis and documentation generation
• Interactive code execution capabilities`,
        executionTime: Date.now(),
        language: 'java',
        framework: 'adaptive-java-core',
        webUrl: webInterface,
        className: className,
        analysisInfo: analysisInfo
      };
      
    } catch (error) {
      console.error('❌ Adaptive Java Core execution failed:', error);
      return {
        success: false,
        output: `❌ Adaptive Java Core execution failed: ${error.message}`,
        error: error.message,
        executionTime: Date.now(),
        language: 'java'
      };
    }
  }

  async destroySession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    console.log(`🗑️ Destroying session container: ${sessionId}`);
    
    try {
      // Stop and remove the container
      if (session.containerId) {
        await this.stopContainer(session.containerId);
        await this.removeContainer(session.containerId);
      }
      
      // Release the port
      if (session.port) {
        this.releasePort(session.port);
      }
      
      // Remove from active sessions
      this.activeSessions.delete(sessionId);
      
      console.log(`✅ Session ${sessionId} destroyed successfully`);
      return true;
    } catch (error) {
      console.error(`Failed to destroy session ${sessionId}: ${error.message}`);
      return false;
    }
  }

  async stopContainer(containerId) {
    return new Promise((resolve) => {
      exec(`docker stop ${containerId}`, (error, stdout, stderr) => {
        if (error && !stderr.includes('No such container')) {
          console.error(`Failed to stop container ${containerId}: ${stderr}`);
        }
        resolve();
      });
    });
  }

  async removeContainer(containerId) {
    return new Promise((resolve) => {
      exec(`docker rm ${containerId}`, (error, stdout, stderr) => {
        if (error && !stderr.includes('No such container')) {
          console.error(`Failed to remove container ${containerId}: ${stderr}`);
        }
        resolve();
      });
    });
  }

  async cleanupInactiveSessions() {
    const now = new Date();
    const maxIdleTime = 30 * 60 * 1000; // 30 minutes
    
    console.log(`🧹 Running session cleanup...`);
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      const idleTime = now - session.lastActivity;
      
      if (idleTime > maxIdleTime) {
        console.log(`🗑️ Cleaning up inactive session: ${sessionId} (idle for ${Math.round(idleTime / 60000)} minutes)`);
        await this.destroySession(sessionId);
      }
    }
  }

  async listActiveSessions() {
    return Array.from(this.activeSessions.values()).map(session => ({
      sessionId: session.sessionId,
      framework: session.framework,
      status: session.status,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      port: session.port,
      webUrl: session.webUrl,
      resourceLimits: session.resourceLimits
    }));
  }

  async getSessionStats() {
    const sessions = await this.listActiveSessions();
    const stats = {
      totalSessions: sessions.length,
      byFramework: {},
      totalResourceUsage: {
        cpus: 0,
        memory: 0
      },
      portsUsed: this.usedPorts.size
    };

    sessions.forEach(session => {
      const framework = session.framework;
      stats.byFramework[framework] = (stats.byFramework[framework] || 0) + 1;
      
      if (session.resourceLimits) {
        stats.totalResourceUsage.cpus += parseFloat(session.resourceLimits.cpus);
        stats.totalResourceUsage.memory += parseInt(session.resourceLimits.memory);
      }
    });

    return stats;
  }

  createMockSession(sessionId, type, language, framework) {
    // Normalize framework name
    const normalizedFramework = framework.toLowerCase();
    
    // Get container port based on framework
    const sharedContainerPorts = {
      // Framework containers
      'django': 8001,
      'express': 3001,
      'express.js': 3001,
      'node.js': 3002,
      'nodejs': 3002,
      'spring boot': 8002,
      'springboot': 8002,
      
      // Core language containers
      'python-core': 8003,
      'python': 8003,
      'javascript-core': 3003,
      'javascript': 3003,
      'java-core': 8004,
      'java': 8004
    };
    
    const containerPort = sharedContainerPorts[normalizedFramework] || 8001;
    const containerName = this.getContainerName(normalizedFramework);
    
    // Create a mock session that points to the shared container
    const mockSession = {
      sessionId,
      type,
      language,
      framework: normalizedFramework,
      containerName: `interview-${containerName}`,
      containerId: `shared-${normalizedFramework}`,
      webUrl: `http://localhost:${containerPort}`,
      status: 'running',
      createdAt: new Date(),
      lastActivity: new Date(),
      port: containerPort,
      isShared: true
    };

    console.log(`🔄 Creating mock session for ${sessionId} using shared container: ${mockSession.containerName}`);
    this.activeSessions.set(sessionId, mockSession);
    return mockSession;
  }

  // Graceful shutdown
  async shutdown() {
    console.log('🛑 Shutting down Production Container Service...');
    
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Destroy all active sessions
    const sessionIds = Array.from(this.activeSessions.keys());
    for (const sessionId of sessionIds) {
      await this.destroySession(sessionId);
    }
    
    console.log('✅ Production Container Service shutdown complete');
  }

  // Helper method for executing Docker commands
  async executeDockerCommand(containerName, command, captureOutput = false) {
    return new Promise((resolve, reject) => {
      const fullCommand = `docker exec ${containerName} sh -c "${command}"`;
      exec(fullCommand, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Docker command failed: ${error.message}\n${stderr}`));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }

  async executeCommand(containerName, command, timeout = 30000, background = false) {
    return new Promise((resolve, reject) => {
      const fullCommand = `docker exec ${background ? '-d' : ''} interview-${containerName} sh -c "${command}"`;
      exec(fullCommand, { timeout }, (error, stdout, stderr) => {
        if (error && !background) {
          resolve({ exitCode: error.code || 1, stdout: stdout || '', stderr: stderr || error.message });
        } else {
          resolve({ exitCode: 0, stdout: stdout || '', stderr: stderr || '' });
        }
      });
    });
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new ProductionContainerService(); 