#!/usr/bin/env python3
"""
Test script for the new ID3 tag update functionality.
This script demonstrates how to use the new endpoints to update ID3 tags.
"""

import requests
import json
import os

# Configuration
API_BASE_URL = "http://127.0.0.1:5002"
SIGNING_KEY = "devkey"  # Updated to match your running server

def test_single_song_update():
    """Test updating ID3 tags for a single song."""
    print("🧪 Testing single song ID3 tag update...")
    
    # Example: Update by song ID
    payload = {
        "song_id": "1"  # Replace with actual song ID from your library
    }
    
    headers = {
        "X-Signing-Key": SIGNING_KEY,
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/library/update-tags",
            json=payload,
            headers=headers
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Success: {result['message']}")
            print(f"📝 Tag result: {result['tag_result']}")
            if result.get('rename_result'):
                print(f"🔄 Rename result: {result['rename_result']}")
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Request failed: {str(e)}")

def test_batch_update():
    """Test batch updating ID3 tags for multiple songs."""
    print("\n🧪 Testing batch ID3 tag update...")
    
    # Example: Update all songs in library
    payload = {
        "update_all": True
    }
    
    # Alternative: Update specific songs
    # payload = {
    #     "song_ids": ["1", "2", "3"]  # Replace with actual song IDs
    # }
    
    headers = {
        "X-Signing-Key": SIGNING_KEY,
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/library/batch-update-tags",
            json=payload,
            headers=headers
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Success: {result['message']}")
            print(f"📊 Total processed: {result['total_processed']}")
            print(f"✅ Successful: {result['successful']}")
            print(f"❌ Failed: {result['failed']}")
            
            # Show detailed results for failed items
            failed_items = [r for r in result['results'] if r['status'] != 'success']
            if failed_items:
                print(f"\n⚠️ Failed items:")
                for item in failed_items:
                    print(f"  - Song {item['song_id']}: {item['filename']} - {item.get('error', 'Unknown error')}")
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Request failed: {str(e)}")

def test_library_info():
    """Test getting library information."""
    print("\n📚 Testing library info...")
    
    headers = {
        "X-Signing-Key": SIGNING_KEY
    }
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/library",
            headers=headers
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Library loaded successfully")
            print(f"📊 Total songs: {result['total']}")
            
            # Show first few songs as examples
            if result['songs']:
                print(f"\n📝 Sample songs:")
                for i, song in enumerate(result['songs'][:3]):
                    print(f"  {i+1}. {song['filename']}")
                    print(f"     Key: {song.get('camelot_key', 'N/A')}, BPM: {song.get('bpm', 'N/A')}")
                    print(f"     Energy: {song.get('energy_level', 'N/A')}")
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Request failed: {str(e)}")

def main():
    """Main test function."""
    print("🎵 Mixed In Key - ID3 Tag Update Test Script")
    print("=" * 50)
    
    # Check if API is running
    try:
        response = requests.get(f"{API_BASE_URL}/hello", headers={"X-Signing-Key": SIGNING_KEY})
        if response.status_code == 200:
            print("✅ API server is running")
        else:
            print("❌ API server is not responding correctly")
            return
    except Exception as e:
        print(f"❌ Cannot connect to API server: {str(e)}")
        print(f"Make sure the server is running on {API_BASE_URL}")
        return
    
    # Run tests
    test_library_info()
    test_single_song_update()
    test_batch_update()
    
    print("\n🎉 Test script completed!")

if __name__ == "__main__":
    main()
