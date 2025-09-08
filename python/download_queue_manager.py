"""
Download Queue Manager for handling multiple concurrent downloads efficiently.
This module provides a centralized queue system with proper resource management,
priority support, and error handling for the download manager.
"""

import asyncio
import threading
import time
import queue
import logging
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field
from enum import Enum
import uuid
from concurrent.futures import ThreadPoolExecutor
import psutil
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DownloadPriority(Enum):
    """Download priority levels"""
    LOW = 1
    NORMAL = 2
    HIGH = 3
    URGENT = 4

class DownloadStatus(Enum):
    """Download status states"""
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    CONVERTING = "converting"
    METADATA = "metadata"
    ANALYZING = "analyzing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"

@dataclass
class DownloadTask:
    """Represents a download task in the queue"""
    id: str
    url: str
    title: str
    artist: str
    album: Optional[str] = None
    download_path: str = ""
    priority: DownloadPriority = DownloadPriority.NORMAL
    status: DownloadStatus = DownloadStatus.QUEUED
    progress: float = 0.0
    stage: str = "queued"
    message: str = "Added to download queue"
    file_size: int = 0
    downloaded_size: int = 0
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    error: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    can_cancel: bool = True
    can_retry: bool = False
    quality: str = "320kbps"
    format: str = "mp3"
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    
    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())

