#!/bin/bash

# OverForge Docker Environment Management Script

case "$1" in
    "start")
        echo "🚀 Starting OverForge Docker environments..."
        docker compose up -d
        echo "✅ All environments started"
        ;;
    "stop")
        echo "🛑 Stopping OverForge Docker environments..."
        docker compose down
        echo "✅ All environments stopped"
        ;;
    "restart")
        echo "🔄 Restarting OverForge Docker environments..."
        docker compose down
        docker compose up -d
        echo "✅ All environments restarted"
        ;;
    "status")
        echo "📊 OverForge Docker Environment Status:"
        docker compose ps
        ;;
    "logs")
        if [ -n "$2" ]; then
            echo "📋 Logs for $2:"
            docker compose logs -f "$2"
        else
            echo "📋 All environment logs:"
            docker compose logs -f
        fi
        ;;
    "rebuild")
        if [ -n "$2" ]; then
            echo "🔨 Rebuilding $2..."
            docker compose build --no-cache "$2"
            docker compose up -d "$2"
            echo "✅ $2 rebuilt and restarted"
        else
            echo "🔨 Rebuilding all environments..."
            docker compose build --no-cache
            docker compose up -d
            echo "✅ All environments rebuilt and restarted"
        fi
        ;;
    "clean")
        echo "🧹 Cleaning up Docker resources..."
        docker compose down -v
        docker system prune -f
        echo "✅ Cleanup complete"
        ;;
    "setup")
        echo "🛠️ Running setup..."
        ./setup.sh
        ;;
    "test")
        echo "🧪 Testing environment connectivity..."
        echo "Testing Django (8001)..."
        curl -s http://localhost:8001/health | jq . || echo "❌ Django not responding"
        echo "Testing Express (3001)..."
        curl -s http://localhost:3001/health | jq . || echo "❌ Express not responding"
        echo "Testing Node.js (3002)..."
        curl -s http://localhost:3002/health | jq . || echo "❌ Node.js not responding"
        echo "Testing Spring Boot (8002)..."
        curl -s http://localhost:8002/actuator/health | jq . || echo "❌ Spring Boot not responding"
        ;;
    *)
        echo "OverForge Docker Environment Manager"
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
        ;;
 esac 