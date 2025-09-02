#!/usr/bin/env python3
"""
Complete test script for the Mixed In Key ID3 tag update system.
This script tests all functionality including ID3 tag updates, file renaming, and batch operations.
"""

import requests
import json
import os
import time

# Configuration
API_BASE_URL = "http://127.0.0.1:5002"
SIGNING_KEY = "devkey"  # Updated to match your running server

def test_api_connection():
    """Test basic API connection."""
    print("🔌 Testing API connection...")
    
    try:
        response = requests.get(f"{API_BASE_URL}/hello", headers={"X-Signing-Key": SIGNING_KEY})
        if response.status_code == 200:
            result = response.json()
            print(f"✅ API connected: {result['message']}")
            return True
        else:
            print(f"❌ API connection failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Cannot connect to API: {str(e)}")
        return False

def test_library_info():
    """Get library information and display sample songs."""
    print("\n📚 Getting library information...")
    
    try:
        response = requests.get(f"{API_BASE_URL}/library", headers={"X-Signing-Key": SIGNING_KEY})
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Library loaded: {result['total']} songs")
            
            if result['songs']:
                print(f"\n📝 Sample songs in library:")
                for i, song in enumerate(result['songs'][:5]):
                    print(f"  {i+1}. ID: {song['id']} - {song['filename']}")
                    print(f"     Key: {song.get('camelot_key', 'N/A')}, BPM: {song.get('bpm', 'N/A')}")
                    print(f"     Energy: {song.get('energy_level', 'N/A')}")
                    print(f"     Path: {song.get('file_path', 'N/A')}")
                    print()
            return result['songs']
        else:
            print(f"❌ Failed to get library: {response.status_code}")
            return []
            
    except Exception as e:
        print(f"❌ Library request failed: {str(e)}")
        return []

