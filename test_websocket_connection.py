#!/usr/bin/env python3
"""
Test script to verify WebSocket connection between frontend and backend
"""
import socketio
import time
import sys

def test_websocket_connection(api_port=5000):
    """Test WebSocket connection to the backend"""
    print(f"🧪 Testing WebSocket connection to port {api_port}...")
    
    # Create SocketIO client
    sio = socketio.Client()
    
    @sio.event
    def connect():
        print("✅ WebSocket connected successfully!")
        
    @sio.event
    def disconnect():
        print("❌ WebSocket disconnected")
        
    @sio.event
    def connected(data):
        print(f"📡 Received connected event: {data}")
        
    @sio.event
    def download_progress(data):
        print(f"📥 Received download progress: {data}")
        
    @sio.event
    def download_error(data):
        print(f"❌ Received download error: {data}")
        
    @sio.event
    def pong(data):
        print(f"🏓 Received pong: {data}")
        
    try:
        # Connect to the backend
        sio.connect(f'http://127.0.0.1:{api_port}')
        
        # Send a test message
        sio.emit('test_message', {'message': 'Hello from test client'})
        
        # Send a ping
        sio.emit('ping')
        
        # Wait for a few seconds to receive responses
        time.sleep(3)
        
        # Disconnect
        sio.disconnect()
        
        print("✅ WebSocket test completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ WebSocket test failed: {e}")
        return False

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    success = test_websocket_connection(port)
    sys.exit(0 if success else 1)
