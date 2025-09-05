#!/bin/bash

# OverForge Docker Environment Management Script (Direct Paths)

# Set direct paths to Docker CLI tools
DOCKER_CLI="/Users/amit.ranjan/Application/Docker.app/Contents/Resources/bin/docker"
DOCKER_COMPOSE="$DOCKER_CLI compose"

case "$1" in
    "start")
        echo "🚀 Starting OverForge Docker environments..."
        $DOCKER_COMPOSE up -d
        echo "✅ All environments started"
        ;;
    "stop")
        echo "🛑 Stopping OverForge Docker environments..."
        $DOCKER_COMPOSE down
        echo "✅ All environments stopped"
        ;;
    "restart")
        echo "🔄 Restarting OverForge Docker environments..."
        $DOCKER_COMPOSE down
        $DOCKER_COMPOSE up -d
        echo "✅ All environments restarted"
        ;;
    "status")
        echo "📊 OverForge Docker Environment Status:"
        $DOCKER_COMPOSE ps
        ;;
    "logs")
        if [ -n "$2" ]; then
            echo "📋 Logs for $2:"
            $DOCKER_COMPOSE logs -f "$2"
        else
            echo "📋 All environment logs:"
            $DOCKER_COMPOSE logs -f
        fi
        ;;
    "rebuild")
        if [ -n "$2" ]; then
            echo "🔨 Rebuilding $2..."
            $DOCKER_COMPOSE build --no-cache "$2"
            $DOCKER_COMPOSE up -d "$2"
            echo "✅ $2 rebuilt and restarted"
        else
            echo "🔨 Rebuilding all environments..."
            $DOCKER_COMPOSE build --no-cache
            $DOCKER_COMPOSE up -d
            echo "✅ All environments rebuilt and restarted"
        fi
        ;;
    "clean")
        echo "🧹 Cleaning up Docker resources..."
        $DOCKER_COMPOSE down -v
        $DOCKER_CLI system prune -f
        echo "✅ Cleanup complete"
        ;;
    "test")
        echo "🧪 Testing environment connectivity..."
        
        test_service() {
            local name=$1
            local url=$2
            
            if curl -s --max-time 5 "$url" > /dev/null 2>&1; then
                echo "✅ $name: $url"
            else
                echo "❌ $name: $url (not responding)"
            fi
        }
        
        test_service "Django" "http://localhost:8001/"
        test_service "Express" "http://localhost:3001/"
        test_service "Node.js" "http://localhost:3002/"
        test_service "Spring Boot" "http://localhost:8002/"
        ;;
    "setup")
        echo "🛠️ Running setup..."
        ./setup-working.sh
        ;;
    *)
        echo "OverForge Docker Environment Manager (Direct Paths)"
        echo "Usage: $0 {start|stop|restart|status|logs|rebuild|clean|setup|test}"
        echo ""
        echo "Commands:"
        echo "  start           Start all environments"
        echo "  stop            Stop all environments"
        echo "  restart         Restart all environments"
        echo "  status          Show container status"
        echo "  logs [service]  Show logs (optionally for specific service)"
        echo "  rebuild [service] Rebuild and restart (optionally specific service)"
        echo "  clean           Stop and clean all Docker resources"
        echo "  setup           Run initial setup"
        echo "  test            Test environment connectivity"
        echo ""
        echo "Examples:"
        echo "  $0 start"
        echo "  $0 logs python-django"
        echo "  $0 rebuild javascript-express"
        echo ""
        echo "🔧 Using Docker at: $DOCKER_CLI"
        ;;
esac 