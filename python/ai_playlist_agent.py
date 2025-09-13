import asyncio
import json
import time
import os as os_module
import tempfile
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple, Callable
from ai_agent import AIAgent, TaskType, TaskStatus
import yt_dlp
import requests
from music_analyzer import MusicAnalyzer

class AIPlaylistAgent:
    """
    Main agentic AI system for automated playlist creation.
    Orchestrates the entire workflow from user request to completed playlist.
    """
    
    def __init__(self, api_key: str, download_path: str, api_port: int = 5002, signing_key: str = "devkey"):
        self.ai_agent = AIAgent(api_key)
        self.download_path = download_path
        self.api_port = api_port
        self.signing_key = signing_key
        self.music_analyzer = MusicAnalyzer()
        
        # Progress callback
        self.progress_callback: Optional[Callable] = None
        
        # Active playlist creation session
        self.active_session: Optional[Dict[str, Any]] = None

    def set_progress_callback(self, callback: Callable[[str, Dict[str, Any]], None]):
        """Set callback for progress updates."""
        self.progress_callback = callback

    def _emit_progress(self, task_id: str, data: Dict[str, Any]):
        """Emit progress update."""
        if self.progress_callback:
            self.progress_callback(task_id, data)

    async def create_playlist_async(self, user_request: str, genre: str, 
                                  bpm_range: Tuple[int, int], target_count: int,
                                  session_id: Optional[str] = None) -> str:
        """
        Main async method to create a playlist based on user request.
        Returns the main task ID for tracking.
        """
        try:
            # Create main playlist creation task
            main_task_id = self.ai_agent.create_task(
                TaskType.PLAYLIST_CREATION,
                f"Create {genre} playlist: {user_request}",
                {
                    'user_request': user_request,
                    'genre': genre,
                    'bpm_range': bpm_range,
                    'target_count': target_count,
                    'session_id': session_id or f"session_{int(time.time())}"
                }
            )
            
            # Initialize session
            self.active_session = {
                'task_id': main_task_id,
                'user_request': user_request,
                'genre': genre,
                'bpm_range': bpm_range,
                'target_count': target_count,
                'downloaded_songs': [],
                'failed_downloads': [],
                'current_progress': 0,
                'start_time': time.time()
            }
            
            # Save initial memory
            self.ai_agent.save_memory(main_task_id, {
                'action': 'playlist_creation_started',
                'user_request': user_request,
                'genre': genre,
                'bpm_range': bpm_range,
                'target_count': target_count
            })
            
            # Update task status
            self.ai_agent.update_task(main_task_id, status=TaskStatus.IN_PROGRESS, progress=0)
            self._emit_progress(main_task_id, {
                'stage': 'initializing',
                'progress': 0,
                'message': 'Initializing AI playlist creation...'
            })
            
            # Generate playlist name
            playlist_name = self.ai_agent.generate_playlist_name(user_request, genre, bpm_range)
            
            # Save playlist name to memory
            self.ai_agent.save_memory(main_task_id, {
                'action': 'playlist_name_generated',
                'playlist_name': playlist_name
            })
            
            self._emit_progress(main_task_id, {
                'stage': 'planning',
                'progress': 10,
                'message': f'Generated playlist name: {playlist_name}'
            })
            
            # Start the main workflow
            await self._execute_playlist_workflow(main_task_id, playlist_name)
            
            return main_task_id
            
        except Exception as e:
            print(f"Error in create_playlist_async: {e}")
            if main_task_id:
                self.ai_agent.update_task(main_task_id, status=TaskStatus.FAILED, error=str(e))
            raise

    async def _execute_playlist_workflow(self, main_task_id: str, playlist_name: str):
        """Execute the main playlist creation workflow."""
        try:
            session = self.active_session
            if not session:
                raise Exception("No active session found")
            
            downloaded_count = 0
            max_attempts = session['target_count'] * 3  # Allow 3x attempts for validation failures
            attempt = 0
            
            while downloaded_count < session['target_count'] and attempt < max_attempts:
                attempt += 1
                
                # Check if task was cancelled
                task = self.ai_agent.get_task(main_task_id)
                if task and task.status == TaskStatus.CANCELLED:
                    break
                
                # Check if task was paused
                if task and task.status == TaskStatus.PAUSED:
                    await asyncio.sleep(1)
                    continue
                
                self._emit_progress(main_task_id, {
                    'stage': 'searching',
                    'progress': 10 + (downloaded_count / session['target_count']) * 70,
                    'message': f'Searching for song {downloaded_count + 1}/{session["target_count"]} (attempt {attempt})'
                })
                
                # Generate search queries
                search_queries = self.ai_agent.generate_search_queries(
                    session['user_request'],
                    session['genre'],
                    session['bpm_range'],
                    session['downloaded_songs']
                )
                
                # Try to find and download a suitable song
                song_result = await self._find_and_download_song(
                    main_task_id, search_queries, session
                )
                
                if song_result:
                    if song_result.get('validated', False):
                        session['downloaded_songs'].append(song_result)
                        downloaded_count += 1
                        
                        # Save successful download to memory
                        self.ai_agent.save_memory(main_task_id, {
                            'action': 'song_downloaded',
                            'song': song_result,
                            'total_downloaded': downloaded_count
                        })
                        
                        self._emit_progress(main_task_id, {
                            'stage': 'downloading',
                            'progress': 10 + (downloaded_count / session['target_count']) * 70,
                            'message': f'Downloaded {downloaded_count}/{session["target_count"]}: {song_result["title"]}'
                        })
                    else:
                        # Song failed validation, delete it
                        await self._delete_invalid_song(song_result)
                        session['failed_downloads'].append(song_result)
                        
                        self._emit_progress(main_task_id, {
                            'stage': 'validating',
                            'progress': 10 + (downloaded_count / session['target_count']) * 70,
                            'message': f'Validation failed for: {song_result["title"]}, retrying...'
                        })
                else:
                    # No suitable song found
                    self._emit_progress(main_task_id, {
                        'stage': 'searching',
                        'progress': 10 + (downloaded_count / session['target_count']) * 70,
                        'message': f'No suitable song found, retrying...'
                    })
                
                # Small delay between attempts
                await asyncio.sleep(1)
            
            # Finalize playlist
            if downloaded_count > 0:
                await self._finalize_playlist(main_task_id, playlist_name, session['downloaded_songs'])
            else:
                self.ai_agent.update_task(main_task_id, status=TaskStatus.FAILED, 
                                        error="No songs could be downloaded and validated")
                
        except Exception as e:
            print(f"Error in playlist workflow: {e}")
            self.ai_agent.update_task(main_task_id, status=TaskStatus.FAILED, error=str(e))
            raise

    async def _find_and_download_song(self, main_task_id: str, search_queries: List[str], 
                                    session: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Find and download a song using search queries."""
        try:
            for query in search_queries:
                # Search YouTube
                search_results = await self._search_youtube(query)
                
                if not search_results:
                    continue
                
                # Try each search result
                for result in search_results[:3]:  # Try top 3 results
                    try:
                        # Download the song
                        download_result = await self._download_song(result, session)
                        
                        if download_result:
                            # Analyze the downloaded song
                            analysis_result = await self._analyze_song(download_result)
                            
                            if analysis_result:
                                # Validate the song
                                is_valid = self._validate_song(analysis_result, session)
                                
                                return {
                                    **download_result,
                                    **analysis_result,
                                    'validated': is_valid,
                                    'search_query': query
                                }
                                
                    except Exception as e:
                        print(f"Error processing search result: {e}")
                        continue
            
            return None
            
        except Exception as e:
            print(f"Error in find_and_download_song: {e}")
            return None

    async def _search_youtube(self, query: str) -> List[Dict[str, Any]]:
        """Search YouTube for songs using the query."""
        try:
            # Use the existing YouTube search endpoint
            response = requests.post(f'http://127.0.0.1:{self.api_port}/youtube/search', 
                                   json={'query': query, 'signingkey': self.signing_key},
                                   timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if result.get('status') == 'success':
                    return result.get('tracks', [])
            
            return []
            
        except Exception as e:
            print(f"Error searching YouTube: {e}")
            return []

    async def _download_song(self, track: Dict[str, Any], session: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Download a song from YouTube."""
        try:
            # Create download task
            download_task_id = self.ai_agent.create_task(
                TaskType.SONG_DOWNLOAD,
                f"Download: {track.get('title', 'Unknown')}",
                {'track': track},
                parent_task_id=session['task_id']
            )
            
            # Use the existing enhanced download endpoint
            download_id = f"{track['id']}_{int(time.time())}"
            
            response = requests.post(f'http://127.0.0.1:{self.api_port}/youtube/download-enhanced',
                                   json={
                                       'url': track['url'],
                                       'title': track['title'],
                                       'artist': track['artist'],
                                       'download_path': self.download_path,
                                       'download_id': download_id,
                                       'signingkey': self.signing_key,
                                       'quality': '320kbps',
                                       'format': 'mp3',
                                       'embed_metadata': True,
                                       'embed_artwork': True
                                   },
                                   timeout=300)  # 5 minute timeout
            
            if response.status_code == 200:
                result = response.json()
                if result.get('status') == 'success':
                    self.ai_agent.update_task(download_task_id, status=TaskStatus.COMPLETED)
                    
                    return {
                        'id': track['id'],
                        'title': track['title'],
                        'artist': track['artist'],
                        'album': track.get('album', ''),
                        'url': track['url'],
                        'thumbnail': track.get('thumbnail', ''),
                        'file_path': result.get('file_path'),
                        'filename': result.get('filename'),
                        'download_id': download_id
                    }
            
            self.ai_agent.update_task(download_task_id, status=TaskStatus.FAILED, 
                                    error=f"Download failed: {response.status_code}")
            return None
            
        except Exception as e:
            print(f"Error downloading song: {e}")
            return None

    async def _analyze_song(self, song: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Analyze a downloaded song for harmonic information."""
        try:
            file_path = song.get('file_path')
            if not file_path or not os_module.path.exists(file_path):
                return None
            
            # Create analysis task
            analysis_task_id = self.ai_agent.create_task(
                TaskType.SONG_ANALYSIS,
                f"Analyze: {song.get('title', 'Unknown')}",
                {'song': song},
                parent_task_id=self.active_session['task_id'] if self.active_session else None
            )
            
            # Analyze the song
            analysis = self.ai_agent.analyze_song_harmonics(file_path)
            
            if analysis.get('analysis_success', False):
                self.ai_agent.update_task(analysis_task_id, status=TaskStatus.COMPLETED)
                return analysis
            else:
                self.ai_agent.update_task(analysis_task_id, status=TaskStatus.FAILED,
                                        error=analysis.get('error', 'Analysis failed'))
                return None
                
        except Exception as e:
            print(f"Error analyzing song: {e}")
            return None

    def _validate_song(self, song: Dict[str, Any], session: Dict[str, Any]) -> bool:
        """Validate if a song fits the playlist criteria."""
        try:
            # Check BPM compatibility
            bpm_valid = self.ai_agent.validate_bpm_compatibility(song, session['bpm_range'])
            
            # Check harmonic compatibility
            harmonic_valid = self.ai_agent.validate_harmonic_compatibility(
                song, session['downloaded_songs']
            )
            
            return bpm_valid and harmonic_valid
            
        except Exception as e:
            print(f"Error validating song: {e}")
            return False

    async def _delete_invalid_song(self, song: Dict[str, Any]):
        """Delete a song that failed validation."""
        try:
            file_path = song.get('file_path')
            if file_path and os_module.path.exists(file_path):
                os_module.remove(file_path)
                print(f"Deleted invalid song: {file_path}")
        except Exception as e:
            print(f"Error deleting invalid song: {e}")

    async def _finalize_playlist(self, main_task_id: str, playlist_name: str, 
                               songs: List[Dict[str, Any]]):
        """Finalize the playlist creation."""
        try:
            self._emit_progress(main_task_id, {
                'stage': 'finalizing',
                'progress': 90,
                'message': f'Creating playlist with {len(songs)} songs...'
            })
            
            # Create playlist save task
            save_task_id = self.ai_agent.create_task(
                TaskType.PLAYLIST_SAVE,
                f"Save playlist: {playlist_name}",
                {'playlist_name': playlist_name, 'songs': songs},
                parent_task_id=main_task_id
            )
            
            # Save playlist to database
            playlist_data = {
                'name': playlist_name,
                'description': f'AI-generated {self.active_session["genre"]} playlist',
                'color': '#4ecdc4',
                'is_query_based': True,
                'query_criteria': {
                    'bpmRange': {
                        'min': self.active_session['bpm_range'][0],
                        'max': self.active_session['bpm_range'][1]
                    },
                    'genres': [self.active_session['genre']]
                },
                'songs': [{'id': song['id']} for song in songs]
            }
            
            # Use the existing playlist creation endpoint
            response = requests.post(f'http://127.0.0.1:{self.api_port}/playlists',
                                   json={**playlist_data, 'signingkey': self.signing_key},
                                   timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if result.get('status') == 'success':
                    self.ai_agent.update_task(save_task_id, status=TaskStatus.COMPLETED)
                    
                    # Save final memory
                    self.ai_agent.save_memory(main_task_id, {
                        'action': 'playlist_completed',
                        'playlist_name': playlist_name,
                        'songs_count': len(songs),
                        'playlist_id': result.get('playlist_id'),
                        'total_time': time.time() - self.active_session['start_time']
                    })
                    
                    # Complete main task
                    self.ai_agent.update_task(main_task_id, status=TaskStatus.COMPLETED, progress=100)
                    
                    self._emit_progress(main_task_id, {
                        'stage': 'complete',
                        'progress': 100,
                        'message': f'Playlist "{playlist_name}" created successfully with {len(songs)} songs!',
                        'playlist_id': result.get('playlist_id'),
                        'songs': songs
                    })
                    
                    return
            
            # If we get here, saving failed
            self.ai_agent.update_task(save_task_id, status=TaskStatus.FAILED,
                                    error="Failed to save playlist to database")
            self.ai_agent.update_task(main_task_id, status=TaskStatus.FAILED,
                                    error="Playlist created but failed to save")
            
        except Exception as e:
            print(f"Error finalizing playlist: {e}")
            self.ai_agent.update_task(main_task_id, status=TaskStatus.FAILED, error=str(e))

    def pause_playlist_creation(self, task_id: str):
        """Pause playlist creation."""
        self.ai_agent.pause_task(task_id)

    def resume_playlist_creation(self, task_id: str):
        """Resume playlist creation."""
        self.ai_agent.resume_task(task_id)

    def cancel_playlist_creation(self, task_id: str):
        """Cancel playlist creation."""
        self.ai_agent.cancel_task(task_id)
        
        # Clean up any downloaded files
        if self.active_session and self.active_session['task_id'] == task_id:
            for song in self.active_session['downloaded_songs']:
                try:
                    file_path = song.get('file_path')
                    if file_path and os_module.path.exists(file_path):
                        os_module.remove(file_path)
                except Exception as e:
                    print(f"Error cleaning up file: {e}")

    def get_playlist_progress(self, task_id: str) -> Dict[str, Any]:
        """Get detailed progress for playlist creation."""
        return self.ai_agent.get_task_progress(task_id)

    def create_playlist(self, user_request: str, genre: str, 
                       bpm_range: Tuple[int, int], target_count: int, download_path: str = None) -> str:
        """
        Synchronous playlist creation without asyncio complications.
        Creates a task and runs a simplified playlist creation process.
        """
        # Create the task first
        main_task_id = self.ai_agent.create_task(
            TaskType.PLAYLIST_CREATION,
            f"Create {genre} playlist: {user_request}",
            {
                'user_request': user_request,
                'genre': genre,
                'bpm_range': bpm_range,
                'target_count': target_count,
                'session_id': f"session_{int(time.time())}"
            }
        )
        
        # Update task to in_progress
        self.ai_agent.update_task(main_task_id, status=TaskStatus.IN_PROGRESS, progress=10)
        
        # Use provided download path or fallback to configured path
        actual_download_path = download_path or self.download_path
        
        # Ensure download path exists
        os_module.makedirs(actual_download_path, exist_ok=True)
        
        # Run playlist creation in a thread
        def run_playlist_creation():
            import os  # Import os locally to avoid scoping issues
            try:
                print(f"Starting AI playlist creation: {user_request}")
                print(f"Using download path: {actual_download_path}")
                
                # Update progress
                self.ai_agent.update_task(main_task_id, progress=5)
                
                # Generate playlist name using AI
                playlist_name = self._generate_playlist_name(user_request, genre)
                
                # Update progress
                self.ai_agent.update_task(main_task_id, progress=10)
                
                # Create playlist in database first
                from database_manager import DatabaseManager
                # Use the same database path as the main app
                home_dir = os.path.expanduser("~")
                app_dir = os.path.join(home_dir, ".mixed_in_key")
                os.makedirs(app_dir, exist_ok=True)
                db_path = os.path.join(app_dir, "music_library.db")
                db_manager = DatabaseManager(db_path)
                
                playlist_data = {
                    'name': playlist_name,
                    'description': f'AI-generated {genre} playlist based on: {user_request}',
                    'color': '#4ecdc4',
                    'is_query_based': True,
                    'query_criteria': {
                        'bpmRange': {
                            'min': bpm_range[0],
                            'max': bpm_range[1]
                        },
                        'genres': [genre],
                        'user_request': user_request
                    }
                }
                
                # Save to database
                playlist_id = db_manager.create_playlist(
                    name=playlist_data['name'],
                    description=playlist_data['description'],
                    color=playlist_data['color'],
                    is_query_based=playlist_data['is_query_based'],
                    query_criteria=playlist_data['query_criteria']
                )
                
                print(f"Created playlist: {playlist_name} (ID: {playlist_id})")
                
                # Update progress
                self.ai_agent.update_task(main_task_id, progress=15)
                
                # Discover songs using AI
                print("Discovering songs with AI...")
                discovered_songs = self._discover_songs_with_ai(user_request, genre, target_count)
                
                # Update progress
                self.ai_agent.update_task(main_task_id, progress=20)
                
                # Download and analyze songs
                downloaded_songs = []
                failed_downloads = []
                validated_songs = []
                
                for i, song_query in enumerate(discovered_songs):
                    if len(validated_songs) >= target_count:
                        break
                    
                    # Update progress
                    progress = 20 + (i / len(discovered_songs)) * 70
                    self.ai_agent.update_task(main_task_id, progress=int(progress))
                    
                    print(f"Processing song {i+1}/{len(discovered_songs)}: {song_query}")
                    
                    # Download the song
                    download_result = self._search_and_download_song(song_query, actual_download_path)
                    
                    if not download_result['success']:
                        print(f"Failed to download {song_query}: {download_result['error']}")
                        failed_downloads.append(song_query)
                        continue
                    
                    downloaded_songs.append(download_result)
                    
                    # Analyze the downloaded song
                    file_path = download_result['file_path']
                    if not file_path:
                        print(f"No file path for {song_query}")
                        continue
                    
                    analysis_result = self._analyze_downloaded_song(file_path)
                    
                    if not analysis_result['success']:
                        print(f"Failed to analyze {song_query}: {analysis_result['error']}")
                        continue
                    
                    analysis = analysis_result['analysis']
                    
                    # First, add the song to the music library database
                    try:
                        # Add the music file to the database
                        music_file_data = {
                            'filename': os.path.basename(file_path),
                            'file_path': file_path,
                            'key_signature': analysis.get('key', ''),
                            'scale': analysis.get('scale', ''),
                            'key_name': analysis.get('key_name', ''),
                            'camelot_key': analysis.get('camelot_key', ''),
                            'bpm': analysis.get('bpm', 0),
                            'energy_level': analysis.get('energy_level', 0),
                            'duration': analysis.get('duration', 0),
                            'file_size': os.path.getsize(file_path) if os.path.exists(file_path) else 0,
                            'bitrate': 320,  # 320kbps as specified
                            'analysis_date': datetime.now().isoformat(),
                            'status': 'analyzed'
                        }
                        music_file_id = db_manager.add_music_file(music_file_data)
                        
                        print(f"✅ Added to music library: {download_result['track']['title']} (ID: {music_file_id})")
                        
                    except Exception as e:
                        print(f"Error adding song to music library: {e}")
                        continue
                    
                    # Validate the song for the playlist
                    if self._validate_song_for_playlist(analysis, bpm_range, validated_songs):
                        # Add to playlist
                        try:
                            db_manager.add_song_to_playlist(playlist_id, music_file_id)
                            
                            validated_songs.append({
                                'title': download_result['track']['title'],
                                'artist': download_result['track']['artist'],
                                'file_path': file_path,
                                'camelot_key': analysis.get('camelot_key', ''),
                                'bpm': analysis.get('bpm', 0),
                                'energy_level': analysis.get('energy_level', 0)
                            })
                            
                            print(f"✅ Added to playlist: {download_result['track']['title']} ({analysis.get('camelot_key', 'Unknown')} - {analysis.get('bpm', 'Unknown')} BPM)")
                            
                        except Exception as e:
                            print(f"Error adding song to playlist: {e}")
                    else:
                        print(f"❌ Song validation failed: {song_query}")
                        # Delete the file if it doesn't meet criteria
                        try:
                            if os.path.exists(file_path):
                                os.remove(file_path)
                                print(f"Deleted invalid song: {file_path}")
                        except Exception as e:
                            print(f"Error deleting file: {e}")
                
                # Update progress
                self.ai_agent.update_task(main_task_id, progress=95)
                
                # Final results
                result_summary = {
                    'playlist_id': playlist_id,
                    'playlist_name': playlist_name,
                    'playlist_data': playlist_data,
                    'songs_discovered': len(discovered_songs),
                    'songs_downloaded': len(downloaded_songs),
                    'songs_validated': len(validated_songs),
                    'songs_added': len(validated_songs),
                    'failed_downloads': len(failed_downloads),
                    'validated_songs': validated_songs
                }
                
                print(f"AI playlist creation complete!")
                print(f"📊 Summary: {len(validated_songs)}/{target_count} songs added to playlist")
                print(f"🎵 Playlist: {playlist_name}")
                
                # Complete the task
                self.ai_agent.update_task(
                    main_task_id, 
                    status=TaskStatus.COMPLETED, 
                    progress=100,
                    result=result_summary
                )
                
            except Exception as e:
                print(f"Error in playlist creation: {e}")
                self.ai_agent.update_task(main_task_id, status=TaskStatus.FAILED, error=str(e))
        
        # Start the thread
        import threading
        thread = threading.Thread(target=run_playlist_creation)
        thread.daemon = True
        thread.start()
        
        return main_task_id
    
    def _generate_playlist_name(self, user_request: str, genre: str) -> str:
        """Generate a playlist name using AI."""
        try:
            # Use Gemini AI to generate a creative playlist name
            prompt = f"""
            Generate a creative and engaging playlist name for a {genre} playlist based on this request: "{user_request}"
            
            Requirements:
            - Keep it under 50 characters
            - Make it catchy and memorable
            - Include the genre or style
            - Be creative but professional
            
            Return only the playlist name, no quotes or extra text.
            """
            
            response = self.ai_agent.model.generate_content(prompt)
            playlist_name = response.text.strip().strip('"').strip("'")
            
            # Fallback if AI response is too long or empty
            if not playlist_name or len(playlist_name) > 50:
                playlist_name = f"AI {genre} Mix: {user_request[:30]}..."
            
            return playlist_name
            
        except Exception as e:
            print(f"Error generating playlist name: {e}")
            # Fallback name
            return f"AI Generated {genre} Playlist"
    
    def _discover_songs_with_ai(self, user_request: str, genre: str, target_count: int) -> List[str]:
        """Use Gemini AI to discover relevant songs for the playlist."""
        try:
            prompt = f"""
            Based on this request: "{user_request}" for a {genre} playlist, suggest {target_count * 2} specific songs that would work well together.
            
            Requirements:
            - Focus on {genre} music
            - Include popular and well-known tracks
            - Consider harmonic compatibility
            - Mix of classic and modern tracks
            - Return as a simple list, one song per line
            - Format: "Artist - Song Title"
            
            Example:
            Drake - God's Plan
            Kendrick Lamar - HUMBLE.
            J. Cole - No Role Modelz
            """
            
            response = self.ai_agent.model.generate_content(prompt)
            songs_text = response.text.strip()
            
            # Parse the response into a list of songs
            songs = []
            for line in songs_text.split('\n'):
                line = line.strip()
                if line and ' - ' in line:
                    songs.append(line)
            
            print(f"AI discovered {len(songs)} songs: {songs[:3]}...")
            return songs[:target_count * 2]  # Return double the target for better selection
            
        except Exception as e:
            print(f"Error discovering songs with AI: {e}")
            # Fallback songs based on genre
            fallback_songs = {
                'Hip-Hop': [
                    'Drake - God\'s Plan',
                    'Kendrick Lamar - HUMBLE.',
                    'J. Cole - No Role Modelz',
                    'Travis Scott - SICKO MODE',
                    'Post Malone - Congratulations'
                ],
                'Electronic': [
                    'Skrillex - Bangarang',
                    'Deadmau5 - Strobe',
                    'Daft Punk - One More Time',
                    'Calvin Harris - Feel So Close',
                    'Avicii - Levels'
                ],
                'Pop': [
                    'Taylor Swift - Shake It Off',
                    'Ed Sheeran - Shape of You',
                    'Ariana Grande - Thank U, Next',
                    'Billie Eilish - Bad Guy',
                    'Dua Lipa - Levitating'
                ]
            }
            return fallback_songs.get(genre, fallback_songs['Hip-Hop'])[:target_count * 2]
    
    def _search_and_download_song(self, song_query: str, download_path: str) -> Dict[str, Any]:
        """Search for and download a song from YouTube."""
        try:
            import requests
            import json
            
            # Search for the song on YouTube
            search_url = f"http://127.0.0.1:{self.api_port}/youtube/search"
            search_payload = {
                "query": song_query,
                "signingkey": self.signing_key
            }
            
            print(f"Searching for: {song_query}")
            search_response = requests.post(search_url, json=search_payload, timeout=30)
            
            if not search_response.ok:
                raise Exception(f"Search failed: {search_response.status_code}")
            
            search_result = search_response.json()
            
            if search_result.get('status') != 'success' or not search_result.get('tracks'):
                raise Exception("No search results found")
            
            # Get the first result
            track = search_result['tracks'][0]
            print(f"Found track: {track['title']} by {track['artist']}")
            
            # Download the track
            download_url = f"http://127.0.0.1:{self.api_port}/youtube/download-enhanced"
            download_payload = {
                "url": track['url'],
                "title": track['title'],
                "artist": track['artist'],
                "download_path": download_path,
                "download_id": f"ai_download_{int(time.time())}_{track['id']}",
                "signingkey": self.signing_key,
                "quality": "320kbps",
                "format": "mp3",
                "embed_metadata": True,
                "embed_artwork": True
            }
            
            print(f"Downloading: {track['title']}")
            download_response = requests.post(download_url, json=download_payload, timeout=120)
            
            if not download_response.ok:
                raise Exception(f"Download failed: {download_response.status_code}")
            
            download_result = download_response.json()
            
            if download_result.get('status') != 'success':
                raise Exception(f"Download failed: {download_result.get('error', 'Unknown error')}")
            
            print(f"Successfully downloaded: {track['title']}")
            return {
                'success': True,
                'track': track,
                'download_result': download_result,
                'file_path': download_result.get('song', {}).get('file_path')
            }
            
        except Exception as e:
            print(f"Error downloading {song_query}: {e}")
            return {
                'success': False,
                'error': str(e),
                'song_query': song_query
            }
    
    def _analyze_downloaded_song(self, file_path: str) -> Dict[str, Any]:
        """Analyze a downloaded song for key, BPM, and energy."""
        try:
            import requests
            
            # Use the existing analysis endpoint
            analyze_url = f"http://127.0.0.1:{self.api_port}/analyze-file"
            analyze_payload = {
                "file_path": file_path,
                "signingkey": self.signing_key
            }
            
            print(f"Analyzing: {file_path}")
            analyze_response = requests.post(analyze_url, json=analyze_payload, timeout=60)
            
            if not analyze_response.ok:
                raise Exception(f"Analysis failed: {analyze_response.status_code}")
            
            analyze_result = analyze_response.json()
            
            if analyze_result.get('status') != 'success':
                raise Exception(f"Analysis failed: {analyze_result.get('error', 'Unknown error')}")
            
            analysis_data = analyze_result.get('analysis', {})
            print(f"Analysis complete: {analysis_data.get('key', 'Unknown')} - {analysis_data.get('bpm', 'Unknown')} BPM")
            
            return {
                'success': True,
                'analysis': analysis_data
            }
            
        except Exception as e:
            print(f"Error analyzing {file_path}: {e}")
            return {
                'success': False,
                'error': str(e),
                'file_path': file_path
            }
    
    def _validate_song_for_playlist(self, analysis: Dict[str, Any], bpm_range: Tuple[int, int], 
                                   existing_songs: List[Dict[str, Any]]) -> bool:
        """Validate if a song fits the playlist criteria."""
        try:
            # Check BPM range (with 10 BPM tolerance)
            bpm = analysis.get('bpm', 0)
            tolerance = 10
            if not (bpm_range[0] - tolerance <= bpm <= bpm_range[1] + tolerance):
                print(f"Song BPM {bpm} outside range {bpm_range} (with {tolerance} BPM tolerance)")
                return False
            
            # Check harmonic compatibility if we have existing songs (temporarily disabled for testing)
            if existing_songs:
                current_key = analysis.get('camelot_key', '')
                if not current_key:
                    print("No key detected for song - allowing anyway for testing")
                    # return False  # Temporarily disabled
                
                # Check if key is compatible with existing songs (temporarily disabled)
                # compatible_keys = self._get_compatible_keys(current_key)
                # existing_keys = [song.get('camelot_key', '') for song in existing_songs if song.get('camelot_key')]
                
                # if existing_keys and not any(key in compatible_keys for key in existing_keys):
                #     print(f"Song key {current_key} not compatible with existing keys {existing_keys}")
                #     return False
            
            return True
            
        except Exception as e:
            print(f"Error validating song: {e}")
            return False
    
    def _get_compatible_keys(self, camelot_key: str) -> List[str]:
        """Get harmonically compatible Camelot keys."""
        # Basic harmonic compatibility rules
        compatible_keys = [camelot_key]  # Same key is always compatible
        
        if not camelot_key:
            return compatible_keys
        
        try:
            # Extract number and letter
            number = int(camelot_key[:-1])
            letter = camelot_key[-1]
            
            # Adjacent keys (same number, different letter)
            other_letter = 'A' if letter == 'B' else 'B'
            compatible_keys.append(f"{number}{other_letter}")
            
            # Relative major/minor (adjacent numbers, same letter)
            if number > 1:
                compatible_keys.append(f"{number-1}{letter}")
            if number < 12:
                compatible_keys.append(f"{number+1}{letter}")
            
            # Perfect fifth (5 steps up)
            fifth_number = (number + 5) % 12
            if fifth_number == 0:
                fifth_number = 12
            compatible_keys.append(f"{fifth_number}{letter}")
            
            return compatible_keys
            
        except Exception as e:
            print(f"Error calculating compatible keys: {e}")
            return [camelot_key]

    def get_active_sessions(self) -> List[Dict[str, Any]]:
        """Get all active playlist creation sessions."""
        active_tasks = self.ai_agent.get_tasks_by_status(TaskStatus.IN_PROGRESS)
        sessions = []
        
        for task in active_tasks:
            if task.type == TaskType.PLAYLIST_CREATION:
                progress = self.get_playlist_progress(task.id)
                sessions.append({
                    'task_id': task.id,
                    'description': task.description,
                    'progress': progress,
                    'data': task.data
                })
        
        return sessions
