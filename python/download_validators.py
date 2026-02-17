"""
Robust Download and Preview Fixes for CamelotDJ
This module contains enhanced error handling and validation for download and preview features.
"""

import os
import sys
import time
import traceback
import logging
from typing import Optional, Tuple, Dict, Any
import psutil

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DownloadValidator:
    """Validates download prerequisites and system resources"""
    
    @staticmethod
    def check_ffmpeg() -> Tuple[bool, Optional[str]]:
        """
        Check if FFmpeg is available and return path
        Returns: (is_available, path_or_error_message)
        """
        import shutil
        
        # Check common locations
        ffmpeg_locations = [
            '/usr/local/bin/ffmpeg',
            '/opt/homebrew/bin/ffmpeg',
            '/usr/bin/ffmpeg',
            shutil.which('ffmpeg')
        ]
        
        for location in ffmpeg_locations:
            if location and os.path.exists(location):
                logger.info(f"✅ FFmpeg found at: {location}")
                return True, location
                
        error_msg = (
            "FFmpeg not found. Please install it:\n"
            "  macOS: brew install ffmpeg\n"
            "  Ubuntu: sudo apt-get install ffmpeg\n"
            "  Windows: Download from https://ffmpeg.org/download.html"
        )
        logger.error(f"❌ {error_msg}")
        return False, error_msg
        
    @staticmethod
    def check_disk_space(path: str, required_mb: int = 100) -> Tuple[bool, str]:
        """
        Check if there's enough disk space
        Returns: (has_space, message)
        """
        try:
            stat = os.statvfs(path)
            free_mb = (stat.f_bavail * stat.f_frsize) / (1024 * 1024)
            
            if free_mb >= required_mb:
                logger.info(f"✅ Sufficient disk space: {free_mb:.0f} MB available")
                return True, f"{free_mb:.0f} MB available"
            else:
                error_msg = f"Insufficient disk space: {free_mb:.0f} MB available, {required_mb} MB required"
                logger.error(f"❌ {error_msg}")
                return False, error_msg
                
        except Exception as e:
            logger.error(f"❌ Error checking disk space: {str(e)}")
            return False, f"Error checking disk space: {str(e)}"
            
    @staticmethod
    def check_system_resources() -> Tuple[bool, Dict[str, Any]]:
        """
        Check system resources (CPU, memory, disk)
        Returns: (is_healthy, resource_info)
        """
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            resource_info = {
                'cpu_percent': cpu_percent,
                'memory_percent': memory.percent,
                'memory_available_mb': memory.available / (1024 * 1024),
                'disk_percent': disk.percent,
                'disk_free_gb': disk.free / (1024 * 1024 * 1024)
            }
            
            # Check if resources are critically low
            is_healthy = (
                cpu_percent < 90 and
                memory.percent < 90 and
                disk.percent < 95
            )
            
            if is_healthy:
                logger.info(f"✅ System resources healthy")
            else:
                logger.warning(f"⚠️ System resources constrained: {resource_info}")
                
            return is_healthy, resource_info
            
        except Exception as e:
            logger.error(f"❌ Error checking system resources: {str(e)}")
            return False, {'error': str(e)}
            
    @staticmethod
    def validate_download_path(path: str) -> Tuple[bool, str]:
        """
        Validate download path exists and is writable
        Returns: (is_valid, message)
        """
        try:
            # Check if path exists
            if not os.path.exists(path):
                try:
                    os.makedirs(path, exist_ok=True)
                    logger.info(f"✅ Created download directory: {path}")
                except Exception as e:
                    error_msg = f"Cannot create download directory: {str(e)}"
                    logger.error(f"❌ {error_msg}")
                    return False, error_msg
                    
            # Check if writable
            if not os.access(path, os.W_OK):
                error_msg = f"Download path is not writable: {path}"
                logger.error(f"❌ {error_msg}")
                return False, error_msg
                
            logger.info(f"✅ Download path valid: {path}")
            return True, "Download path is valid"
            
        except Exception as e:
            error_msg = f"Error validating download path: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg
            
    @staticmethod
    def validate_url(url: str) -> Tuple[bool, str]:
        """
        Validate YouTube URL format
        Returns: (is_valid, message)
        """
        import re
        
        # YouTube URL patterns
        patterns = [
            r'(?:https?://)?(?:www\.)?youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})',
            r'(?:https?://)?(?:www\.)?youtu\.be/([a-zA-Z0-9_-]{11})',
            r'(?:https?://)?(?:www\.)?youtube\.com/embed/([a-zA-Z0-9_-]{11})'
        ]
        
        for pattern in patterns:
            if re.match(pattern, url):
                logger.info(f"✅ Valid YouTube URL")
                return True, "Valid YouTube URL"
                
        error_msg = "Invalid YouTube URL format"
        logger.error(f"❌ {error_msg}")
        return False, error_msg


