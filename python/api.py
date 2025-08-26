from flask import Flask, request, jsonify, send_file
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from graphene import ObjectType, String, Schema, Field, List, Mutation
from flask_graphql import GraphQLView
from calc import calc as real_calc
from music_analyzer import MusicAnalyzer, analyze_music_file
from database_manager import DatabaseManager
import argparse
import os
import json
import tempfile
import base64
from urllib.parse import unquote
import ytmusicapi
from pytube import YouTube
import yt_dlp
import subprocess
import shutil
import threading
import time

#
# Notes on setting up a flask GraphQL server
# https://codeburst.io/how-to-build-a-graphql-wrapper-for-a-restful-api-in-python-b49767676630
#
# Notes on using pyinstaller to package a flask server (discussing issues that don't come up
# in this simple example but likely would come up in a more real application)
# for making pyinstaller see https://mapopa.blogspot.com/2013/10/flask-and-pyinstaller-notice.html
# and https://github.com/pyinstaller/pyinstaller/issues/1071
# and https://elc.github.io/posts/executable-flask-pyinstaller/
#

class Query(ObjectType):

#
# IMPORTANT - There is currently nothing preventing a malicious web page
#             running in the users web browser from making requests of this
#             server. If you add additional code here you will need to make
#             sure its either code that is appropriate for a malicious web
#             page to be able to run (like the calculator example below) or
#             that you wrap some kind of security model around the python
#             web server before adding the code.
#

    awake = String(description="Awake")
    def resolve_awake(self, args):
        return "Awake"

    exit = String(description="Exit", signingkey=String(required=True))
    def resolve_exit(self, info, signingkey):
        if signingkey != apiSigningKey:
            return
        os._exit(0)
        return

    hello = String(description="Hello", signingkey=String(required=True))
    def resolve_hello(self, info, signingkey):
        if signingkey != apiSigningKey:
            return "invalid signature"
        return "World"
    
    calc = String(description="Calculator", signingkey=String(required=True), math=String(required=True))
    def resolve_calc(self, info, signingkey, math):
        """based on the input text, return the int result"""
        if signingkey != apiSigningKey:
            return "invalid signature"
        try:
            return real_calc(math)
        except Exception:
            return 0.0
    
    echo = String(description="Echo", signingkey=String(required=True), text=String(required=True))
    def resolve_echo(self, info, signingkey, text):
        if signingkey != apiSigningKey:
            return "invalid signature"
        """echo any text"""
        return text
    
    # Music Analysis Endpoints
    analyze_music = String(
        description="Analyze music file for key, BPM, and energy",
        signingkey=String(required=True),
        file_path=String(required=True)
    )
    def resolve_analyze_music(self, info, signingkey, file_path):
        if signingkey != apiSigningKey:
            return json.dumps({"error": "invalid signature"})
        
        try:
            # Analyze the music file
            analysis_result = analyze_music_file(file_path)
            return json.dumps(analysis_result)
        except Exception as e:
            return json.dumps({
                "error": f"Analysis failed: {str(e)}",
                "status": "error"
            })
    
    get_compatible_keys = String(
        description="Get harmonically compatible keys",
        signingkey=String(required=True),
        camelot_key=String(required=True)
    )
    def resolve_get_compatible_keys(self, info, signingkey, camelot_key):
        if signingkey != apiSigningKey:
            return json.dumps({"error": "invalid signature"})
        
        try:
            analyzer = MusicAnalyzer()
            compatible_keys = analyzer.get_compatible_keys(camelot_key)
            return json.dumps(compatible_keys)
        except Exception as e:
            return json.dumps({
                "error": f"Failed to get compatible keys: {str(e)}"
            })

view_func = GraphQLView.as_view("graphql", schema=Schema(query=Query), graphiql=True)

parser = argparse.ArgumentParser()
parser.add_argument("--apiport", type=int, default=5000)
parser.add_argument("--signingkey", type=str, default="")
args = parser.parse_args()

apiSigningKey = args.signingkey

# Initialize database manager
db_manager = DatabaseManager()

app = Flask(__name__)
app.add_url_rule("/graphql/", view_func=view_func)
app.add_url_rule("/graphiql/", view_func=view_func) # for compatibility with other samples
CORS(app) # Allows all domains to access the flask server via CORS

