#!/bin/bash

# Function to kill all background jobs on exit
cleanup() {
    echo "Stopping all services..."
    # Using pkill to be more robust in case jobs -p fails
    pkill -P $$
    exit
}

trap cleanup INT

# --- AI Module Setup ---
AI_MODULE_DIR="ai_module"
VENV_DIR="$AI_MODULE_DIR/venv"

# Check if python3 is available
if ! command -v python3 &> /dev/null
then
    echo "Error: python3 is not installed. Please install Python 3 to run the AI Module."
    exit 1
fi

# Check if virtual environment exists, if not create it and install dependencies
if [ ! -d "$VENV_DIR" ]; then
    echo "Python virtual environment not found. Creating one..."
    python3 -m venv "$VENV_DIR"
    echo "Virtual environment created. Installing dependencies..."
    "$VENV_DIR/bin/pip" install -r "$AI_MODULE_DIR/requirements.txt"
    if [ $? -ne 0 ]; then
        echo "Error: Failed to install dependencies for AI module. Please check requirements.txt and run pip install manually."
        exit 1
    fi
    echo "AI Module dependencies installed."
fi

# --- Start Services ---

# Start Backend
echo "Starting Backend service..."
(cd backend && npm run dev) &
BACKEND_PID=$!

# Start AI Module
echo "Starting AI Module service..."
(cd $AI_MODULE_DIR && ../$VENV_DIR/bin/uvicorn app:app --reload --port 8000) &
AI_MODULE_PID=$!

# Start Frontend
echo "Starting Frontend service..."
(cd frontend && npm run dev) &
FRONTEND_PID=$!


echo "All services are starting in the background."
echo "Backend PID: $BACKEND_PID"
echo "AI Module PID: $AI_MODULE_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Press Ctrl+C to stop all services."

# Wait for all background jobs to finish
wait 