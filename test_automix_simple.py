#!/usr/bin/env python3
"""
Simple Auto Mix Test
===================

Quick test to verify Auto Mix functionality is working.
"""

import requests
import json

def test_automix():
    """Test Auto Mix functionality."""
    base_url = "http://127.0.0.1:5002"
    headers = {"X-Signing-Key": "devkey", "Content-Type": "application/json"}
    
    print("🧪 Testing Auto Mix functionality...")
    
    # Test 1: Check AI Status
    print("\n1. Checking AI Status...")
    try:
        response = requests.get(f"{base_url}/automix/ai-status", headers={"X-Signing-Key": "devkey"})
        if response.status_code == 200:
            data = response.json()
            print(f"   Status: {data['ai_status']['is_initialized']}")
            print(f"   Model: {data['ai_status']['model_name']}")
            print(f"   Error: {data['ai_status']['initialization_error']}")
        else:
            print(f"   Error: HTTP {response.status_code}")
    except Exception as e:
        print(f"   Error: {e}")
    
    # Test 2: Test with sample data
    print("\n2. Testing track recommendation...")
    test_data = {
        "current_song": {
            "id": "test1",
            "filename": "test1.mp3",
            "camelot_key": "8B",
            "bpm": 128.0,
            "energy_level": 7,
            "duration": 240.0,
            "artist": "Test Artist",
            "title": "Test Song"
        },
        "playlist": [
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
        ],
        "transition_type": "smooth_transition"
    }
    
    try:
        response = requests.post(f"{base_url}/automix/next-track", 
                               headers=headers, 
                               json=test_data)
        if response.status_code == 200:
            data = response.json()
            print(f"   Status: {data['status']}")
            if data['status'] == 'success':
                print(f"   Recommended: {data['recommended_track']['filename']}")
            else:
                print(f"   Message: {data.get('message', 'No message')}")
        else:
            print(f"   Error: HTTP {response.status_code}")
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"   Error: {e}")

if __name__ == "__main__":
    test_automix()