def test_single_song_update(song_id):
    """Test updating ID3 tags for a single song."""
    print(f"\n🧪 Testing single song ID3 tag update for song ID: {song_id}")
    
    payload = {
        "song_id": str(song_id)
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
            
            if result.get('tag_result'):
                tag_data = result['tag_result'].get('metadata_written', {})
                print(f"📝 ID3 Tags updated:")
                print(f"   Title: {tag_data.get('title', 'N/A')}")
                print(f"   Comment: {tag_data.get('comment', 'N/A')}")
                print(f"   Track Number: {tag_data.get('track_number', 'N/A')}")
                print(f"   Artist: {tag_data.get('artist', 'N/A')}")
                print(f"   Album: {tag_data.get('album', 'N/A')}")
                print(f"   Genre: {tag_data.get('genre', 'N/A')}")
            
            if result.get('rename_result', {}).get('renamed'):
                rename_data = result['rename_result']
                print(f"🔄 File renamed:")
                print(f"   Old: {rename_data.get('old_filename', 'N/A')}")
                print(f"   New: {rename_data.get('new_filename', 'N/A')}")
            
            return True
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Request failed: {str(e)}")
        return False

def test_force_update_tags(song_id):
    """Test force updating ID3 tags for a song."""
    print(f"\n🔧 Testing force update ID3 tags for song ID: {song_id}")
    
    payload = {
        "song_id": str(song_id),
        "force_rename": True
    }
    
    headers = {
        "X-Signing-Key": SIGNING_KEY,
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/library/force-update-tags",
            json=payload,
            headers=headers
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Success: {result['message']}")
            
            if result.get('tag_result'):
                tag_data = result['tag_result'].get('metadata_written', {})
                print(f"📝 ID3 Tags updated:")
                print(f"   Title: {tag_data.get('title', 'N/A')}")
                print(f"   Comment: {tag_data.get('comment', 'N/A')}")
                print(f"   Track Number: {tag_data.get('track_number', 'N/A')}")
            
            return True
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Request failed: {str(e)}")
        return False

def test_batch_update_specific_songs(song_ids):
    """Test batch updating ID3 tags for specific songs."""
    print(f"\n📦 Testing batch update for specific songs: {song_ids}")
    
    payload = {
        "song_ids": song_ids
    }
    
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
            
            # Show detailed results
            if result.get('results'):
                print(f"\n📋 Detailed results:")
                for item in result['results']:
                    status_emoji = "✅" if item['status'] == 'success' else "❌"
                    print(f"  {status_emoji} Song {item['song_id']}: {item['filename']}")
                    if item['status'] != 'success':
                        print(f"     Error: {item.get('error', 'Unknown error')}")
            
            return True
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Request failed: {str(e)}")
        return False

def test_batch_update_all():
    """Test batch updating ID3 tags for all songs in library."""
    print(f"\n🌍 Testing batch update for ALL songs in library...")
    
    payload = {
        "update_all": True
    }
    
    headers = {
        "X-Signing-Key": SIGNING_KEY,
        "Content-Type": "application/json"
    }
    
    try:
        print("⚠️ This will update ALL songs in your library. Starting in 3 seconds...")
        for i in range(3, 0, -1):
            print(f"   {i}...")
            time.sleep(1)
        
        print("🚀 Starting batch update...")
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
            
            # Show failed items if any
            failed_items = [r for r in result['results'] if r['status'] != 'success']
            if failed_items:
                print(f"\n⚠️ Failed items:")
                for item in failed_items:
                    print(f"  - Song {item['song_id']}: {item['filename']}")
                    print(f"    Error: {item.get('error', 'Unknown error')}")
            
            return True
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Request failed: {str(e)}")
        return False

def test_file_analysis(file_path):
    """Test analyzing a file and updating its ID3 tags."""
    print(f"\n🔍 Testing file analysis and ID3 update for: {file_path}")
    
    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        return False
    
    payload = {
        "file_path": file_path
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
            
            if result.get('tag_result'):
                tag_data = result['tag_result'].get('metadata_written', {})
                print(f"📝 ID3 Tags updated:")
                print(f"   Title: {tag_data.get('title', 'N/A')}")
                print(f"   Comment: {tag_data.get('comment', 'N/A')}")
                print(f"   Track Number: {tag_data.get('track_number', 'N/A')}")
            
            return True
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Request failed: {str(e)}")
        return False

def main():
    """Main test function."""
    print("🎵 Mixed In Key - Complete ID3 Tag Update System Test")
    print("=" * 60)
    
    # Test API connection
    if not test_api_connection():
        print("❌ Cannot proceed without API connection")
        return
    
    # Get library info
    songs = test_library_info()
    if not songs:
        print("❌ No songs found in library. Please add some songs first.")
        return
    
    # Test single song update with first song
    if songs:
        first_song_id = songs[0]['id']
        test_single_song_update(first_song_id)
        
        # Test force update
        test_force_update_tags(first_song_id)
        
        # Test batch update for first few songs
        if len(songs) >= 3:
            song_ids = [str(songs[0]['id']), str(songs[1]['id']), str(songs[2]['id'])]
            test_batch_update_specific_songs(song_ids)
    
    # Ask user if they want to test batch update all
    print(f"\n🤔 Do you want to test batch update for ALL songs? (y/N)")
    user_input = input().strip().lower()
    
    if user_input in ['y', 'yes']:
        test_batch_update_all()
    else:
        print("⏭️ Skipping batch update all test")
    
    # Test file analysis if user provides a path
    print(f"\n🔍 Do you want to test with a specific file? (y/N)")
    user_input = input().strip().lower()
    
    if user_input in ['y', 'yes']:
        print("Enter the full path to an audio file:")
        file_path = input().strip()
        if file_path:
            test_file_analysis(file_path)
    
    print("\n🎉 Complete test script finished!")
    print("\n📋 Summary of what was tested:")
    print("  ✅ API connection")
    print("  ✅ Library information")
    print("  ✅ Single song ID3 update")
    print("  ✅ Force update tags")
    print("  ✅ Batch update specific songs")
    if user_input in ['y', 'yes']:
        print("  ✅ Batch update all songs")
    print("  ✅ File analysis and update (if requested)")

if __name__ == "__main__":
    main()
