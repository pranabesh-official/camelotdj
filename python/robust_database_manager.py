import sqlite3
import os
import json
import threading
import time
import logging
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any, Callable
from contextlib import contextmanager
from dataclasses import dataclass
from enum import Enum
import queue
import functools

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DatabaseErrorType(Enum):
    CONNECTION_ERROR = "connection_error"
    QUERY_ERROR = "query_error"
    TRANSACTION_ERROR = "transaction_error"
    LOCK_ERROR = "lock_error"
    INTEGRITY_ERROR = "integrity_error"
    TIMEOUT_ERROR = "timeout_error"
    UNKNOWN_ERROR = "unknown_error"

class DatabaseErrorSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class DatabaseError:
    error_type: DatabaseErrorType
    severity: DatabaseErrorSeverity
    message: str
    original_error: Exception
    context: Dict[str, Any]
    timestamp: datetime
    retry_count: int = 0
    max_retries: int = 3

class RetryStrategy(Enum):
    IMMEDIATE = "immediate"
    FIXED_DELAY = "fixed_delay"
    EXPONENTIAL_BACKOFF = "exponential_backoff"
    LINEAR_BACKOFF = "linear_backoff"
    NO_RETRY = "no_retry"

class DatabaseConnectionPool:
    """Thread-safe SQLite connection pool with health monitoring"""
    
    def __init__(self, db_path: str, max_connections: int = 10, 
                 connection_timeout: int = 30, health_check_interval: int = 60):
        self.db_path = db_path
        self.max_connections = max_connections
        self.connection_timeout = connection_timeout
        self.health_check_interval = health_check_interval
        
        # Thread-safe connection pool
        self._pool = queue.Queue(maxsize=max_connections)
        self._pool_lock = threading.Lock()
        self._active_connections = 0
        self._connection_stats = {
            'created': 0,
            'reused': 0,
            'failed': 0,
            'timeouts': 0
        }
        
        # Health monitoring
        self._last_health_check = 0
        self._is_healthy = True
        self._health_check_lock = threading.Lock()
        
        # Initialize pool with one connection
        self._create_initial_connections()
        
        logger.info(f"Database connection pool initialized for {db_path}")
    
    def _create_initial_connections(self):
        """Create initial connections for the pool"""
        try:
            for _ in range(min(2, self.max_connections)):
                conn = self._create_connection()
                if conn:
                    self._pool.put(conn)
                    self._connection_stats['created'] += 1
        except Exception as e:
            logger.error(f"Failed to create initial connections: {e}")
    
    def _create_connection(self) -> Optional[sqlite3.Connection]:
        """Create a new database connection with proper configuration"""
        try:
            conn = sqlite3.connect(
                self.db_path,
                timeout=self.connection_timeout,
                check_same_thread=False
            )
            
            # Configure connection for better performance and reliability
            conn.execute("PRAGMA journal_mode=WAL")  # Write-Ahead Logging
            conn.execute("PRAGMA synchronous=NORMAL")  # Balance between safety and speed
            conn.execute("PRAGMA cache_size=10000")  # Increase cache size
            conn.execute("PRAGMA temp_store=MEMORY")  # Store temp tables in memory
            conn.execute("PRAGMA foreign_keys=ON")  # Enable foreign key constraints
            conn.execute("PRAGMA busy_timeout=30000")  # 30 second busy timeout
            
            # Set row factory for easier data access
            conn.row_factory = sqlite3.Row
            
            logger.debug(f"Created new database connection to {self.db_path}")
            return conn
            
        except Exception as e:
            logger.error(f"Failed to create database connection: {e}")
            self._connection_stats['failed'] += 1
            return None
    
    def _is_connection_healthy(self, conn: sqlite3.Connection) -> bool:
        """Check if a connection is still healthy"""
        try:
            conn.execute("SELECT 1").fetchone()
            return True
        except Exception:
            return False
    
    def _perform_health_check(self):
        """Perform periodic health check on the database"""
        current_time = time.time()
        
        with self._health_check_lock:
            if current_time - self._last_health_check < self.health_check_interval:
                return
            
            self._last_health_check = current_time
            
            try:
                # Test database accessibility
                test_conn = self._create_connection()
                if test_conn:
                    test_conn.close()
                    self._is_healthy = True
                    logger.debug("Database health check passed")
                else:
                    self._is_healthy = False
                    logger.warning("Database health check failed")
            except Exception as e:
                self._is_healthy = False
                logger.error(f"Database health check error: {e}")
    
    def get_connection(self) -> Optional[sqlite3.Connection]:
        """Get a connection from the pool"""
        self._perform_health_check()
        
        if not self._is_healthy:
            logger.error("Database is not healthy, cannot get connection")
            return None
        
        with self._pool_lock:
            try:
                # Try to get existing connection
                conn = self._pool.get_nowait()
                
                # Check if connection is still healthy
                if self._is_connection_healthy(conn):
                    self._connection_stats['reused'] += 1
                    return conn
                else:
                    # Connection is stale, create a new one
                    conn.close()
                    conn = self._create_connection()
                    if conn:
                        self._connection_stats['created'] += 1
                    return conn
                    
            except queue.Empty:
                # No connections available, create new one if under limit
                if self._active_connections < self.max_connections:
                    conn = self._create_connection()
                    if conn:
                        self._active_connections += 1
                        self._connection_stats['created'] += 1
                    return conn
                else:
                    logger.warning("Connection pool exhausted, waiting for available connection")
                    try:
                        conn = self._pool.get(timeout=5)  # Wait up to 5 seconds
                        if self._is_connection_healthy(conn):
                            self._connection_stats['reused'] += 1
                            return conn
                        else:
                            conn.close()
                            return self._create_connection()
                    except queue.Empty:
                        logger.error("Timeout waiting for database connection")
                        self._connection_stats['timeouts'] += 1
                        return None
    
    def return_connection(self, conn: sqlite3.Connection):
        """Return a connection to the pool"""
        if not conn:
            return
        
        try:
            # Check if connection is still healthy before returning
            if self._is_connection_healthy(conn):
                self._pool.put_nowait(conn)
            else:
                # Connection is stale, close it and don't return to pool
                conn.close()
                with self._pool_lock:
                    self._active_connections = max(0, self._active_connections - 1)
        except queue.Full:
            # Pool is full, close the connection
            conn.close()
            with self._pool_lock:
                self._active_connections = max(0, self._active_connections - 1)
        except Exception as e:
            logger.error(f"Error returning connection to pool: {e}")
            conn.close()
    
    def close_all_connections(self):
        """Close all connections in the pool"""
        with self._pool_lock:
            while not self._pool.empty():
                try:
                    conn = self._pool.get_nowait()
                    conn.close()
                except queue.Empty:
                    break
            self._active_connections = 0
    
    def get_stats(self) -> Dict[str, Any]:
        """Get connection pool statistics"""
        with self._pool_lock:
            return {
                'pool_size': self._pool.qsize(),
                'active_connections': self._active_connections,
                'max_connections': self.max_connections,
                'is_healthy': self._is_healthy,
                'stats': self._connection_stats.copy()
            }

