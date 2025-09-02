#!/bin/bash

# Mixed In Key Backend Startup Script
# This script automatically restarts the Python backend if it stops

cd "$(dirname "$0")/python"

echo "Starting Mixed In Key Python Backend..."
echo "Backend will run on port 5002 with signing key 'devkey'"
echo "Press Ctrl+C to stop the backend"
echo "========================================="

# Function to start the backend
start_backend() {
    python3 api.py --apiport 5002 --signingkey devkey
}

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down Mixed In Key backend..."
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Keep trying to start the backend if it stops unexpectedly
while true; do
    echo "$(date): Starting backend..."
    start_backend
    exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo "$(date): Backend stopped normally"
        break
    else
        echo "$(date): Backend stopped unexpectedly (exit code: $exit_code)"
        echo "$(date): Restarting in 3 seconds..."
        sleep 3
    fi
done