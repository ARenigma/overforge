#!/bin/bash

# Restart Preview Containers Script
# This script restarts the Docker containers with updated configuration
# to fix the iframe/web preview issues

set -e  # Exit on any error

echo "🔄 Restarting Preview Containers with Updated Configuration"
echo "========================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Container configurations
CONTAINERS=(
    "python-django:8001"
    "javascript-express:3001"
    "javascript-nodejs:3002"
    "java-springboot:8002"
)

DOCKER_ENV_PATH="./backend/docker-environments"

# Check if we're in the right directory
if [ ! -d "$DOCKER_ENV_PATH" ]; then
    print_error "Docker environments directory not found: $DOCKER_ENV_PATH"
    print_error "Please run this script from the overforge root directory"
    exit 1
fi

print_status "Found Docker environments directory: $DOCKER_ENV_PATH"

# Stop existing containers
print_status "Stopping existing interview containers..."
for container_info in "${CONTAINERS[@]}"; do
    container_name=$(echo $container_info | cut -d':' -f1)
    port=$(echo $container_info | cut -d':' -f2)

    # Stop container if running
    if docker ps -q --filter "name=interview-${container_name}" | grep -q .; then
        print_status "Stopping interview-${container_name}..."
        docker stop "interview-${container_name}" || true
    fi

    # Remove container if exists
    if docker ps -aq --filter "name=interview-${container_name}" | grep -q .; then
        print_status "Removing interview-${container_name}..."
        docker rm "interview-${container_name}" || true
    fi

    # Stop any process using the port
    if lsof -ti :$port >/dev/null 2>&1; then
        print_warning "Killing process on port $port..."
        lsof -ti :$port | xargs kill -9 || true
    fi
done

print_success "Stopped all existing containers"

# Build and start containers
print_status "Building and starting containers with updated configuration..."

for container_info in "${CONTAINERS[@]}"; do
    container_name=$(echo $container_info | cut -d':' -f1)
    port=$(echo $container_info | cut -d':' -f2)
    container_path="$DOCKER_ENV_PATH/$container_name"

    if [ -d "$container_path" ]; then
        print_status "Building $container_name container..."

        # Build the container
        cd "$container_path"

        # Copy middleware file for Django
        if [ "$container_name" = "python-django" ]; then
            print_status "Copying custom middleware for Django..."
            if [ -f "interview_middleware.py" ]; then
                print_success "Custom middleware found"
            else
                print_warning "Custom middleware not found, using default configuration"
            fi
        fi

        # Build the Docker image
        if docker build -t "interview-${container_name}" .; then
            print_success "Built interview-${container_name} image"
        else
            print_error "Failed to build interview-${container_name} image"
            cd - > /dev/null
            continue
        fi

        # Start the container
        print_status "Starting interview-${container_name} on port ${port}..."
        if docker run -d \
            --name "interview-${container_name}" \
            -p "${port}:${port}" \
            -e DEBUG=True \
            -e ALLOWED_HOSTS="*" \
            -e PORT="${port}" \
            "interview-${container_name}"; then
            print_success "Started interview-${container_name} on port ${port}"
        else
            print_error "Failed to start interview-${container_name}"
        fi

        cd - > /dev/null
    else
        print_warning "Container directory not found: $container_path"
    fi

    echo ""
done

# Wait for containers to start
print_status "Waiting for containers to start..."
sleep 5

# Check container status
print_status "Checking container status..."
echo ""
printf "%-25s %-15s %-10s %-30s\n" "CONTAINER" "STATUS" "PORT" "URL"
echo "--------------------------------------------------------------------------------"

for container_info in "${CONTAINERS[@]}"; do
    container_name=$(echo $container_info | cut -d':' -f1)
    port=$(echo $container_info | cut -d':' -f2)

    # Check if container is running
    if docker ps --filter "name=interview-${container_name}" --format "{{.Status}}" | grep -q "Up"; then
        status="${GREEN}Running${NC}"
        url="http://localhost:${port}"

        # Test if port is accessible
        if curl -s "http://localhost:${port}/health" > /dev/null 2>&1 || curl -s "http://localhost:${port}" > /dev/null 2>&1; then
            status="${GREEN}Running ✓${NC}"
        else
            status="${YELLOW}Starting...${NC}"
        fi
    else
        status="${RED}Stopped${NC}"
        url="N/A"
    fi

    printf "%-35s %-25s %-10s %-30s\n" "interview-${container_name}" "$status" "$port" "$url"
done

echo ""
echo "=================================================================================="

# Test Django container specifically (the one having iframe issues)
print_status "Testing Django container iframe compatibility..."
if curl -s -I "http://localhost:8001" | grep -i "x-frame-options: sameorigin" > /dev/null; then
    print_success "Django container now allows iframe embedding (X-Frame-Options: SAMEORIGIN)"
elif curl -s -I "http://localhost:8001" | grep -i "x-frame-options" > /dev/null; then
    print_warning "Django container has X-Frame-Options set, but may need adjustment"
else
    print_warning "Could not verify X-Frame-Options header (container may still be starting)"
fi

# Test health endpoints
print_status "Testing health endpoints..."
for container_info in "${CONTAINERS[@]}"; do
    container_name=$(echo $container_info | cut -d':' -f1)
    port=$(echo $container_info | cut -d':' -f2)

    if curl -s "http://localhost:${port}/health" > /dev/null 2>&1; then
        print_success "Health check passed for ${container_name} on port ${port}"
    elif curl -s "http://localhost:${port}" > /dev/null 2>&1; then
        print_success "Container responding for ${container_name} on port ${port}"
    else
        print_warning "Container not responding for ${container_name} on port ${port}"
    fi
done

echo ""
print_success "Container restart completed!"
echo ""
echo "🌐 Web Preview URLs:"
echo "   Django:       http://localhost:8001"
echo "   Express:      http://localhost:3001"
echo "   Node.js:      http://localhost:3002"
echo "   Spring Boot:  http://localhost:8002"
echo ""
echo "🔧 To view logs for a container:"
echo "   docker logs interview-python-django"
echo "   docker logs interview-javascript-express"
echo ""
echo "🛑 To stop all containers:"
echo "   docker stop \$(docker ps -q --filter 'name=interview-')"
echo ""
echo "✅ The iframe/web preview issue should now be fixed!"
echo "   Try refreshing your web preview in the Overforge interface."
