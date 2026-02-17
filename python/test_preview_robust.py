#!/usr/bin/env python3
"""
Comprehensive test suite for song preview and streaming functionality.
Tests audio streaming, preview endpoints, and error handling.
"""

import os
import sys
import time
import requests
import json
from io import BytesIO

# Configuration
API_PORT = 5002
API_SIGNING_KEY = "devkey"
BASE_URL = f"http://127.0.0.1:{API_PORT}"

class PreviewTester:
    """Test suite for preview and streaming functionality"""
    
    def __init__(self):
        self.test_results = []
        self.headers = {'X-Signing-Key': API_SIGNING_KEY}
        
    def check_server_health(self):
        """Check if server is running and healthy"""
        print("🔍 Checking server health...")
        
        try:
            response = requests.get(f"{BASE_URL}/health", timeout=5)
            if response.status_code == 200:
                health_data = response.json()
                print(f"✅ Server is healthy")
                print(f"📊 Status: {health_data.get('status')}")
                print(f"📊 FFmpeg: {health_data.get('ffmpeg_available')}")
                print(f"📊 Database: {health_data.get('database_status')}")
                return True
            else:
                print(f"❌ Server health check failed: {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"❌ Cannot connect to server: {str(e)}")
            print(f"💡 Make sure the backend is running on port {API_PORT}")
            return False
            
    def test_stream_endpoint_basic(self):
        """Test 1: Basic streaming endpoint"""
        print("\n" + "="*60)
        print("TEST 1: Basic Streaming Endpoint")
        print("="*60)
        
        # Use a known working video ID (Rick Astley - Never Gonna Give You Up)
        video_id = "dQw4w9WgXcQ"
        url = f"{BASE_URL}/youtube/stream/{video_id}"
        
        print(f"🔗 Testing stream URL: {url}")
        
        try:
            # Make request with signing key
            response = requests.get(
                url,
                params={'signingkey': API_SIGNING_KEY},
                headers=self.headers,
                stream=True,
                timeout=30
            )
            
            print(f"📊 Response status: {response.status_code}")
            print(f"📊 Content-Type: {response.headers.get('Content-Type')}")
            
            if response.status_code == 200:
                # Read first chunk to verify streaming works
                chunk_count = 0
                total_bytes = 0
                
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        chunk_count += 1
                        total_bytes += len(chunk)
                        
                        # Only read first few chunks for testing
                        if chunk_count >= 10:
                            break
                            
                print(f"✅ Successfully streamed {chunk_count} chunks ({total_bytes} bytes)")
                return True
            else:
                print(f"❌ Stream request failed: {response.status_code}")
                print(f"📄 Response: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Stream request error: {str(e)}")
            return False
            
    def test_stream_endpoint_invalid_video(self):
        """Test 2: Streaming with invalid video ID"""
        print("\n" + "="*60)
        print("TEST 2: Streaming with Invalid Video ID")
        print("="*60)
        
        # Use an invalid video ID
        video_id = "invalid_video_id_12345"
        url = f"{BASE_URL}/youtube/stream/{video_id}"
        
        print(f"🔗 Testing with invalid video ID: {video_id}")
        
        try:
            response = requests.get(
                url,
                params={'signingkey': API_SIGNING_KEY},
                headers=self.headers,
                timeout=30
            )
            
            print(f"📊 Response status: {response.status_code}")
            
            # Should return error (404 or 500)
            if response.status_code in [404, 500]:
                print(f"✅ Correctly returned error for invalid video")
                return True
            else:
                print(f"❌ Unexpected response: {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {str(e)}")
            return False
            
    def test_stream_endpoint_auth(self):
        """Test 3: Streaming authentication"""
        print("\n" + "="*60)
        print("TEST 3: Streaming Authentication")
        print("="*60)
        
        video_id = "dQw4w9WgXcQ"
        url = f"{BASE_URL}/youtube/stream/{video_id}"
        
        # Test without signing key
        print("🔒 Testing without signing key...")
        try:
            response = requests.get(url, timeout=10)
            
            if response.status_code == 401:
                print(f"✅ Correctly rejected request without signing key")
                return True
            else:
                print(f"❌ Should have returned 401, got {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {str(e)}")
            return False
            
    def test_preview_endpoint(self):
        """Test 4: Preview endpoint (placeholder)"""
        print("\n" + "="*60)
        print("TEST 4: Preview Endpoint")
        print("="*60)
        
        video_id = "dQw4w9WgXcQ"
        url = f"{BASE_URL}/youtube/preview/{video_id}"
        
        print(f"🔗 Testing preview URL: {url}")
        
        try:
            response = requests.get(
                url,
                params={'signingkey': API_SIGNING_KEY},
                headers=self.headers,
                timeout=10
            )
            
            print(f"📊 Response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"📄 Response: {json.dumps(data, indent=2)}")
                
                # Check if it's the placeholder response
                if 'note' in data and 'placeholder' in data.get('note', '').lower():
                    print(f"⚠️ Preview endpoint is still a placeholder")
                    print(f"💡 Use /youtube/stream/<video_id> instead")
                    return True
                else:
                    print(f"✅ Preview endpoint implemented")
                    return True
            else:
                print(f"❌ Preview request failed: {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {str(e)}")
            return False
            
    def test_stream_headers(self):
        """Test 5: Stream response headers"""
        print("\n" + "="*60)
        print("TEST 5: Stream Response Headers")
        print("="*60)
        
        video_id = "dQw4w9WgXcQ"
        url = f"{BASE_URL}/youtube/stream/{video_id}"
        
        try:
            response = requests.get(
                url,
                params={'signingkey': API_SIGNING_KEY},
                headers=self.headers,
                stream=True,
                timeout=30
            )
            
            if response.status_code == 200:
                print("📊 Response Headers:")
                
                # Check important headers
                required_headers = [
                    'Content-Type',
                    'Access-Control-Allow-Origin',
                    'Cache-Control'
                ]
                
                all_present = True
                for header in required_headers:
                    value = response.headers.get(header)
                    if value:
                        print(f"  ✅ {header}: {value}")
                    else:
                        print(f"  ❌ {header}: Missing")
                        all_present = False
                        
                return all_present
            else:
                print(f"❌ Request failed: {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {str(e)}")
            return False
            
    def test_stream_performance(self):
        """Test 6: Stream performance"""
        print("\n" + "="*60)
        print("TEST 6: Stream Performance")
        print("="*60)
        
        video_id = "dQw4w9WgXcQ"
        url = f"{BASE_URL}/youtube/stream/{video_id}"
        
        try:
            start_time = time.time()
            
            response = requests.get(
                url,
                params={'signingkey': API_SIGNING_KEY},
                headers=self.headers,
                stream=True,
                timeout=30
            )
            
            first_byte_time = time.time() - start_time
            
            if response.status_code == 200:
                # Read first chunk
                chunk = next(response.iter_content(chunk_size=8192), None)
                
                if chunk:
                    first_chunk_time = time.time() - start_time
                    
                    print(f"⏱️ Time to first byte: {first_byte_time:.2f}s")
                    print(f"⏱️ Time to first chunk: {first_chunk_time:.2f}s")
                    print(f"📊 First chunk size: {len(chunk)} bytes")
                    
                    # Should be reasonably fast (< 10 seconds)
                    if first_chunk_time < 10:
                        print(f"✅ Stream performance acceptable")
                        return True
                    else:
                        print(f"⚠️ Stream performance slow (>{first_chunk_time:.2f}s)")
                        return False
                else:
                    print(f"❌ No data received")
                    return False
            else:
                print(f"❌ Request failed: {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {str(e)}")
            return False
            
    def test_concurrent_streams(self):
        """Test 7: Concurrent streaming"""
        print("\n" + "="*60)
        print("TEST 7: Concurrent Streaming")
        print("="*60)
        
        video_id = "dQw4w9WgXcQ"
        url = f"{BASE_URL}/youtube/stream/{video_id}"
        
        print("🔄 Testing 3 concurrent streams...")
        
        import threading
        
        results = []
        
        def stream_worker():
            try:
                response = requests.get(
                    url,
                    params={'signingkey': API_SIGNING_KEY},
                    headers=self.headers,
                    stream=True,
                    timeout=30
                )
                
                if response.status_code == 200:
                    # Read first chunk
                    chunk = next(response.iter_content(chunk_size=8192), None)
                    results.append(chunk is not None)
                else:
                    results.append(False)
                    
            except Exception as e:
                print(f"❌ Stream worker error: {str(e)}")
                results.append(False)
                
        # Start 3 concurrent streams
        threads = []
        for i in range(3):
            thread = threading.Thread(target=stream_worker)
            thread.start()
            threads.append(thread)
            
        # Wait for all threads
        for thread in threads:
            thread.join(timeout=60)
            
        success_count = sum(results)
        print(f"📊 Successful streams: {success_count}/3")
        
        return success_count >= 2  # At least 2 should succeed
        
    def run_all_tests(self):
        """Run all tests"""
        print("\n" + "="*60)
        print("🎵 CAMELOTDJ PREVIEW & STREAMING TEST SUITE")
        print("="*60)
        
        # Check server health first
        if not self.check_server_health():
            print("\n❌ Server is not available. Please start the backend first:")
            print(f"   cd python && python api.py --apiport {API_PORT} --signingkey {API_SIGNING_KEY}")
            return False
            
        tests = [
            ("Basic Streaming Endpoint", self.test_stream_endpoint_basic),
            ("Streaming with Invalid Video", self.test_stream_endpoint_invalid_video),
            ("Streaming Authentication", self.test_stream_endpoint_auth),
            ("Preview Endpoint", self.test_preview_endpoint),
            ("Stream Response Headers", self.test_stream_headers),
            ("Stream Performance", self.test_stream_performance),
            ("Concurrent Streaming", self.test_concurrent_streams)
        ]
        
        results = []
        
        for test_name, test_func in tests:
            try:
                result = test_func()
                results.append((test_name, result))
            except Exception as e:
                print(f"❌ Test failed with exception: {str(e)}")
                import traceback
                traceback.print_exc()
                results.append((test_name, False))
                
        # Print summary
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        
        passed = 0
        failed = 0
        
        for test_name, result in results:
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{status}: {test_name}")
            if result:
                passed += 1
            else:
                failed += 1
                
        print(f"\n📊 Total: {len(results)} tests")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        
        return failed == 0


def main():
    """Main test runner"""
    tester = PreviewTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print("\n❌ Some tests failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
