#!/bin/bash

# OverForge Docker PATH Helper
# Source this file to add Docker to your PATH

DOCKER_BIN_DIR="/Users/amit.ranjan/Application/Docker.app/Contents/Resources/bin"

if [ -d "$DOCKER_BIN_DIR" ]; then
    export PATH="$DOCKER_BIN_DIR:$PATH"
    echo "✅ Docker added to PATH"
    echo "   You can now use: docker, docker-compose commands"
    echo "   Docker version: $(docker --version)"
else
    echo "❌ Docker Desktop not found at expected location"
fi

# Alias for convenience
alias docker-env='cd /Users/amit.ranjan/overforge/backend/docker-environments'
alias docker-start='docker compose up -d'
alias docker-stop='docker compose down'
alias docker-status='docker compose ps'
alias docker-logs='docker compose logs -f'

echo "🔧 Available aliases:"
echo "   docker-env      # Navigate to docker environments directory"
echo "   docker-start    # Start all containers"
echo "   docker-stop     # Stop all containers"
echo "   docker-status   # Show container status"
echo "   docker-logs     # Show logs" 