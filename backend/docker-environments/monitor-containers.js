#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class ContainerMonitor {
  constructor() {
    this.monitoringInterval = 30000; // 30 seconds
    this.logFile = path.join(__dirname, 'container-metrics.log');
    this.alertThresholds = {
      cpu: 80, // 80% CPU usage
      memory: 85, // 85% memory usage
      containers: 50 // Max 50 concurrent containers
    };
    this.isRunning = false;
  }

  async start() {
    console.log('🔍 Starting Container Monitor...');
    this.isRunning = true;
    
    // Initial log
    await this.logMetrics('Monitor started');
    
    // Start monitoring loop
    this.monitorLoop();
    
    // Setup graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  async stop() {
    console.log('🛑 Stopping Container Monitor...');
    this.isRunning = false;
    await this.logMetrics('Monitor stopped');
    process.exit(0);
  }

  async monitorLoop() {
    while (this.isRunning) {
      try {
        await this.collectMetrics();
        await this.sleep(this.monitoringInterval);
      } catch (error) {
        console.error('Monitoring error:', error);
        await this.logMetrics(`Error: ${error.message}`);
        await this.sleep(5000); // Shorter sleep on error
      }
    }
  }

  async collectMetrics() {
    const timestamp = new Date().toISOString();
    console.log(`📊 Collecting metrics at ${timestamp}`);

    // Get overall Docker stats
    const systemStats = await this.getDockerSystemStats();
    
    // Get individual container stats
    const containerStats = await this.getContainerStats();
    
    // Get session container stats (interview-* pattern)
    const sessionStats = await this.getSessionContainerStats();
    
    const metrics = {
      timestamp,
      system: systemStats,
      containers: containerStats,
      sessions: sessionStats,
      alerts: []
    };

    // Check for alerts
    await this.checkAlerts(metrics);
    
    // Log metrics
    await this.logMetrics(JSON.stringify(metrics, null, 2));
    
    // Display summary
    this.displaySummary(metrics);
  }

  async getDockerSystemStats() {
    return new Promise((resolve) => {
      exec('docker system df --format "table {{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}"', (error, stdout) => {
        if (error) {
          resolve({ error: error.message });
          return;
        }
        
        const lines = stdout.trim().split('\n').slice(1); // Skip header
        const stats = {};
        
        lines.forEach(line => {
          const [type, count, size, reclaimable] = line.split('\t');
          stats[type.toLowerCase()] = {
            count: parseInt(count) || 0,
            size,
            reclaimable
          };
        });
        
        resolve(stats);
      });
    });
  }

  async getContainerStats() {
    return new Promise((resolve) => {
      exec('docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}"', (error, stdout) => {
        if (error) {
          resolve({ error: error.message });
          return;
        }
        
        const lines = stdout.trim().split('\n').slice(1); // Skip header
        const containers = [];
        
        lines.forEach(line => {
          if (line.trim()) {
            const parts = line.split('\t');
            if (parts.length >= 6) {
              const [name, cpu, memUsage, memPerc, netIO, blockIO] = parts;
              containers.push({
                name: (name || '').trim(),
                cpu: (cpu || '0%').trim(),
                memUsage: (memUsage || '0B').trim(),
                memPerc: (memPerc || '0%').trim(),
                netIO: (netIO || '0B').trim(),
                blockIO: (blockIO || '0B').trim()
              });
            }
          }
        });
        
        resolve(containers);
      });
    });
  }

  async getSessionContainerStats() {
    return new Promise((resolve) => {
      exec('docker ps --filter "name=interview-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.CreatedAt}}"', (error, stdout) => {
        if (error) {
          resolve({ error: error.message });
          return;
        }
        
        const lines = stdout.trim().split('\n').slice(1); // Skip header
        const sessions = [];
        
        lines.forEach(line => {
          if (line.trim()) {
            const parts = line.split('\t');
            if (parts.length >= 4) {
              const [name, status, ports, created] = parts;
              sessions.push({
                name: (name || '').trim(),
                status: (status || '').trim(),
                ports: (ports || '').trim(),
                created: (created || '').trim()
              });
            }
          }
        });
        
        resolve({
          total: sessions.length,
          containers: sessions
        });
      });
    });
  }

  async checkAlerts(metrics) {
    const alerts = [];

    // Check session container count
    if (metrics.sessions.total > this.alertThresholds.containers) {
      alerts.push({
        type: 'HIGH_CONTAINER_COUNT',
        message: `High session container count: ${metrics.sessions.total}`,
        severity: 'warning',
        threshold: this.alertThresholds.containers
      });
    }

    // Check individual container resources
    if (metrics.containers && Array.isArray(metrics.containers)) {
      metrics.containers.forEach(container => {
        const cpuPercent = parseFloat(container.cpu.replace('%', ''));
        const memPercent = parseFloat(container.memPerc.replace('%', ''));

        if (cpuPercent > this.alertThresholds.cpu) {
          alerts.push({
            type: 'HIGH_CPU_USAGE',
            container: container.name,
            message: `High CPU usage: ${container.cpu}`,
            severity: 'warning',
            threshold: this.alertThresholds.cpu
          });
        }

        if (memPercent > this.alertThresholds.memory) {
          alerts.push({
            type: 'HIGH_MEMORY_USAGE',
            container: container.name,
            message: `High memory usage: ${container.memPerc}`,
            severity: 'warning',
            threshold: this.alertThresholds.memory
          });
        }
      });
    }

    metrics.alerts = alerts;

    // Log alerts to console
    if (alerts.length > 0) {
      console.log('🚨 ALERTS:');
      alerts.forEach(alert => {
        console.log(`  ⚠️ ${alert.type}: ${alert.message}`);
      });
    }
  }

  displaySummary(metrics) {
    console.log('📈 CONTAINER METRICS SUMMARY');
    console.log('═'.repeat(50));
    
    // Session containers
    console.log(`🐳 Session Containers: ${metrics.sessions.total}`);
    
    // Top resource consumers
    if (metrics.containers && Array.isArray(metrics.containers)) {
      const topCpu = metrics.containers
        .sort((a, b) => parseFloat(b.cpu) - parseFloat(a.cpu))
        .slice(0, 3);
      
      console.log('🔥 Top CPU Usage:');
      topCpu.forEach((container, i) => {
        console.log(`  ${i + 1}. ${container.name}: ${container.cpu}`);
      });

      const topMem = metrics.containers
        .sort((a, b) => parseFloat(b.memPerc) - parseFloat(a.memPerc))
        .slice(0, 3);
      
      console.log('💾 Top Memory Usage:');
      topMem.forEach((container, i) => {
        console.log(`  ${i + 1}. ${container.name}: ${container.memPerc}`);
      });
    }

    // System stats
    if (metrics.system.images) {
      console.log(`📦 Docker Images: ${metrics.system.images.count}`);
    }
    if (metrics.system.containers) {
      console.log(`🏠 Total Containers: ${metrics.system.containers.count}`);
    }

    console.log('═'.repeat(50));
    console.log('');
  }

  async logMetrics(data) {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${data}\n`;
      await fs.appendFile(this.logFile, logEntry);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility methods for external scripts
  async getResourceUsageSummary() {
    const metrics = {
      timestamp: new Date().toISOString(),
      system: await this.getDockerSystemStats(),
      containers: await this.getContainerStats(),
      sessions: await this.getSessionContainerStats()
    };

    return {
      totalSessions: metrics.sessions.total,
      totalContainers: metrics.system.containers?.count || 0,
      averageCpuUsage: this.calculateAverageCpu(metrics.containers),
      averageMemoryUsage: this.calculateAverageMemory(metrics.containers),
      alertCount: 0 // Will be calculated by checkAlerts
    };
  }

  calculateAverageCpu(containers) {
    if (!containers || !Array.isArray(containers) || containers.length === 0) {
      return 0;
    }
    
    const total = containers.reduce((sum, container) => {
      return sum + parseFloat(container.cpu.replace('%', ''));
    }, 0);
    
    return (total / containers.length).toFixed(2);
  }

  calculateAverageMemory(containers) {
    if (!containers || !Array.isArray(containers) || containers.length === 0) {
      return 0;
    }
    
    const total = containers.reduce((sum, container) => {
      return sum + parseFloat(container.memPerc.replace('%', ''));
    }, 0);
    
    return (total / containers.length).toFixed(2);
  }

  // Cleanup utilities
  async cleanupStoppedContainers() {
    console.log('🧹 Cleaning up stopped containers...');
    
    return new Promise((resolve) => {
      exec('docker container prune -f', (error, stdout, stderr) => {
        if (error) {
          console.error('Cleanup failed:', stderr);
          resolve({ success: false, error: error.message });
          return;
        }
        
        console.log('✅ Cleanup completed:', stdout);
        resolve({ success: true, output: stdout });
      });
    });
  }

  async cleanupUnusedImages() {
    console.log('🧹 Cleaning up unused images...');
    
    return new Promise((resolve) => {
      exec('docker image prune -f', (error, stdout, stderr) => {
        if (error) {
          console.error('Image cleanup failed:', stderr);
          resolve({ success: false, error: error.message });
          return;
        }
        
        console.log('✅ Image cleanup completed:', stdout);
        resolve({ success: true, output: stdout });
      });
    });
  }
}

// CLI usage
if (require.main === module) {
  const monitor = new ContainerMonitor();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'start':
      monitor.start();
      break;
    case 'summary':
      monitor.getResourceUsageSummary().then(summary => {
        console.log('📊 Resource Usage Summary:');
        console.log(JSON.stringify(summary, null, 2));
        process.exit(0);
      });
      break;
    case 'cleanup':
      Promise.all([
        monitor.cleanupStoppedContainers(),
        monitor.cleanupUnusedImages()
      ]).then(results => {
        console.log('🧹 Cleanup completed');
        console.log(results);
        process.exit(0);
      });
      break;
    default:
      console.log('Usage: node monitor-containers.js [start|summary|cleanup]');
      console.log('  start   - Start continuous monitoring');
      console.log('  summary - Get current resource summary');
      console.log('  cleanup - Clean up stopped containers and unused images');
      process.exit(1);
  }
}

module.exports = ContainerMonitor; 