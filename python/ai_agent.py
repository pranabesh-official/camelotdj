import json
import time
import uuid
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import google.generativeai as genai
from music_analyzer import MusicAnalyzer
import os
import sqlite3
from datetime import datetime

class TaskStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"

class TaskType(Enum):
    PLAYLIST_CREATION = "playlist_creation"
    SONG_DOWNLOAD = "song_download"
    SONG_ANALYSIS = "song_analysis"
    HARMONIC_VALIDATION = "harmonic_validation"
    PLAYLIST_SAVE = "playlist_save"

@dataclass
class Task:
    id: str
    type: TaskType
    status: TaskStatus
    description: str
    data: Dict[str, Any]
    created_at: str
    updated_at: str
    parent_task_id: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    progress: int = 0

@dataclass
class AgentMemory:
    task_id: str
    context: Dict[str, Any]
    created_at: str
    updated_at: str

class AIAgent:
    """
    Agentic AI system for automated YouTube playlist creation with harmonic mixing.
    Uses Google Gemini AI for intelligent song selection and playlist generation.
    """
    
    def __init__(self, api_key: str, db_path: str = "ai_agent.db"):
        self.api_key = api_key
        self.db_path = db_path
        self.music_analyzer = MusicAnalyzer()
        
        # Initialize Gemini AI
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Initialize database
        self._init_database()
        
        # Active tasks tracking
        self.active_tasks: Dict[str, Task] = {}
        
        # Camelot Wheel for harmonic mixing
        self.camelot_wheel = {
            # Minor keys (inner wheel)
            'A minor': '8A', 'A# minor': '3A', 'B minor': '10A', 'C minor': '5A',
            'C# minor': '12A', 'D minor': '7A', 'D# minor': '2A', 'E minor': '9A',
            'F minor': '4A', 'F# minor': '11A', 'G minor': '6A', 'G# minor': '1A',
            'Bb minor': '3A', 'Db minor': '12A', 'Eb minor': '2A', 'Ab minor': '1A',
            
            # Major keys (outer wheel)
            'A major': '11B', 'A# major': '6B', 'B major': '1B', 'C major': '8B',
            'C# major': '3B', 'D major': '10B', 'D# major': '5B', 'E major': '12B',
            'F major': '7B', 'F# major': '2B', 'G major': '9B', 'G# major': '4B',
            'Bb major': '6B', 'Db major': '3B', 'Eb major': '5B', 'Ab major': '4B'
        }
        
        # Compatible keys mapping
        self.compatible_keys = {
            '1A': ['1A', '2A', '12A', '1B', '2B', '12B'],
            '2A': ['2A', '1A', '3A', '2B', '1B', '3B'],
            '3A': ['3A', '2A', '4A', '3B', '2B', '4B'],
            '4A': ['4A', '3A', '5A', '4B', '3B', '5B'],
            '5A': ['5A', '4A', '6A', '5B', '4B', '6B'],
            '6A': ['6A', '5A', '7A', '6B', '5B', '7B'],
            '7A': ['7A', '6A', '8A', '7B', '6B', '8B'],
            '8A': ['8A', '7A', '9A', '8B', '7B', '9B'],
            '9A': ['9A', '8A', '10A', '9B', '8B', '10B'],
            '10A': ['10A', '9A', '11A', '10B', '9B', '11B'],
            '11A': ['11A', '10A', '12A', '11B', '10B', '12B'],
            '12A': ['12A', '11A', '1A', '12B', '11B', '1B'],
            '1B': ['1B', '2B', '12B', '1A', '2A', '12A'],
            '2B': ['2B', '1B', '3B', '2A', '1A', '3A'],
            '3B': ['3B', '2B', '4B', '3A', '2A', '4A'],
            '4B': ['4B', '3B', '5B', '4A', '3A', '5A'],
            '5B': ['5B', '4B', '6B', '5A', '4A', '6A'],
            '6B': ['6B', '5B', '7B', '6A', '5A', '7A'],
            '7B': ['7B', '6B', '8B', '7A', '6A', '8A'],
            '8B': ['8B', '7B', '9B', '8A', '7A', '9A'],
            '9B': ['9B', '8B', '10B', '9A', '8A', '10A'],
            '10B': ['10B', '9B', '11B', '10A', '9A', '11A'],
            '11B': ['11B', '10B', '12B', '11A', '10A', '12A'],
            '12B': ['12B', '11B', '1B', '12A', '11A', '1A']
        }

    def _init_database(self):
        """Initialize SQLite database for task and memory management."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Tasks table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    description TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    parent_task_id TEXT,
                    result TEXT,
                    error TEXT,
                    progress INTEGER DEFAULT 0
                )
            ''')
            
            # Memory table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS agent_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL,
                    context TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (task_id) REFERENCES tasks (id)
                )
            ''')
            
            conn.commit()

    def create_task(self, task_type: TaskType, description: str, data: Dict[str, Any], 
                   parent_task_id: Optional[str] = None) -> str:
        """Create a new task and return its ID."""
        task_id = f"ai_task_{int(time.time())}"
        now = datetime.now().isoformat()
        
        task = Task(
            id=task_id,
            type=task_type,
            status=TaskStatus.PENDING,
            description=description,
            data=data,
            created_at=now,
            updated_at=now,
            parent_task_id=parent_task_id
        )
        
        # Save to database
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO tasks (id, type, status, description, data, created_at, updated_at, parent_task_id, progress)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                task.id, task.type.value, task.status.value, task.description,
                json.dumps(task.data), task.created_at, task.updated_at,
                task.parent_task_id, task.progress
            ))
            conn.commit()
        
        self.active_tasks[task_id] = task
        return task_id

    def update_task(self, task_id: str, status: Optional[TaskStatus] = None,
                   progress: Optional[int] = None, result: Optional[Dict[str, Any]] = None,
                   error: Optional[str] = None):
        """Update task status and data."""
        if task_id not in self.active_tasks:
            return
        
        task = self.active_tasks[task_id]
        task.updated_at = datetime.now().isoformat()
        
        if status:
            task.status = status
        if progress is not None:
            task.progress = progress
        if result:
            task.result = result
        if error:
            task.error = error
        
        # Update database
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE tasks 
                SET status = ?, progress = ?, result = ?, error = ?, updated_at = ?
                WHERE id = ?
            ''', (
                task.status.value, task.progress,
                json.dumps(task.result) if task.result else None,
                task.error, task.updated_at, task_id
            ))
            conn.commit()

    def get_task(self, task_id: str) -> Optional[Task]:
        """Get task by ID."""
        # First check memory
        if task_id in self.active_tasks:
            return self.active_tasks[task_id]
        
        # If not in memory, check database
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, type, status, description, data, created_at, updated_at, 
                       parent_task_id, result, error, progress
                FROM tasks WHERE id = ?
            ''', (task_id,))
            
            row = cursor.fetchone()
            if row:
                task = Task(
                    id=row[0],
                    type=TaskType(row[1]),
                    status=TaskStatus(row[2]),
                    description=row[3],
                    data=json.loads(row[4]),
                    created_at=row[5],
                    updated_at=row[6],
                    parent_task_id=row[7],
                    result=json.loads(row[8]) if row[8] else None,
                    error=row[9],
                    progress=row[10]
                )
                # Cache in memory for future access
                self.active_tasks[task_id] = task
                return task
        
        return None

    def get_tasks_by_status(self, status: TaskStatus) -> List[Task]:
        """Get all tasks with specific status."""
        tasks = []
        
        # Check memory first
        for task in self.active_tasks.values():
            if task.status == status:
                tasks.append(task)
        
        # Also check database for tasks not in memory
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, type, status, description, data, created_at, updated_at, 
                       parent_task_id, result, error, progress
                FROM tasks WHERE status = ? AND id NOT IN ({})
            '''.format(','.join(['?' for _ in self.active_tasks.keys()])), 
            [status.value] + list(self.active_tasks.keys()))
            
            for row in cursor.fetchall():
                task = Task(
                    id=row[0],
                    type=TaskType(row[1]),
                    status=TaskStatus(row[2]),
                    description=row[3],
                    data=json.loads(row[4]),
                    created_at=row[5],
                    updated_at=row[6],
                    parent_task_id=row[7],
                    result=json.loads(row[8]) if row[8] else None,
                    error=row[9],
                    progress=row[10]
                )
                # Cache in memory
                self.active_tasks[task.id] = task
                tasks.append(task)
        
        return tasks

    def save_memory(self, task_id: str, context: Dict[str, Any]):
        """Save context to agent memory."""
        now = datetime.now().isoformat()
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO agent_memory (task_id, context, created_at, updated_at)
                VALUES (?, ?, ?, ?)
            ''', (task_id, json.dumps(context), now, now))
            conn.commit()

    def get_memory(self, task_id: str) -> List[Dict[str, Any]]:
        """Get memory context for a task."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT context, created_at FROM agent_memory 
                WHERE task_id = ? 
                ORDER BY created_at DESC
            ''', (task_id,))
            
            results = []
            for row in cursor.fetchall():
                results.append({
                    'context': json.loads(row[0]),
                    'created_at': row[1]
                })
            return results

    def generate_playlist_name(self, user_request: str, genre: str, bpm_range: Tuple[int, int]) -> str:
        """Generate an intelligent playlist name using Gemini AI."""
        try:
            prompt = f"""
            Generate a creative and professional playlist name for a DJ mix based on these criteria:
            - User request: "{user_request}"
            - Genre: {genre}
            - BPM range: {bpm_range[0]}-{bpm_range[1]}
            
            The name should be:
            - Catchy and memorable
            - Professional sounding
            - 2-6 words maximum
            - Include genre or style reference
            - Suitable for DJ use
            
            Return only the playlist name, no quotes or additional text.
            """
            
            response = self.model.generate_content(prompt)
            playlist_name = response.text.strip().strip('"').strip("'")
            
            # Fallback if AI fails
            if not playlist_name or len(playlist_name) > 50:
                playlist_name = f"{genre.title()} Mix {bpm_range[0]}-{bpm_range[1]} BPM"
            
            return playlist_name
            
        except Exception as e:
            print(f"Error generating playlist name: {e}")
            return f"{genre.title()} Mix {bpm_range[0]}-{bpm_range[1]} BPM"

    def generate_search_queries(self, user_request: str, genre: str, bpm_range: Tuple[int, int], 
                              current_songs: List[Dict[str, Any]]) -> List[str]:
        """Generate YouTube search queries using Gemini AI."""
        try:
            # Build context about current songs
            current_context = ""
            if current_songs:
                current_context = f"Current songs in playlist: {len(current_songs)} songs"
                if current_songs:
                    last_song = current_songs[-1]
                    current_context += f", last song: {last_song.get('title', 'Unknown')} by {last_song.get('artist', 'Unknown')}"
            
            prompt = f"""
            Generate 5 specific YouTube search queries for finding songs that would fit in a DJ playlist with these criteria:
            
            User request: "{user_request}"
            Genre: {genre}
            BPM range: {bpm_range[0]}-{bpm_range[1]}
            {current_context}
            
            Requirements:
            - Each query should be 2-4 words maximum
            - Focus on popular, well-known songs
            - Include genre-specific terms
            - Consider BPM-appropriate styles
            - Make queries that would return high-quality, DJ-friendly tracks
            - Avoid overly specific or obscure terms
            
            Return only the 5 search queries, one per line, no numbering or additional text.
            """
            
            response = self.model.generate_content(prompt)
            queries = [q.strip() for q in response.text.strip().split('\n') if q.strip()]
            
            # Fallback queries if AI fails
            if not queries or len(queries) < 3:
                queries = [
                    f"{genre} {bpm_range[0]} bpm",
                    f"{genre} remix",
                    f"{genre} mix",
                    f"{genre} dance",
                    f"{genre} club"
                ]
            
            return queries[:5]  # Ensure max 5 queries
            
        except Exception as e:
            print(f"Error generating search queries: {e}")
            return [
                f"{genre} {bpm_range[0]} bpm",
                f"{genre} remix",
                f"{genre} mix"
            ]

    def validate_harmonic_compatibility(self, new_song: Dict[str, Any], 
                                      existing_songs: List[Dict[str, Any]]) -> bool:
        """Validate if a song harmonically fits with existing playlist."""
        try:
            new_camelot = new_song.get('camelot_key')
            if not new_camelot or new_camelot == 'Unknown':
                return True  # Allow if no key detected
            
            if not existing_songs:
                return True  # First song is always valid
            
            # Get the last song's key for harmonic mixing
            last_song = existing_songs[-1]
            last_camelot = last_song.get('camelot_key')
            
            if not last_camelot or last_camelot == 'Unknown':
                return True  # Allow if last song has no key
            
            # Check if keys are compatible
            compatible_keys = self.compatible_keys.get(last_camelot, [])
            return new_camelot in compatible_keys
            
        except Exception as e:
            print(f"Error validating harmonic compatibility: {e}")
            return True  # Allow on error

    def validate_bpm_compatibility(self, new_song: Dict[str, Any], 
                                 bpm_range: Tuple[int, int]) -> bool:
        """Validate if a song's BPM fits the target range."""
        try:
            song_bpm = new_song.get('bpm', 0)
            if not song_bpm or song_bpm <= 0:
                return True  # Allow if no BPM detected
            
            return bpm_range[0] <= song_bpm <= bpm_range[1]
            
        except Exception as e:
            print(f"Error validating BPM compatibility: {e}")
            return True  # Allow on error

    def analyze_song_harmonics(self, file_path: str) -> Dict[str, Any]:
        """Analyze a song file for harmonic information."""
        try:
            analysis = self.music_analyzer.analyze_audio_file(file_path)
            
            # Extract key information
            key = analysis.get('key', 'Unknown')
            scale = analysis.get('scale', 'Unknown')
            camelot_key = analysis.get('camelot_key', 'Unknown')
            bpm = analysis.get('bpm', 0)
            energy = analysis.get('energy_level', 0)
            
            return {
                'key': key,
                'scale': scale,
                'camelot_key': camelot_key,
                'bpm': bpm,
                'energy_level': energy,
                'analysis_success': True
            }
            
        except Exception as e:
            print(f"Error analyzing song harmonics: {e}")
            return {
                'key': 'Unknown',
                'scale': 'Unknown',
                'camelot_key': 'Unknown',
                'bpm': 0,
                'energy_level': 0,
                'analysis_success': False,
                'error': str(e)
            }

    def get_compatible_keys(self, camelot_key: str) -> List[str]:
        """Get harmonically compatible keys for a given Camelot key."""
        return self.compatible_keys.get(camelot_key, [])

    def pause_task(self, task_id: str):
        """Pause a running task."""
        self.update_task(task_id, status=TaskStatus.PAUSED)

    def resume_task(self, task_id: str):
        """Resume a paused task."""
        self.update_task(task_id, status=TaskStatus.IN_PROGRESS)

    def cancel_task(self, task_id: str):
        """Cancel a task."""
        self.update_task(task_id, status=TaskStatus.CANCELLED)

    def get_task_progress(self, task_id: str) -> Dict[str, Any]:
        """Get detailed progress information for a task."""
        task = self.get_task(task_id)
        if not task:
            return {'error': 'Task not found'}
        
        memory = self.get_memory(task_id)
        
        return {
            'task_id': task_id,
            'status': task.status.value,
            'progress': task.progress,
            'description': task.description,
            'created_at': task.created_at,
            'updated_at': task.updated_at,
            'result': task.result,
            'error': task.error,
            'memory_entries': len(memory)
        }
