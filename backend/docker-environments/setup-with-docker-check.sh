#!/bin/bash

echo "🐳 OverForge Docker Environment Setup"
echo "====================================="

# Function to check if Docker Desktop is running
check_docker_running() {
    if docker info &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Check if Docker Desktop app exists
DOCKER_APP_PATH="/Users/amit.ranjan/Application/Docker.app"
DOCKER_APP_ALT="/Applications/Docker.app"

if [ -d "$DOCKER_APP_PATH" ]; then
    echo "✅ Docker Desktop found at: $DOCKER_APP_PATH"
    DOCKER_PATH="$DOCKER_APP_PATH"
elif [ -d "$DOCKER_APP_ALT" ]; then
    echo "✅ Docker Desktop found at: $DOCKER_APP_ALT"
    DOCKER_PATH="$DOCKER_APP_ALT"
else
    echo "❌ Docker Desktop not found. Please install Docker Desktop first:"
    echo "   macOS: https://docs.docker.com/desktop/install/mac-install/"
    exit 1
fi

# Check if docker command is available
if ! command -v docker &> /dev/null; then
    echo "⚠️ Docker CLI not available in PATH"
    echo "🚀 Starting Docker Desktop..."
    
    # Start Docker Desktop
    open "$DOCKER_PATH"
    
    echo "⏳ Waiting for Docker Desktop to start and install CLI tools..."
    echo "   This may take 30-60 seconds on first run..."
    
    # Wait for Docker to become available (max 2 minutes)
    TIMEOUT=120
    COUNTER=0
    
    while [ $COUNTER -lt $TIMEOUT ]; do
        if command -v docker &> /dev/null && check_docker_running; then
            echo "✅ Docker is now available!"
            break
        fi
        
        if [ $((COUNTER % 10)) -eq 0 ]; then
            echo "   Still waiting... ($COUNTER/$TIMEOUT seconds)"
        fi
        
        sleep 2
        COUNTER=$((COUNTER + 2))
    done
    
    if [ $COUNTER -ge $TIMEOUT ]; then
        echo "❌ Docker Desktop didn't start in time"
        echo "Please manually:"
        echo "1. Open Docker Desktop from Applications"
        echo "2. Wait for it to fully start (whale icon in menu bar)"
        echo "3. Install CLI tools if prompted"
        echo "4. Run this script again"
        exit 1
    fi
else
    echo "✅ Docker CLI found"
fi

# Verify Docker is running
if ! check_docker_running; then
    echo "❌ Docker daemon is not running"
    echo "Please start Docker Desktop and try again"
    exit 1
fi

echo "✅ Docker verification complete"
echo "   Docker version: $(docker --version)"

# Check for docker-compose
if command -v docker-compose &> /dev/null; then
    echo "   Docker Compose version: $(docker-compose --version)"
elif docker compose version &> /dev/null; then
    echo "   Docker Compose (plugin) version: $(docker compose version)"
    # Create alias for older docker-compose syntax
    alias docker-compose='docker compose'
    echo "   Using 'docker compose' as 'docker-compose'"
else
    echo "❌ Docker Compose not available"
    exit 1
fi

echo "✅ Docker setup verified"

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

# Use docker-compose or docker compose depending on what's available
COMPOSE_CMD="docker-compose"
if ! command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker compose"
fi

# Define the path to the docker-compose file
COMPOSE_FILE="$(dirname "$0")/docker-compose.yml"

# Build and start all containers
if $COMPOSE_CMD -f "$COMPOSE_FILE" build; then
    echo "✅ Docker images built successfully"
else
    echo "❌ Failed to build Docker images"
    echo "Check the error messages above"
    exit 1
fi

echo "🚀 Starting containers..."
if $COMPOSE_CMD -f "$COMPOSE_FILE" up -d; then
    echo "✅ Containers started successfully"
else
    echo "❌ Failed to start containers"
    echo "Check the error messages above"
    exit 1
fi

# Wait for containers to be ready
echo "⏳ Waiting for containers to be ready..."
sleep 15

# Check container status
echo "📊 Container Status:"
$COMPOSE_CMD -f "$COMPOSE_FILE" ps

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
echo "   $COMPOSE_CMD -f $COMPOSE_FILE logs -f              # View all logs"
echo "   $COMPOSE_CMD -f $COMPOSE_FILE logs -f python-django # View Django logs"
echo "   $COMPOSE_CMD -f $COMPOSE_FILE down                 # Stop all containers"
echo "   $COMPOSE_CMD -f $COMPOSE_FILE up -d                # Start all containers"
echo ""
echo "🔧 Management script:"
echo "   ./manage.sh start                 # Start environments"
echo "   ./manage.sh status                # Check status"
echo "   ./manage.sh test                  # Test connectivity" 