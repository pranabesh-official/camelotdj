#!/usr/bin/env python3
"""
Auto Mix Quick Start Test
========================

This script provides a quick way to test the Auto Mix feature implementation.
It starts the API server, runs basic tests, and provides usage examples.

Usage:
    python test_automix_quickstart.py

Author: AI Assistant
Date: 2024
"""

import subprocess
import time
import requests
import json
import sys
import os
from pathlib import Path

def check_dependencies():
    """Check if required dependencies are installed."""
    print("🔍 Checking dependencies...")
    
    try:
        import llm
        print("✅ llm library is installed")
    except ImportError:
        print("❌ llm library not found. Installing...")
        subprocess.run([sys.executable, "-m", "pip", "install", "llm"], check=True)
        print("✅ llm library installed")
    
    try:
        import flask
        print("✅ Flask is installed")
    except ImportError:
        print("❌ Flask not found. Installing...")
        subprocess.run([sys.executable, "-m", "pip", "install", "flask"], check=True)
        print("✅ Flask installed")

def start_api_server():
    """Start the API server in the background."""
    print("🚀 Starting API server...")
    
    # Change to the python directory
    python_dir = Path(__file__).parent / "python"
    os.chdir(python_dir)
    
    # Start the server
    process = subprocess.Popen([sys.executable, "api.py"], 
                             stdout=subprocess.PIPE, 
                             stderr=subprocess.PIPE)
    
    # Wait for server to start
    print("⏳ Waiting for server to start...")
    time.sleep(5)
    
    # Check if server is running
    try:
        response = requests.get("http://127.0.0.1:5002/hello", 
                              headers={"X-Signing-Key": "devkey"})
        if response.status_code == 200:
            print("✅ API server is running")
            return process
        else:
            print("❌ API server failed to start properly")
            return None
    except requests.exceptions.ConnectionError:
        print("❌ API server is not responding")
        return None

def test_basic_functionality():
    """Test basic Auto Mix functionality."""
    print("\n🧪 Testing basic functionality...")
    
    # Test data
    test_songs = [
        {
            "id": "test1",
            "filename": "test1.mp3",
            "camelot_key": "8B",
            "bpm": 128.0,
            "energy_level": 7,
            "duration": 240.0,
            "artist": "Test Artist 1",
            "title": "Test Song 1"
        },
        {
            "id": "test2",
            "filename": "test2.mp3",
            "camelot_key": "8B",
            "bpm": 130.0,
            "energy_level": 8,
            "duration": 200.0,
            "artist": "Test Artist 2",
            "title": "Test Song 2"
        },
        {
            "id": "test3",
            "filename": "test3.mp3",
            "camelot_key": "9B",
            "bpm": 125.0,
            "energy_level": 6,
            "duration": 180.0,
            "artist": "Test Artist 3",
            "title": "Test Song 3"
        }
    ]
    
    headers = {
        "Content-Type": "application/json",
        "X-Signing-Key": "devkey"
    }
    
    # Test 1: AI Status
    print("1. Testing AI status...")
    try:
        response = requests.get("http://127.0.0.1:5002/automix/ai-status",
                              headers={"X-Signing-Key": "devkey"})
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ AI Status: {data['ai_status']['is_initialized']}")
        else:
            print(f"   ❌ AI Status failed: {response.status_code}")
    except Exception as e:
        print(f"   ❌ AI Status error: {e}")
    
    # Test 2: Playlist Analysis
    print("2. Testing playlist analysis...")
    try:
        response = requests.post("http://127.0.0.1:5002/automix/analyze-playlist",
                               headers=headers,
                               json={"playlist": test_songs})
        if response.status_code == 200:
            data = response.json()
            score = data['playlist_analysis']['compatibility_score']
            print(f"   ✅ Playlist analysis: {score}% compatibility")
        else:
            print(f"   ❌ Playlist analysis failed: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Playlist analysis error: {e}")
    
    # Test 3: Next Track Recommendation
    print("3. Testing next track recommendation...")
    try:
        current_song = test_songs[0]
        playlist = test_songs[1:]
        
        response = requests.post("http://127.0.0.1:5002/automix/next-track",
                               headers=headers,
                               json={
                                   "current_song": current_song,
                                   "playlist": playlist,
                                   "transition_type": "smooth_transition"
                               })
        if response.status_code == 200:
            data = response.json()
            if data['status'] == 'success':
                recommended = data['recommended_track']['filename']
                print(f"   ✅ Recommended: {recommended}")
            else:
                print(f"   ℹ️  No recommendation: {data.get('message', 'Unknown')}")
        else:
            print(f"   ❌ Next track failed: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Next track error: {e}")
    
    # Test 4: Transition Types
    print("4. Testing transition types...")
    try:
        response = requests.get("http://127.0.0.1:5002/automix/transition-types",
                              headers={"X-Signing-Key": "devkey"})
        if response.status_code == 200:
            data = response.json()
            types = [t['type'] for t in data['transition_types']]
            print(f"   ✅ Available transitions: {', '.join(types)}")
        else:
            print(f"   ❌ Transition types failed: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Transition types error: {e}")

