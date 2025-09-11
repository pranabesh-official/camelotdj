import sqlite3
import os
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class MigrationStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"

@dataclass
class Migration:
    version: str
    name: str
    description: str
    up_sql: str
    down_sql: str
    dependencies: List[str] = None
    created_at: datetime = None

    def __post_init__(self):
        if self.dependencies is None:
            self.dependencies = []
        if self.created_at is None:
            self.created_at = datetime.now()

class DatabaseMigrator:
    """Handles database schema migrations with rollback capabilities"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.migrations_table = "schema_migrations"
        self.migrations: List[Migration] = []
        self._init_migrations_table()
        self._load_migrations()
    
    def _init_migrations_table(self):
        """Initialize the migrations tracking table"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(f'''
                CREATE TABLE IF NOT EXISTS {self.migrations_table} (
                    version TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    executed_at TEXT,
                    execution_time_ms INTEGER,
                    error_message TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.commit()
    
    def _load_migrations(self):
        """Load all available migrations"""
        # This would typically load from migration files
        # For now, we'll define them inline
        self.migrations = [
            Migration(
                version="001",
                name="add_cover_art_columns",
                description="Add cover art related columns to music_files table",
                up_sql="""
                    ALTER TABLE music_files ADD COLUMN cover_art TEXT;
                    ALTER TABLE music_files ADD COLUMN cover_art_extracted INTEGER DEFAULT 0;
                """,
                down_sql="""
                    -- Note: SQLite doesn't support DROP COLUMN directly
                    -- This would require recreating the table
                """
            ),
            Migration(
                version="002", 
                name="add_rating_column",
                description="Add rating column to music_files table",
                up_sql="""
                    ALTER TABLE music_files ADD COLUMN rating INTEGER DEFAULT 0;
                """,
                down_sql="""
                    -- Note: SQLite doesn't support DROP COLUMN directly
                """
            ),
            Migration(
                version="003",
                name="add_track_id_column", 
                description="Add track_id column for unique track identification",
                up_sql="""
                    ALTER TABLE music_files ADD COLUMN track_id TEXT UNIQUE;
                """,
                down_sql="""
                    -- Note: SQLite doesn't support DROP COLUMN directly
                """
            ),
            Migration(
                version="004",
                name="add_id3_metadata_columns",
                description="Add comprehensive ID3 metadata columns",
                up_sql="""
                    ALTER TABLE music_files ADD COLUMN title TEXT;
                    ALTER TABLE music_files ADD COLUMN artist TEXT;
                    ALTER TABLE music_files ADD COLUMN album TEXT;
                    ALTER TABLE music_files ADD COLUMN albumartist TEXT;
                    ALTER TABLE music_files ADD COLUMN date TEXT;
                    ALTER TABLE music_files ADD COLUMN year TEXT;
                    ALTER TABLE music_files ADD COLUMN genre TEXT;
                    ALTER TABLE music_files ADD COLUMN composer TEXT;
                    ALTER TABLE music_files ADD COLUMN tracknumber TEXT;
                    ALTER TABLE music_files ADD COLUMN discnumber TEXT;
                    ALTER TABLE music_files ADD COLUMN comment TEXT;
                    ALTER TABLE music_files ADD COLUMN initialkey TEXT;
                    ALTER TABLE music_files ADD COLUMN bpm_from_tags TEXT;
                    ALTER TABLE music_files ADD COLUMN website TEXT;
                    ALTER TABLE music_files ADD COLUMN isrc TEXT;
                    ALTER TABLE music_files ADD COLUMN language TEXT;
                    ALTER TABLE music_files ADD COLUMN organization TEXT;
                    ALTER TABLE music_files ADD COLUMN copyright TEXT;
                    ALTER TABLE music_files ADD COLUMN encodedby TEXT;
                    ALTER TABLE music_files ADD COLUMN id3_metadata TEXT;
                """,
                down_sql="""
                    -- Note: SQLite doesn't support DROP COLUMN directly
                """
            ),
            Migration(
                version="005",
                name="add_analysis_tracking_columns",
                description="Add columns for tracking analysis status and preventing reanalysis",
                up_sql="""
                    ALTER TABLE music_files ADD COLUMN analysis_status TEXT DEFAULT 'pending';
                    ALTER TABLE music_files ADD COLUMN id3_tags_written INTEGER DEFAULT 0;
                    ALTER TABLE music_files ADD COLUMN prevent_reanalysis INTEGER DEFAULT 0;
                """,
                down_sql="""
                    -- Note: SQLite doesn't support DROP COLUMN directly
                """
            )
        ]
    
    def get_pending_migrations(self) -> List[Migration]:
        """Get migrations that haven't been executed yet"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(f'''
                SELECT version FROM {self.migrations_table} 
                WHERE status = 'completed'
            ''')
            completed_versions = {row[0] for row in cursor.fetchall()}
        
        return [m for m in self.migrations if m.version not in completed_versions]
    
    def get_migration_status(self, version: str) -> Optional[MigrationStatus]:
        """Get the status of a specific migration"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(f'''
                SELECT status FROM {self.migrations_table} 
                WHERE version = ?
            ''', (version,))
            result = cursor.fetchone()
            return MigrationStatus(result[0]) if result else None
    
    def execute_migration(self, migration: Migration) -> bool:
        """Execute a single migration"""
        logger.info(f"Executing migration {migration.version}: {migration.name}")
        
        start_time = datetime.now()
        
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Record migration start
                cursor.execute(f'''
                    INSERT OR REPLACE INTO {self.migrations_table} 
                    (version, name, description, status, executed_at)
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    migration.version,
                    migration.name,
                    migration.description,
                    MigrationStatus.RUNNING.value,
                    start_time.isoformat()
                ))
                conn.commit()
                
                # Execute the migration SQL
                cursor.executescript(migration.up_sql)
                conn.commit()
                
                # Record successful completion
                execution_time = (datetime.now() - start_time).total_seconds() * 1000
                cursor.execute(f'''
                    UPDATE {self.migrations_table} 
                    SET status = ?, execution_time_ms = ?
                    WHERE version = ?
                ''', (
                    MigrationStatus.COMPLETED.value,
                    execution_time,
                    migration.version
                ))
                conn.commit()
                
                logger.info(f"Migration {migration.version} completed successfully in {execution_time:.2f}ms")
                return True
                
        except Exception as e:
            logger.error(f"Migration {migration.version} failed: {e}")
            
            # Record failure
            try:
                with sqlite3.connect(self.db_path) as conn:
                    cursor = conn.cursor()
                    cursor.execute(f'''
                        UPDATE {self.migrations_table} 
                        SET status = ?, error_message = ?
                        WHERE version = ?
                    ''', (
                        MigrationStatus.FAILED.value,
                        str(e),
                        migration.version
                    ))
                    conn.commit()
            except Exception as record_error:
                logger.error(f"Failed to record migration failure: {record_error}")
            
            return False
    
    def rollback_migration(self, migration: Migration) -> bool:
        """Rollback a migration"""
        logger.info(f"Rolling back migration {migration.version}: {migration.name}")
        
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Execute rollback SQL
                if migration.down_sql.strip():
                    cursor.executescript(migration.down_sql)
                    conn.commit()
                
                # Update status
                cursor.execute(f'''
                    UPDATE {self.migrations_table} 
                    SET status = ?
                    WHERE version = ?
                ''', (
                    MigrationStatus.ROLLED_BACK.value,
                    migration.version
                ))
                conn.commit()
                
                logger.info(f"Migration {migration.version} rolled back successfully")
                return True
                
        except Exception as e:
            logger.error(f"Failed to rollback migration {migration.version}: {e}")
            return False
    
    def migrate(self) -> bool:
        """Run all pending migrations"""
        pending = self.get_pending_migrations()
        
        if not pending:
            logger.info("No pending migrations")
            return True
        
        logger.info(f"Found {len(pending)} pending migrations")
        
        success_count = 0
        for migration in pending:
            if self.execute_migration(migration):
                success_count += 1
            else:
                logger.error(f"Migration failed, stopping migration process")
                break
        
        logger.info(f"Migration process completed: {success_count}/{len(pending)} successful")
        return success_count == len(pending)
    
    def get_migration_history(self) -> List[Dict[str, Any]]:
        """Get the complete migration history"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(f'''
                SELECT version, name, description, status, executed_at, 
                       execution_time_ms, error_message, created_at
                FROM {self.migrations_table}
                ORDER BY version
            ''')
            
            columns = [desc[0] for desc in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
    
    def validate_schema(self) -> Dict[str, Any]:
        """Validate the current database schema"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Get table information
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            
            # Get music_files table structure
            cursor.execute("PRAGMA table_info(music_files)")
            music_files_columns = [row[1] for row in cursor.fetchall()]
            
            # Check for required columns
            required_columns = [
                'id', 'filename', 'file_path', 'camelot_key', 'bpm', 
                'energy_level', 'cover_art', 'cover_art_extracted', 'rating'
            ]
            
            missing_columns = [col for col in required_columns if col not in music_files_columns]
            
            return {
                "tables": tables,
                "music_files_columns": music_files_columns,
                "missing_required_columns": missing_columns,
                "is_valid": len(missing_columns) == 0,
                "last_checked": datetime.now().isoformat()
            }
    
    def backup_database(self, backup_path: str) -> bool:
        """Create a backup of the database"""
        try:
            import shutil
            shutil.copy2(self.db_path, backup_path)
            logger.info(f"Database backed up to {backup_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to backup database: {e}")
            return False
    
    def restore_database(self, backup_path: str) -> bool:
        """Restore database from backup"""
        try:
            import shutil
            shutil.copy2(backup_path, self.db_path)
            logger.info(f"Database restored from {backup_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to restore database: {e}")
            return False

def run_migrations(db_path: str) -> bool:
    """Convenience function to run migrations"""
    migrator = DatabaseMigrator(db_path)
    
    # Create backup before migration
    backup_path = f"{db_path}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    if migrator.backup_database(backup_path):
        logger.info(f"Backup created: {backup_path}")
    
    # Run migrations
    success = migrator.migrate()
    
    if success:
        logger.info("All migrations completed successfully")
    else:
        logger.error("Some migrations failed")
    
    return success

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    else:
        db_path = os.path.join(os.path.expanduser("~"), ".mixed_in_key", "music_library.db")
    
    success = run_migrations(db_path)
    sys.exit(0 if success else 1)
