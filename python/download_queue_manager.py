"""
Download Queue Manager for YouTube Music Downloads
Manages download tasks with priority and status tracking
"""

import threading
import time
from enum import Enum
from dataclasses import dataclass
from typing import List, Optional, Callable
import queue
import logging

class DownloadPriority(Enum):
    LOW = 1
    NORMAL = 2
    HIGH = 3
    URGENT = 4

class DownloadStatus(Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class DownloadTask:
    id: str
    url: str
    title: str
    artist: str
    download_path: str
    priority: DownloadPriority = DownloadPriority.NORMAL
    status: DownloadStatus = DownloadStatus.PENDING
    progress: float = 0.0
    error_message: Optional[str] = None
    created_at: float = 0.0
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    
    def __post_init__(self):
        if self.created_at == 0.0:
            self.created_at = time.time()

class DownloadQueueManager:
    def __init__(self):
        self._queue = queue.PriorityQueue()
        self._tasks: dict[str, DownloadTask] = {}
        self._worker_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._callbacks: List[Callable[[DownloadTask], None]] = []
        self._is_running = False
        
    def add_task(self, task: DownloadTask) -> bool:
        """Add a download task to the queue"""
        try:
            with self._lock:
                self._tasks[task.id] = task
                # Priority queue uses negative priority for max-heap behavior
                self._queue.put((-task.priority.value, task.created_at, task.id))
                
            # Start worker if not running
            if not self._is_running:
                self.start_worker()
                
            return True
        except Exception as e:
            logging.error(f"Failed to add download task: {e}")
            return False
    
    def remove_task(self, task_id: str) -> bool:
        """Remove a task from the queue"""
        try:
            with self._lock:
                if task_id in self._tasks:
                    task = self._tasks[task_id]
                    task.status = DownloadStatus.CANCELLED
                    return True
            return False
        except Exception as e:
            logging.error(f"Failed to remove download task: {e}")
            return False
    
    def get_task(self, task_id: str) -> Optional[DownloadTask]:
        """Get a task by ID"""
        with self._lock:
            return self._tasks.get(task_id)
    
    def get_all_tasks(self) -> List[DownloadTask]:
        """Get all tasks"""
        with self._lock:
            return list(self._tasks.values())
    
    def get_tasks_by_status(self, status: DownloadStatus) -> List[DownloadTask]:
        """Get tasks filtered by status"""
        with self._lock:
            return [task for task in self._tasks.values() if task.status == status]
    
    def add_callback(self, callback: Callable[[DownloadTask], None]):
        """Add a callback for task status updates"""
        self._callbacks.append(callback)
    
    def add_progress_callback(self, callback: Callable[[DownloadTask], None]):
        """Add a callback for task progress updates (alias for add_callback)"""
        self.add_callback(callback)
    
    def add_completion_callback(self, callback: Callable[[DownloadTask], None]):
        """Add a callback for task completion updates (alias for add_callback)"""
        self.add_callback(callback)
    
    def add_error_callback(self, callback: Callable[[DownloadTask], None]):
        """Add a callback for task error updates (alias for add_callback)"""
        self.add_callback(callback)
    
    def _notify_callbacks(self, task: DownloadTask):
        """Notify all callbacks of task updates"""
        for callback in self._callbacks:
            try:
                callback(task)
            except Exception as e:
                logging.error(f"Callback error: {e}")
    
    def start_worker(self):
        """Start the download worker thread"""
        if self._is_running:
            return
            
        self._is_running = True
        self._stop_event.clear()
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker_thread.start()
    
    def stop_worker(self):
        """Stop the download worker thread"""
        self._is_running = False
        self._stop_event.set()
        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=5.0)
    
    def _worker_loop(self):
        """Main worker loop for processing download tasks"""
        while self._is_running and not self._stop_event.is_set():
            try:
                # Get next task from queue
                try:
                    _, _, task_id = self._queue.get(timeout=1.0)
                except queue.Empty:
                    continue
                
                with self._lock:
                    task = self._tasks.get(task_id)
                    if not task or task.status == DownloadStatus.CANCELLED:
                        continue
                
                # Process the download task
                self._process_download(task)
                
            except Exception as e:
                logging.error(f"Worker loop error: {e}")
                time.sleep(1.0)
    
    def _process_download(self, task: DownloadTask):
        """Process a single download task"""
        try:
            # Update task status
            task.status = DownloadStatus.DOWNLOADING
            task.started_at = time.time()
            self._notify_callbacks(task)
            
            # Simulate download process (replace with actual download logic)
            # This is a placeholder - in a real implementation, you would:
            # 1. Use yt-dlp or pytube to download the audio
            # 2. Update progress during download
            # 3. Handle errors appropriately
            
            # Simulate progress updates
            for progress in range(0, 101, 10):
                if task.status == DownloadStatus.CANCELLED:
                    return
                    
                task.progress = progress
                self._notify_callbacks(task)
                time.sleep(0.1)  # Simulate download time
            
            # Mark as completed
            task.status = DownloadStatus.COMPLETED
            task.completed_at = time.time()
            task.progress = 100.0
            self._notify_callbacks(task)
            
        except Exception as e:
            # Mark as failed
            task.status = DownloadStatus.FAILED
            task.error_message = str(e)
            task.completed_at = time.time()
            self._notify_callbacks(task)
            logging.error(f"Download failed for task {task.id}: {e}")
    
    def clear_completed_tasks(self):
        """Remove all completed tasks from the queue"""
        with self._lock:
            completed_ids = [
                task_id for task_id, task in self._tasks.items() 
                if task.status in [DownloadStatus.COMPLETED, DownloadStatus.FAILED, DownloadStatus.CANCELLED]
            ]
            for task_id in completed_ids:
                del self._tasks[task_id]
    
    def get_queue_stats(self) -> dict:
        """Get queue statistics"""
        with self._lock:
            total = len(self._tasks)
            pending = len([t for t in self._tasks.values() if t.status == DownloadStatus.PENDING])
            downloading = len([t for t in self._tasks.values() if t.status == DownloadStatus.DOWNLOADING])
            completed = len([t for t in self._tasks.values() if t.status == DownloadStatus.COMPLETED])
            failed = len([t for t in self._tasks.values() if t.status == DownloadStatus.FAILED])
            
            return {
                'total': total,
                'pending': pending,
                'downloading': downloading,
                'completed': completed,
                'failed': failed,
                'is_running': self._is_running
            }
    
    @property
    def is_running(self) -> bool:
        """Check if the worker is running"""
        return self._is_running
    
    def add_download(self, task: DownloadTask) -> str:
        """Add a download task and return its ID"""
        self.add_task(task)
        return task.id
    
    def get_all_downloads(self) -> List[DownloadTask]:
        """Get all download tasks (alias for get_all_tasks)"""
        return self.get_all_tasks()
    
    def cancel_download(self, task_id: str) -> bool:
        """Cancel a download task"""
        return self.remove_task(task_id)
    
    def retry_download(self, task_id: str) -> bool:
        """Retry a failed download task"""
        with self._lock:
            if task_id in self._tasks:
                task = self._tasks[task_id]
                if task.status == DownloadStatus.FAILED:
                    task.status = DownloadStatus.PENDING
                    task.error_message = None
                    task.progress = 0.0
                    # Re-add to queue
                    self._queue.put((-task.priority.value, task.created_at, task.id))
                    return True
        return False
    
    def clear_completed_downloads(self):
        """Clear completed downloads"""
        with self._lock:
            completed_ids = [
                task_id for task_id, task in self._tasks.items() 
                if task.status == DownloadStatus.COMPLETED
            ]
            for task_id in completed_ids:
                del self._tasks[task_id]
    
    def clear_failed_downloads(self):
        """Clear failed downloads"""
        with self._lock:
            failed_ids = [
                task_id for task_id, task in self._tasks.items() 
                if task.status == DownloadStatus.FAILED
            ]
            for task_id in failed_ids:
                del self._tasks[task_id]
    
    def update_max_concurrent_downloads(self, max_concurrent: int):
        """Update maximum concurrent downloads (placeholder)"""
        # This would be implemented if we had concurrent download support
        pass

# Global instance
download_queue_manager = DownloadQueueManager()