# REST endpoints for file upload and music analysis
@app.route('/upload-analyze', methods=['POST'])
def upload_and_analyze():
    """REST endpoint for uploading and analyzing music files."""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.form.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        # Check if file was uploaded
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        
        file = request.files['file']
        if not file.filename or file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Save uploaded file permanently for audio serving
        upload_dir = os.path.join(tempfile.gettempdir(), 'mixed_in_key_uploads')
        if not os.path.exists(upload_dir):
            os.makedirs(upload_dir)
        
        permanent_path = os.path.join(upload_dir, file.filename)
        file.save(permanent_path)
        
        # Store file path for audio serving
        uploaded_files[file.filename] = permanent_path
        
        try:
            # Analyze the uploaded file
            analysis_result = analyze_music_file(permanent_path)
            # Write tags and cue points to ID3
            try:
                analyzer = MusicAnalyzer()
                tag_result = analyzer.write_id3_tags(permanent_path, analysis_result)
                analysis_result['tag_write'] = tag_result
            except Exception as _e:
                pass
            
            # Add file path to result for audio serving
            analysis_result['file_path'] = permanent_path
            analysis_result['filename'] = file.filename
            
            # Save to database
            try:
                file_data = {
                    'filename': file.filename,
                    'file_path': permanent_path,
                    'file_size': analysis_result.get('file_size', 0),
                    'key': analysis_result.get('key', ''),
                    'scale': analysis_result.get('scale', ''),
                    'key_name': analysis_result.get('key_name', ''),
                    'camelot_key': analysis_result.get('camelot_key', ''),
                    'bpm': analysis_result.get('bpm', 0.0),
                    'energy_level': analysis_result.get('energy_level', 0.0),
                    'duration': analysis_result.get('duration', 0.0),
                    'cue_points': analysis_result.get('cue_points', []),
                    'status': 'found'
                }
                db_id = db_manager.add_music_file(file_data)
                analysis_result['db_id'] = db_id
                print(f"Saved file to database with ID: {db_id}")
            except Exception as e:
                print(f"Failed to save to database: {str(e)}")
                # Continue without database save
            
            return jsonify(analysis_result)
            
        except Exception as e:
            # Keep file for potential retry but log the error
            print(f"Analysis failed for {file.filename}: {str(e)}")
            return jsonify({
                "error": f"Analysis failed: {str(e)}",
                "status": "error",
                "filename": file.filename,
                "file_path": permanent_path
            }), 500
            
    except Exception as e:
        return jsonify({
            "error": f"Upload and analysis failed: {str(e)}",
            "status": "error"
        }), 500

@app.route('/analyze-file', methods=['POST'])
def analyze_existing_file():
    """REST endpoint for analyzing existing music files by path."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        data = request_json
        file_path = data.get('file_path')
        
        if not file_path:
            return jsonify({"error": "No file path provided"}), 400
        
        if not os.path.exists(file_path):
            return jsonify({"error": "File not found"}), 404
        
        # Analyze the file
        analysis_result = analyze_music_file(file_path)
        return jsonify(analysis_result)
        
    except Exception as e:
        return jsonify({
            "error": f"Analysis failed: {str(e)}",
            "status": "error"
        }), 500

@app.route('/compatible-keys', methods=['GET'])
def get_compatible_keys_rest():
    """REST endpoint for getting compatible keys."""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        camelot_key = request.args.get('camelot_key')
        
        if not camelot_key:
            return jsonify({"error": "No camelot_key provided"}), 400
        
        analyzer = MusicAnalyzer()
        compatible_keys = analyzer.get_compatible_keys(camelot_key)
        return jsonify(compatible_keys)
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to get compatible keys: {str(e)}"
        }), 500

# Store uploaded files for audio serving
uploaded_files = {}

# Database REST endpoints
@app.route('/library', methods=['GET'])
def get_library():
    """Get all music files from the database library."""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        status_filter = request.args.get('status')  # Optional filter by status
        files = db_manager.get_all_music_files(status_filter)
        
        # Convert database records to frontend format
        songs = []
        for file_record in files:
            song = {
                'id': str(file_record['id']),
                'filename': file_record['filename'],
                'file_path': file_record['file_path'],
                'key': file_record['key_signature'],
                'scale': file_record['scale'],
                'key_name': file_record['key_name'],
                'camelot_key': file_record['camelot_key'],
                'bpm': file_record['bpm'],
                'energy_level': file_record['energy_level'],
                'duration': file_record['duration'],
                'file_size': file_record['file_size'],
                'status': file_record['status'],
                'analysis_date': file_record['analysis_date'],
                'cue_points': json.loads(file_record['cue_points']) if file_record['cue_points'] else []
            }
            songs.append(song)
        
        return jsonify({
            'songs': songs,
            'total': len(songs),
            'status': 'success'
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to get library: {str(e)}",
            "status": "error"
        }), 500

@app.route('/library/stats', methods=['GET'])
def get_library_stats():
    """Get library statistics."""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        stats = db_manager.get_library_stats()
        return jsonify({
            'stats': stats,
            'status': 'success'
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to get stats: {str(e)}",
            "status": "error"
        }), 500

@app.route('/library/verify', methods=['POST'])
def verify_library():
    """Verify that all files in the library still exist."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        found_count, missing_count = db_manager.verify_file_locations()
        
        return jsonify({
            'found': found_count,
            'missing': missing_count,
            'total': found_count + missing_count,
            'status': 'success'
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to verify library: {str(e)}",
            "status": "error"
        }), 500

