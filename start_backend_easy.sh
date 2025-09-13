#!/bin/bash

# Easy Backend Startup Script for Mixed In Key
# This script ensures the backend is running and provides helpful feedback

echo "🎵 Mixed In Key Backend Startup Script"
echo "======================================"

# Check if backend is already running
if lsof -i :5002 > /dev/null 2>&1; then
    echo "✅ Backend is already running on port 5002"
    echo "🌐 You can now use the application"
    exit 0
fi

echo "🚀 Starting backend server..."

# Change to python directory
cd "$(dirname "$0")/python"

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed or not in PATH"
    echo "Please install Python 3 and try again"
    exit 1
fi

# Check if required modules are available
echo "🔍 Checking dependencies..."
python3 -c "import flask, flask_cors, flask_graphql, graphene" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "❌ Required Python packages are missing"
    echo "Please run: pip install -r requirements.txt"
    exit 1
fi

echo "✅ Dependencies are available"

# Start the backend
echo "🎯 Starting backend on port 5002..."
python3 api.py --apiport 5002 --signingkey devkey
