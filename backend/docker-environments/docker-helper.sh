#!/bin/bash

# OverForge Docker Helper Script
# Usage: ./docker-helper.sh [command]

DOCKER_BIN_DIR="/Users/amit.ranjan/Application/Docker.app/Contents/Resources/bin"

# Add Docker to PATH for this script
export PATH="$DOCKER_BIN_DIR:$PATH"

case "$1" in
    "start")
        echo "🚀 Starting OverForge Docker containers..."
        docker compose up -d
        echo "✅ All containers started"
        ;;
    "stop")
        echo "🛑 Stopping OverForge Docker containers..."
        docker compose down
        echo "✅ All containers stopped"
        ;;
    "status")
        echo "📊 OverForge Container Status:"
        docker compose ps
        ;;
    "logs")
        echo "📋 Container logs (Ctrl+C to exit):"
        docker compose logs -f
        ;;
    "restart")
        echo "🔄 Restarting OverForge Docker containers..."
        docker compose restart
        echo "✅ All containers restarted"
        ;;
    "build")
        echo "🔨 Building OverForge Docker containers..."
        docker compose build
        echo "✅ Build complete"
        ;;
    "clean")
        echo "🧹 Cleaning up OverForge Docker environment..."
        docker compose down -v --remove-orphans
        docker image prune -f
        echo "✅ Cleanup complete"
        ;;
    "health")
        echo "🏥 Health check for all services:"
        docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        echo "🌐 Service URLs:"
        echo "  Django:      http://localhost:8001"
        echo "  Express:     http://localhost:3001"
        echo "  Node.js:     http://localhost:3002"
        echo "  Spring Boot: http://localhost:8002"
        echo "  PostgreSQL:  localhost:5433"
        echo "  Redis:       localhost:6380"
        ;;
    *)
        echo "OverForge Docker Helper"
        echo "Usage: $0 [command]"
        echo ""
        echo "Available commands:"
        echo "  start    - Start all containers"
        echo "  stop     - Stop all containers"
        echo "  status   - Show container status"
        echo "  logs     - Show container logs"
        echo "  restart  - Restart all containers"
        echo "  build    - Build all containers"
        echo "  clean    - Clean up containers and images"
        echo "  health   - Show health status and URLs"
        echo ""
        echo "Example: $0 start"
        ;;
esac