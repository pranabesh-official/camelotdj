"""
Enhanced Error Handling System for Mixed In Key API
Provides robust error handling, retry mechanisms, and detailed error reporting
"""

import time
import traceback
import logging
from typing import Dict, Any, Optional, Callable, List
from enum import Enum
import functools
import json
import os
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ErrorType(Enum):
    """Types of errors that can occur during downloads"""
    NETWORK_ERROR = "network_error"
    DOWNLOAD_ERROR = "download_error"
    CONVERSION_ERROR = "conversion_error"
    METADATA_ERROR = "metadata_error"
    ANALYSIS_ERROR = "analysis_error"
    FILE_SYSTEM_ERROR = "file_system_error"
    PERMISSION_ERROR = "permission_error"
    QUOTA_ERROR = "quota_error"
    FORMAT_ERROR = "format_error"
    UNKNOWN_ERROR = "unknown_error"

class ErrorSeverity(Enum):
    """Severity levels for errors"""
    LOW = "low"           # Non-critical, can continue
    MEDIUM = "medium"     # May affect quality but can recover
    HIGH = "high"         # Critical, requires retry
    CRITICAL = "critical" # Fatal, cannot recover

class RetryStrategy(Enum):
    """Retry strategies for different error types"""
    IMMEDIATE = "immediate"      # Retry immediately
    EXPONENTIAL = "exponential"  # Exponential backoff
    LINEAR = "linear"           # Linear backoff
    FIXED = "fixed"            # Fixed delay
    NO_RETRY = "no_retry"      # Don't retry

