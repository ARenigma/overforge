# Docker Usage Guide

## ✅ Docker Status: All Containers Running Successfully

Your OverForge Docker environment is fully operational!

## Simple Commands

Use the new `docker-helper.sh` script for easy container management:

```bash
# Navigate to docker directory
cd backend/docker-environments

# Check status and health
./docker-helper.sh health

# View container status
./docker-helper.sh status

# View logs
./docker-helper.sh logs

# Restart if needed
./docker-helper.sh restart

# Stop containers
./docker-helper.sh stop

# Start containers
./docker-helper.sh start
```

## Service URLs (All Working ✅)

- **Django**: http://localhost:8001 (Admin: admin/interview123)
- **Express.js**: http://localhost:3001 (REST API)
- **Node.js**: http://localhost:3002 (Async Environment)
- **Spring Boot**: http://localhost:8002 (Enterprise Java)
- **PostgreSQL**: localhost:5433 (Database)
- **Redis**: localhost:6380 (Cache)

## Testing Services

All services are healthy and responding:

```bash
# Test Express.js
curl http://localhost:3001/health

# Test Spring Boot
curl http://localhost:8002/actuator/health

# Test Django (browser)
open http://localhost:8001

# Test PostgreSQL connection
psql -h localhost -p 5433 -U interview_user -d express_db
```

## What Fixed the Issue

The problem was with shell aliases not persisting across terminal sessions. The new `docker-helper.sh` script:

1. ✅ **Direct execution**: Commands run immediately without alias dependency
2. ✅ **PATH management**: Automatically adds Docker to PATH
3. ✅ **Clear feedback**: Shows exactly what's happening
4. ✅ **Health monitoring**: Easy status checking

## Frontend Integration Ready

Your enhanced interface can now use these production containers:

1. **Session containers**: Auto-created for framework problems
2. **Live web preview**: Real-time output in iframe
3. **Console output**: Container metrics and execution results
4. **Resource monitoring**: CPU/memory tracking

## Next Steps

1. Start your frontend: `cd frontend && npm run dev`
2. Start your backend: `cd backend && npm start`
3. Navigate to: http://localhost:3000/room/test-session/choose
4. Select "Enhanced Interface"
5. Choose a framework (Django, Express, Spring Boot)
6. Watch containers auto-create and run your code!

## Troubleshooting

If you ever have Docker issues:

```bash
# Check if Docker Desktop is running
./docker-helper.sh health

# Restart everything
./docker-helper.sh restart

# Clean rebuild (if needed)
./docker-helper.sh clean
./docker-helper.sh build
./docker-helper.sh start
```

Your Docker environment is production-ready! 🚀