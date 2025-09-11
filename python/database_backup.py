import sqlite3
import os
import shutil
import gzip
import json
import time
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from pathlib import Path
import threading
import schedule

logger = logging.getLogger(__name__)

@dataclass
class BackupInfo:
    path: str
    timestamp: datetime
    size: int
    compressed: bool
    version: str
    checksum: str
    metadata: Dict[str, Any]

class DatabaseBackupManager:
    """Comprehensive database backup and restore system with compression and versioning"""
    
    def __init__(self, db_path: str, backup_dir: str = None, max_backups: int = 10):
        self.db_path = db_path
        self.backup_dir = backup_dir or os.path.join(os.path.dirname(db_path), 'backups')
        self.max_backups = max_backups
        self.backup_lock = threading.Lock()
        
        # Ensure backup directory exists
        os.makedirs(self.backup_dir, exist_ok=True)
        
        # Load backup metadata
        self.backup_metadata_file = os.path.join(self.backup_dir, 'backup_metadata.json')
        self.backups = self._load_backup_metadata()
        
        logger.info(f"Database backup manager initialized for {db_path}")
        logger.info(f"Backup directory: {self.backup_dir}")
    
    def _load_backup_metadata(self) -> List[BackupInfo]:
        """Load backup metadata from file"""
        if not os.path.exists(self.backup_metadata_file):
            return []
        
        try:
            with open(self.backup_metadata_file, 'r') as f:
                data = json.load(f)
            
            backups = []
            for backup_data in data.get('backups', []):
                backups.append(BackupInfo(
                    path=backup_data['path'],
                    timestamp=datetime.fromisoformat(backup_data['timestamp']),
                    size=backup_data['size'],
                    compressed=backup_data.get('compressed', False),
                    version=backup_data.get('version', '1.0'),
                    checksum=backup_data.get('checksum', ''),
                    metadata=backup_data.get('metadata', {})
                ))
            
            return sorted(backups, key=lambda b: b.timestamp, reverse=True)
        except Exception as e:
            logger.error(f"Failed to load backup metadata: {e}")
            return []
    
    def _save_backup_metadata(self):
        """Save backup metadata to file"""
        try:
            data = {
                'backups': [
                    {
                        'path': backup.path,
                        'timestamp': backup.timestamp.isoformat(),
                        'size': backup.size,
                        'compressed': backup.compressed,
                        'version': backup.version,
                        'checksum': backup.checksum,
                        'metadata': backup.metadata
                    }
                    for backup in self.backups
                ],
                'last_updated': datetime.now().isoformat()
            }
            
            with open(self.backup_metadata_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save backup metadata: {e}")
    
    def _calculate_checksum(self, file_path: str) -> str:
        """Calculate MD5 checksum of a file"""
        import hashlib
        
        hash_md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    
    def _get_database_info(self) -> Dict[str, Any]:
        """Get database information for metadata"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Get table counts
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tables = [row[0] for row in cursor.fetchall()]
                
                table_counts = {}
                for table in tables:
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    table_counts[table] = cursor.fetchone()[0]
                
                # Get database size
                cursor.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
                db_size = cursor.fetchone()[0]
                
                return {
                    'tables': tables,
                    'table_counts': table_counts,
                    'database_size': db_size,
                    'file_size': os.path.getsize(self.db_path)
                }
        except Exception as e:
            logger.error(f"Failed to get database info: {e}")
            return {}
    
    def create_backup(self, compress: bool = True, comment: str = "") -> Optional[BackupInfo]:
        """Create a new database backup"""
        with self.backup_lock:
            try:
                timestamp = datetime.now()
                timestamp_str = timestamp.strftime("%Y%m%d_%H%M%S")
                
                # Create backup filename
                backup_filename = f"music_library_backup_{timestamp_str}.db"
                if compress:
                    backup_filename += ".gz"
                
                backup_path = os.path.join(self.backup_dir, backup_filename)
                
                logger.info(f"Creating backup: {backup_path}")
                
                # Create backup
                if compress:
                    with open(self.db_path, 'rb') as f_in:
                        with gzip.open(backup_path, 'wb') as f_out:
                            shutil.copyfileobj(f_in, f_out)
                else:
                    shutil.copy2(self.db_path, backup_path)
                
                # Calculate checksum
                checksum = self._calculate_checksum(backup_path)
                
                # Get database info
                db_info = self._get_database_info()
                
                # Create backup info
                backup_info = BackupInfo(
                    path=backup_path,
                    timestamp=timestamp,
                    size=os.path.getsize(backup_path),
                    compressed=compress,
                    version="1.0",
                    checksum=checksum,
                    metadata={
                        'comment': comment,
                        'database_info': db_info,
                        'backup_type': 'manual' if not comment else 'scheduled'
                    }
                )
                
                # Add to backups list
                self.backups.insert(0, backup_info)  # Most recent first
                
                # Cleanup old backups
                self._cleanup_old_backups()
                
                # Save metadata
                self._save_backup_metadata()
                
                logger.info(f"Backup created successfully: {backup_path} ({backup_info.size} bytes)")
                return backup_info
                
            except Exception as e:
                logger.error(f"Failed to create backup: {e}")
                return None
    
    def restore_backup(self, backup_info: BackupInfo, verify: bool = True) -> bool:
        """Restore database from backup"""
        with self.backup_lock:
            try:
                if not os.path.exists(backup_info.path):
                    logger.error(f"Backup file not found: {backup_info.path}")
                    return False
                
                # Verify backup if requested
                if verify:
                    current_checksum = self._calculate_checksum(backup_info.path)
                    if current_checksum != backup_info.checksum:
                        logger.error(f"Backup checksum mismatch: expected {backup_info.checksum}, got {current_checksum}")
                        return False
                
                # Create backup of current database before restore
                current_backup_path = f"{self.db_path}.pre_restore_{int(time.time())}"
                shutil.copy2(self.db_path, current_backup_path)
                logger.info(f"Current database backed up to: {current_backup_path}")
                
                # Restore from backup
                if backup_info.compressed:
                    with gzip.open(backup_info.path, 'rb') as f_in:
                        with open(self.db_path, 'wb') as f_out:
                            shutil.copyfileobj(f_in, f_out)
                else:
                    shutil.copy2(backup_info.path, self.db_path)
                
                # Verify restored database
                try:
                    with sqlite3.connect(self.db_path) as conn:
                        cursor = conn.cursor()
                        cursor.execute("SELECT COUNT(*) FROM music_files")
                        file_count = cursor.fetchone()[0]
                        logger.info(f"Restored database verified: {file_count} music files")
                except Exception as e:
                    logger.error(f"Restored database verification failed: {e}")
                    # Restore from pre-restore backup
                    shutil.copy2(current_backup_path, self.db_path)
                    logger.info("Restored original database due to verification failure")
                    return False
                
                logger.info(f"Database restored successfully from: {backup_info.path}")
                return True
                
            except Exception as e:
                logger.error(f"Failed to restore backup: {e}")
                return False
    
    def _cleanup_old_backups(self):
        """Remove old backups to stay within max_backups limit"""
        while len(self.backups) > self.max_backups:
            old_backup = self.backups.pop()  # Remove oldest
            
            try:
                if os.path.exists(old_backup.path):
                    os.remove(old_backup.path)
                    logger.info(f"Removed old backup: {old_backup.path}")
            except Exception as e:
                logger.error(f"Failed to remove old backup {old_backup.path}: {e}")
    
    def list_backups(self) -> List[BackupInfo]:
        """List all available backups"""
        return self.backups.copy()
    
    def get_backup_info(self, backup_path: str) -> Optional[BackupInfo]:
        """Get information about a specific backup"""
        for backup in self.backups:
            if backup.path == backup_path:
                return backup
        return None
    
    def delete_backup(self, backup_info: BackupInfo) -> bool:
        """Delete a backup"""
        try:
            if os.path.exists(backup_info.path):
                os.remove(backup_info.path)
            
            # Remove from backups list
            self.backups = [b for b in self.backups if b.path != backup_info.path]
            self._save_backup_metadata()
            
            logger.info(f"Backup deleted: {backup_info.path}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete backup {backup_info.path}: {e}")
            return False
    
    def schedule_automatic_backups(self, interval_hours: int = 24):
        """Schedule automatic backups"""
        def backup_job():
            logger.info("Running scheduled backup...")
            backup_info = self.create_backup(compress=True, comment="Scheduled backup")
            if backup_info:
                logger.info(f"Scheduled backup completed: {backup_info.path}")
            else:
                logger.error("Scheduled backup failed")
        
        # Schedule the backup
        schedule.every(interval_hours).hours.do(backup_job)
        
        # Start the scheduler in a separate thread
        def run_scheduler():
            while True:
                schedule.run_pending()
                time.sleep(60)  # Check every minute
        
        scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
        scheduler_thread.start()
        
        logger.info(f"Automatic backups scheduled every {interval_hours} hours")
    
    def get_backup_stats(self) -> Dict[str, Any]:
        """Get backup statistics"""
        if not self.backups:
            return {
                'total_backups': 0,
                'total_size': 0,
                'oldest_backup': None,
                'newest_backup': None,
                'average_size': 0
            }
        
        total_size = sum(backup.size for backup in self.backups)
        oldest = min(self.backups, key=lambda b: b.timestamp)
        newest = max(self.backups, key=lambda b: b.timestamp)
        
        return {
            'total_backups': len(self.backups),
            'total_size': total_size,
            'oldest_backup': oldest.timestamp.isoformat(),
            'newest_backup': newest.timestamp.isoformat(),
            'average_size': total_size // len(self.backups),
            'compressed_backups': len([b for b in self.backups if b.compressed]),
            'uncompressed_backups': len([b for b in self.backups if not b.compressed])
        }
    
    def verify_backup_integrity(self, backup_info: BackupInfo) -> bool:
        """Verify the integrity of a backup"""
        try:
            if not os.path.exists(backup_info.path):
                return False
            
            # Check file size
            actual_size = os.path.getsize(backup_info.path)
            if actual_size != backup_info.size:
                logger.warning(f"Backup size mismatch: expected {backup_info.size}, got {actual_size}")
                return False
            
            # Check checksum
            actual_checksum = self._calculate_checksum(backup_info.path)
            if actual_checksum != backup_info.checksum:
                logger.warning(f"Backup checksum mismatch: expected {backup_info.checksum}, got {actual_checksum}")
                return False
            
            # Try to open the backup as a database
            if backup_info.compressed:
                with gzip.open(backup_info.path, 'rb') as f:
                    temp_path = f"{backup_info.path}.temp"
                    with open(temp_path, 'wb') as temp_f:
                        shutil.copyfileobj(f, temp_f)
                    
                    try:
                        with sqlite3.connect(temp_path) as conn:
                            cursor = conn.cursor()
                            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                            tables = cursor.fetchall()
                            if not tables:
                                return False
                    finally:
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
            else:
                with sqlite3.connect(backup_info.path) as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                    tables = cursor.fetchall()
                    if not tables:
                        return False
            
            return True
        except Exception as e:
            logger.error(f"Backup integrity check failed: {e}")
            return False

def main():
    """Command line interface for backup management"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Database Backup Manager')
    parser.add_argument('--db-path', required=True, help='Path to database file')
    parser.add_argument('--backup-dir', help='Backup directory (default: ./backups)')
    parser.add_argument('--action', choices=['create', 'list', 'restore', 'delete', 'verify'], required=True)
    parser.add_argument('--backup-path', help='Path to backup file (for restore/delete/verify)')
    parser.add_argument('--compress', action='store_true', help='Compress backup')
    parser.add_argument('--comment', help='Backup comment')
    
    args = parser.parse_args()
    
    backup_manager = DatabaseBackupManager(args.db_path, args.backup_dir)
    
    if args.action == 'create':
        backup_info = backup_manager.create_backup(compress=args.compress, comment=args.comment or "")
        if backup_info:
            print(f"Backup created: {backup_info.path}")
        else:
            print("Backup failed")
            exit(1)
    
    elif args.action == 'list':
        backups = backup_manager.list_backups()
        for backup in backups:
            print(f"{backup.timestamp.isoformat()} - {backup.path} ({backup.size} bytes)")
    
    elif args.action == 'restore':
        if not args.backup_path:
            print("--backup-path required for restore")
            exit(1)
        
        backup_info = backup_manager.get_backup_info(args.backup_path)
        if not backup_info:
            print(f"Backup not found: {args.backup_path}")
            exit(1)
        
        if backup_manager.restore_backup(backup_info):
            print("Database restored successfully")
        else:
            print("Restore failed")
            exit(1)
    
    elif args.action == 'delete':
        if not args.backup_path:
            print("--backup-path required for delete")
            exit(1)
        
        backup_info = backup_manager.get_backup_info(args.backup_path)
        if not backup_info:
            print(f"Backup not found: {args.backup_path}")
            exit(1)
        
        if backup_manager.delete_backup(backup_info):
            print("Backup deleted successfully")
        else:
            print("Delete failed")
            exit(1)
    
    elif args.action == 'verify':
        if not args.backup_path:
            print("--backup-path required for verify")
            exit(1)
        
        backup_info = backup_manager.get_backup_info(args.backup_path)
        if not backup_info:
            print(f"Backup not found: {args.backup_path}")
            exit(1)
        
        if backup_manager.verify_backup_integrity(backup_info):
            print("Backup integrity verified")
        else:
            print("Backup integrity check failed")
            exit(1)

if __name__ == "__main__":
    main()
