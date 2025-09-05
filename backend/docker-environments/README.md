# 🐳 OverForge Interview Framework Environments

This directory contains Docker-based execution environments for different programming frameworks used in coding interviews.

## 📋 Prerequisites

### Install Docker Desktop
1. **macOS**: Download from [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
2. **Windows**: Download from [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
3. **Linux**: Install using package manager or from [Docker Engine](https://docs.docker.com/engine/install/)

### Verify Installation
```bash
docker --version
docker-compose --version
```

## 🏗️ Available Environments

| Framework | Container | Port | Description |
|-----------|-----------|------|-------------|
| **Python/Django** | `python-django` | 8001 | Django 5.0 with PostgreSQL |
| **JavaScript/Express** | `javascript-express` | 3001 | Express.js with middleware |
| **JavaScript/Node.js** | `javascript-nodejs` | 3002 | Pure Node.js environment |
| **Java/Spring Boot** | `java-springboot` | 8002 | Spring Boot with JPA |

## 🚀 Quick Start

### 1. Start All Environments
```bash
cd backend/docker-environments
docker-compose up -d
```

### 2. Check Status
```bash
docker-compose ps
```

### 3. Access Environments
- **Django Admin**: http://localhost:8001/admin/ (admin/interview123)
- **Express API**: http://localhost:3001/
- **Node.js API**: http://localhost:3002/
- **Spring Boot**: http://localhost:8002/actuator/health

### 4. View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f python-django
```

## 🔧 Individual Environment Management

### Start Specific Environment
```bash
docker-compose up -d python-django
docker-compose up -d javascript-express
docker-compose up -d java-springboot
```

### Stop Environments
```bash
docker-compose down
```

### Rebuild After Changes
```bash
docker-compose build --no-cache python-django
docker-compose up -d python-django
```

## 📊 Database Access

### PostgreSQL Connection
- **Host**: localhost
- **Port**: 5433
- **Username**: postgres
- **Password**: interview123
- **Databases**:
  - `django_interview_db`
  - `springboot_interview_db`
  - `express_interview_db`
  - `nodejs_interview_db`

### Redis Connection
- **Host**: localhost
- **Port**: 6380

## 🐛 Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs python-django

# Rebuild container
docker-compose build --no-cache python-django
docker-compose up -d python-django
```

### Port Conflicts
If ports are already in use, modify `docker-compose.yml`:
```yaml
ports:
  - "8011:8000"  # Change 8001 to 8011
```

### Clean Reset
```bash
# Stop and remove everything
docker-compose down -v
docker system prune -f

# Restart
docker-compose up -d
```

## 🔄 Integration with OverForge

The ContainerService automatically:
1. **Detects framework type** from interview session
2. **Starts appropriate container** if not running
3. **Executes code** within the container environment
4. **Returns results** with web preview URL

### Supported Problem Types
- **Django Model Setup** → Python/Django container
- **Express Route Handler** → JavaScript/Express container
- **Async Function Handler** → JavaScript/Node.js container
- **Spring Boot REST API** → Java/Spring Boot container

## 🚧 Development

### Add New Framework
1. Create new directory: `backend/docker-environments/new-framework/`
2. Add Dockerfile and configuration files
3. Update `docker-compose.yml`
4. Update `containerService.js` framework mapping
5. Test with `docker-compose up -d new-framework`

### Modify Existing Environment
1. Edit files in framework directory
2. Rebuild: `docker-compose build --no-cache framework-name`
3. Restart: `docker-compose up -d framework-name`

## 📈 Performance Notes

- **Cold Start**: ~10-30 seconds for first container start
- **Warm Start**: ~2-5 seconds for subsequent executions
- **Memory Usage**: ~100-500MB per active container
- **Concurrent Sessions**: Containers are shared between interview sessions

## 🔐 Security

- Containers run in isolated network
- Limited resource allocation
- No persistent code storage
- Automatic cleanup of temporary files 