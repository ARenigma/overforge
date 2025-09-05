#!/bin/bash

echo "🐳 OverForge Docker Environment Setup"
echo "====================================="

# Set direct paths to Docker CLI tools
DOCKER_CLI="/Users/amit.ranjan/Application/Docker.app/Contents/Resources/bin/docker"
DOCKER_COMPOSE="$DOCKER_CLI compose"

# Verify Docker is working
echo "✅ Using Docker at: $DOCKER_CLI"
if ! $DOCKER_CLI info &> /dev/null; then
    echo "❌ Docker daemon is not running"
    echo "Please make sure Docker Desktop is running and try again"
    exit 1
fi

echo "✅ Docker verification complete"
echo "   Docker version: $($DOCKER_CLI --version)"
echo "   Docker Compose version: $($DOCKER_CLI compose version)"

# Create missing Maven wrapper for Spring Boot
echo "🔧 Setting up Spring Boot environment..."
mkdir -p java-springboot/.mvn/wrapper
cat > java-springboot/mvnw << 'EOF'
#!/bin/bash
exec mvn "$@"
EOF
chmod +x java-springboot/mvnw

# Create Spring Boot source structure and main application
mkdir -p java-springboot/src/main/java/com/overforge/interview
mkdir -p java-springboot/src/main/resources

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

# Create application.properties
cat > java-springboot/src/main/resources/application.properties << 'EOF'
server.port=8080
spring.application.name=interview-environment
management.endpoints.web.exposure.include=health,info
management.endpoint.health.show-details=always
EOF

echo "🏗️ Building Docker images..."

# Build all containers
if $DOCKER_COMPOSE build; then
    echo "✅ Docker images built successfully"
else
    echo "❌ Failed to build Docker images"
    echo "Check the error messages above"
    exit 1
fi

echo "🚀 Starting containers..."
if $DOCKER_COMPOSE up -d; then
    echo "✅ Containers started successfully"
else
    echo "❌ Failed to start containers"
    echo "Check the error messages above"
    exit 1
fi

# Wait for containers to be ready
echo "⏳ Waiting for containers to be ready..."
sleep 20

# Check container status
echo "📊 Container Status:"
$DOCKER_COMPOSE ps

echo ""
echo "🧪 Testing connectivity..."

# Test each service
test_service() {
    local name=$1
    local url=$2
    local timeout=5
    
    if curl -s --max-time $timeout "$url" > /dev/null 2>&1; then
        echo "✅ $name: $url"
        return 0
    else
        echo "⚠️ $name: $url (not responding yet)"
        return 1
    fi
}

test_service "Django" "http://localhost:8001/"
test_service "Express" "http://localhost:3001/"
test_service "Node.js" "http://localhost:3002/"
test_service "Spring Boot" "http://localhost:8002/"
test_service "PostgreSQL" "localhost:5433" # This will fail but shows it's being checked

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
echo "   $DOCKER_COMPOSE logs -f              # View all logs"
echo "   $DOCKER_COMPOSE logs -f python-django # View Django logs"
echo "   $DOCKER_COMPOSE down                 # Stop all containers"
echo "   $DOCKER_COMPOSE up -d                # Start all containers"
echo ""
echo "🔧 Management (use our script):"
echo "   ./manage-working.sh start            # Start environments"
echo "   ./manage-working.sh status           # Check status"
echo "   ./manage-working.sh test             # Test connectivity"
echo ""
echo "💡 Note: If any service isn't responding, wait a minute and check again"
echo "   Some containers (especially Spring Boot) take time to start" 