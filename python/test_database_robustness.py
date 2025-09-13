#!/usr/bin/env python3
"""
Test script for database robustness improvements
"""

import os
import sys
import time
import sqlite3
import tempfile
import threading
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from robust_database_manager import RobustDatabaseManager
from database_backup import DatabaseBackupManager
from database_migrator import DatabaseMigrator

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_connection_pooling():
    """Test connection pooling functionality"""
    logger.info("Testing connection pooling...")
    
    # Create temporary database
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name
    
    try:
        # Initialize robust database manager
        db_manager = RobustDatabaseManager(db_path, max_connections=5)
        
        # Test concurrent connections
        def test_connection(thread_id):
            try:
                with db_manager.get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT 1")
                    result = cursor.fetchone()
                    logger.info(f"Thread {thread_id}: Connection successful")
                    return True
            except Exception as e:
                logger.error(f"Thread {thread_id}: Connection failed - {e}")
                return False
        
        # Test with multiple threads
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(test_connection, i) for i in range(10)]
            results = [future.result() for future in as_completed(futures)]
        
        success_rate = sum(results) / len(results)
        logger.info(f"Connection pooling test: {success_rate:.2%} success rate")
        
        # Test pool statistics
        stats = db_manager.pool.get_stats()
        logger.info(f"Pool stats: {stats}")
        
        return success_rate > 0.8
        
    finally:
        # Cleanup
        db_manager.close()
        if os.path.exists(db_path):
            os.unlink(db_path)

def test_retry_mechanisms():
    """Test retry mechanisms"""
    logger.info("Testing retry mechanisms...")
    
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name
    
    try:
        db_manager = RobustDatabaseManager(db_path)
        
        # Test retry with simulated failure
        def failing_operation():
            # Simulate a failure on first attempt
            if not hasattr(failing_operation, 'attempts'):
                failing_operation.attempts = 0
            failing_operation.attempts += 1
            
            if failing_operation.attempts < 3:
                raise sqlite3.OperationalError("Simulated database lock")
            return "Success after retries"
        
        # This should succeed after retries
        result = db_manager.execute_with_retry(failing_operation, {"test": "retry"})
        logger.info(f"Retry test result: {result}")
        
        return result == "Success after retries"
        
    finally:
        db_manager.close()
        if os.path.exists(db_path):
            os.unlink(db_path)

def test_backup_restore():
    """Test backup and restore functionality"""
    logger.info("Testing backup and restore...")
    
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name
    
    try:
        # Create test database with some data
        db_manager = RobustDatabaseManager(db_path)
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO music_files (filename, file_path) VALUES (?, ?)", 
                         ("test_song.mp3", "/path/to/test_song.mp3"))
            conn.commit()
        
        # Test backup
        backup_manager = DatabaseBackupManager(db_path)
        backup_info = backup_manager.create_backup(compress=True, comment="Test backup")
        
        if not backup_info:
            logger.error("Backup creation failed")
            return False
        
        logger.info(f"Backup created: {backup_info.path}")
        
        # Modify database
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO music_files (filename, file_path) VALUES (?, ?)", 
                         ("modified_song.mp3", "/path/to/modified_song.mp3"))
            conn.commit()
        
        # Test restore
        success = backup_manager.restore_backup(backup_info, verify=True)
        
        if success:
            # Verify data was restored
            with db_manager.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM music_files")
                count = cursor.fetchone()[0]
                logger.info(f"Restore verification: {count} records")
                return count == 1  # Should be 1 (original), not 2 (modified)
        
        return False
        
    finally:
        db_manager.close()
        if os.path.exists(db_path):
            os.unlink(db_path)
        
        # Cleanup backup
        if 'backup_info' in locals() and backup_info and os.path.exists(backup_info.path):
            os.unlink(backup_info.path)

