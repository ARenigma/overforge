#!/bin/bash

echo "Stopping all services..."

# Find and kill processes by port
lsof -ti:5000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9 # Next.js might be on other ports
lsof -ti:3002 | xargs kill -9 # Next.js might be on other ports

# Also kill the docker-compose processes just in case
(cd backend/docker-environments && docker-compose down)

echo "All services stopped." 