@app.route('/scan-locations', methods=['GET'])
def get_scan_locations():
    """Get remembered scan locations."""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        locations = db_manager.get_scan_locations()
        return jsonify({
            'locations': locations,
            'status': 'success'
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to get scan locations: {str(e)}",
            "status": "error"
        }), 500

@app.route('/scan-locations', methods=['POST'])
def add_scan_location():
    """Add a new scan location to remember."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        data = request_json
        path = data.get('path')
        name = data.get('name')
        
        if not path:
            return jsonify({"error": "No path provided"}), 400
        
        location_id = db_manager.add_scan_location(path, name)
        
        return jsonify({
            'location_id': location_id,
            'status': 'success'
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to add scan location: {str(e)}",
            "status": "error"
        }), 500

# YouTube Music Integration
# Global YouTube Music API instance
ytmusic = None

def initialize_ytmusic():
    """Initialize YouTube Music API"""
    global ytmusic
    try:
        ytmusic = ytmusicapi.YTMusic()
        print("✅ YouTube Music API initialized successfully")
        return True
    except Exception as e:
        print(f"❌ Failed to initialize YouTube Music API: {str(e)}")
        return False

# Initialize YouTube Music API on startup
initialize_ytmusic()

@app.route('/youtube/search', methods=['POST'])
def youtube_search():
    """Search YouTube Music for tracks."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        if not ytmusic:
            if not initialize_ytmusic():
                return jsonify({
                    "error": "YouTube Music API not available",
                    "status": "error"
                }), 500
        
        # Double-check ytmusic is still available after initialization attempt
        if not ytmusic:
            return jsonify({
                "error": "YouTube Music API initialization failed",
                "status": "error"
            }), 500
        
        query = request_json.get('query')
        if not query:
            return jsonify({"error": "No search query provided"}), 400
        
        # Search YouTube Music
        print(f"🔍 Searching YouTube Music for: {query}")
        search_results = ytmusic.search(query, filter='songs', limit=20)
        
        # Transform results to our format
        tracks = []
        for result in search_results:
            try:
                # Extract duration
                duration_text = result.get('duration', '')
                
                # Get thumbnail URL
                thumbnail_url = ''
                if result.get('thumbnails'):
                    thumbnail_url = result['thumbnails'][-1]['url']  # Get highest quality
                
                # Extract artist name
                artist_name = ''
                if result.get('artists') and len(result['artists']) > 0:
                    artist_name = result['artists'][0]['name']
                
                # Extract album name
                album_name = ''
                if result.get('album') and result['album'].get('name'):
                    album_name = result['album']['name']
                
                track = {
                    'id': result.get('videoId', ''),
                    'title': result.get('title', ''),
                    'artist': artist_name,
                    'album': album_name,
                    'duration': duration_text,
                    'thumbnail': thumbnail_url,
                    'url': f"https://music.youtube.com/watch?v={result.get('videoId', '')}"
                }
                
                if track['id'] and track['title']:  # Only add if we have essential data
                    tracks.append(track)
                    
            except Exception as e:
                print(f"Error processing search result: {str(e)}")
                continue
        
        print(f"✅ Found {len(tracks)} tracks for query: {query}")
        
        return jsonify({
            "tracks": tracks,
            "total": len(tracks),
            "status": "success"
        })
        
    except Exception as e:
        print(f"❌ YouTube search error: {str(e)}")
        return jsonify({
            "error": f"Search failed: {str(e)}",
            "status": "error"
        }), 500