def test_migration_system():
    """Test database migration system"""
    logger.info("Testing migration system...")
    
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name
    
    try:
        # Create initial database without new columns
        with sqlite3.connect(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE music_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    file_path TEXT NOT NULL UNIQUE
                )
            ''')
            conn.commit()
        
        # Test migration
        migrator = DatabaseMigrator(db_path)
        
        # Validate schema before migration
        validation_before = migrator.validate_schema()
        logger.info(f"Schema before migration: {validation_before}")
        
        # Run migrations
        success = migrator.migrate()
        
        if success:
            # Validate schema after migration
            validation_after = migrator.validate_schema()
            logger.info(f"Schema after migration: {validation_after}")
            
            # Check migration history
            history = migrator.get_migration_history()
            logger.info(f"Migration history: {len(history)} migrations")
            
            return validation_after['is_valid'] and len(history) > 0
        
        return False
        
    finally:
        if os.path.exists(db_path):
            os.unlink(db_path)

def test_health_monitoring():
    """Test health monitoring functionality"""
    logger.info("Testing health monitoring...")
    
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name
    
    try:
        db_manager = RobustDatabaseManager(db_path)
        
        # Test health status
        health = db_manager.get_health_status()
        logger.info(f"Health status: {health}")
        
        # Verify health status structure
        required_fields = ['status', 'database_path', 'file_count', 'playlist_count', 'connection_pool']
        has_required_fields = all(field in health for field in required_fields)
        
        # Test pool statistics
        pool_stats = db_manager.pool.get_stats()
        logger.info(f"Pool statistics: {pool_stats}")
        
        return has_required_fields and health['status'] in ['healthy', 'unhealthy']
        
    finally:
        db_manager.close()
        if os.path.exists(db_path):
            os.unlink(db_path)

def test_error_classification():
    """Test error classification and handling"""
    logger.info("Testing error classification...")
    
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name
    
    try:
        db_manager = RobustDatabaseManager(db_path)
        
        # Test different error types
        test_errors = [
            sqlite3.OperationalError("database is locked"),
            sqlite3.IntegrityError("UNIQUE constraint failed"),
            sqlite3.DatabaseError("database disk image is malformed"),
            Exception("Unknown error")
        ]
        
        for error in test_errors:
            db_error = db_manager._handle_database_error(error, {"test": "classification"})
            logger.info(f"Error: {error} -> Type: {db_error.error_type}, Severity: {db_error.severity}")
        
        return True
        
    finally:
        db_manager.close()
        if os.path.exists(db_path):
            os.unlink(db_path)

def run_all_tests():
    """Run all robustness tests"""
    logger.info("Starting database robustness tests...")
    
    tests = [
        ("Connection Pooling", test_connection_pooling),
        ("Retry Mechanisms", test_retry_mechanisms),
        ("Backup & Restore", test_backup_restore),
        ("Migration System", test_migration_system),
        ("Health Monitoring", test_health_monitoring),
        ("Error Classification", test_error_classification)
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        logger.info(f"\n{'='*50}")
        logger.info(f"Running test: {test_name}")
        logger.info(f"{'='*50}")
        
        try:
            start_time = time.time()
            success = test_func()
            duration = time.time() - start_time
            
            results[test_name] = {
                'success': success,
                'duration': duration,
                'error': None
            }
            
            status = "PASSED" if success else "FAILED"
            logger.info(f"Test {test_name}: {status} ({duration:.2f}s)")
            
        except Exception as e:
            duration = time.time() - start_time
            results[test_name] = {
                'success': False,
                'duration': duration,
                'error': str(e)
            }
            logger.error(f"Test {test_name}: FAILED with error - {e}")
    
    # Print summary
    logger.info(f"\n{'='*50}")
    logger.info("TEST SUMMARY")
    logger.info(f"{'='*50}")
    
    passed = sum(1 for r in results.values() if r['success'])
    total = len(results)
    
    for test_name, result in results.items():
        status = "PASSED" if result['success'] else "FAILED"
        logger.info(f"{test_name}: {status} ({result['duration']:.2f}s)")
        if result['error']:
            logger.info(f"  Error: {result['error']}")
    
    logger.info(f"\nOverall: {passed}/{total} tests passed ({passed/total:.1%})")
    
    return passed == total

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
