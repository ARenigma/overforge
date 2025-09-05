#!/bin/bash

echo "🐳 OverForge Docker Environment Setup"
echo "====================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker Desktop first:"
    echo "   macOS: https://docs.docker.com/desktop/install/mac-install/"
    echo "   Windows: https://docs.docker.com/desktop/install/windows-install/"
    echo "   Linux: https://docs.docker.com/engine/install/"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not available. Please install Docker Desktop."
    exit 1
fi

echo "✅ Docker installation verified"
echo "   Docker version: $(docker --version)"
echo "   Docker Compose version: $(docker-compose --version)"

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Docker daemon is not running. Please start Docker Desktop."
    exit 1
fi

echo "✅ Docker daemon is running"

# Create missing Maven wrapper for Spring Boot
echo "🔧 Setting up Spring Boot environment..."
mkdir -p java-springboot/.mvn/wrapper
cat > java-springboot/mvnw << 'EOF'
#!/bin/bash
exec mvn "$@"
EOF
chmod +x java-springboot/mvnw

# Create Spring Boot source structure
mkdir -p java-springboot/src/main/java/com/overforge/interview
cat > java-springboot/src/main/java/com/overforge/interview/InterviewApplication.java << 'EOF'
package com.overforge.interview;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
@RestController
public class InterviewApplication {
    public static void main(String[] args) {
        SpringApplication.run(InterviewApplication.class, args);
    }
    
    @GetMapping("/")
    public String home() {
        return "Spring Boot Interview Environment Ready!";
    }
    
    @GetMapping("/health")
    public String health() {
        return "OK";
    }
}
EOF

echo "🏗️ Building Docker images..."

# Build and start all containers
if docker-compose build; then
    echo "✅ Docker images built successfully"
else
    echo "❌ Failed to build Docker images"
    exit 1
fi

echo "🚀 Starting containers..."
if docker-compose up -d; then
    echo "✅ Containers started successfully"
else
    echo "❌ Failed to start containers"
    exit 1
fi

# Wait for containers to be ready
echo "⏳ Waiting for containers to be ready..."
sleep 10

# Check container status
echo "📊 Container Status:"
docker-compose ps

echo ""
echo "🎉 Setup Complete!"
echo "==================="
echo "🌐 Access your environments:"
echo "   Django:      http://localhost:8001/ (admin: admin/interview123)"
echo "   Express:     http://localhost:3001/"
echo "   Node.js:     http://localhost:3002/"
echo "   Spring Boot: http://localhost:8002/"
echo ""
echo "💾 Database access:"
echo "   PostgreSQL:  localhost:5433 (postgres/interview123)"
echo "   Redis:       localhost:6380"
echo ""
echo "📋 Useful commands:"
echo "   docker-compose logs -f              # View all logs"
echo "   docker-compose logs -f python-django # View Django logs"
echo "   docker-compose down                 # Stop all containers"
echo "   docker-compose up -d                # Start all containers" 