# YouTube Download Helper Functions
def download_with_ytdlp(url, output_path, title, artist):
    """Download using yt-dlp (more reliable) - outputs 320kbps MP3 directly"""
    try:
        # Change output path to MP3 for direct download
        mp3_output_path = output_path.replace('.mp4', '.mp3')
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': mp3_output_path,
            'noplaylist': True,
            'extractaudio': True,
            'audioformat': 'mp3',
            'audioquality': '320',  # Force 320kbps
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '320',
            }],
            'quiet': False,
            'no_warnings': False,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f"🎵 yt-dlp downloading as 320kbps MP3: {url}")
            ydl.download([url])
            
        # Check if the MP3 file was created
        if os.path.exists(mp3_output_path):
            print(f"✅ Successfully downloaded 320kbps MP3: {mp3_output_path}")
            return mp3_output_path
        else:
            print(f"❌ MP3 file not found after download: {mp3_output_path}")
            return False
        
    except Exception as e:
        print(f"❌ yt-dlp download failed: {str(e)}")
        return False

def download_with_pytube(url, output_path, title, artist):
    """Fallback download using pytube - ensures 320kbps MP3 conversion"""
    try:
        print(f"🔍 Creating YouTube object with pytube...")
        yt = YouTube(url, use_oauth=False, allow_oauth_cache=False)
        
        # Get video info first to validate
        print(f"📹 Video title: {yt.title}")
        print(f"⏱️ Video length: {yt.length} seconds")
        
        if yt.length and yt.length > 1200:  # 20 minutes
            print(f"⚠️ Video too long: {yt.length} seconds")
            return False
        
        # Get the highest quality audio stream
        print(f"🎧 Getting audio streams...")
        audio_streams = yt.streams.filter(only_audio=True, file_extension='mp4')
        
        if not audio_streams:
            audio_streams = yt.streams.filter(only_audio=True)
        
        if not audio_streams:
            print(f"❌ No audio streams available")
            return False
        
        # Select best audio stream (highest bitrate available)
        audio_stream = audio_streams.order_by('abr').desc().first()
        
        if not audio_stream:
            print(f"❌ No suitable audio stream found")
            return False
        
        print(f"🎵 Selected stream: {audio_stream.abr} kbps")
        
        # Download to temporary MP4 file first
        temp_mp4_path = output_path.replace('.mp3', '_temp.mp4')
        temp_dir = os.path.dirname(temp_mp4_path)
        temp_filename = os.path.basename(temp_mp4_path)
        
        audio_stream.download(output_path=temp_dir, filename=temp_filename)
        
        if not os.path.exists(temp_mp4_path):
            print(f"❌ Failed to download temporary MP4 file")
            return False
        
        # Convert to 320kbps MP3 using pydub
        try:
            from pydub import AudioSegment
            
            print(f"🔄 Converting to 320kbps MP3...")
            audio = AudioSegment.from_file(temp_mp4_path, format="mp4")
            
            # Final MP3 path
            mp3_output_path = output_path.replace('.mp4', '.mp3')
            audio.export(mp3_output_path, format="mp3", bitrate="320k")
            
            # Clean up temporary MP4 file
            if os.path.exists(temp_mp4_path):
                os.remove(temp_mp4_path)
            
            if os.path.exists(mp3_output_path):
                print(f"✅ Successfully converted to 320kbps MP3: {mp3_output_path}")
                return mp3_output_path
            else:
                print(f"❌ MP3 conversion failed")
                return False
                
        except ImportError:
            print(f"⚠️ pydub not available, cannot convert to 320kbps MP3")
            # Move the MP4 file to final location as fallback
            final_path = output_path.replace('.mp4', '.mp3')
            try:
                shutil.move(temp_mp4_path, final_path)
                print(f"⚠️ Saved as MP4 format (conversion unavailable): {final_path}")
                return final_path
            except Exception as move_error:
                print(f"❌ Failed to move file: {str(move_error)}")
                return False
        
    except Exception as e:
        print(f"❌ pytube download failed: {str(e)}")
        return False

