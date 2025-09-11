"""
Auto Mix End-to-End Test Suite
=============================

This module provides comprehensive end-to-end tests for the automix feature,
including API integration, AI model testing, and performance validation.

Author: AI Assistant
Date: 2024
"""

import unittest
import json
import time
import requests
import threading
from typing import Dict, List, Any
from unittest.mock import Mock, patch

class AutoMixE2ETest(unittest.TestCase):
    """End-to-end tests for the Auto Mix feature."""
    
    def setUp(self):
        """Set up test environment."""
        self.api_base_url = "http://127.0.0.1:5002"
        self.api_key = "devkey"
        self.headers = {
            "Content-Type": "application/json",
            "X-Signing-Key": self.api_key
        }
        
        # Test data
        self.test_songs = [
            {
                "id": "song1",
                "filename": "song1.mp3",
                "camelot_key": "8B",
                "bpm": 128.0,
                "energy_level": 7,
                "duration": 240.0,
                "artist": "Artist 1",
                "title": "Song 1"
            },
            {
                "id": "song2",
                "filename": "song2.mp3",
                "camelot_key": "8B",
                "bpm": 130.0,
                "energy_level": 8,
                "duration": 200.0,
                "artist": "Artist 2",
                "title": "Song 2"
            },
            {
                "id": "song3",
                "filename": "song3.mp3",
                "camelot_key": "9B",
                "bpm": 125.0,
                "energy_level": 6,
                "duration": 180.0,
                "artist": "Artist 3",
                "title": "Song 3"
            },
            {
                "id": "song4",
                "filename": "song4.mp3",
                "camelot_key": "7B",
                "bpm": 132.0,
                "energy_level": 9,
                "duration": 220.0,
                "artist": "Artist 4",
                "title": "Song 4"
            }
        ]
    
    def test_api_health_check(self):
        """Test that the API is running and accessible."""
        try:
            response = requests.get(f"{self.api_base_url}/hello", 
                                  headers={"X-Signing-Key": self.api_key})
            self.assertEqual(response.status_code, 200)
            
            data = response.json()
            self.assertEqual(data["status"], "success")
            print("✅ API health check passed")
        except requests.exceptions.ConnectionError:
            self.fail("API server is not running. Please start the server first.")
    
    def test_automix_ai_status(self):
        """Test Auto Mix AI status endpoint."""
        response = requests.get(f"{self.api_base_url}/automix/ai-status",
                              headers={"X-Signing-Key": self.api_key})
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("ai_status", data)
        
        ai_status = data["ai_status"]
        self.assertIn("is_initialized", ai_status)
        self.assertIn("model_name", ai_status)
        self.assertIn("ai_library_available", ai_status)
        
        print(f"✅ AI Status: {ai_status}")
    
    def test_transition_types_endpoint(self):
        """Test getting available transition types."""
        response = requests.get(f"{self.api_base_url}/automix/transition-types",
                              headers={"X-Signing-Key": self.api_key})
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("transition_types", data)
        
        transition_types = data["transition_types"]
        self.assertGreater(len(transition_types), 0)
        
        # Check that we have expected transition types
        expected_types = ["smooth_transition", "energy_raise", "peak_buildup", "cooldown", "random"]
        for expected_type in expected_types:
            found = any(t["type"] == expected_type for t in transition_types)
            self.assertTrue(found, f"Expected transition type '{expected_type}' not found")
        
        print(f"✅ Found {len(transition_types)} transition types")
    
    def test_playlist_analysis(self):
        """Test playlist analysis functionality."""
        response = requests.post(f"{self.api_base_url}/automix/analyze-playlist",
                               headers=self.headers,
                               json={"playlist": self.test_songs})
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("playlist_analysis", data)
        self.assertEqual(data["track_count"], 4)
        
        analysis = data["playlist_analysis"]
        self.assertIn("total_tracks", analysis)
        self.assertIn("compatibility_score", analysis)
        self.assertIn("recommendations", analysis)
        
        print(f"✅ Playlist analysis completed - Compatibility score: {analysis['compatibility_score']}")
    
    def test_next_track_recommendation(self):
        """Test next track recommendation functionality."""
        current_song = self.test_songs[0]
        playlist = self.test_songs[1:]  # Exclude current song
        
        response = requests.post(f"{self.api_base_url}/automix/next-track",
                               headers=self.headers,
                               json={
                                   "current_song": current_song,
                                   "playlist": playlist,
                                   "transition_type": "smooth_transition"
                               })
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Should either have a recommendation or no recommendation message
        self.assertIn("status", data)
        self.assertTrue(data["status"] in ["success", "no_recommendation"])
        
        if data["status"] == "success":
            self.assertIn("recommended_track", data)
            recommended = data["recommended_track"]
            self.assertIn("id", recommended)
            self.assertIn("filename", recommended)
            print(f"✅ Recommended track: {recommended['filename']}")
        else:
            print(f"ℹ️  No recommendation: {data.get('message', 'Unknown reason')}")
    
    def test_different_transition_types(self):
        """Test different transition types."""
        current_song = self.test_songs[0]
        playlist = self.test_songs[1:]
        
        transition_types = ["smooth_transition", "energy_raise", "peak_buildup", "cooldown", "random"]
        
        for transition_type in transition_types:
            with self.subTest(transition_type=transition_type):
                response = requests.post(f"{self.api_base_url}/automix/next-track",
                                       headers=self.headers,
                                       json={
                                           "current_song": current_song,
                                           "playlist": playlist,
                                           "transition_type": transition_type
                                       })
                
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertIn("status", data)
                print(f"✅ {transition_type}: {data['status']}")
    
    def test_performance_benchmark(self):
        """Test performance of Auto Mix operations."""
        current_song = self.test_songs[0]
        playlist = self.test_songs[1:]
        
        # Test multiple requests to measure performance
        num_requests = 5
        start_time = time.time()
        
        for i in range(num_requests):
            response = requests.post(f"{self.api_base_url}/automix/next-track",
                                   headers=self.headers,
                                   json={
                                       "current_song": current_song,
                                       "playlist": playlist,
                                       "transition_type": "random"
                                   })
            self.assertEqual(response.status_code, 200)
        
        end_time = time.time()
        total_time = end_time - start_time
        avg_time = total_time / num_requests
        
        print(f"✅ Performance test: {num_requests} requests in {total_time:.2f}s (avg: {avg_time:.2f}s)")
        
        # Performance should be reasonable (less than 2 seconds per request)
        self.assertLess(avg_time, 2.0, "Average response time too slow")
    
    def test_error_handling(self):
        """Test error handling for invalid requests."""
        # Test with invalid signing key
        response = requests.post(f"{self.api_base_url}/automix/next-track",
                               headers={"X-Signing-Key": "invalid_key"},
                               json={"current_song": self.test_songs[0], "playlist": self.test_songs[1:]})
        
        self.assertEqual(response.status_code, 401)
        data = response.json()
        self.assertIn("error", data)
        
        # Test with missing data
        response = requests.post(f"{self.api_base_url}/automix/next-track",
                               headers=self.headers,
                               json={})
        
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("error", data)
        
        # Test with empty playlist
        response = requests.post(f"{self.api_base_url}/automix/next-track",
                               headers=self.headers,
                               json={
                                   "current_song": self.test_songs[0],
                                   "playlist": []
                               })
        
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("error", data)
        
        print("✅ Error handling tests passed")
    
    def test_concurrent_requests(self):
        """Test handling of concurrent requests."""
        current_song = self.test_songs[0]
        playlist = self.test_songs[1:]
        
        def make_request():
            response = requests.post(f"{self.api_base_url}/automix/next-track",
                                   headers=self.headers,
                                   json={
                                       "current_song": current_song,
                                       "playlist": playlist,
                                       "transition_type": "random"
                                   })
            return response.status_code == 200
        
        # Create multiple threads making concurrent requests
        threads = []
        results = []
        
        for i in range(3):
            thread = threading.Thread(target=lambda: results.append(make_request()))
            threads.append(thread)
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        # All requests should succeed
        self.assertEqual(len(results), 3)
        self.assertTrue(all(results))
        
        print("✅ Concurrent request handling test passed")
    
    def test_large_playlist_handling(self):
        """Test handling of large playlists."""
        # Create a large playlist (100 songs)
        large_playlist = []
        for i in range(100):
            song = {
                "id": f"large_song_{i}",
                "filename": f"large_song_{i}.mp3",
                "camelot_key": f"{((i % 12) + 1)}B",
                "bpm": 120.0 + (i % 20),
                "energy_level": (i % 10) + 1,
                "duration": 180.0 + (i % 60),
                "artist": f"Artist {i}",
                "title": f"Song {i}"
            }
            large_playlist.append(song)
        
        current_song = large_playlist[0]
        playlist = large_playlist[1:]
        
        start_time = time.time()
        response = requests.post(f"{self.api_base_url}/automix/next-track",
                               headers=self.headers,
                               json={
                                   "current_song": current_song,
                                   "playlist": playlist,
                                   "transition_type": "random"
                               })
        end_time = time.time()
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("status", data)
        
        response_time = end_time - start_time
        print(f"✅ Large playlist test: 100 songs processed in {response_time:.2f}s")
        
        # Should still be reasonably fast even with large playlists
        self.assertLess(response_time, 5.0, "Response time too slow for large playlist")

def run_e2e_tests():
    """Run all end-to-end tests."""
    print("🧪 Running Auto Mix End-to-End Tests")
    print("=" * 50)
    
    # Check if API server is running
    try:
        response = requests.get("http://127.0.0.1:5002/hello", 
                              headers={"X-Signing-Key": "devkey"})
        if response.status_code != 200:
            print("❌ API server is not responding correctly")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ API server is not running. Please start it first:")
        print("   python api.py")
        return False
    
    # Run tests
    test_suite = unittest.TestLoader().loadTestsFromTestCase(AutoMixE2ETest)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    return result.wasSuccessful()

if __name__ == "__main__":
    success = run_e2e_tests()
    if success:
        print("\n✅ All end-to-end tests passed!")
    else:
        print("\n❌ Some end-to-end tests failed!")