class DownloadError(Exception):
    """Custom exception for download-related errors"""
    def __init__(self, message: str, error_type: ErrorType, severity: ErrorSeverity, 
                 retry_strategy: RetryStrategy = RetryStrategy.EXPONENTIAL, 
                 retry_count: int = 0, max_retries: int = 3, 
                 context: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.error_type = error_type
        self.severity = severity
        self.retry_strategy = retry_strategy
        self.retry_count = retry_count
        self.max_retries = max_retries
        self.context = context or {}
        self.timestamp = datetime.now().isoformat()
        self.traceback = traceback.format_exc()

class ErrorHandler:
    """Enhanced error handler with retry mechanisms and detailed reporting"""
    
    def __init__(self):
        self.error_log: List[Dict[str, Any]] = []
        self.retry_delays = {
            RetryStrategy.IMMEDIATE: 0,
            RetryStrategy.FIXED: 2,
            RetryStrategy.LINEAR: lambda count: count * 2,
            RetryStrategy.EXPONENTIAL: lambda count: min(2 ** count, 60),
            RetryStrategy.NO_RETRY: 0
        }
        
        # Error type mappings for automatic classification
        self.error_patterns = {
            ErrorType.NETWORK_ERROR: [
                "connection", "timeout", "network", "unreachable", "refused",
                "ssl", "certificate", "dns", "resolve"
            ],
            ErrorType.DOWNLOAD_ERROR: [
                "download", "yt-dlp", "pytube", "extract", "video unavailable",
                "private", "deleted", "blocked", "region", "age-restricted"
            ],
            ErrorType.CONVERSION_ERROR: [
                "convert", "ffmpeg", "pydub", "audio", "format", "codec",
                "bitrate", "sample rate"
            ],
            ErrorType.METADATA_ERROR: [
                "metadata", "id3", "tag", "artwork", "thumbnail", "embed"
            ],
            ErrorType.ANALYSIS_ERROR: [
                "analyze", "key", "bpm", "tempo", "energy", "music analysis"
            ],
            ErrorType.FILE_SYSTEM_ERROR: [
                "file", "directory", "path", "disk", "space", "permission",
                "access denied", "read-only"
            ],
            ErrorType.QUOTA_ERROR: [
                "quota", "limit", "rate", "throttle", "too many requests"
            ]
        }
    
    def classify_error(self, error_message: str, exception: Optional[Exception] = None) -> ErrorType:
        """Automatically classify error type based on message content"""
        error_lower = error_message.lower()
        
        for error_type, patterns in self.error_patterns.items():
            if any(pattern in error_lower for pattern in patterns):
                return error_type
        
        # Check exception type for additional classification
        if exception:
            if isinstance(exception, (ConnectionError, TimeoutError)):
                return ErrorType.NETWORK_ERROR
            elif isinstance(exception, (FileNotFoundError, PermissionError, OSError)):
                return ErrorType.FILE_SYSTEM_ERROR
            elif isinstance(exception, (ValueError, TypeError)):
                return ErrorType.FORMAT_ERROR
        
        return ErrorType.UNKNOWN_ERROR
    
    def determine_severity(self, error_type: ErrorType, error_message: str) -> ErrorSeverity:
        """Determine error severity based on type and message"""
        severity_mapping = {
            ErrorType.NETWORK_ERROR: ErrorSeverity.MEDIUM,
            ErrorType.DOWNLOAD_ERROR: ErrorSeverity.HIGH,
            ErrorType.CONVERSION_ERROR: ErrorSeverity.HIGH,
            ErrorType.METADATA_ERROR: ErrorSeverity.LOW,
            ErrorType.ANALYSIS_ERROR: ErrorSeverity.LOW,
            ErrorType.FILE_SYSTEM_ERROR: ErrorSeverity.HIGH,
            ErrorType.PERMISSION_ERROR: ErrorSeverity.CRITICAL,
            ErrorType.QUOTA_ERROR: ErrorSeverity.HIGH,
            ErrorType.FORMAT_ERROR: ErrorSeverity.MEDIUM,
            ErrorType.UNKNOWN_ERROR: ErrorSeverity.MEDIUM
        }
        
        base_severity = severity_mapping.get(error_type, ErrorSeverity.MEDIUM)
        
        # Adjust severity based on error message content
        error_lower = error_message.lower()
        if any(critical in error_lower for critical in ["fatal", "critical", "cannot", "unable"]):
            return ErrorSeverity.CRITICAL
        elif any(high in error_lower for high in ["failed", "error", "exception"]):
            return ErrorSeverity.HIGH
        elif any(medium in error_lower for medium in ["warning", "issue", "problem"]):
            return ErrorSeverity.MEDIUM
        
        return base_severity
    
    def determine_retry_strategy(self, error_type: ErrorType, severity: ErrorSeverity) -> RetryStrategy:
        """Determine retry strategy based on error type and severity"""
        if severity == ErrorSeverity.CRITICAL:
            return RetryStrategy.NO_RETRY
        
        retry_mapping = {
            ErrorType.NETWORK_ERROR: RetryStrategy.EXPONENTIAL,
            ErrorType.DOWNLOAD_ERROR: RetryStrategy.EXPONENTIAL,
            ErrorType.CONVERSION_ERROR: RetryStrategy.LINEAR,
            ErrorType.METADATA_ERROR: RetryStrategy.NO_RETRY,
            ErrorType.ANALYSIS_ERROR: RetryStrategy.NO_RETRY,
            ErrorType.FILE_SYSTEM_ERROR: RetryStrategy.FIXED,
            ErrorType.PERMISSION_ERROR: RetryStrategy.NO_RETRY,
            ErrorType.QUOTA_ERROR: RetryStrategy.EXPONENTIAL,
            ErrorType.FORMAT_ERROR: RetryStrategy.LINEAR,
            ErrorType.UNKNOWN_ERROR: RetryStrategy.EXPONENTIAL
        }
        
        return retry_mapping.get(error_type, RetryStrategy.EXPONENTIAL)
    
    def calculate_retry_delay(self, strategy: RetryStrategy, retry_count: int) -> float:
        """Calculate delay for next retry based on strategy"""
        delay = self.retry_delays.get(strategy, 0)
        
        if callable(delay):
            return delay(retry_count)
        elif isinstance(delay, (int, float)):
            return delay
        
        return 0
    
    def should_retry(self, error: DownloadError) -> bool:
        """Determine if error should be retried"""
        if error.retry_strategy == RetryStrategy.NO_RETRY:
            return False
        
        if error.retry_count >= error.max_retries:
            return False
        
        if error.severity == ErrorSeverity.CRITICAL:
            return False
        
        return True
    
    def log_error(self, error: DownloadError, context: Optional[Dict[str, Any]] = None):
        """Log error with detailed information"""
        error_entry = {
            "timestamp": error.timestamp,
            "error_type": error.error_type.value,
            "severity": error.severity.value,
            "message": str(error),
            "retry_strategy": error.retry_strategy.value,
            "retry_count": error.retry_count,
            "max_retries": error.max_retries,
            "context": {**error.context, **(context or {})},
            "traceback": error.traceback
        }
        
        self.error_log.append(error_entry)
        
        # Log to console with appropriate level
        log_message = f"❌ {error.error_type.value.upper()}: {error.message}"
        if error.retry_count > 0:
            log_message += f" (retry {error.retry_count}/{error.max_retries})"
        
        if error.severity == ErrorSeverity.CRITICAL:
            logger.critical(log_message)
        elif error.severity == ErrorSeverity.HIGH:
            logger.error(log_message)
        elif error.severity == ErrorSeverity.MEDIUM:
            logger.warning(log_message)
        else:
            logger.info(log_message)
    
    def create_error_response(self, error: DownloadError, include_traceback: bool = False) -> Dict[str, Any]:
        """Create standardized error response"""
        response = {
            "error": str(error),
            "error_type": error.error_type.value,
            "severity": error.severity.value,
            "retry_strategy": error.retry_strategy.value,
            "retry_count": error.retry_count,
            "max_retries": error.max_retries,
            "can_retry": self.should_retry(error),
            "timestamp": error.timestamp,
            "context": error.context
        }
        
        if include_traceback:
            response["traceback"] = error.traceback
        
        return response
    
    def get_error_statistics(self) -> Dict[str, Any]:
        """Get error statistics for monitoring"""
        if not self.error_log:
            return {"total_errors": 0}
        
        error_types = {}
        severities = {}
        retry_strategies = {}
        
        for error in self.error_log:
            error_types[error["error_type"]] = error_types.get(error["error_type"], 0) + 1
            severities[error["severity"]] = severities.get(error["severity"], 0) + 1
            retry_strategies[error["retry_strategy"]] = retry_strategies.get(error["retry_strategy"], 0) + 1
        
        return {
            "total_errors": len(self.error_log),
            "error_types": error_types,
            "severities": severities,
            "retry_strategies": retry_strategies,
            "recent_errors": self.error_log[-10:] if len(self.error_log) > 10 else self.error_log
        }

# Global error handler instance
error_handler = ErrorHandler()

def handle_download_error(func: Callable) -> Callable:
    """Decorator for handling download errors with retry logic"""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        max_retries = kwargs.pop('max_retries', 3)
        retry_count = 0
        
        while retry_count <= max_retries:
            try:
                return func(*args, **kwargs)
            except Exception as e:
                error_message = str(e)
                error_type = error_handler.classify_error(error_message, e)
                severity = error_handler.determine_severity(error_type, error_message)
                retry_strategy = error_handler.determine_retry_strategy(error_type, severity)
                
                download_error = DownloadError(
                    message=error_message,
                    error_type=error_type,
                    severity=severity,
                    retry_strategy=retry_strategy,
                    retry_count=retry_count,
                    max_retries=max_retries,
                    context={"function": func.__name__, "args": str(args)[:200]}
                )
                
                error_handler.log_error(download_error)
                
                if not error_handler.should_retry(download_error):
                    raise download_error
                
                retry_count += 1
                delay = error_handler.calculate_retry_delay(retry_strategy, retry_count)
                
                if delay > 0:
                    logger.info(f"🔄 Retrying {func.__name__} in {delay} seconds (attempt {retry_count}/{max_retries})")
                    time.sleep(delay)
        
        # If we get here, all retries failed
        raise DownloadError(
            message=f"All retry attempts failed for {func.__name__}",
            error_type=ErrorType.UNKNOWN_ERROR,
            severity=ErrorSeverity.CRITICAL,
            retry_strategy=RetryStrategy.NO_RETRY,
            retry_count=retry_count,
            max_retries=max_retries
        )
    
    return wrapper

def create_robust_error_response(error: Exception, download_id: Optional[str] = None, 
                                context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create a robust error response for API endpoints"""
    error_message = str(error)
    error_type = error_handler.classify_error(error_message, error)
    severity = error_handler.determine_severity(error_type, error_message)
    retry_strategy = error_handler.determine_retry_strategy(error_type, severity)
    
    download_error = DownloadError(
        message=error_message,
        error_type=error_type,
        severity=severity,
        retry_strategy=retry_strategy,
        context=context or {}
    )
    
    error_handler.log_error(download_error, {"download_id": download_id})
    
    response = error_handler.create_error_response(download_error)
    response["status"] = "error"
    
    # Add HTTP status code based on severity
    if severity == ErrorSeverity.CRITICAL:
        response["http_status"] = 500
    elif severity == ErrorSeverity.HIGH:
        response["http_status"] = 400
    elif severity == ErrorSeverity.MEDIUM:
        response["http_status"] = 422
    else:
        response["http_status"] = 200
    
    return response

def emit_error_progress(download_id: str, error: DownloadError, 
                       progress_callback: Optional[Callable] = None):
    """Emit error progress to WebSocket clients"""
    if progress_callback:
        progress_callback(download_id, {
            'stage': 'error',
            'progress': 0,
            'message': f'{error.error_type.value.replace("_", " ").title()}: {error.message}',
            'error_type': error.error_type.value,
            'severity': error.severity.value,
            'can_retry': error_handler.should_retry(error),
            'retry_count': error.retry_count,
            'max_retries': error.max_retries,
            'timestamp': time.time()
        })

# Export the main components
__all__ = [
    'ErrorType', 'ErrorSeverity', 'RetryStrategy', 'DownloadError', 
    'ErrorHandler', 'error_handler', 'handle_download_error',
    'create_robust_error_response', 'emit_error_progress'
]
