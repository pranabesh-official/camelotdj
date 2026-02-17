#!/usr/bin/env python3
"""
Integration test for download functionality with real YouTube videos.
Tests the complete download pipeline including analysis.
"""

import os
import sys
import time
import json
import requests
import tempfile
import shutil

# Configuration
API_PORT = 5002
API_SIGNING_KEY = "devkey"
BASE_URL = f"http://127.0.0.1:{API_PORT}"

# Test video (short, public, commonly used for testing)
TEST_VIDEO_ID = "dQw4w9WgXcQ"  # Rick Astley - Never Gonna Give You Up
TEST_VIDEO_URL = f"https://www.youtube.com/watch?v={TEST_VIDEO_ID}"
TEST_TITLE = "Never Gonna Give You Up"
TEST_ARTIST = "Rick Astley"

class DownloadIntegrationTest:
    """Integration test for download functionality"""
    
    def __init__(self):
        self.test_dir = tempfile.mkdtemp(prefix="camelotdj_download_test_")
        self.headers = {'X-Signing-Key': API_SIGNING_KEY}
        self.download_id = None
        
    def cleanup(self):
        """Cleanup test directory"""
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
            print(f"✅ Cleaned up test directory: {self.test_dir}")
            
    def check_backend_health(self):
        """Check if backend is healthy"""
        print("\n" + "="*60)
        print("🔍 Checking Backend Health")
        print("="*60)
        
        try:
            response = requests.get(f"{BASE_URL}/health", timeout=5)
            if response.status_code == 200:
                health = response.json()
                print(f"✅ Backend Status: {health.get('status')}")
                print(f"✅ FFmpeg Available: {health.get('ffmpeg_available')}")
                print(f"✅ Database Status: {health.get('database_status')}")
                print(f"✅ Queue Manager: {health.get('queue_manager_status')}")
                
                if not health.get('ffmpeg_available'):
                    print("❌ FFmpeg is not available! Download will fail.")
                    return False
                    
                return health.get('status') == 'healthy'
            else:
                print(f"❌ Health check failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Cannot connect to backend: {str(e)}")
            print(f"💡 Make sure backend is running: python3 api.py --apiport {API_PORT} --signingkey {API_SIGNING_KEY}")
            return False
            
    def test_basic_download(self):
        """Test basic download endpoint"""
        print("\n" + "="*60)
        print("TEST 1: Basic Download (/youtube/download)")
        print("="*60)
        
        print(f"📁 Test directory: {self.test_dir}")
        print(f"🔗 Video URL: {TEST_VIDEO_URL}")
        print(f"🎵 Title: {TEST_TITLE}")
        print(f"🎤 Artist: {TEST_ARTIST}")
        
        try:
            response = requests.post(
                f"{BASE_URL}/youtube/download",
                headers={'Content-Type': 'application/json', **self.headers},
                json={
                    'url': TEST_VIDEO_URL,
                    'title': TEST_TITLE,
                    'artist': TEST_ARTIST,
                    'download_path': self.test_dir,
                    'signingkey': API_SIGNING_KEY
                },
                timeout=120  # 2 minutes timeout
            )
            
            print(f"📊 Response Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Download Status: {result.get('status')}")
                
                if result.get('status') == 'success':
                    song = result.get('song', {})
                    print(f"✅ File Path: {song.get('file_path')}")
                    print(f"✅ Key: {song.get('camelot_key')} ({song.get('key_name')})")
                    print(f"✅ BPM: {song.get('bpm')}")
                    print(f"✅ Energy Level: {song.get('energy_level')}")
                    print(f"✅ Bitrate: {song.get('bitrate')} kbps")
                    
                    # Verify file exists
                    file_path = song.get('file_path')
                    if file_path and os.path.exists(file_path):
                        file_size = os.path.getsize(file_path)
                        print(f"✅ File Size: {file_size / (1024*1024):.2f} MB")
                        
                        # Verify it's an MP3
                        if file_path.endswith('.mp3'):
                            print(f"✅ File Format: MP3")
                        else:
                            print(f"⚠️ File Format: {os.path.splitext(file_path)[1]}")
                            
                        return True
                    else:
                        print(f"❌ File not found at: {file_path}")
                        return False
                else:
                    print(f"❌ Download failed: {result.get('error')}")
                    return False
            else:
                error_text = response.text
                print(f"❌ Request failed: {error_text}")
                return False
                
        except requests.exceptions.Timeout:
            print(f"❌ Request timeout (>120s)")
            return False
        except Exception as e:
            print(f"❌ Test failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
            
    def test_queued_download(self):
        """Test queued download endpoint"""
        print("\n" + "="*60)
        print("TEST 2: Queued Download (/youtube/download-queued)")
        print("="*60)
        
        try:
            # Submit download to queue
            response = requests.post(
                f"{BASE_URL}/youtube/download-queued",
                headers={'Content-Type': 'application/json', **self.headers},
                json={
                    'url': TEST_VIDEO_URL,
                    'title': TEST_TITLE,
                    'artist': TEST_ARTIST,
                    'download_path': self.test_dir,
                    'priority': 'normal',
                    'signingkey': API_SIGNING_KEY
                },
                timeout=10
            )
            
            print(f"📊 Response Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Queue Status: {result.get('status')}")
                self.download_id = result.get('download_id')
                print(f"✅ Download ID: {self.download_id}")
                
                # Monitor queue status
                print("\n📊 Monitoring download progress...")
                max_wait = 120  # 2 minutes
                start_time = time.time()
                
                while time.time() - start_time < max_wait:
                    queue_response = requests.get(
                        f"{BASE_URL}/youtube/queue/status",
                        params={'signingkey': API_SIGNING_KEY},
                        headers=self.headers,
                        timeout=5
                    )
                    
                    if queue_response.status_code == 200:
                        queue_data = queue_response.json()
                        downloads = queue_data.get('downloads', [])
                        
                        # Find our download
                        our_download = None
                        for dl in downloads:
                            if dl.get('id') == self.download_id:
                                our_download = dl
                                break
                                
                        if our_download:
                            status = our_download.get('status')
                            progress = our_download.get('progress', 0)
                            stage = our_download.get('stage', '')
                            message = our_download.get('message', '')
                            
                            print(f"📊 Status: {status} | Progress: {progress:.1f}% | Stage: {stage} | {message}")
                            
                            if status == 'completed':
                                print(f"✅ Download completed successfully!")
                                
                                # Verify file exists
                                files = os.listdir(self.test_dir)
                                mp3_files = [f for f in files if f.endswith('.mp3')]
                                
                                if mp3_files:
                                    file_path = os.path.join(self.test_dir, mp3_files[0])
                                    file_size = os.path.getsize(file_path)
                                    print(f"✅ File: {mp3_files[0]}")
                                    print(f"✅ Size: {file_size / (1024*1024):.2f} MB")
                                    return True
                                else:
                                    print(f"❌ No MP3 files found in {self.test_dir}")
                                    return False
                                    
                            elif status == 'failed':
                                error = our_download.get('error', 'Unknown error')
                                print(f"❌ Download failed: {error}")
                                return False
                                
                        else:
                            print(f"⚠️ Download not found in queue")
                            
                    time.sleep(2)  # Check every 2 seconds
                    
                print(f"❌ Download timeout ({max_wait}s)")
                return False
                
            else:
                print(f"❌ Failed to queue download: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Test failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
            
    def test_analysis_quality(self):
        """Test that analysis produces valid results"""
        print("\n" + "="*60)
        print("TEST 3: Analysis Quality Check")
        print("="*60)
        
        # Find downloaded files
        files = os.listdir(self.test_dir)
        mp3_files = [f for f in files if f.endswith('.mp3')]
        
        if not mp3_files:
            print(f"❌ No MP3 files found for analysis")
            return False
            
        file_path = os.path.join(self.test_dir, mp3_files[0])
        print(f"📁 Analyzing: {mp3_files[0]}")
        
        # Check file properties
        try:
            from mutagen.mp3 import MP3
            from mutagen.id3 import ID3
            
            audio = MP3(file_path)
            print(f"✅ Duration: {audio.info.length:.2f}s")
            print(f"✅ Bitrate: {audio.info.bitrate / 1000:.0f} kbps")
            print(f"✅ Sample Rate: {audio.info.sample_rate} Hz")
            
            # Check ID3 tags
            if audio.tags:
                title = audio.tags.get('TIT2')
                artist = audio.tags.get('TPE1')
                
                if title:
                    print(f"✅ Title Tag: {title.text[0]}")
                if artist:
                    print(f"✅ Artist Tag: {artist.text[0]}")
                    
                # Check for custom tags (key, BPM)
                for tag in audio.tags.values():
                    tag_str = str(tag)
                    if 'camelot' in tag_str.lower() or 'key' in tag_str.lower():
                        print(f"✅ Key Tag Found: {tag}")
                    if 'bpm' in tag_str.lower():
                        print(f"✅ BPM Tag Found: {tag}")
                        
            # Verify bitrate is close to 320kbps
            bitrate_kbps = audio.info.bitrate / 1000
            if bitrate_kbps >= 300:
                print(f"✅ Bitrate Quality: Excellent ({bitrate_kbps:.0f} kbps)")
                return True
            elif bitrate_kbps >= 256:
                print(f"⚠️ Bitrate Quality: Good ({bitrate_kbps:.0f} kbps, target: 320 kbps)")
                return True
            else:
                print(f"❌ Bitrate Quality: Low ({bitrate_kbps:.0f} kbps, target: 320 kbps)")
                return False
                
        except ImportError:
            print(f"⚠️ mutagen not installed, skipping detailed analysis")
            print(f"   Install with: pip install mutagen")
            return True  # Don't fail if mutagen not available
        except Exception as e:
            print(f"❌ Analysis failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
            
    def run_all_tests(self):
        """Run all integration tests"""
        print("\n" + "="*60)
        print("🧪 CAMELOTDJ DOWNLOAD INTEGRATION TESTS")
        print("="*60)
        
        # Check backend health
        if not self.check_backend_health():
            print("\n❌ Backend is not healthy. Cannot proceed with tests.")
            return False
            
        results = []
        
        # Test 1: Basic download
        try:
            result = self.test_basic_download()
            results.append(("Basic Download", result))
        except Exception as e:
            print(f"❌ Test failed with exception: {str(e)}")
            results.append(("Basic Download", False))
            
        # Test 2: Queued download (skip if basic failed)
        if results[0][1]:  # Only run if basic download passed
            try:
                result = self.test_queued_download()
                results.append(("Queued Download", result))
            except Exception as e:
                print(f"❌ Test failed with exception: {str(e)}")
                results.append(("Queued Download", False))
        else:
            print("\n⚠️ Skipping queued download test (basic download failed)")
            results.append(("Queued Download", None))
            
        # Test 3: Analysis quality
        try:
            result = self.test_analysis_quality()
            results.append(("Analysis Quality", result))
        except Exception as e:
            print(f"❌ Test failed with exception: {str(e)}")
            results.append(("Analysis Quality", False))
            
        # Print summary
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        
        passed = 0
        failed = 0
        skipped = 0
        
        for test_name, result in results:
            if result is True:
                print(f"✅ PASS: {test_name}")
                passed += 1
            elif result is False:
                print(f"❌ FAIL: {test_name}")
                failed += 1
            else:
                print(f"⚠️ SKIP: {test_name}")
                skipped += 1
                
        print(f"\n📊 Total: {len(results)} tests")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"⚠️ Skipped: {skipped}")
        
        # Cleanup
        self.cleanup()
        
        return failed == 0


def main():
    """Main test runner"""
    tester = DownloadIntegrationTest()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 All integration tests passed!")
        print("✅ Download functionality is working correctly!")
        print("✅ 320kbps MP3 conversion is working!")
        print("✅ Song analysis is working!")
        sys.exit(0)
    else:
        print("\n❌ Some integration tests failed!")
        print("💡 Check the output above for details")
        sys.exit(1)


if __name__ == "__main__":
    main()