class DownloadErrorHandler:
    """Enhanced error handling for downloads"""
    
    @staticmethod
    def categorize_error(error: Exception) -> Dict[str, Any]:
        """
        Categorize download error and suggest fix
        Returns: error_info dict with category, message, and suggested_action
        """
        error_str = str(error).lower()
        error_trace = traceback.format_exc()
        
        # Network errors
        if any(keyword in error_str for keyword in ['network', 'connection', 'timeout', 'unreachable']):
            return {
                'category': 'network',
                'message': 'Network connection error',
                'suggested_action': 'Check internet connection and try again',
                'retryable': True,
                'retry_delay': 5
            }
            
        # Video unavailable
        if any(keyword in error_str for keyword in ['unavailable', 'not found', 'removed', 'private']):
            return {
                'category': 'video_unavailable',
                'message': 'Video is unavailable or restricted',
                'suggested_action': 'Video may be private, deleted, or geo-blocked',
                'retryable': False
            }
            
        # FFmpeg errors
        if any(keyword in error_str for keyword in ['ffmpeg', 'codec', 'conversion']):
            return {
                'category': 'ffmpeg',
                'message': 'Audio conversion error',
                'suggested_action': 'Ensure FFmpeg is installed and accessible',
                'retryable': False
            }
            
        # Disk space errors
        if any(keyword in error_str for keyword in ['disk', 'space', 'no space']):
            return {
                'category': 'disk_space',
                'message': 'Insufficient disk space',
                'suggested_action': 'Free up disk space and try again',
                'retryable': False
            }
            
        # Permission errors
        if any(keyword in error_str for keyword in ['permission', 'access denied', 'forbidden']):
            return {
                'category': 'permission',
                'message': 'Permission denied',
                'suggested_action': 'Check file/directory permissions',
                'retryable': False
            }
            
        # Rate limiting
        if any(keyword in error_str for keyword in ['rate limit', 'too many requests', '429']):
            return {
                'category': 'rate_limit',
                'message': 'Rate limited by YouTube',
                'suggested_action': 'Wait a few minutes before trying again',
                'retryable': True,
                'retry_delay': 60
            }
            
        # Default unknown error
        return {
            'category': 'unknown',
            'message': str(error),
            'suggested_action': 'Check logs for details',
            'retryable': True,
            'retry_delay': 10,
            'trace': error_trace
        }
        
    @staticmethod
    def should_retry(error_info: Dict[str, Any], retry_count: int, max_retries: int = 3) -> bool:
        """
        Determine if download should be retried
        Returns: should_retry boolean
        """
        if retry_count >= max_retries:
            logger.info(f"❌ Max retries ({max_retries}) reached")
            return False
            
        if not error_info.get('retryable', False):
            logger.info(f"❌ Error is not retryable: {error_info['category']}")
            return False
            
        logger.info(f"✅ Will retry (attempt {retry_count + 1}/{max_retries})")
        return True
        
    @staticmethod
    def get_retry_delay(error_info: Dict[str, Any], retry_count: int) -> int:
        """
        Calculate retry delay with exponential backoff
        Returns: delay in seconds
        """
        base_delay = error_info.get('retry_delay', 5)
        # Exponential backoff: base_delay * 2^retry_count
        delay = base_delay * (2 ** retry_count)
        # Cap at 5 minutes
        return min(delay, 300)


