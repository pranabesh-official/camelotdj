import sqlite3
import os
import json
import sqlite3
from datetime import datetime
from typing import List, Dict, Optional, Tuple
import logging

class DatabaseManager:
    """
    Database manager for Mixed In Key application.
    Tracks music file locations, analysis results, and user library data.
    """
    
    def __init__(self, db_path: Optional[str] = None):
        """Initialize database manager with SQLite database."""
        if db_path is None:
            # Default to user's home directory for persistence
            home_dir = os.path.expanduser("~")
            app_dir = os.path.join(home_dir, ".mixed_in_key")
            os.makedirs(app_dir, exist_ok=True)
            db_path = os.path.join(app_dir, "music_library.db")
        
        self.db_path = db_path
        self.init_database()
        
    def init_database(self):
        """Initialize database tables if they don't exist."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Music files table - tracks file locations and analysis
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS music_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    file_path TEXT NOT NULL UNIQUE,
                    file_size INTEGER,
                    file_hash TEXT,
                    
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
                    cue_points TEXT,  -- JSON string of cue points array
                    
                    -- File status
                    status TEXT DEFAULT 'found',  -- found, missing, analyzing, error
                    last_checked TEXT,
                    error_message TEXT,
                    
                    -- Timestamps
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Playlists table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS playlists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    color TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Playlist items table (many-to-many relationship)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS playlist_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    playlist_id INTEGER,
                    music_file_id INTEGER,
                    position INTEGER,
                    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE CASCADE,
                    FOREIGN KEY (music_file_id) REFERENCES music_files (id) ON DELETE CASCADE
                )
            ''')
            
            # Scan locations table - remember where user has scanned for music
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS scan_locations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    path TEXT NOT NULL UNIQUE,
                    name TEXT,
                    last_scanned TEXT,
                    files_found INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Application settings table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create indexes for better performance
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_music_files_path ON music_files(file_path)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_music_files_camelot ON music_files(camelot_key)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_music_files_status ON music_files(status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id)')
            
            conn.commit()
            
    def add_music_file(self, file_data: Dict) -> int:
        """Add or update a music file in the database."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Check if file already exists
            cursor.execute('SELECT id FROM music_files WHERE file_path = ?', (file_data['file_path'],))
            existing = cursor.fetchone()
            
            current_time = datetime.now().isoformat()
            
            if existing:
                # Update existing file
                file_id = existing[0]
                cursor.execute('''
                    UPDATE music_files SET
                        filename = ?, file_size = ?, key_signature = ?, scale = ?,
                        key_name = ?, camelot_key = ?, bpm = ?, energy_level = ?,
                        duration = ?, analysis_date = ?, cue_points = ?,
                        status = ?, last_checked = ?, updated_at = ?
                    WHERE id = ?
                ''', (
                    file_data.get('filename', ''),
                    file_data.get('file_size', 0),
                    file_data.get('key', ''),
                    file_data.get('scale', ''),
                    file_data.get('key_name', ''),
                    file_data.get('camelot_key', ''),
                    file_data.get('bpm', 0.0),
                    file_data.get('energy_level', 0.0),
                    file_data.get('duration', 0.0),
                    file_data.get('analysis_date', current_time),
                    json.dumps(file_data.get('cue_points', [])),
                    file_data.get('status', 'found'),
                    current_time,
                    current_time,
                    file_id
                ))
            else:
                # Insert new file
                cursor.execute('''
                    INSERT INTO music_files (
                        filename, file_path, file_size, key_signature, scale,
                        key_name, camelot_key, bpm, energy_level, duration,
                        analysis_date, cue_points, status, last_checked
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    file_data.get('filename', ''),
                    file_data['file_path'],
                    file_data.get('file_size', 0),
                    file_data.get('key', ''),
                    file_data.get('scale', ''),
                    file_data.get('key_name', ''),
                    file_data.get('camelot_key', ''),
                    file_data.get('bpm', 0.0),
                    file_data.get('energy_level', 0.0),
                    file_data.get('duration', 0.0),
                    file_data.get('analysis_date', current_time),
                    json.dumps(file_data.get('cue_points', [])),
                    file_data.get('status', 'found'),
                    current_time
                ))
                file_id = cursor.lastrowid
                if file_id is None:
                    raise RuntimeError("Failed to insert music file")
            
            conn.commit()
            return file_id
    
    def get_all_music_files(self, status_filter: Optional[str] = None) -> List[Dict]:
        """Get all music files from database."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            query = 'SELECT * FROM music_files'
            params = []
            
            if status_filter:
                query += ' WHERE status = ?'
                params.append(status_filter)
                
            query += ' ORDER BY filename'
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            columns = [desc[0] for desc in cursor.description]
            return [dict(zip(columns, row)) for row in rows]
    
    def get_music_file_by_path(self, file_path: str) -> Optional[Dict]:
        """Get a music file by its path."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM music_files WHERE file_path = ?', (file_path,))
            row = cursor.fetchone()
            
            if row:
                columns = [desc[0] for desc in cursor.description]
                return dict(zip(columns, row))
            return None
    
    def get_files_by_camelot_key(self, camelot_key: str) -> List[Dict]:
        """Get all files with a specific Camelot key."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM music_files WHERE camelot_key = ? AND status = "found" ORDER BY filename',
                (camelot_key,)
            )
            rows = cursor.fetchall()
            
            columns = [desc[0] for desc in cursor.description]
            return [dict(zip(columns, row)) for row in rows]
    
    def add_scan_location(self, path: str, name: Optional[str] = None) -> int:
        """Add a scan location to remember where music was found."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            if name is None:
                name = os.path.basename(path) or path
            
            cursor.execute('''
                INSERT OR REPLACE INTO scan_locations (path, name, last_scanned)
                VALUES (?, ?, ?)
            ''', (path, name, datetime.now().isoformat()))
            
            conn.commit()
            location_id = cursor.lastrowid
            if location_id is None:
                raise RuntimeError("Failed to insert scan location")
            return location_id
    
    def get_scan_locations(self) -> List[Dict]:
        """Get all remembered scan locations."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM scan_locations WHERE is_active = 1 ORDER BY last_scanned DESC')
            rows = cursor.fetchall()
            
            columns = [desc[0] for desc in cursor.description]
            return [dict(zip(columns, row)) for row in rows]
    
    def update_file_status(self, file_path: str, status: str, error_message: Optional[str] = None):
        """Update the status of a music file (found, missing, error, etc.)."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE music_files SET 
                    status = ?, 
                    error_message = ?, 
                    last_checked = ?,
                    updated_at = ?
                WHERE file_path = ?
            ''', (
                status, 
                error_message, 
                datetime.now().isoformat(),
                datetime.now().isoformat(),
                file_path
            ))
            conn.commit()
    
    def verify_file_locations(self) -> Tuple[int, int]:
        """Verify that all files in database still exist. Returns (found, missing) counts."""
        files = self.get_all_music_files()
        found_count = 0
        missing_count = 0
        
        for file_record in files:
            file_path = file_record['file_path']
            if os.path.exists(file_path):
                if file_record['status'] != 'found':
                    self.update_file_status(file_path, 'found')
                found_count += 1
            else:
                if file_record['status'] != 'missing':
                    self.update_file_status(file_path, 'missing')
                missing_count += 1
        
        return found_count, missing_count
    
    def get_library_stats(self) -> Dict:
        """Get statistics about the music library."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Total files
            cursor.execute('SELECT COUNT(*) FROM music_files')
            total_files = cursor.fetchone()[0]
            
            # Files by status
            cursor.execute('SELECT status, COUNT(*) FROM music_files GROUP BY status')
            status_counts = dict(cursor.fetchall())
            
            # Files by key
            cursor.execute('SELECT camelot_key, COUNT(*) FROM music_files WHERE status = "found" GROUP BY camelot_key')
            key_distribution = dict(cursor.fetchall())
            
            # Total duration
            cursor.execute('SELECT SUM(duration) FROM music_files WHERE status = "found"')
            total_duration = cursor.fetchone()[0] or 0
            
            return {
                'total_files': total_files,
                'status_counts': status_counts,
                'key_distribution': key_distribution,
                'total_duration_hours': total_duration / 3600 if total_duration else 0
            }
    
    def set_setting(self, key: str, value: str):
        """Set an application setting."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO app_settings (key, value, updated_at)
                VALUES (?, ?, ?)
            ''', (key, value, datetime.now().isoformat()))
            conn.commit()
    
    def get_setting(self, key: str) -> Optional[str]:
        """Get an application setting."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT value FROM app_settings WHERE key = ?', (key,))
            result = cursor.fetchone()
            return result[0] if result else None
    
    def delete_setting(self, key: str):
        """Delete an application setting."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM app_settings WHERE key = ?', (key,))
            conn.commit()
    
    def close(self):
        """Close database connection."""
        # SQLite connections are automatically closed when using context managers
        pass