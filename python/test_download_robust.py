#!/usr/bin/env python3
"""
Comprehensive test suite for download functionality.
Tests download queue, error handling, retries, and analysis.
"""

import os
import sys
import time
import json
import tempfile
import shutil
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from download_queue_manager import (
    DownloadQueueManager,
    DownloadTask,
    DownloadPriority,
    DownloadStatus
)

class DownloadTester:
    """Test suite for download functionality"""
    
    def __init__(self):
        self.test_dir = tempfile.mkdtemp(prefix="camelotdj_test_")
        self.queue_manager = None
        self.test_results = []
        
    def setup(self):
        """Setup test environment"""
        print("🔧 Setting up test environment...")
        print(f"📁 Test directory: {self.test_dir}")
        
        # Initialize queue manager
        self.queue_manager = DownloadQueueManager(
            max_concurrent_downloads=2,
            max_retries=3
        )
        
        # Setup callbacks
        self.queue_manager.add_progress_callback(self.on_progress)
        self.queue_manager.add_completion_callback(self.on_completion)
        self.queue_manager.add_error_callback(self.on_error)
        
        # Start queue
        self.queue_manager.start()
        print("✅ Queue manager started")
        
    def teardown(self):
        """Cleanup test environment"""
        print("\n🧹 Cleaning up test environment...")
        
        if self.queue_manager:
            self.queue_manager.stop()
            
        # Remove test directory
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
            print(f"✅ Removed test directory: {self.test_dir}")
            
    def on_progress(self, task):
        """Progress callback"""
        print(f"📊 Progress: {task.title} - {task.progress:.1f}% ({task.stage})")
        
    def on_completion(self, task):
        """Completion callback"""
        print(f"✅ Completed: {task.title}")
        self.test_results.append({
            'task_id': task.id,
            'status': 'completed',
            'title': task.title
        })
        
    def on_error(self, task):
        """Error callback"""
        print(f"❌ Error: {task.title} - {task.error}")
        self.test_results.append({
            'task_id': task.id,
            'status': 'failed',
            'title': task.title,
            'error': task.error
        })
        
    def test_queue_basic(self):
        """Test 1: Basic queue functionality"""
        print("\n" + "="*60)
        print("TEST 1: Basic Queue Functionality")
        print("="*60)
        
        # Create test task
        task = DownloadTask(
            id="test_basic_1",
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",  # Rick Astley - Never Gonna Give You Up
            title="Never Gonna Give You Up",
            artist="Rick Astley",
            download_path=self.test_dir,
            priority=DownloadPriority.NORMAL
        )
        
        # Add to queue
        task_id = self.queue_manager.add_download(task)
        print(f"✅ Added task to queue: {task_id}")
        
        # Wait for completion (max 60 seconds)
        timeout = 60
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            status = self.queue_manager.get_download_status(task_id)
            if status and status.status in [DownloadStatus.COMPLETED, DownloadStatus.FAILED]:
                break
            time.sleep(1)
            
        # Check result
        final_status = self.queue_manager.get_download_status(task_id)
        if final_status:
            print(f"📊 Final status: {final_status.status.value}")
            print(f"📊 Progress: {final_status.progress}%")
            if final_status.error:
                print(f"❌ Error: {final_status.error}")
            return final_status.status == DownloadStatus.COMPLETED
        else:
            print("❌ Task not found")
            return False
            
    def test_priority_queue(self):
        """Test 2: Priority queue handling"""
        print("\n" + "="*60)
        print("TEST 2: Priority Queue Handling")
        print("="*60)
        
        # Create tasks with different priorities
        tasks = [
            DownloadTask(
                id="test_priority_low",
                url="https://www.youtube.com/watch?v=test1",
                title="Low Priority Task",
                artist="Test Artist",
                download_path=self.test_dir,
                priority=DownloadPriority.LOW
            ),
            DownloadTask(
                id="test_priority_urgent",
                url="https://www.youtube.com/watch?v=test2",
                title="Urgent Priority Task",
                artist="Test Artist",
                download_path=self.test_dir,
                priority=DownloadPriority.URGENT
            ),
            DownloadTask(
                id="test_priority_normal",
                url="https://www.youtube.com/watch?v=test3",
                title="Normal Priority Task",
                artist="Test Artist",
                download_path=self.test_dir,
                priority=DownloadPriority.NORMAL
            )
        ]
        
        # Add all tasks
        task_ids = []
        for task in tasks:
            task_id = self.queue_manager.add_download(task)
            task_ids.append(task_id)
            print(f"✅ Added {task.priority.name} priority task: {task_id}")
            
        # Get queue stats
        stats = self.queue_manager.get_queue_stats()
        print(f"📊 Queue stats: {stats}")
        
        return len(task_ids) == 3
        
    def test_concurrent_downloads(self):
        """Test 3: Concurrent download handling"""
        print("\n" + "="*60)
        print("TEST 3: Concurrent Download Handling")
        print("="*60)
        
        # Create multiple tasks
        num_tasks = 5
        tasks = []
        
        for i in range(num_tasks):
            task = DownloadTask(
                id=f"test_concurrent_{i}",
                url=f"https://www.youtube.com/watch?v=test{i}",
                title=f"Concurrent Task {i}",
                artist="Test Artist",
                download_path=self.test_dir,
                priority=DownloadPriority.NORMAL
            )
            tasks.append(task)
            
        # Add all tasks
        task_ids = []
        for task in tasks:
            task_id = self.queue_manager.add_download(task)
            task_ids.append(task_id)
            
        print(f"✅ Added {num_tasks} tasks to queue")
        
        # Check concurrent download limit
        time.sleep(2)  # Wait for tasks to start
        stats = self.queue_manager.get_queue_stats()
        print(f"📊 Active downloads: {stats['active']}")
        print(f"📊 Queued downloads: {stats['queued']}")
        
        # Should not exceed max_concurrent_downloads (2)
        return stats['active'] <= 2
        
    def test_cancel_download(self):
        """Test 4: Download cancellation"""
        print("\n" + "="*60)
        print("TEST 4: Download Cancellation")
        print("="*60)
        
        # Create task
        task = DownloadTask(
            id="test_cancel",
            url="https://www.youtube.com/watch?v=test_cancel",
            title="Cancellable Task",
            artist="Test Artist",
            download_path=self.test_dir,
            priority=DownloadPriority.NORMAL
        )
        
        # Add to queue
        task_id = self.queue_manager.add_download(task)
        print(f"✅ Added task: {task_id}")
        
        # Wait a bit then cancel
        time.sleep(2)
        success = self.queue_manager.cancel_download(task_id)
        
        if success:
            print(f"✅ Successfully cancelled task: {task_id}")
            
            # Verify status
            status = self.queue_manager.get_download_status(task_id)
            if status:
                print(f"📊 Status after cancel: {status.status.value}")
                return status.status == DownloadStatus.CANCELLED
        else:
            print(f"❌ Failed to cancel task: {task_id}")
            
        return success
        
    def test_retry_failed_download(self):
        """Test 5: Retry failed downloads"""
        print("\n" + "="*60)
        print("TEST 5: Retry Failed Downloads")
        print("="*60)
        
        # Create task with invalid URL (will fail)
        task = DownloadTask(
            id="test_retry",
            url="https://www.youtube.com/watch?v=invalid_url_12345",
            title="Retry Test Task",
            artist="Test Artist",
            download_path=self.test_dir,
            priority=DownloadPriority.NORMAL
        )
        
        # Add to queue
        task_id = self.queue_manager.add_download(task)
        print(f"✅ Added task (will fail): {task_id}")
        
        # Wait for failure
        timeout = 30
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            status = self.queue_manager.get_download_status(task_id)
            if status and status.status == DownloadStatus.FAILED:
                break
            time.sleep(1)
            
        # Check if failed
        status = self.queue_manager.get_download_status(task_id)
        if status and status.status == DownloadStatus.FAILED:
            print(f"✅ Task failed as expected")
            print(f"📊 Retry count: {status.retry_count}")
            
            # Try to retry
            success = self.queue_manager.retry_download(task_id)
            if success:
                print(f"✅ Retry initiated")
                return True
            else:
                print(f"❌ Retry failed (may have exceeded max retries)")
                return status.retry_count >= 3  # Max retries reached
        else:
            print(f"❌ Task did not fail as expected")
            return False
            
    def test_queue_stats(self):
        """Test 6: Queue statistics"""
        print("\n" + "="*60)
        print("TEST 6: Queue Statistics")
        print("="*60)
        
        # Get initial stats
        stats = self.queue_manager.get_queue_stats()
        print(f"📊 Initial stats: {json.dumps(stats, indent=2)}")
        
        # Add some tasks
        for i in range(3):
            task = DownloadTask(
                id=f"test_stats_{i}",
                url=f"https://www.youtube.com/watch?v=stats{i}",
                title=f"Stats Test {i}",
                artist="Test Artist",
                download_path=self.test_dir,
                priority=DownloadPriority.NORMAL
            )
            self.queue_manager.add_download(task)
            
        # Get updated stats
        time.sleep(1)
        stats = self.queue_manager.get_queue_stats()
        print(f"📊 Updated stats: {json.dumps(stats, indent=2)}")
        
        # Verify stats structure
        required_keys = ['total', 'active', 'queued', 'completed', 'failed', 'cancelled']
        return all(key in stats for key in required_keys)
        
    def test_get_all_downloads(self):
        """Test 7: Get all downloads"""
        print("\n" + "="*60)
        print("TEST 7: Get All Downloads")
        print("="*60)
        
        # Add some tasks
        task_ids = []
        for i in range(3):
            task = DownloadTask(
                id=f"test_getall_{i}",
                url=f"https://www.youtube.com/watch?v=getall{i}",
                title=f"Get All Test {i}",
                artist="Test Artist",
                download_path=self.test_dir,
                priority=DownloadPriority.NORMAL
            )
            task_id = self.queue_manager.add_download(task)
            task_ids.append(task_id)
            
        # Get all downloads
        all_downloads = self.queue_manager.get_all_downloads()
        print(f"📊 Total downloads: {len(all_downloads)}")
        
        # Verify all tasks are present
        for task_id in task_ids:
            if task_id in all_downloads:
                task = all_downloads[task_id]
                print(f"✅ Found task: {task.title} ({task.status.value})")
            else:
                print(f"❌ Task not found: {task_id}")
                return False
                
        return True
        
    def run_all_tests(self):
        """Run all tests"""
        print("\n" + "="*60)
        print("🧪 CAMELOTDJ DOWNLOAD TEST SUITE")
        print("="*60)
        
        self.setup()
        
        tests = [
            ("Basic Queue Functionality", self.test_queue_basic),
            ("Priority Queue Handling", self.test_priority_queue),
            ("Concurrent Download Handling", self.test_concurrent_downloads),
            ("Download Cancellation", self.test_cancel_download),
            ("Retry Failed Downloads", self.test_retry_failed_download),
            ("Queue Statistics", self.test_queue_stats),
            ("Get All Downloads", self.test_get_all_downloads)
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
        
        self.teardown()
        
        return failed == 0


def main():
    """Main test runner"""
    tester = DownloadTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print("\n❌ Some tests failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
