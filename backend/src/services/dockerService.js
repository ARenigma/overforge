const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class DockerService {
  constructor() {
    this.dockerComposePath = path.join(__dirname, '../../docker-environments');
    this.isInitialized = false;
    this.containers = new Map();
    this.startupPromise = null;
    this.dockerCommand = 'docker';
    this.dockerComposeCommand = 'docker compose';
  }

  /**
   * Check if Docker is available on the system
   */
  async checkDockerAvailability() {
    return new Promise((resolve) => {
      // Try standard docker command first
      exec('docker --version', (error) => {
        if (!error) {
          this.dockerCommand = 'docker';
          this.dockerComposeCommand = 'docker compose';
          resolve(true);
          return;
        }

        // Try user-specific Docker installation
        const userDockerPath = '/Users/amit.ranjan/Application/Docker.app/Contents/Resources/bin/docker';
        exec(`${userDockerPath} --version`, (userError) => {
          if (!userError) {
            console.log('✅ Found Docker in user directory:', userDockerPath);
            this.dockerCommand = userDockerPath;
            this.dockerComposeCommand = `${userDockerPath} compose`;
            resolve(true);
          } else {
            console.log('⚠️  Docker not found on system - container features will be disabled');
            resolve(false);
          }
        });
      });
    });
  }

  /**
   * Check if docker-compose.yml exists
   */
  checkDockerComposeFile() {
    const composePath = path.join(this.dockerComposePath, 'docker-compose.yml');
    return fs.existsSync(composePath);
  }

  /**
   * Start Docker containers automatically
   */
  async startContainers() {
    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = this._doStartContainers();
    return this.startupPromise;
  }

  async _doStartContainers() {
    try {
      // Check if Docker is disabled via environment variable
      if (process.env.DISABLE_DOCKER === 'true') {
        console.log('🔕 Docker containers disabled via DISABLE_DOCKER environment variable');
        return false;
      }

      console.log('🐳 Checking Docker availability...');
      
      const dockerAvailable = await this.checkDockerAvailability();
      if (!dockerAvailable) {
        console.log('🔕 Docker containers disabled - Docker not available');
        return false;
      }

      if (!this.checkDockerComposeFile()) {
        console.log('🔕 Docker containers disabled - docker-compose.yml not found');
        return false;
      }

      console.log('🚀 Starting Docker containers automatically...');
      
      return new Promise((resolve, reject) => {
        // Use the detected docker command
        const composeCmd = this.dockerComposeCommand || 'docker compose';
        const cmdParts = composeCmd.split(' ');
        const command = cmdParts[0];
        const args = [...cmdParts.slice(1), 'up', '-d'];

        console.log(`🐳 Running: ${command} ${args.join(' ')}`);
        
        const startProcess = spawn(command, args, {
          cwd: this.dockerComposePath,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        startProcess.stdout.on('data', (data) => {
          output += data.toString();
        });

        startProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        startProcess.on('close', (code) => {
          if (code === 0) {
            console.log('✅ Docker containers started successfully');
            this.isInitialized = true;
            this._updateContainerStatus();
            resolve(true);
          } else {
            console.log('⚠️  Docker containers failed to start:', errorOutput);
            console.log('🔄 Backend will continue without containers');
            resolve(false);
          }
        });

        startProcess.on('error', (error) => {
          console.log('⚠️  Docker startup error:', error.message);
          console.log('🔄 Backend will continue without containers');
          resolve(false);
        });

        // Timeout after 120 seconds (increased from 60s)
        setTimeout(() => {
          startProcess.kill();
          console.log('⏰ Docker startup timeout - continuing without containers');
          resolve(false);
        }, 120000);
      });

    } catch (error) {
      console.log('⚠️  Docker initialization error:', error.message);
      return false;
    }
  }

  /**
   * Get container status
   */
  async getContainerStatus() {
    return new Promise((resolve) => {
      const composeCmd = this.dockerComposeCommand || 'docker compose';
      exec(`${composeCmd} ps --format json`, {
        cwd: this.dockerComposePath
      }, (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }

        try {
          const lines = stdout.trim().split('\n').filter(line => line.trim());
          const containers = lines.map(line => JSON.parse(line));
          resolve(containers);
        } catch (parseError) {
          resolve([]);
        }
      });
    });
  }

  /**
   * Update internal container status
   */
  async _updateContainerStatus() {
    try {
      const containers = await this.getContainerStatus();
      
      this.containers.clear();
      containers.forEach(container => {
        this.containers.set(container.Service, {
          name: container.Service,
          status: container.State,
          ports: container.Publishers || []
        });
      });

      // Log status
      if (containers.length > 0) {
        console.log('📊 Container status:');
        containers.forEach(container => {
          const status = container.State === 'running' ? '🟢' : '🔴';
          console.log(`   ${status} ${container.Service}: ${container.State}`);
        });
      }

    } catch (error) {
      console.log('⚠️  Failed to update container status:', error.message);
    }
  }

  /**
   * Stop all containers (for graceful shutdown)
   */
  async stopContainers() {
    if (!this.isInitialized) return;

    console.log('🛑 Stopping Docker containers...');
    
    return new Promise((resolve) => {
      const composeCmd = this.dockerComposeCommand || 'docker compose';
      exec(`${composeCmd} down`, {
        cwd: this.dockerComposePath
      }, (error) => {
        if (error) {
          console.log('⚠️  Error stopping containers:', error.message);
        } else {
          console.log('✅ Docker containers stopped');
        }
        resolve();
      });
    });
  }

  /**
   * Get available environments
   */
  getAvailableEnvironments() {
    return Array.from(this.containers.values());
  }

  /**
   * Check if specific environment is ready
   */
  isEnvironmentReady(environment) {
    const container = this.containers.get(environment);
    return container && container.status === 'running';
  }

  /**
   * Get service health status for health endpoint
   */
  getHealthStatus() {
    if (!this.isInitialized) {
      return 'disabled';
    }

    const runningContainers = Array.from(this.containers.values())
      .filter(c => c.status === 'running').length;
    
    const totalContainers = this.containers.size;

    if (totalContainers === 0) {
      return 'no-containers';
    } else if (runningContainers === totalContainers) {
      return 'all-running';
    } else if (runningContainers > 0) {
      return 'partially-running';
    } else {
      return 'stopped';
    }
  }
}

// Create singleton instance
const dockerService = new DockerService();

module.exports = dockerService; 