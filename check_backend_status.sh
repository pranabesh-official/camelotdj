#!/bin/bash

# Backend Status Check Script for Mixed In Key
# This script checks if the backend is running and provides status information

echo "🎵 Mixed In Key Backend Status Check"
echo "===================================="

# Check if backend is running
if lsof -i :5002 > /dev/null 2>&1; then
    echo "✅ Backend is running on port 5002"
    
    # Get process information
    PID=$(lsof -i :5002 | grep Python | awk '{print $2}')
    echo "📊 Process ID: $PID"
    
    # Test API endpoint
    echo "🔍 Testing API endpoint..."
    response=$(curl -s -X POST http://127.0.0.1:5002/graphql/ -H "Content-Type: application/json" -d '{"query": "{ awake }"}' 2>/dev/null)
    
    if echo "$response" | grep -q "Awake"; then
        echo "✅ API is responding correctly"
        echo "🌐 Backend is fully operational"
    else
        echo "⚠️  Backend is running but API is not responding correctly"
        echo "Response: $response"
    fi
else
    echo "❌ Backend is not running on port 5002"
    echo "💡 To start the backend, run: ./start_backend_easy.sh"
fi