@app.route('/youtube/stream/<video_id>', methods=['GET'])
def stream_youtube_audio(video_id):
    """Stream YouTube audio for preview without downloading."""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        # Get stream URL using yt-dlp
        ydl_opts = {
            'format': 'bestaudio',
            'quiet': True,
            'no_warnings': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Check if info extraction was successful
            if not info:
                return jsonify({"error": "Could not extract video information"}), 404
            
            # Get the best audio format
            formats = info.get('formats', [])
            audio_formats = [f for f in formats if f.get('acodec') != 'none']
            
            if not audio_formats:
                return jsonify({"error": "No audio stream available"}), 404
            
            # Sort by quality and get the best one
            best_format = sorted(audio_formats, key=lambda x: x.get('abr', 0), reverse=True)[0]
            stream_url = best_format.get('url')
            
            if not stream_url:
                return jsonify({"error": "Could not extract stream URL"}), 500
            
            return jsonify({
                "stream_url": stream_url,
                "title": info.get('title', ''),
                "duration": info.get('duration', 0),
                "status": "success"
            })
            
    except Exception as e:
        print(f"❌ Streaming error: {str(e)}")
        return jsonify({
            "error": f"Failed to get stream: {str(e)}",
            "status": "error"
        }), 500

@app.route('/youtube/download', methods=['POST'])
def youtube_download():
    """Download a YouTube track and analyze it."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        url = request_json.get('url')
        title = request_json.get('title', 'Unknown Title')
        artist = request_json.get('artist', 'Unknown Artist')
        download_path = request_json.get('download_path')
        
        if not url:
            return jsonify({"error": "No URL provided"}), 400
            
        if not download_path:
            return jsonify({"error": "No download path provided"}), 400
        
        if not os.path.exists(download_path):
            return jsonify({"error": "Download path does not exist"}), 400
        
        print(f"🎵 Downloading: {title} by {artist}")
        print(f"📁 Download path: {download_path}")
        print(f"🔗 URL: {url}")
        
        # Create safe filename - ensure MP3 extension
        safe_title = "".join(c for c in f"{artist} - {title}" if c.isalnum() or c in (' ', '-', '_')).rstrip()
        if len(safe_title) > 200:  # Limit filename length
            safe_title = safe_title[:200]
        temp_filename = f"{safe_title}.mp4"  # Temporary filename for pytube fallback
        final_filename = f"{safe_title}.mp3"  # Final MP3 filename
        
        temp_path = os.path.join(tempfile.gettempdir(), temp_filename)
        final_path = os.path.join(download_path, final_filename)
        
        # Check if file already exists
        if os.path.exists(final_path):
            print(f"⚠️ File already exists: {final_path}")
            # Add timestamp to make unique
            import time
            timestamp = int(time.time())
            final_filename = f"{safe_title}_{timestamp}.mp3"
            final_path = os.path.join(download_path, final_filename)
        
        downloaded_file_path = None
        
        try:
            # Use yt-dlp first (more reliable) - downloads directly to final path as 320kbps MP3
            print(f"🔍 Attempting download with yt-dlp...")
            downloaded_file_path = download_with_ytdlp(url, final_path, title, artist)
            
            if not downloaded_file_path:
                print(f"🔄 yt-dlp failed, trying pytube fallback...")
                downloaded_file_path = download_with_pytube(url, temp_path, title, artist)
                
                # If pytube succeeded, move the file to final location
                if downloaded_file_path and downloaded_file_path != final_path:
                    try:
                        shutil.move(downloaded_file_path, final_path)
                        downloaded_file_path = final_path
                        print(f"📁 Moved file to final location: {final_path}")
                    except Exception as move_error:
                        print(f"❌ Failed to move file to final location: {str(move_error)}")
                        # Keep the file where it is
                        final_path = downloaded_file_path
                        final_filename = os.path.basename(final_path)
            
            if not downloaded_file_path:
                return jsonify({
                    "error": "All download methods failed. Video may be unavailable or restricted.",
                    "status": "error"
                }), 400
                
        except Exception as download_error:
            print(f"❌ Download exception: {str(download_error)}")
            return jsonify({
                "error": f"Download failed: {str(download_error)}",
                "status": "error"
            }), 500
        
        # At this point, we should have a 320kbps MP3 file
        # Verify the file exists and update paths
        if not os.path.exists(downloaded_file_path):
            return jsonify({
                "error": "Downloaded file not found after processing",
                "status": "error"
            }), 500
        
        # Update final paths to match the actual downloaded file
        final_path = downloaded_file_path
        final_filename = os.path.basename(final_path)
        
        print(f"✅ Successfully downloaded 320kbps MP3: {final_path}")
        
        # File is already downloaded as 320kbps MP3
        # Add to uploaded files for audio serving
        uploaded_files[final_filename] = final_path
        
        # Analyze the downloaded file
        print(f"🔍 Analyzing downloaded file...")
        try:
            analysis_result = analyze_music_file(final_path)
            
            # Add download metadata
            analysis_result['filename'] = final_filename
            analysis_result['file_path'] = final_path
            analysis_result['youtube_url'] = url
            analysis_result['youtube_title'] = title
            analysis_result['youtube_artist'] = artist
            analysis_result['bitrate'] = 320  # Downloaded at 320kbps
            
            # Write ID3 tags
            try:
                analyzer = MusicAnalyzer()
                tag_result = analyzer.write_id3_tags(final_path, analysis_result)
                analysis_result['tag_write'] = tag_result
            except Exception as e:
                print(f"Failed to write ID3 tags: {str(e)}")
            
            # Save to database
            try:
                file_data = {
                    'filename': final_filename,
                    'file_path': final_path,
                    'file_size': analysis_result.get('file_size', 0),
                    'key': analysis_result.get('key', ''),
                    'scale': analysis_result.get('scale', ''),
                    'key_name': analysis_result.get('key_name', ''),
                    'camelot_key': analysis_result.get('camelot_key', ''),
                    'bpm': analysis_result.get('bpm', 0.0),
                    'energy_level': analysis_result.get('energy_level', 0.0),
                    'duration': analysis_result.get('duration', 0.0),
                    'cue_points': analysis_result.get('cue_points', []),
                    'status': 'found'
                }
                db_id = db_manager.add_music_file(file_data)
                analysis_result['db_id'] = db_id
                print(f"💾 Saved to database with ID: {db_id}")
            except Exception as e:
                print(f"Failed to save to database: {str(e)}")
            
            print(f"🎉 Successfully downloaded and analyzed: {final_filename}")
            
            return jsonify({
                "song": analysis_result,
                "status": "success",
                "message": f"Successfully downloaded and analyzed {title} by {artist}"
            })
            
        except Exception as e:
            print(f"❌ Analysis failed: {str(e)}")
            return jsonify({
                "error": f"Download succeeded but analysis failed: {str(e)}",
                "status": "error",
                "file_path": final_path
            }), 500
        
    except Exception as e:
        print(f"❌ Download error: {str(e)}")
        return jsonify({
            "error": f"Download failed: {str(e)}",
            "status": "error"
        }), 500

# Settings Management Endpoints
@app.route('/settings/download-path', methods=['GET'])
def get_download_path():
    """Get the saved download path setting."""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        # Try to get from database settings
        path = db_manager.get_setting('youtube_download_path')
        
        return jsonify({
            'path': path,
            'status': 'success'
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to get download path: {str(e)}",
            "status": "error"
        }), 500

@app.route('/settings/download-path', methods=['POST'])
def save_download_path():
    """Save the download path setting."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        path = request_json.get('path')
        
        if not path:
            return jsonify({"error": "No path provided"}), 400
        
        # Validate path exists
        if not os.path.exists(path):
            return jsonify({"error": "Path does not exist"}), 400
            
        # Save to database settings
        db_manager.set_setting('youtube_download_path', path)
        
        return jsonify({
            'status': 'success',
            'message': 'Download path saved successfully'
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to save download path: {str(e)}",
            "status": "error"
        }), 500

@app.route('/settings/download-path', methods=['DELETE'])
def clear_download_path():
    """Clear the download path setting."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        # Clear from database settings
        db_manager.delete_setting('youtube_download_path')
        
        return jsonify({
            'status': 'success',
            'message': 'Download path cleared successfully'
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to clear download path: {str(e)}",
            "status": "error"
        }), 500

@app.route('/audio/<filename>', methods=['GET'])
def serve_audio(filename):
    """Serve audio files for playback."""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        # Decode the filename
        decoded_filename = unquote(filename)
        
        # Check if file exists in uploaded files or try to find it
        file_path = uploaded_files.get(decoded_filename)
        
        if not file_path or not os.path.exists(file_path):
            # Try to find the file in common music directories
            possible_paths = [
                os.path.join(os.path.expanduser('~'), 'Music', decoded_filename),
                os.path.join(os.path.expanduser('~'), 'Downloads', decoded_filename),
                os.path.join(tempfile.gettempdir(), decoded_filename),
                decoded_filename  # Try as absolute path
            ]
            
            for path in possible_paths:
                if os.path.exists(path):
                    file_path = path
                    break
            
            if not file_path or not os.path.exists(file_path):
                return jsonify({"error": "Audio file not found"}), 404
        
        # Serve the audio file
        return send_file(
            file_path,
            as_attachment=False,
            mimetype='audio/mpeg'  # Default to MP3, could be enhanced to detect actual type
        )
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to serve audio: {str(e)}"
        }), 500

if __name__ == "__main__":
    app.run(port=args.apiport)