class DownloadQueueManager:
    """Manages download queue with proper resource management and prioritization"""
    
    def __init__(self, max_concurrent_downloads: int = 3, max_retries: int = 3):
        self.max_concurrent_downloads = max_concurrent_downloads
        self.max_retries = max_retries
        self.download_queue = queue.PriorityQueue()
        self.active_downloads: Dict[str, DownloadTask] = {}
        self.completed_downloads: Dict[str, DownloadTask] = {}
        self.failed_downloads: Dict[str, DownloadTask] = {}
        self.download_lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=max_concurrent_downloads)
        self.is_running = False
        self.queue_thread: Optional[threading.Thread] = None
        self.progress_callbacks: List[Callable] = []
        self.completion_callbacks: List[Callable] = []
        self.error_callbacks: List[Callable] = []
        
        # Resource monitoring
        self.cpu_threshold = 80.0  # CPU usage threshold
        self.memory_threshold = 80.0  # Memory usage threshold
        self.disk_threshold = 90.0  # Disk usage threshold
        
        logger.info(f"DownloadQueueManager initialized with max_concurrent_downloads={max_concurrent_downloads}")
    
    def add_progress_callback(self, callback: Callable):
        """Add a progress callback function"""
        self.progress_callbacks.append(callback)
    
    def add_completion_callback(self, callback: Callable):
        """Add a completion callback function"""
        self.completion_callbacks.append(callback)
    
    def add_error_callback(self, callback: Callable):
        """Add an error callback function"""
        self.error_callbacks.append(callback)
    
    def _emit_progress(self, task: DownloadTask):
        """Emit progress update to all registered callbacks"""
        for callback in self.progress_callbacks:
            try:
                callback(task)
            except Exception as e:
                logger.error(f"Error in progress callback: {e}")
    
    def _emit_completion(self, task: DownloadTask):
        """Emit completion update to all registered callbacks"""
        for callback in self.completion_callbacks:
            try:
                callback(task)
            except Exception as e:
                logger.error(f"Error in completion callback: {e}")
    
    def _emit_error(self, task: DownloadTask):
        """Emit error update to all registered callbacks"""
        for callback in self.error_callbacks:
            try:
                callback(task)
            except Exception as e:
                logger.error(f"Error in error callback: {e}")
    
    def _check_system_resources(self) -> bool:
        """Check if system resources are available for new downloads"""
        try:
            # Check CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            if cpu_percent > self.cpu_threshold:
                logger.warning(f"CPU usage too high: {cpu_percent}%")
                return False
            
            # Check memory usage
            memory = psutil.virtual_memory()
            if memory.percent > self.memory_threshold:
                logger.warning(f"Memory usage too high: {memory.percent}%")
                return False
            
            # Check disk usage for download path
            if hasattr(self, 'download_path') and self.download_path:
                disk_usage = psutil.disk_usage(self.download_path)
                disk_percent = (disk_usage.used / disk_usage.total) * 100
                if disk_percent > self.disk_threshold:
                    logger.warning(f"Disk usage too high: {disk_percent}%")
                    return False
            
            return True
        except Exception as e:
            logger.error(f"Error checking system resources: {e}")
            return True  # Allow download if we can't check resources
    
    def add_download(self, task: DownloadTask) -> str:
        """Add a download task to the queue"""
        with self.download_lock:
            # Check if task already exists
            if task.id in self.active_downloads:
                logger.warning(f"Download task {task.id} already exists")
                return task.id
            
            # Set priority for queue ordering (higher priority = lower number)
            priority_value = (5 - task.priority.value, task.created_at)
            
            # Add to priority queue
            self.download_queue.put((priority_value, task))
            
            logger.info(f"Added download task {task.id} to queue: {task.title} by {task.artist}")
            
            # Start queue processor if not running
            if not self.is_running:
                self.start()
            
            return task.id
    
    def start(self):
        """Start the download queue processor"""
        if self.is_running:
            return
        
        self.is_running = True
        self.queue_thread = threading.Thread(target=self._process_queue, daemon=True)
        self.queue_thread.start()
        logger.info("Download queue processor started")
    
    def stop(self):
        """Stop the download queue processor"""
        self.is_running = False
        if self.queue_thread:
            self.queue_thread.join(timeout=5)
        self.executor.shutdown(wait=True)
        logger.info("Download queue processor stopped")
    
    def _process_queue(self):
        """Main queue processing loop"""
        while self.is_running:
            try:
                # Check if we can start more downloads
                if len(self.active_downloads) < self.max_concurrent_downloads:
                    # Check system resources
                    if not self._check_system_resources():
                        time.sleep(2)  # Wait before checking again
                        continue
                    
                    # Get next task from queue
                    try:
                        priority_value, task = self.download_queue.get(timeout=1)
                        
                        # Check if task is still valid
                        if task.status == DownloadStatus.CANCELLED:
                            continue
                        
                        # Start download
                        self._start_download(task)
                        
                    except queue.Empty:
                        continue
                
                time.sleep(0.5)  # Small delay to prevent busy waiting
                
            except Exception as e:
                logger.error(f"Error in queue processor: {e}")
                time.sleep(1)
    
    def _start_download(self, task: DownloadTask):
        """Start a download task"""
        with self.download_lock:
            task.status = DownloadStatus.DOWNLOADING
            task.start_time = time.time()
            task.stage = "initializing"
            task.message = "Starting download..."
            self.active_downloads[task.id] = task
        
        # Submit to thread pool
        future = self.executor.submit(self._execute_download, task)
        
        # Add callback for completion
        future.add_done_callback(lambda f: self._handle_download_completion(task, f))
        
        logger.info(f"Started download task {task.id}: {task.title}")
        self._emit_progress(task)
    
    def _execute_download(self, task: DownloadTask):
        """Execute the actual download using the main application's download function"""
        try:
            # Import the download function from the main API module
            import sys
            import os
            sys.path.append(os.path.dirname(os.path.abspath(__file__)))
            
            # We'll need to call the actual download function from api.py
            # For now, we'll implement a simplified version that calls the existing download logic
            
            # Update progress
            task.stage = "downloading"
            task.message = "Downloading audio..."
            task.progress = 10.0
            self._emit_progress(task)
            
            # Create safe filename
            safe_title = "".join(c for c in f"{task.artist} - {task.title}" if c.isalnum() or c in (' ', '-', '_')).rstrip()
            if len(safe_title) > 200:
                safe_title = safe_title[:200]
            temp_filename = f"{safe_title}.mp4"
            final_filename = f"{safe_title}.mp3"
            
            import tempfile
            temp_path = os.path.join(tempfile.gettempdir(), temp_filename)
            final_path = os.path.join(task.download_path, final_filename)
            
            # Check if file already exists
            if os.path.exists(final_path):
                timestamp = int(time.time())
                final_filename = f"{safe_title}_{timestamp}.mp3"
                final_path = os.path.join(task.download_path, final_filename)
            
            # Update progress
            task.stage = "downloading"
            task.message = "Downloading with yt-dlp..."
            task.progress = 30.0
            self._emit_progress(task)
            
            # Call the actual download function (we'll need to import it)
            # For now, we'll use a placeholder that will be replaced with the actual implementation
            success = self._perform_actual_download(task, temp_path, final_path)
            
            if not success:
                raise Exception("Download failed")
            
            # Update progress
            task.stage = "converting"
            task.message = "Converting to MP3..."
            task.progress = 70.0
            self._emit_progress(task)
            
            # Update progress
            task.stage = "metadata"
            task.message = "Adding metadata..."
            task.progress = 85.0
            self._emit_progress(task)
            
            # Update progress
            task.stage = "analyzing"
            task.message = "Analyzing music..."
            task.progress = 95.0
            self._emit_progress(task)
            
            # Complete
            task.status = DownloadStatus.COMPLETED
            task.stage = "complete"
            task.message = "Download complete!"
            task.progress = 100.0
            task.end_time = time.time()
            task.file_size = os.path.getsize(final_path) if os.path.exists(final_path) else 0
            
            return task
            
        except Exception as e:
            task.status = DownloadStatus.FAILED
            task.stage = "error"
            task.message = f"Download failed: {str(e)}"
            task.error = str(e)
            task.end_time = time.time()
            raise e
    
    def _perform_actual_download(self, task: DownloadTask, temp_path: str, final_path: str) -> bool:
        """Perform the actual download by calling the existing download logic"""
        try:
            # Import the necessary functions from the main API module
            import sys
            import os
            sys.path.append(os.path.dirname(os.path.abspath(__file__)))
            
            # Import the download functions from api.py
            from api import download_with_ytdlp_enhanced, convert_to_320kbps_mp3, enhance_metadata_with_artwork, analyze_music_file, verify_audio_quality
            
            # Update progress
            task.stage = "downloading"
            task.message = "Downloading with yt-dlp..."
            task.progress = 30.0
            self._emit_progress(task)
            
            # Perform the actual download
            success, metadata, actual_temp_path = download_with_ytdlp_enhanced(
                task.url, temp_path, task.title, task.artist, task.id
            )
            
            if not success:
                raise Exception("Download failed")
            
            # Update progress
            task.stage = "converting"
            task.message = "Converting to MP3..."
            task.progress = 60.0
            self._emit_progress(task)
            
            # Convert to MP3
            conversion_success = convert_to_320kbps_mp3(actual_temp_path, final_path, task.id)
            if not conversion_success:
                raise Exception("Conversion failed")
            
            # Update progress
            task.stage = "metadata"
            task.message = "Adding metadata..."
            task.progress = 80.0
            self._emit_progress(task)
            
            # Enhance metadata
            try:
                enhance_metadata_with_artwork(final_path, metadata)
            except Exception as e:
                logger.warning(f"Metadata enhancement failed: {e}")
            
            # Update progress
            task.stage = "analyzing"
            task.message = "Analyzing music..."
            task.progress = 90.0
            self._emit_progress(task)
            
            # Analyze the file
            try:
                analysis_result = analyze_music_file(final_path)
                task.metadata.update(analysis_result)
                
                # Import database manager to add the song to the database
                from database_manager import DatabaseManager
                db_manager = DatabaseManager()
                
                # Create file data for database insertion
                file_data = {
                    'filename': os.path.basename(final_path),
                    'file_path': final_path,
                    'title': task.title,
                    'artist': task.artist,
                    'album': task.album or '',
                    'duration': analysis_result.get('duration', 0),
                    'file_size': os.path.getsize(final_path) if os.path.exists(final_path) else 0,
                    'bitrate': analysis_result.get('bitrate', 320),
                    'key': analysis_result.get('key', 'Unknown'),
                    'scale': analysis_result.get('scale', 'Unknown'),
                    'key_name': analysis_result.get('key_name', 'Unknown'),
                    'camelot_key': analysis_result.get('camelot_key', 'Unknown'),
                    'bpm': analysis_result.get('bpm', 0),
                    'energy_level': analysis_result.get('energy_level', 5),
                    'status': 'analyzed',
                    'analysis_date': time.strftime('%Y-%m-%d %H:%M:%S')
                }
                
                # Generate unique track_id
                track_id = db_manager.generate_unique_track_id(final_path, os.path.basename(final_path))
                file_data['track_id'] = track_id
                
                # Add to database
                db_id = db_manager.add_music_file(file_data)
                print(f"🎵 Queue manager added song to database with ID: {db_id}")
                
                # Create complete analysis result with database info
                complete_analysis_result = {
                    **analysis_result,
                    **file_data,
                    'db_id': db_id,
                    'id': db_id
                }
                
                # Store complete result for completion callback
                task.metadata['analysis_result'] = complete_analysis_result
                
                # Add to "Downloads" playlist
                downloads_playlist = db_manager.get_playlist_by_name("Downloads")
                if not downloads_playlist:
                    downloads_playlist_id = db_manager.create_playlist(name="Downloads", description="Automatically downloaded songs", color="#4ecdc4")
                else:
                    downloads_playlist_id = downloads_playlist['id']
                
                if downloads_playlist_id:
                    db_manager.add_song_to_playlist(downloads_playlist_id, db_id)
                    print(f"✅ Added song {db_id} to 'Downloads' playlist")
                    
            except Exception as e:
                logger.warning(f"Analysis failed: {e}")
                task.metadata.update({
                    'key': 'Unknown',
                    'scale': 'Unknown',
                    'key_name': 'Unknown',
                    'camelot_key': 'Unknown',
                    'bpm': 0.0,
                    'energy_level': 0.0,
                    'duration': 0.0,
                    'cue_points': []
                })
            
            # Verify quality
            try:
                actual_bitrate = verify_audio_quality(final_path)
                task.metadata['bitrate'] = actual_bitrate
                task.metadata['quality_verified'] = actual_bitrate >= 300
            except Exception as e:
                logger.warning(f"Quality verification failed: {e}")
                task.metadata['bitrate'] = 320
                task.metadata['quality_verified'] = False
            
            # Clean up temp file
            try:
                if actual_temp_path and os.path.exists(actual_temp_path):
                    os.remove(actual_temp_path)
            except Exception as e:
                logger.warning(f"Failed to clean up temp file: {e}")
            
            return True
            
        except Exception as e:
            logger.error(f"Download execution failed: {e}")
            # Clean up temp file on error
            try:
                if temp_path and os.path.exists(temp_path):
                    os.remove(temp_path)
            except:
                pass
            raise e
    
    def _handle_download_completion(self, task: DownloadTask, future):
        """Handle download completion"""
        with self.download_lock:
            # Remove from active downloads
            if task.id in self.active_downloads:
                del self.active_downloads[task.id]
            
            try:
                # Check if download was successful
                if future.exception() is None:
                    task.status = DownloadStatus.COMPLETED
                    self.completed_downloads[task.id] = task
                    logger.info(f"Download completed successfully: {task.title}")
                    self._emit_completion(task)
                else:
                    # Handle retry logic
                    if task.retry_count < task.max_retries:
                        task.retry_count += 1
                        task.status = DownloadStatus.QUEUED
                        task.stage = "queued"
                        task.message = f"Retrying download (attempt {task.retry_count + 1}/{task.max_retries + 1})..."
                        task.progress = 0.0
                        task.error = None
                        
                        # Re-add to queue with higher priority
                        priority_value = (5 - task.priority.value, task.created_at)
                        self.download_queue.put((priority_value, task))
                        
                        logger.info(f"Retrying download {task.id} (attempt {task.retry_count})")
                    else:
                        task.status = DownloadStatus.FAILED
                        self.failed_downloads[task.id] = task
                        logger.error(f"Download failed after {task.max_retries} retries: {task.title}")
                        self._emit_error(task)
                        
            except Exception as e:
                logger.error(f"Error handling download completion: {e}")
                task.status = DownloadStatus.FAILED
                task.error = str(e)
                self.failed_downloads[task.id] = task
                self._emit_error(task)
    
    def cancel_download(self, task_id: str) -> bool:
        """Cancel a download task"""
        with self.download_lock:
            # Check active downloads
            if task_id in self.active_downloads:
                task = self.active_downloads[task_id]
                task.status = DownloadStatus.CANCELLED
                task.stage = "cancelled"
                task.message = "Download cancelled"
                task.can_cancel = False
                task.can_retry = True
                del self.active_downloads[task_id]
                logger.info(f"Cancelled download: {task.title}")
                self._emit_progress(task)
                return True
            
            # Check queued downloads
            # Note: This is a simplified approach. In a real implementation,
            # you'd need to remove the task from the priority queue
            logger.warning(f"Could not cancel download {task_id}: not found in active downloads")
            return False
    
    def retry_download(self, task_id: str) -> bool:
        """Retry a failed download"""
        with self.download_lock:
            if task_id in self.failed_downloads:
                task = self.failed_downloads[task_id]
                task.status = DownloadStatus.QUEUED
                task.stage = "queued"
                task.message = "Retrying download..."
                task.progress = 0.0
                task.retry_count = 0
                task.error = None
                task.can_retry = False
                task.can_cancel = True
                
                # Remove from failed downloads
                del self.failed_downloads[task_id]
                
                # Re-add to queue
                priority_value = (5 - task.priority.value, task.created_at)
                self.download_queue.put((priority_value, task))
                
                logger.info(f"Retrying download: {task.title}")
                return True
            
            return False
    
    def get_download_status(self, task_id: str) -> Optional[DownloadTask]:
        """Get the status of a download task"""
        with self.download_lock:
            # Check all dictionaries
            for download_dict in [self.active_downloads, self.completed_downloads, self.failed_downloads]:
                if task_id in download_dict:
                    return download_dict[task_id]
            return None
    
    def get_all_downloads(self) -> Dict[str, DownloadTask]:
        """Get all download tasks"""
        with self.download_lock:
            all_downloads = {}
            all_downloads.update(self.active_downloads)
            all_downloads.update(self.completed_downloads)
            all_downloads.update(self.failed_downloads)
            return all_downloads
    
    def get_queue_stats(self) -> Dict[str, int]:
        """Get queue statistics"""
        with self.download_lock:
            return {
                'queued': self.download_queue.qsize(),
                'active': len(self.active_downloads),
                'completed': len(self.completed_downloads),
                'failed': len(self.failed_downloads),
                'total': self.download_queue.qsize() + len(self.active_downloads) + 
                        len(self.completed_downloads) + len(self.failed_downloads)
            }
    
    def clear_completed_downloads(self):
        """Clear completed downloads from memory"""
        with self.download_lock:
            self.completed_downloads.clear()
            logger.info("Cleared completed downloads")
    
    def clear_failed_downloads(self):
        """Clear failed downloads from memory"""
        with self.download_lock:
            self.failed_downloads.clear()
            logger.info("Cleared failed downloads")
    
    def update_max_concurrent_downloads(self, new_max: int):
        """Update the maximum number of concurrent downloads"""
        with self.download_lock:
            self.max_concurrent_downloads = new_max
            # Update thread pool executor
            self.executor.shutdown(wait=True)
            self.executor = ThreadPoolExecutor(max_workers=new_max)
            logger.info(f"Updated max concurrent downloads to {new_max}")

# Global instance
download_queue_manager = DownloadQueueManager()
