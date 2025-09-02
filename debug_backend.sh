#!/bin/bash

echo "🔍 Debugging Python Backend Startup"
echo "=================================="

# Check if we're in the right directory
echo "📁 Current directory: $(pwd)"

# Check if Python executable exists
if [ -f "pythondist/api" ]; then
    echo "✅ Python executable found: pythondist/api"
    ls -la pythondist/api
else
    echo "❌ Python executable not found: pythondist/api"
    echo "📂 Contents of pythondist/:"
    ls -la pythondist/ 2>/dev/null || echo "pythondist/ directory not found"
fi

# Check if Python source exists
if [ -f "python/api.py" ]; then
    echo "✅ Python source found: python/api.py"
else
    echo "❌ Python source not found: python/api.py"
fi

# Check Python environment
echo "🐍 Python version:"
python3 --version 2>/dev/null || echo "python3 not found"

# Check if we can run the Python executable directly
echo "🧪 Testing Python executable directly:"
if [ -f "pythondist/api" ]; then
    echo "Attempting to run: ./pythondist/api --apiport 5002 --signingkey devkey"
    timeout 5s ./pythondist/api --apiport 5002 --signingkey devkey &
    PYTHON_PID=$!
    sleep 2
    if kill -0 $PYTHON_PID 2>/dev/null; then
        echo "✅ Python backend started successfully"
        kill $PYTHON_PID
    else
        echo "❌ Python backend failed to start"
    fi
fi

echo "🔍 Check the logs in the app's user data directory for more details"
echo "📝 On macOS: ~/Library/Application Support/CAMELOTDJ/python.log"
echo "📝 On Windows: %APPDATA%/CAMELOTDJ/python.log"