class RobustDatabaseManager:
    """Enhanced database manager with connection pooling, retry logic, and comprehensive error handling"""
    
    def __init__(self, db_path: Optional[str] = None, max_connections: int = 10):
        if db_path is None:
            home_dir = os.path.expanduser("~")
            app_dir = os.path.join(home_dir, ".mixed_in_key")
            os.makedirs(app_dir, exist_ok=True)
            db_path = os.path.join(app_dir, "music_library.db")
        
        self.db_path = db_path
        self.pool = DatabaseConnectionPool(db_path, max_connections)
        self.retry_strategies = {
            DatabaseErrorType.CONNECTION_ERROR: RetryStrategy.EXPONENTIAL_BACKOFF,
            DatabaseErrorType.QUERY_ERROR: RetryStrategy.LINEAR_BACKOFF,
            DatabaseErrorType.TRANSACTION_ERROR: RetryStrategy.FIXED_DELAY,
            DatabaseErrorType.LOCK_ERROR: RetryStrategy.EXPONENTIAL_BACKOFF,
            DatabaseErrorType.INTEGRITY_ERROR: RetryStrategy.NO_RETRY,
            DatabaseErrorType.TIMEOUT_ERROR: RetryStrategy.EXPONENTIAL_BACKOFF,
            DatabaseErrorType.UNKNOWN_ERROR: RetryStrategy.LINEAR_BACKOFF
        }
        
        # Initialize database schema
        self._init_database()
        
        logger.info(f"Robust database manager initialized for {db_path}")
    
    def _classify_error(self, error: Exception) -> DatabaseErrorType:
        """Classify database errors for appropriate handling"""
        error_str = str(error).lower()
        
        if 'database is locked' in error_str or 'database lock' in error_str:
            return DatabaseErrorType.LOCK_ERROR
        elif 'connection' in error_str or 'unable to open' in error_str:
            return DatabaseErrorType.CONNECTION_ERROR
        elif 'timeout' in error_str or 'busy' in error_str:
            return DatabaseErrorType.TIMEOUT_ERROR
        elif 'integrity' in error_str or 'constraint' in error_str:
            return DatabaseErrorType.INTEGRITY_ERROR
        elif 'syntax' in error_str or 'sql' in error_str:
            return DatabaseErrorType.QUERY_ERROR
        elif 'transaction' in error_str:
            return DatabaseErrorType.TRANSACTION_ERROR
        else:
            return DatabaseErrorType.UNKNOWN_ERROR
    
    def _determine_severity(self, error_type: DatabaseErrorType, error: Exception) -> DatabaseErrorSeverity:
        """Determine error severity for appropriate handling"""
        if error_type in [DatabaseErrorType.CONNECTION_ERROR, DatabaseErrorType.LOCK_ERROR]:
            return DatabaseErrorSeverity.HIGH
        elif error_type == DatabaseErrorType.INTEGRITY_ERROR:
            return DatabaseErrorSeverity.CRITICAL
        elif error_type == DatabaseErrorType.TIMEOUT_ERROR:
            return DatabaseErrorSeverity.MEDIUM
        else:
            return DatabaseErrorSeverity.LOW
    
    def _calculate_retry_delay(self, strategy: RetryStrategy, retry_count: int) -> float:
        """Calculate delay for retry based on strategy"""
        if strategy == RetryStrategy.NO_RETRY:
            return 0
        elif strategy == RetryStrategy.IMMEDIATE:
            return 0
        elif strategy == RetryStrategy.FIXED_DELAY:
            return 1.0
        elif strategy == RetryStrategy.LINEAR_BACKOFF:
            return min(retry_count * 1.0, 10.0)
        elif strategy == RetryStrategy.EXPONENTIAL_BACKOFF:
            return min(2 ** retry_count, 30.0)
        else:
            return 1.0
    
    def _should_retry(self, db_error: DatabaseError) -> bool:
        """Determine if an operation should be retried"""
        if db_error.retry_count >= db_error.max_retries:
            return False
        if db_error.severity == DatabaseErrorSeverity.CRITICAL:
            return False
        if db_error.error_type == DatabaseErrorType.INTEGRITY_ERROR:
            return False
        return True
    
    def _handle_database_error(self, error: Exception, context: Dict[str, Any], 
                             retry_count: int = 0) -> DatabaseError:
        """Create and handle database error with appropriate retry logic"""
        error_type = self._classify_error(error)
        severity = self._determine_severity(error_type, error)
        
        db_error = DatabaseError(
            error_type=error_type,
            severity=severity,
            message=str(error),
            original_error=error,
            context=context,
            timestamp=datetime.now(),
            retry_count=retry_count
        )
        
        logger.error(f"Database error [{error_type.value}]: {db_error.message}")
        return db_error
    
    @contextmanager
    def get_connection(self):
        """Context manager for database connections with automatic cleanup"""
        conn = None
        try:
            conn = self.pool.get_connection()
            if not conn:
                raise Exception("Failed to get database connection from pool")
            yield conn
        except Exception as e:
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                self.pool.return_connection(conn)
    
    def execute_with_retry(self, operation: Callable, context: Dict[str, Any] = None, 
                          max_retries: int = 3) -> Any:
        """Execute database operation with retry logic"""
        if context is None:
            context = {}
        
        retry_count = 0
        last_error = None
        
        while retry_count <= max_retries:
            try:
                return operation()
            except Exception as e:
                last_error = e
                db_error = self._handle_database_error(e, context, retry_count)
                
                if not self._should_retry(db_error):
                    logger.error(f"Operation failed after {retry_count} retries: {db_error.message}")
                    raise db_error.original_error
                
                retry_count += 1
                strategy = self.retry_strategies.get(db_error.error_type, RetryStrategy.LINEAR_BACKOFF)
                delay = self._calculate_retry_delay(strategy, retry_count)
                
                if delay > 0:
                    logger.info(f"Retrying operation in {delay} seconds (attempt {retry_count}/{max_retries})")
                    time.sleep(delay)
        
        # If we get here, all retries failed
        raise last_error
    
    def _init_database(self):
        """Initialize database with proper error handling"""
        def init_operation():
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Create music_files table with all necessary columns
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS music_files (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        filename TEXT NOT NULL,
                        file_path TEXT NOT NULL UNIQUE,
                        file_size INTEGER,
                        file_hash TEXT,
                        track_id TEXT UNIQUE,
                        rating INTEGER DEFAULT 0,
                        
                        -- Music analysis data
                        key_signature TEXT,
                        scale TEXT,
                        key_name TEXT,
                        camelot_key TEXT,
                        bpm REAL,
                        energy_level REAL,
                        duration REAL,
                        
                        -- Analysis metadata
                        analysis_date TEXT,
                        analysis_version TEXT,
                        cue_points TEXT,
                        
                        -- File status
                        status TEXT DEFAULT 'found',
                        last_checked TEXT,
                        error_message TEXT,
                        
                        -- ID3 metadata
                        title TEXT,
                        artist TEXT,
                        album TEXT,
                        albumartist TEXT,
                        date TEXT,
                        year TEXT,
                        genre TEXT,
                        composer TEXT,
                        tracknumber TEXT,
                        discnumber TEXT,
                        comment TEXT,
                        initialkey TEXT,
                        bpm_from_tags TEXT,
                        website TEXT,
                        isrc TEXT,
                        language TEXT,
                        organization TEXT,
                        copyright TEXT,
                        encodedby TEXT,
                        id3_metadata TEXT,
                        
                        -- Analysis tracking
                        analysis_status TEXT DEFAULT 'pending',
                        id3_tags_written INTEGER DEFAULT 0,
                        prevent_reanalysis INTEGER DEFAULT 0,
                        
                        -- Cover art
                        cover_art TEXT,
                        cover_art_extracted INTEGER DEFAULT 0,
                        
                        -- Timestamps
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                ''')
                
                # Create other tables...
                self._create_playlist_tables(cursor)
                self._create_scan_location_tables(cursor)
                self._create_settings_tables(cursor)
                
                conn.commit()
                logger.info("Database schema initialized successfully")
        
        try:
            self.execute_with_retry(init_operation, {"operation": "init_database"})
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise
    
    def _create_playlist_tables(self, cursor):
        """Create playlist-related tables"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS playlist_songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id INTEGER,
                music_file_id INTEGER,
                position INTEGER,
                added_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE CASCADE,
                FOREIGN KEY (music_file_id) REFERENCES music_files (id) ON DELETE CASCADE
            )
        ''')
    
    def _create_scan_location_tables(self, cursor):
        """Create scan location tables"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS scan_locations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                last_scanned TEXT,
                file_count INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    
    def _create_settings_tables(self, cursor):
        """Create settings tables"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get comprehensive health status of the database"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Get database info
                cursor.execute("PRAGMA database_list")
                databases = cursor.fetchall()
                
                cursor.execute("PRAGMA table_info(music_files)")
                table_info = cursor.fetchall()
                
                cursor.execute("SELECT COUNT(*) FROM music_files")
                file_count = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM playlists")
                playlist_count = cursor.fetchone()[0]
                
                pool_stats = self.pool.get_stats()
                
                return {
                    "status": "healthy" if pool_stats['is_healthy'] else "unhealthy",
                    "database_path": self.db_path,
                    "file_count": file_count,
                    "playlist_count": playlist_count,
                    "connection_pool": pool_stats,
                    "tables": [row[1] for row in table_info],  # table names
                    "last_check": datetime.now().isoformat()
                }
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "last_check": datetime.now().isoformat()
            }
    
    def close(self):
        """Close all database connections"""
        self.pool.close_all_connections()
        logger.info("Database manager closed")

# Decorator for automatic retry on database operations
def with_database_retry(max_retries: int = 3):
    """Decorator to add automatic retry logic to database operations"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(self, *args, **kwargs):
            if hasattr(self, 'execute_with_retry'):
                return self.execute_with_retry(
                    lambda: func(self, *args, **kwargs),
                    {"function": func.__name__, "args": str(args)[:100]},
                    max_retries
                )
            else:
                return func(self, *args, **kwargs)
        return wrapper
    return decorator