class StreamValidator:
    """Validates streaming prerequisites"""
    
    @staticmethod
    def validate_video_id(video_id: str) -> Tuple[bool, str]:
        """
        Validate YouTube video ID format
        Returns: (is_valid, message)
        """
        import re
        
        # YouTube video IDs are 11 characters: alphanumeric, hyphen, underscore
        pattern = r'^[a-zA-Z0-9_-]{11}$'
        
        if re.match(pattern, video_id):
            logger.info(f"✅ Valid video ID: {video_id}")
            return True, "Valid video ID"
        else:
            error_msg = f"Invalid video ID format: {video_id}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg
            
    @staticmethod
    def check_stream_availability(video_id: str) -> Tuple[bool, str]:
        """
        Check if video is available for streaming
        Returns: (is_available, message)
        """
        try:
            import yt_dlp
            
            url = f"https://www.youtube.com/watch?v={video_id}"
            
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': True
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
                if info:
                    logger.info(f"✅ Video available for streaming: {info.get('title', 'Unknown')}")
                    return True, f"Video available: {info.get('title', 'Unknown')}"
                else:
                    error_msg = "Video information not available"
                    logger.error(f"❌ {error_msg}")
                    return False, error_msg
                    
        except Exception as e:
            error_msg = f"Error checking stream availability: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg


# Utility functions for integration

def validate_download_request(url: str, download_path: str) -> Tuple[bool, Dict[str, Any]]:
    """
    Comprehensive validation for download request
    Returns: (is_valid, validation_results)
    """
    results = {
        'valid': True,
        'checks': {}
    }
    
    # Check URL
    url_valid, url_msg = DownloadValidator.validate_url(url)
    results['checks']['url'] = {'valid': url_valid, 'message': url_msg}
    if not url_valid:
        results['valid'] = False
        
    # Check download path
    path_valid, path_msg = DownloadValidator.validate_download_path(download_path)
    results['checks']['download_path'] = {'valid': path_valid, 'message': path_msg}
    if not path_valid:
        results['valid'] = False
        
    # Check FFmpeg
    ffmpeg_valid, ffmpeg_msg = DownloadValidator.check_ffmpeg()
    results['checks']['ffmpeg'] = {'valid': ffmpeg_valid, 'message': ffmpeg_msg}
    if not ffmpeg_valid:
        results['valid'] = False
        
    # Check disk space
    space_valid, space_msg = DownloadValidator.check_disk_space(download_path)
    results['checks']['disk_space'] = {'valid': space_valid, 'message': space_msg}
    if not space_valid:
        results['valid'] = False
        
    # Check system resources
    resources_healthy, resource_info = DownloadValidator.check_system_resources()
    results['checks']['system_resources'] = {
        'healthy': resources_healthy,
        'info': resource_info
    }
    # Don't fail on resource constraints, just warn
    
    return results['valid'], results


def validate_stream_request(video_id: str) -> Tuple[bool, Dict[str, Any]]:
    """
    Comprehensive validation for stream request
    Returns: (is_valid, validation_results)
    """
    results = {
        'valid': True,
        'checks': {}
    }
    
    # Check video ID format
    id_valid, id_msg = StreamValidator.validate_video_id(video_id)
    results['checks']['video_id'] = {'valid': id_valid, 'message': id_msg}
    if not id_valid:
        results['valid'] = False
        
    # Check stream availability (optional, can be slow)
    # Uncomment if you want to pre-check availability
    # available, avail_msg = StreamValidator.check_stream_availability(video_id)
    # results['checks']['availability'] = {'valid': available, 'message': avail_msg}
    
    return results['valid'], results


# Example usage
if __name__ == "__main__":
    print("🧪 Testing Download Validators...")
    
    # Test FFmpeg check
    ffmpeg_ok, ffmpeg_path = DownloadValidator.check_ffmpeg()
    print(f"FFmpeg: {ffmpeg_ok} - {ffmpeg_path}")
    
    # Test disk space check
    space_ok, space_msg = DownloadValidator.check_disk_space("/tmp")
    print(f"Disk Space: {space_ok} - {space_msg}")
    
    # Test system resources
    healthy, resources = DownloadValidator.check_system_resources()
    print(f"System Resources: {healthy}")
    print(f"  CPU: {resources.get('cpu_percent', 0):.1f}%")
    print(f"  Memory: {resources.get('memory_percent', 0):.1f}%")
    print(f"  Disk: {resources.get('disk_percent', 0):.1f}%")
    
    # Test URL validation
    url_ok, url_msg = DownloadValidator.validate_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    print(f"URL Validation: {url_ok} - {url_msg}")
    
    # Test video ID validation
    vid_ok, vid_msg = StreamValidator.validate_video_id("dQw4w9WgXcQ")
    print(f"Video ID Validation: {vid_ok} - {vid_msg}")
    
    print("\n✅ Validator tests complete!")