def run_comprehensive_tests():
    """Run comprehensive test suite."""
    print("\n🧪 Running comprehensive tests...")
    
    try:
        # Run unit tests
        result = subprocess.run([sys.executable, "run_automix_tests.py"], 
                              capture_output=True, text=True)
        if result.returncode == 0:
            print("✅ Unit tests passed")
        else:
            print("❌ Unit tests failed")
            print(result.stdout)
            print(result.stderr)
    except Exception as e:
        print(f"❌ Unit test error: {e}")
    
    try:
        # Run E2E tests
        result = subprocess.run([sys.executable, "test_automix_e2e.py"], 
                              capture_output=True, text=True)
        if result.returncode == 0:
            print("✅ E2E tests passed")
        else:
            print("❌ E2E tests failed")
            print(result.stdout)
            print(result.stderr)
    except Exception as e:
        print(f"❌ E2E test error: {e}")

def show_usage_examples():
    """Show usage examples."""
    print("\n📚 Usage Examples:")
    print("=" * 50)
    
    print("\n1. Frontend Integration:")
    print("   - The Auto Mix button is now available in the AudioPlayer component")
    print("   - Click the toggle to enable/disable Auto Mix")
    print("   - Use the Next button to get AI-recommended tracks")
    
    print("\n2. API Usage:")
    print("   curl -X POST http://127.0.0.1:5002/automix/next-track \\")
    print("        -H 'Content-Type: application/json' \\")
    print("        -H 'X-Signing-Key: devkey' \\")
    print("        -d '{\"current_song\": {...}, \"playlist\": [...]}'")
    
    print("\n3. Python Integration:")
    print("   import requests")
    print("   response = requests.post('http://127.0.0.1:5002/automix/next-track', ...)")
    print("   recommendation = response.json()['recommended_track']")

def main():
    """Main function."""
    print("🎵 Auto Mix Quick Start Test")
    print("=" * 50)
    
    # Check dependencies
    check_dependencies()
    
    # Start API server
    server_process = start_api_server()
    if not server_process:
        print("❌ Failed to start API server. Exiting.")
        return 1
    
    try:
        # Test basic functionality
        test_basic_functionality()
        
        # Ask if user wants to run comprehensive tests
        print("\n❓ Run comprehensive tests? (y/n): ", end="")
        if input().lower().startswith('y'):
            run_comprehensive_tests()
        
        # Show usage examples
        show_usage_examples()
        
        print("\n✅ Quick start test completed!")
        print("\n📖 For detailed documentation, see AUTOMIX_IMPLEMENTATION_GUIDE.md")
        
    finally:
        # Clean up
        print("\n🧹 Cleaning up...")
        server_process.terminate()
        server_process.wait()
        print("✅ Server stopped")
    
    return 0

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
