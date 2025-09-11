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
                    track_id TEXT UNIQUE,  -- Unique track identifier
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
            
            # Add track_id column if it doesn't exist (for existing databases)
            try:
                cursor.execute('ALTER TABLE music_files ADD COLUMN track_id TEXT UNIQUE')
                print("✅ Added track_id column to existing database")
            except sqlite3.OperationalError:
                # Column already exists
                pass
            # Add rating column if it doesn't exist (for existing databases)
            try:
                cursor.execute('ALTER TABLE music_files ADD COLUMN rating INTEGER DEFAULT 0')
                print("✅ Added rating column to existing database")
            except sqlite3.OperationalError:
                # Column already exists
                pass
            
            # Add ID3 metadata columns if they don't exist (for existing databases)
            id3_columns = [
                ('title', 'TEXT'),
                ('artist', 'TEXT'),
                ('album', 'TEXT'),
                ('albumartist', 'TEXT'),
                ('date', 'TEXT'),
                ('year', 'TEXT'),
                ('genre', 'TEXT'),
                ('composer', 'TEXT'),
                ('tracknumber', 'TEXT'),
                ('discnumber', 'TEXT'),
                ('comment', 'TEXT'),
                ('initialkey', 'TEXT'),
                ('bpm_from_tags', 'TEXT'),
                ('website', 'TEXT'),
                ('isrc', 'TEXT'),
                ('language', 'TEXT'),
                ('organization', 'TEXT'),
                ('copyright', 'TEXT'),
                ('encodedby', 'TEXT'),
                ('id3_metadata', 'TEXT'),  # JSON blob for all metadata
                # Analysis tracking columns
                ('analysis_status', 'TEXT DEFAULT "pending"'),  # pending, analyzing, completed, failed
                ('id3_tags_written', 'BOOLEAN DEFAULT 0'),  # Track if ID3 tags have been written
                ('last_analysis_attempt', 'TEXT'),  # Timestamp of last analysis attempt
                ('analysis_attempts', 'INTEGER DEFAULT 0'),  # Number of analysis attempts
                ('file_hash', 'TEXT'),  # MD5 hash of file content for duplicate detection
                ('prevent_reanalysis', 'BOOLEAN DEFAULT 0'),  # Flag to prevent re-analysis
                ('cover_art', 'TEXT'),  # Base64 encoded cover art
                ('cover_art_extracted', 'BOOLEAN DEFAULT 0')  # Flag to track if cover art has been extracted
            ]
            
            for column_name, column_type in id3_columns:
                try:
                    cursor.execute(f'ALTER TABLE music_files ADD COLUMN {column_name} {column_type}')
                    print(f"✅ Added {column_name} column to existing database")
                except sqlite3.OperationalError:
                    # Column already exists
                    pass
            
            # Playlists table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS playlists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    color TEXT,
                    is_query_based BOOLEAN DEFAULT 0,
                    query_criteria TEXT,  -- JSON string for query criteria
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Add new columns for query-based playlists if they don't exist
            try:
                cursor.execute('ALTER TABLE playlists ADD COLUMN is_query_based BOOLEAN DEFAULT 0')
                print("✅ Added is_query_based column to playlists table")
            except sqlite3.OperationalError:
                # Column already exists
                pass
            try:
                cursor.execute('ALTER TABLE playlists ADD COLUMN query_criteria TEXT')
                print("✅ Added query_criteria column to playlists table")
            except sqlite3.OperationalError:
                # Column already exists
                pass
            
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
                # Extract ID3 metadata
                id3_data = file_data.get('id3', {})
                
                # Calculate file hash for duplicate detection if file exists
                file_hash = self.calculate_file_hash(file_data['file_path']) if os.path.exists(file_data['file_path']) else ''
                
                cursor.execute('''
                    UPDATE music_files SET
                        filename = ?, file_size = ?, key_signature = ?, scale = ?,
                        key_name = ?, camelot_key = ?, bpm = ?, energy_level = ?,
                        duration = ?, analysis_date = ?, cue_points = ?,
                        status = ?, last_checked = ?, updated_at = ?,
                        title = ?, artist = ?, album = ?, albumartist = ?, date = ?, year = ?,
                        genre = ?, composer = ?, tracknumber = ?, discnumber = ?, comment = ?,
                        initialkey = ?, bpm_from_tags = ?, website = ?, isrc = ?, language = ?,
                        organization = ?, copyright = ?, encodedby = ?, id3_metadata = ?,
                        analysis_status = ?, id3_tags_written = ?, file_hash = ?, prevent_reanalysis = ?,
                        cover_art = ?, cover_art_extracted = ?
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
                    # ID3 metadata fields
                    id3_data.get('title', ''),
                    id3_data.get('artist', ''),
                    id3_data.get('album', ''),
                    id3_data.get('albumartist', ''),
                    id3_data.get('date', ''),
                    id3_data.get('year', ''),
                    id3_data.get('genre', ''),
                    id3_data.get('composer', ''),
                    id3_data.get('tracknumber', ''),
                    id3_data.get('discnumber', ''),
                    id3_data.get('comment', ''),
                    id3_data.get('initialkey', ''),
                    id3_data.get('bpm', ''),
                    id3_data.get('website', ''),
                    id3_data.get('isrc', ''),
                    id3_data.get('language', ''),
                    id3_data.get('organization', ''),
                    id3_data.get('copyright', ''),
                    id3_data.get('encodedby', ''),
                    json.dumps(id3_data),  # Store complete metadata as JSON
                    # Analysis tracking fields
                    file_data.get('analysis_status', 'pending'),
                    file_data.get('id3_tags_written', 0),
                    file_hash,
                    file_data.get('prevent_reanalysis', 0),
                    file_data.get('cover_art', ''),
                    file_data.get('cover_art_extracted', 0),
                    file_id
                ))
            else:
                # Insert new file
                # Extract ID3 metadata
                id3_data = file_data.get('id3', {})
                
                # Calculate file hash for duplicate detection
                file_hash = self.calculate_file_hash(file_data['file_path']) if os.path.exists(file_data['file_path']) else ''
                
                cursor.execute('''
                    INSERT INTO music_files (
                        filename, file_path, file_size, key_signature, scale,
                        key_name, camelot_key, bpm, energy_level, duration,
                        analysis_date, cue_points, status, last_checked,
                        title, artist, album, albumartist, date, year,
                        genre, composer, tracknumber, discnumber, comment,
                        initialkey, bpm_from_tags, website, isrc, language,
                        organization, copyright, encodedby, id3_metadata,
                        analysis_status, id3_tags_written, file_hash, prevent_reanalysis,
                        cover_art, cover_art_extracted
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    current_time,
                    # ID3 metadata fields
                    id3_data.get('title', ''),
                    id3_data.get('artist', ''),
                    id3_data.get('album', ''),
                    id3_data.get('albumartist', ''),
                    id3_data.get('date', ''),
                    id3_data.get('year', ''),
                    id3_data.get('genre', ''),
                    id3_data.get('composer', ''),
                    id3_data.get('tracknumber', ''),
                    id3_data.get('discnumber', ''),
                    id3_data.get('comment', ''),
                    id3_data.get('initialkey', ''),
                    id3_data.get('bpm', ''),
                    id3_data.get('website', ''),
                    id3_data.get('isrc', ''),
                    id3_data.get('language', ''),
                    id3_data.get('organization', ''),
                    id3_data.get('copyright', ''),
                    id3_data.get('encodedby', ''),
                    json.dumps(id3_data),  # Store complete metadata as JSON
                    # Analysis tracking fields
                    file_data.get('analysis_status', 'pending'),
                    file_data.get('id3_tags_written', 0),
                    file_hash,
                    file_data.get('prevent_reanalysis', 0),
                    file_data.get('cover_art', ''),
                    file_data.get('cover_art_extracted', 0)
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
    
    def delete_music_file_by_id(self, song_id: str) -> bool:
        """Delete a music file from the database by ID."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # First get the file path to check if file exists
                cursor.execute('SELECT file_path FROM music_files WHERE id = ?', (song_id,))
                result = cursor.fetchone()
                
                if not result:
                    return False
                
                file_path = result[0]
                
                # Delete from database
                cursor.execute('DELETE FROM music_files WHERE id = ?', (song_id,))
                
                # Also remove from playlist items
                cursor.execute('DELETE FROM playlist_items WHERE music_file_id = ?', (song_id,))
                
                conn.commit()
                
                print(f"🗑️ Deleted song ID {song_id} from database")
                return True
                
        except Exception as e:
            print(f"❌ Error deleting song by ID {song_id}: {str(e)}")
            return False
    
    def delete_music_file_by_path(self, file_path: str) -> bool:
        """Delete a music file from the database by file path."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # First get the ID to check if file exists
                cursor.execute('SELECT id FROM music_files WHERE file_path = ?', (file_path,))
                result = cursor.fetchone()
                
                if not result:
                    return False
                
                song_id = result[0]
                
                # Delete from database
                cursor.execute('DELETE FROM music_files WHERE file_path = ?', (file_path,))
                
                # Also remove from playlist items
                cursor.execute('DELETE FROM playlist_items WHERE music_file_id = ?', (song_id,))
                
                conn.commit()
                
                print(f"🗑️ Deleted song with path {file_path} from database")
                return True
                
        except Exception as e:
            print(f"❌ Error deleting song by path {file_path}: {str(e)}")
            return False
    
    def update_music_file_metadata(self, file_id: str, metadata_updates: dict) -> Optional[dict]:
        """Update metadata for a music file."""
        try:
            # Convert file_id to integer if it's a string
            try:
                file_id_int = int(file_id)
            except (ValueError, TypeError):
                print(f"Invalid file_id format: {file_id}")
                return None
            
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Build dynamic update query
                update_fields = []
                params = []
                
                # Map frontend field names to database column names
                field_mapping = {
                    'key': 'key_signature',
                    'scale': 'scale',
                    'key_name': 'key_name',
                    'camelot_key': 'camelot_key',
                    'bpm': 'bpm',
                    'energy_level': 'energy_level',
                    'duration': 'duration',
                    'cue_points': 'cue_points'
                }
                
                for field, value in metadata_updates.items():
                    if field in field_mapping:
                        db_field = field_mapping[field]
                        update_fields.append(f"{db_field} = ?")
                        
                        # Handle special cases
                        if field == 'cue_points' and isinstance(value, list):
                            params.append(json.dumps(value))
                        elif field in ['bpm', 'energy_level', 'duration']:
                            # Ensure numeric values are properly converted
                            try:
                                if value is not None and value != '':
                                    if field == 'energy_level':
                                        params.append(int(float(value)))
                                    else:
                                        params.append(float(value))
                                else:
                                    params.append(None)
                            except (ValueError, TypeError):
                                params.append(None)
                        else:
                            # Handle string values
                            if value is not None and value != '':
                                params.append(str(value))
                            else:
                                params.append(None)
                
                if not update_fields:
                    print(f"No valid fields to update for file_id: {file_id_int}")
                    return None
                
                # Add updated_at timestamp and analysis_date
                update_fields.append("updated_at = CURRENT_TIMESTAMP")
                update_fields.append("analysis_date = CURRENT_TIMESTAMP")
                
                # Add file_id to params
                params.append(file_id_int)
                
                query = f"""
                    UPDATE music_files 
                    SET {', '.join(update_fields)}
                    WHERE id = ?
                """
                
                print(f"Executing update query: {query}")
                print(f"Parameters: {params}")
                
                cursor.execute(query, params)
                conn.commit()
                
                if cursor.rowcount > 0:
                    print(f"Successfully updated {cursor.rowcount} rows for file_id: {file_id_int}")
                    # Return updated record
                    return self.get_music_file_by_id(str(file_id_int))
                else:
                    print(f"No rows updated for file_id: {file_id_int}")
                    return None
                    
        except Exception as e:
            print(f"Error updating music file metadata: {str(e)}")
            import traceback
            traceback.print_exc()
            return None

    def update_music_file_path(self, file_id: int, new_file_path: str) -> Optional[dict]:
        """Update file path for a music file (after renaming)."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Update both file_path and filename
                new_filename = os.path.basename(new_file_path)
                
                cursor.execute("""
                    UPDATE music_files 
                    SET file_path = ?, filename = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (new_file_path, new_filename, file_id))
                
                conn.commit()
                
                if cursor.rowcount > 0:
                    # Return updated record
                    return self.get_music_file_by_id(file_id)
                else:
                    return None
                    
        except Exception as e:
            print(f"Error updating music file path: {str(e)}")
            return None

    def get_music_file_by_id(self, file_id: str) -> Optional[dict]:
        """Get a music file by its ID."""
        try:
            # Convert file_id to integer if it's a string
            try:
                file_id_int = int(file_id)
            except (ValueError, TypeError):
                print(f"Invalid file_id format: {file_id}")
                return None
            
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT * FROM music_files WHERE id = ?
                """, (file_id_int,))
                
                row = cursor.fetchone()
                if row:
                    columns = [description[0] for description in cursor.description]
                    return dict(zip(columns, row))
                else:
                    print(f"No music file found with ID: {file_id_int}")
                    return None
                    
        except Exception as e:
            print(f"Error getting music file by ID: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
    
    def close(self):
        """Close database connection."""
        # SQLite connections are automatically closed when using context managers
        pass

    def check_song_has_metadata(self, file_path: str) -> dict:
        """Check if a song already has key and BPM metadata."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT id, filename, key_signature, camelot_key, bpm, energy_level, duration, analysis_date
                    FROM music_files 
                    WHERE file_path = ?
                """, (file_path,))
                
                row = cursor.fetchone()
                if row:
                    columns = [description[0] for description in cursor.description]
                    song_data = dict(zip(columns, row))
                    
                    # Check if song has complete metadata
                    has_key = bool(song_data.get('key_signature') or song_data.get('camelot_key'))
                    has_bpm = bool(song_data.get('bpm') and song_data.get('bpm') > 0)
                    has_energy = bool(song_data.get('energy_level') and song_data.get('energy_level') > 0)
                    has_duration = bool(song_data.get('duration') and song_data.get('duration') > 0)
                    
                    return {
                        'exists': True,
                        'song_id': song_data['id'],
                        'filename': song_data['filename'],
                        'has_complete_metadata': has_key and has_bpm and has_energy and has_duration,
                        'has_key': has_key,
                        'has_bpm': has_bpm,
                        'has_energy': has_energy,
                        'has_duration': has_duration,
                        'key_signature': song_data.get('key_signature'),
                        'camelot_key': song_data.get('camelot_key'),
                        'bpm': song_data.get('bpm'),
                        'energy_level': song_data.get('energy_level'),
                        'duration': song_data.get('duration'),
                        'analysis_date': song_data.get('analysis_date'),
                        'status': 'complete' if (has_key and has_bpm and has_energy and has_duration) else 'partial'
                    }
                else:
                    return {
                        'exists': False,
                        'status': 'not_found'
                    }
                    
        except Exception as e:
            print(f"Error checking song metadata: {str(e)}")
            return {
                'exists': False,
                'status': 'error',
                'error': str(e)
            }

    def generate_unique_track_id(self, file_path: str, filename: str) -> str:
        """Generate a unique track ID based on file path and content."""
        try:
            import hashlib
            import os
            
            # Get file size and modification time for uniqueness
            file_stat = os.stat(file_path)
            file_size = file_stat.st_size
            file_mtime = file_stat.st_mtime
            
            # Create a unique hash based on file path, size, and modification time
            unique_string = f"{file_path}:{file_size}:{file_mtime}"
            track_hash = hashlib.md5(unique_string.encode()).hexdigest()[:12]
            
            # Create a readable track ID
            clean_filename = "".join(c for c in filename if c.isalnum() or c in (' ', '-', '_')).strip()
            clean_filename = clean_filename[:20]  # Limit length
            
            unique_track_id = f"{clean_filename}_{track_hash}"
            
            return unique_track_id
            
        except Exception as e:
            print(f"Error generating unique track ID: {str(e)}")
            # Fallback to timestamp-based ID
            import time
            return f"track_{int(time.time())}"

    def get_song_by_track_id(self, track_id: str) -> Optional[dict]:
        """Get a song by its unique track ID."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT * FROM music_files 
                    WHERE track_id = ?
                """, (track_id,))
                
                row = cursor.fetchone()
                if row:
                    columns = [description[0] for description in cursor.description]
                    return dict(zip(columns, row))
                else:
                    return None
                    
        except Exception as e:
            print(f"Error getting song by track ID: {str(e)}")
            return None

    def update_track_id(self, file_id: str, track_id: str) -> bool:
        """Update the track_id for a song."""
        try:
            file_id_int = int(file_id)
            
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    UPDATE music_files 
                    SET track_id = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (track_id, file_id_int))
                
                conn.commit()
                return cursor.rowcount > 0
                
        except Exception as e:
            print(f"Error updating track ID: {str(e)}")
            return False

    def should_skip_analysis(self, file_path: str) -> dict:
        """Check if a file should be skipped for analysis based on various criteria."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT id, filename, analysis_status, id3_tags_written, 
                           prevent_reanalysis, analysis_attempts, last_analysis_attempt,
                           key_signature, camelot_key, bpm, energy_level, duration
                    FROM music_files 
                    WHERE file_path = ?
                """, (file_path,))
                
                row = cursor.fetchone()
                if row:
                    columns = [description[0] for description in cursor.description]
                    song_data = dict(zip(columns, row))
                    
                    # Check if re-analysis is explicitly prevented (highest priority)
                    prevent_reanalysis = song_data.get('prevent_reanalysis', 0) == 1
                    
                    # Check if analysis is already completed and tags are written
                    is_completed = (song_data.get('analysis_status') == 'completed' and 
                                  song_data.get('id3_tags_written', 0) == 1)
                    
                    # Check if file has complete metadata
                    has_complete_metadata = all([
                        song_data.get('key_signature') or song_data.get('camelot_key'),
                        song_data.get('bpm') and song_data.get('bpm') > 0,
                        song_data.get('energy_level') and song_data.get('energy_level') > 0,
                        song_data.get('duration') and song_data.get('duration') > 0
                    ])
                    
                    should_skip = prevent_reanalysis or is_completed or has_complete_metadata
                    
                    return {
                        'should_skip': should_skip,
                        'reason': 'prevented' if prevent_reanalysis else 
                                 'completed' if is_completed else 
                                 'has_metadata' if has_complete_metadata else 'none',
                        'song_data': song_data,
                        'analysis_status': song_data.get('analysis_status'),
                        'id3_tags_written': song_data.get('id3_tags_written', 0) == 1,
                        'has_complete_metadata': has_complete_metadata
                    }
                else:
                    return {
                        'should_skip': False,
                        'reason': 'not_found',
                        'song_data': None
                    }
                    
        except Exception as e:
            print(f"Error checking if should skip analysis: {str(e)}")
            return {
                'should_skip': False,
                'reason': 'error',
                'error': str(e)
            }

    def mark_analysis_started(self, file_path: str) -> bool:
        """Mark that analysis has started for a file."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    UPDATE music_files 
                    SET analysis_status = 'analyzing', 
                        last_analysis_attempt = CURRENT_TIMESTAMP,
                        analysis_attempts = analysis_attempts + 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE file_path = ?
                """, (file_path,))
                
                conn.commit()
                return cursor.rowcount > 0
                
        except Exception as e:
            print(f"Error marking analysis started: {str(e)}")
            return False

    def mark_analysis_completed(self, file_path: str, analysis_data: dict = None) -> bool:
        """Mark that analysis has been completed for a file."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # If analysis_data is provided, update the analysis results as well
                if analysis_data:
                    cursor.execute("""
                        UPDATE music_files 
                        SET analysis_status = 'completed',
                            key_signature = ?, camelot_key = ?, bpm = ?, 
                            energy_level = ?, duration = ?, analysis_date = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE file_path = ?
                    """, (
                        analysis_data.get('key', ''),
                        analysis_data.get('camelot_key', ''),
                        analysis_data.get('bpm', 0.0),
                        analysis_data.get('energy_level', 0.0),
                        analysis_data.get('duration', 0.0),
                        file_path
                    ))
                else:
                    cursor.execute("""
                        UPDATE music_files 
                        SET analysis_status = 'completed', updated_at = CURRENT_TIMESTAMP
                        WHERE file_path = ?
                    """, (file_path,))
                
                conn.commit()
                return cursor.rowcount > 0
                
        except Exception as e:
            print(f"Error marking analysis completed: {str(e)}")
            return False

    def mark_id3_tags_written(self, file_path: str) -> bool:
        """Mark that ID3 tags have been written for a file."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    UPDATE music_files 
                    SET id3_tags_written = 1, updated_at = CURRENT_TIMESTAMP
                    WHERE file_path = ?
                """, (file_path,))
                
                conn.commit()
                return cursor.rowcount > 0
                
        except Exception as e:
            print(f"Error marking ID3 tags written: {str(e)}")
            return False

    def mark_analysis_failed(self, file_path: str, error_message: str = None) -> bool:
        """Mark that analysis has failed for a file."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    UPDATE music_files 
                    SET analysis_status = 'failed', 
                        error_message = ?, 
                        updated_at = CURRENT_TIMESTAMP
                    WHERE file_path = ?
                """, (error_message, file_path))
                
                conn.commit()
                return cursor.rowcount > 0
                
        except Exception as e:
            print(f"Error marking analysis failed: {str(e)}")
            return False

    def set_prevent_reanalysis(self, file_path: str, prevent: bool = True) -> bool:
        """Set or unset the prevent_reanalysis flag for a file."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    UPDATE music_files 
                    SET prevent_reanalysis = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE file_path = ?
                """, (1 if prevent else 0, file_path))
                
                conn.commit()
                return cursor.rowcount > 0
                
        except Exception as e:
            print(f"Error setting prevent_reanalysis flag: {str(e)}")
            return False

    def update_cover_art(self, file_path: str, cover_art: str) -> bool:
        """Update cover art for a music file."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    UPDATE music_files 
                    SET cover_art = ?, cover_art_extracted = 1, updated_at = CURRENT_TIMESTAMP
                    WHERE file_path = ?
                """, (cover_art, file_path))
                
                conn.commit()
                return cursor.rowcount > 0
                
        except Exception as e:
            print(f"Error updating cover art: {str(e)}")
            return False

    def get_cover_art(self, file_path: str) -> Optional[str]:
        """Get cover art for a music file."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT cover_art, cover_art_extracted 
                    FROM music_files 
                    WHERE file_path = ?
                """, (file_path,))
                
                result = cursor.fetchone()
                if result and result[1]:  # cover_art_extracted is True
                    return result[0]  # cover_art
                return None
                
        except Exception as e:
            print(f"Error getting cover art: {str(e)}")
            return None

    def calculate_file_hash(self, file_path: str) -> str:
        """Calculate MD5 hash of file content for duplicate detection."""
        try:
            import hashlib
            
            hash_md5 = hashlib.md5()
            with open(file_path, "rb") as f:
                # Read file in chunks to handle large files
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_md5.update(chunk)
            return hash_md5.hexdigest()
            
        except Exception as e:
            print(f"Error calculating file hash: {str(e)}")
            return ""

    def find_duplicate_by_hash(self, file_hash: str) -> Optional[dict]:
        """Find a file with the same hash (duplicate content)."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT * FROM music_files 
                    WHERE file_hash = ? AND file_hash != ''
                """, (file_hash,))
                
                row = cursor.fetchone()
                if row:
                    columns = [description[0] for description in cursor.description]
                    return dict(zip(columns, row))
                else:
                    return None
                    
        except Exception as e:
            print(f"Error finding duplicate by hash: {str(e)}")
            return None

    # Playlist Management Methods
    
    def create_playlist(self, name: str, description: str = None, color: str = None, 
                       is_query_based: bool = False, query_criteria: dict = None) -> int:
        """Create a new playlist and return its ID."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                query_criteria_json = json.dumps(query_criteria) if query_criteria else None
                
                cursor.execute("""
                    INSERT INTO playlists (name, description, color, is_query_based, query_criteria)
                    VALUES (?, ?, ?, ?, ?)
                """, (name, description, color, is_query_based, query_criteria_json))
                
                playlist_id = cursor.lastrowid
                conn.commit()
                
                print(f"✅ Created playlist: {name} (ID: {playlist_id})")
                return playlist_id
                
        except Exception as e:
            print(f"Error creating playlist: {str(e)}")
            return None

    def get_all_playlists(self) -> List[dict]:
        """Get all playlists with their metadata."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT * FROM playlists 
                    ORDER BY created_at DESC
                """)
                
                rows = cursor.fetchall()
                columns = [description[0] for description in cursor.description]
                
                playlists = []
                for row in rows:
                    playlist = dict(zip(columns, row))
                    # Parse query criteria JSON if it exists
                    if playlist.get('query_criteria'):
                        try:
                            playlist['query_criteria'] = json.loads(playlist['query_criteria'])
                        except json.JSONDecodeError:
                            playlist['query_criteria'] = None
                    playlists.append(playlist)
                
                return playlists
                
        except Exception as e:
            print(f"Error getting playlists: {str(e)}")
            return []

    def get_playlist(self, playlist_id: int) -> Optional[dict]:
        """Get a specific playlist by ID."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT * FROM playlists 
                    WHERE id = ?
                """, (playlist_id,))
                
                row = cursor.fetchone()
                if row:
                    columns = [description[0] for description in cursor.description]
                    playlist = dict(zip(columns, row))
                    
                    # Parse query criteria JSON if it exists
                    if playlist.get('query_criteria'):
                        try:
                            playlist['query_criteria'] = json.loads(playlist['query_criteria'])
                        except json.JSONDecodeError:
                            playlist['query_criteria'] = None
                    
                    return playlist
                else:
                    return None
                    
        except Exception as e:
            print(f"Error getting playlist: {str(e)}")
            return None

    def update_playlist(self, playlist_id: int, name: str = None, description: str = None, 
                       color: str = None, is_query_based: bool = None, query_criteria: dict = None) -> bool:
        """Update playlist metadata."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Build dynamic update query
                updates = []
                params = []
                
                if name is not None:
                    updates.append("name = ?")
                    params.append(name)
                if description is not None:
                    updates.append("description = ?")
                    params.append(description)
                if color is not None:
                    updates.append("color = ?")
                    params.append(color)
                if is_query_based is not None:
                    updates.append("is_query_based = ?")
                    params.append(is_query_based)
                if query_criteria is not None:
                    updates.append("query_criteria = ?")
                    params.append(json.dumps(query_criteria))
                
                if not updates:
                    return True  # Nothing to update
                
                updates.append("updated_at = CURRENT_TIMESTAMP")
                params.append(playlist_id)
                
                query = f"UPDATE playlists SET {', '.join(updates)} WHERE id = ?"
                cursor.execute(query, params)
                
                conn.commit()
                return cursor.rowcount > 0
                
        except Exception as e:
            print(f"Error updating playlist: {str(e)}")
            return False

    def delete_playlist(self, playlist_id: int) -> bool:
        """Delete a playlist and all its items."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Delete playlist items first (CASCADE should handle this, but being explicit)
                cursor.execute("DELETE FROM playlist_items WHERE playlist_id = ?", (playlist_id,))
                
                # Delete the playlist
                cursor.execute("DELETE FROM playlists WHERE id = ?", (playlist_id,))
                
                conn.commit()
                return cursor.rowcount > 0
                
        except Exception as e:
            print(f"Error deleting playlist: {str(e)}")
            return False

    def add_song_to_playlist(self, playlist_id: int, music_file_id: int, position: int = None) -> bool:
        """Add a song to a playlist."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # If no position specified, add to end
                if position is None:
                    cursor.execute("""
                        SELECT COALESCE(MAX(position), 0) + 1 
                        FROM playlist_items 
                        WHERE playlist_id = ?
                    """, (playlist_id,))
                    position = cursor.fetchone()[0]
                
                cursor.execute("""
                    INSERT INTO playlist_items (playlist_id, music_file_id, position)
                    VALUES (?, ?, ?)
                """, (playlist_id, music_file_id, position))
                
                conn.commit()
                return True
                
        except Exception as e:
            print(f"Error adding song to playlist: {str(e)}")
            return False

    def remove_song_from_playlist(self, playlist_id: int, music_file_id: int) -> bool:
        """Remove a song from a playlist."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    DELETE FROM playlist_items 
                    WHERE playlist_id = ? AND music_file_id = ?
                """, (playlist_id, music_file_id))
                
                conn.commit()
                return cursor.rowcount > 0
                
        except Exception as e:
            print(f"Error removing song from playlist: {str(e)}")
            return False

    def get_playlist_songs(self, playlist_id: int) -> List[dict]:
        """Get all songs in a playlist with their metadata."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT mf.*, pi.position, pi.added_at
                    FROM music_files mf
                    JOIN playlist_items pi ON mf.id = pi.music_file_id
                    WHERE pi.playlist_id = ?
                    ORDER BY pi.position ASC
                """, (playlist_id,))
                
                rows = cursor.fetchall()
                columns = [description[0] for description in cursor.description]
                
                songs = []
                for row in rows:
                    song = dict(zip(columns, row))
                    # Parse cue points JSON if it exists
                    if song.get('cue_points'):
                        try:
                            song['cue_points'] = json.loads(song['cue_points'])
                        except json.JSONDecodeError:
                            song['cue_points'] = []
                    songs.append(song)
                
                return songs
                
        except Exception as e:
            print(f"Error getting playlist songs: {str(e)}")
            return []

    def clear_playlist(self, playlist_id: int) -> bool:
        """Remove all songs from a playlist."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute("DELETE FROM playlist_items WHERE playlist_id = ?", (playlist_id,))
                
                conn.commit()
                return True
                
        except Exception as e:
            print(f"Error clearing playlist: {str(e)}")
            return False