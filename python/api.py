from flask import Flask, request, jsonify, send_file, Response, make_response
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import time
from graphene import ObjectType, String, Schema, Field, List, Mutation
from flask_graphql import GraphQLView
from calc import calc as real_calc
from music_analyzer import MusicAnalyzer, analyze_music_file
from database_manager import DatabaseManager
import argparse
import os
import json
import time
import tempfile
import base64
import math
from urllib.parse import unquote
import ytmusicapi
from pytube import YouTube
import yt_dlp
import subprocess
import sqlite3
import shutil
import threading
import time
from mutagen.mp3 import MP3
from mutagen.id3 import ID3
from mutagen.id3._frames import APIC, TIT2, TPE1, TALB, TDRC
import requests
from PIL import Image
import io
import platform
import psutil
from download_queue_manager import download_queue_manager, DownloadTask, DownloadPriority, DownloadStatus
from automix_api import get_automix_api

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

# Resolve signing key with safe fallbacks for development
apiSigningKey = args.signingkey or os.environ.get('API_SIGNING_KEY', '')
if not apiSigningKey:
    # In dev environments the Electron main process and npm scripts use 'devkey'
    apiSigningKey = 'devkey'

# Initialize database manager
db_manager = DatabaseManager()

# Setup download queue manager callbacks
def setup_download_queue_callbacks():
    """Setup callbacks for the download queue manager"""
    
    def progress_callback(task):
        """Handle progress updates from download queue"""
        emit_progress(task.id, {
            'stage': task.stage,
            'progress': task.progress,
            'message': task.message,
            'quality': task.quality,
            'format': task.format,
            'timestamp': time.time(),
            'percentage': task.progress
        })
    
    def completion_callback(task):
        """Handle download completion"""
        print(f"🎵 Queue completion callback for {task.id}")
        print(f"🎵 Task metadata keys: {list(task.metadata.keys()) if task.metadata else 'None'}")
        
        # Include song data from task metadata if available
        completion_data = {
            'stage': 'complete',
            'progress': 100,
            'message': 'Download complete!',
            'quality': task.quality,
            'format': task.format,
            'timestamp': time.time(),
            'percentage': 100,
            'completed': True,
            'file_size': task.file_size,
            'duration': task.metadata.get('duration', 0)
        }
        
        # Add song data if available in task metadata
        if task.metadata and 'analysis_result' in task.metadata:
            completion_data['song'] = task.metadata['analysis_result']
            print(f"🎵 Including song data in completion callback: {task.metadata['analysis_result'].get('title', 'Unknown')}")
        else:
            print(f"🎵 No song data available in task metadata")
            
        emit_progress(task.id, completion_data)
    
    def error_callback(task):
        """Handle download errors"""
        emit_progress(task.id, {
            'stage': 'error',
            'progress': 0,
            'message': task.error or 'Download failed',
            'timestamp': time.time(),
            'error': task.error
        })
    
    # Register callbacks
    download_queue_manager.add_progress_callback(progress_callback)
    download_queue_manager.add_completion_callback(completion_callback)
    download_queue_manager.add_error_callback(error_callback)

# Initialize callbacks
setup_download_queue_callbacks()

app = Flask(__name__)
app.add_url_rule("/graphql/", view_func=view_func)
app.add_url_rule("/graphiql/", view_func=view_func) # for compatibility with other samples
# Allow cross-origin requests from the embedded renderer with credentials and custom headers
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}}, expose_headers=["X-Signing-Key"]) 

# Initialize SocketIO for real-time communication with robust configuration
socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    logger=True, 
    engineio_logger=True,
    ping_timeout=30,
    ping_interval=15,
    max_http_buffer_size=1000000,
    always_connect=True,
    allow_upgrades=True,
    transports=['polling', 'websocket'],  # Try polling first, then websocket
    async_mode='threading'
)
# Utility: get signing key from any common location
def get_request_signing_key():
    try:
        # Prefer explicit header; fall back to query, form, JSON body, or cookie
        request_json = None
        try:
            request_json = request.get_json(silent=True) or {}
        except Exception:
            request_json = {}
        return (
            request.headers.get('X-Signing-Key')
            or request.args.get('signingkey')
            or request.form.get('signingkey')
            or (request_json.get('signingkey') if isinstance(request_json, dict) else None)
            or request.cookies.get('signingkey')
        )
    except Exception:
        return None

# Health check endpoint for monitoring database and service health
@app.route('/health', methods=['GET'])
def health_check():
    """Comprehensive health check endpoint"""
    try:
        start_time = time.time()
        
        # Check database connectivity and get stats
        db_manager = DatabaseManager()
        
        # Get basic database stats
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Get file count
            cursor.execute("SELECT COUNT(*) FROM music_files")
            file_count = cursor.fetchone()[0]
            
            # Get playlist count
            cursor.execute("SELECT COUNT(*) FROM playlists")
            playlist_count = cursor.fetchone()[0]
            
            # Get database size
            cursor.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
            db_size = cursor.fetchone()[0]
            
            # Check for recent errors
            cursor.execute("SELECT COUNT(*) FROM music_files WHERE status = 'error' AND last_checked > datetime('now', '-1 hour')")
            recent_errors = cursor.fetchone()[0]
        
        # Get system resources
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        # Calculate response time
        response_time = (time.time() - start_time) * 1000  # Convert to milliseconds
        
        # Determine overall health status
        health_status = "healthy"
        if recent_errors > 10:
            health_status = "degraded"
        if cpu_percent > 90 or memory.percent > 90 or disk.percent > 95:
            health_status = "unhealthy"
        if response_time > 5000:  # 5 seconds
            health_status = "degraded"
        
        health_data = {
            "status": health_status,
            "timestamp": time.time(),
            "response_time_ms": round(response_time, 2),
            "database": {
                "file_count": file_count,
                "playlist_count": playlist_count,
                "size_bytes": db_size,
                "recent_errors": recent_errors,
                "status": "connected"
            },
            "system": {
                "cpu_percent": round(cpu_percent, 2),
                "memory_percent": round(memory.percent, 2),
                "memory_available_gb": round(memory.available / (1024**3), 2),
                "disk_percent": round(disk.percent, 2),
                "disk_free_gb": round(disk.free / (1024**3), 2)
            },
            "connection_pool": {
                "active": 1,  # Placeholder - would need actual pool implementation
                "idle": 0,
                "total": 1
            },
            "services": {
                "database": "healthy",
                "music_analyzer": "healthy",
                "download_queue": "healthy" if download_queue_manager.is_running else "stopped"
            }
        }
        
        # Return appropriate HTTP status based on health
        if health_status == "healthy":
            return jsonify(health_data), 200
        elif health_status == "degraded":
            return jsonify(health_data), 200  # Still operational
        else:
            return jsonify(health_data), 503  # Service unavailable
            
    except Exception as e:
        error_response = {
            "status": "unhealthy",
            "timestamp": time.time(),
            "error": str(e),
            "database": {"status": "error"},
            "system": {"status": "unknown"},
            "services": {"status": "error"}
        }
        return jsonify(error_response), 503


# Global store for active downloads
active_downloads = {}

# WebSocket event handlers with robust error handling
@socketio.on('connect')
def handle_connect():
    try:
        client_id = getattr(request, 'sid', 'unknown')
        transport = getattr(request, 'transport', 'unknown')
        print(f"✅ Client connected: {client_id} via {transport}")
        emit('connected', {'status': 'Connected to download server', 'client_id': client_id, 'transport': transport})
    except Exception as e:
        print(f"⚠️ Connect handler error: {str(e)}")
        try:
            emit('error', {'message': 'Connection error occurred'})
        except:
            pass

@socketio.on('disconnect')
def handle_disconnect():
    try:
        client_id = getattr(request, 'sid', None)
        print(f"❌ Client disconnected: {client_id}")
        # Clean up any active downloads for this client
        if client_id and client_id in active_downloads:
            del active_downloads[client_id]
    except Exception as e:
        print(f"⚠️ Disconnect handler error: {str(e)}")

@socketio.on('ping')
def handle_ping():
    """Handle ping from client"""
    try:
        emit('pong', {'timestamp': time.time()})
    except Exception as e:
        print(f"⚠️ Ping handler error: {str(e)}")

@socketio.on('join_download')
def handle_join_download(data):
    try:
        download_id = data.get('download_id')
        client_id = getattr(request, 'sid', 'unknown')
        print(f"📥 Client {client_id} joined download: {download_id}")
        # Send current progress if download is active
        if download_id in active_downloads:
            progress_data = active_downloads[download_id]
            emit('download_progress', progress_data)
    except Exception as e:
        print(f"⚠️ Join download handler error: {str(e)}")

@socketio.on('test_message')
def handle_test_message(data):
    try:
        client_id = getattr(request, 'sid', 'unknown')
        print(f"🧪 Test message received from {client_id}: {data}")
        emit('test_response', {'status': 'received', 'message': data.get('message', 'No message')})
    except Exception as e:
        print(f"⚠️ Test message handler error: {str(e)}")

@socketio.on('get_usb_devices')
def handle_get_usb_devices():
    """Handle WebSocket request for USB devices"""
    try:
        client_id = getattr(request, 'sid', 'unknown')
        print(f"🔌 Client {client_id} requested USB devices")
        
        devices = get_usb_devices()
        emit('usb_devices', {'devices': devices})
        print(f"✅ Sent {len(devices)} USB devices to client {client_id}")
        
    except Exception as e:
        print(f"⚠️ Error handling USB devices request: {e}")
        emit('usb_devices_error', {'error': str(e)})

@socketio.on('pause_download')
def handle_pause_download(data):
    """Handle WebSocket request to pause a download"""
    try:
        download_id = data.get('download_id')
        client_id = getattr(request, 'sid', 'unknown')
        print(f"⏸️ Client {client_id} requested to pause download: {download_id}")
        
        if download_id in active_downloads:
            # Update the download status to paused
            active_downloads[download_id]['stage'] = 'paused'
            active_downloads[download_id]['message'] = 'Download paused by user'
            
            emit_progress(download_id, {
                'stage': 'paused',
                'progress': active_downloads[download_id].get('progress', 0),
                'message': 'Download paused by user'
            })
            print(f"✅ Download {download_id} paused successfully")
        else:
            print(f"⚠️ Download {download_id} not found in active downloads")
            emit('download_error', {
                'download_id': download_id,
                'error': 'Download not found or already completed'
            })
    except Exception as e:
        print(f"⚠️ Error pausing download: {e}")
        emit('download_error', {
            'download_id': data.get('download_id', 'unknown'),
            'error': str(e)
        })

@socketio.on('resume_download')
def handle_resume_download(data):
    """Handle WebSocket request to resume a download"""
    try:
        download_id = data.get('download_id')
        client_id = getattr(request, 'sid', 'unknown')
        print(f"▶️ Client {client_id} requested to resume download: {download_id}")
        
        if download_id in active_downloads:
            # Update the download status to resuming
            active_downloads[download_id]['stage'] = 'downloading'
            active_downloads[download_id]['message'] = 'Download resumed by user'
            
            emit_progress(download_id, {
                'stage': 'downloading',
                'progress': active_downloads[download_id].get('progress', 0),
                'message': 'Download resumed by user'
            })
            print(f"✅ Download {download_id} resumed successfully")
        else:
            print(f"⚠️ Download {download_id} not found in active downloads")
            emit('download_error', {
                'download_id': download_id,
                'error': 'Download not found or already completed'
            })
    except Exception as e:
        print(f"⚠️ Error resuming download: {e}")
        emit('download_error', {
            'download_id': data.get('download_id', 'unknown'),
            'error': str(e)
        })

@socketio.on('cancel_download')
def handle_cancel_download(data):
    """Handle WebSocket request to cancel a download"""
    try:
        download_id = data.get('download_id')
        client_id = getattr(request, 'sid', 'unknown')
        print(f"🚫 Client {client_id} requested to cancel download: {download_id}")
        
        if download_id in active_downloads:
            # Remove from active downloads
            del active_downloads[download_id]
            
            emit_progress(download_id, {
                'stage': 'cancelled',
                'progress': 0,
                'message': 'Download cancelled by user'
            })
            print(f"✅ Download {download_id} cancelled successfully")
        else:
            print(f"⚠️ Download {download_id} not found in active downloads")
            emit('download_error', {
                'download_id': download_id,
                'error': 'Download not found or already completed'
            })
    except Exception as e:
        print(f"⚠️ Error cancelling download: {e}")
        emit('download_error', {
            'download_id': data.get('download_id', 'unknown'),
            'error': str(e)
        })

def format_bytes(bytes_value):
    """Format bytes into human readable format"""
    if bytes_value == 0:
        return "0 B"
    k = 1024
    sizes = ['B', 'KB', 'MB', 'GB']
    i = int(math.floor(math.log(bytes_value) / math.log(k)))
    return f"{bytes_value / (k ** i):.1f} {sizes[i]}"

def emit_progress(download_id, progress_data):
    """Emit download progress to all connected clients with robust error handling"""
    try:
        # Validate and clean progress data
        cleaned_data = validate_progress_data(progress_data)
        
        print(f"📡 Emitting progress for {download_id}: {cleaned_data}")
        active_downloads[download_id] = cleaned_data
        
        # Create the message payload
        message_payload = {
            'download_id': download_id,
            **cleaned_data
        }
        
        # Use safe_emit for better error handling
        if not safe_emit('download_progress', message_payload):
            # If safe_emit fails, try sending essential data only
            essential_data = {
                'download_id': download_id,
                'stage': cleaned_data.get('stage', 'unknown'),
                'progress': cleaned_data.get('progress', 0),
                'message': cleaned_data.get('message', ''),
                'timestamp': cleaned_data.get('timestamp', time.time())
            }
            safe_emit('download_progress', essential_data)
            
            # Send additional completion data separately if needed
            if cleaned_data.get('stage') == 'complete':
                completion_data = {
                    'download_id': download_id,
                    'quality': cleaned_data.get('quality', ''),
                    'format': cleaned_data.get('format', ''),
                    'file_size': cleaned_data.get('file_size', 0),
                    'duration': cleaned_data.get('duration', 0)
                }
                safe_emit('download_complete', completion_data)
        
        print(f"✅ Progress emitted for {download_id}")
    except Exception as e:
        print(f"⚠️ Error emitting progress for {download_id}: {str(e)}")
        # Try to emit error to specific clients if possible
        try:
            socketio.emit('download_error', {
                'download_id': download_id,
                'error': f'Progress emission failed: {str(e)}'
            })
        except:
            pass

def validate_progress_data(data):
    """Validate and clean progress data to prevent WebSocket issues"""
    if not isinstance(data, dict):
        return {}
    
    # Clean the data - remove any problematic values
    cleaned = {}
    for key, value in data.items():
        if isinstance(value, (str, int, float, bool)) or value is None:
            cleaned[key] = value
        elif isinstance(value, dict):
            # Recursively clean nested dictionaries
            cleaned[key] = validate_progress_data(value)
        else:
            # Convert other types to string
            cleaned[key] = str(value)
    
    # Ensure required fields exist
    if 'timestamp' not in cleaned:
        cleaned['timestamp'] = time.time()
    
    # Validate string lengths to prevent frame issues
    for key, value in cleaned.items():
        if isinstance(value, str) and len(value) > 10000:  # 10KB string limit
            cleaned[key] = value[:10000] + "..."
            print(f"⚠️ Truncated large string field '{key}' to prevent WebSocket frame issues")
    
    return cleaned

def safe_emit(event_name, data, room=None):
    """Safely emit WebSocket events with error handling"""
    try:
        # Validate data before sending
        if isinstance(data, dict):
            data = validate_progress_data(data)
        
        # Check message size
        message_size = len(str(data))
        if message_size > 500000:  # 500KB limit
            print(f"⚠️ Large message detected ({message_size} bytes), skipping emission")
            return False
        
        # Emit the event
        if room:
            socketio.emit(event_name, data, room=room)
        else:
            socketio.emit(event_name, data)
        
        return True
    except Exception as e:
        print(f"⚠️ Error emitting {event_name}: {str(e)}")
        return False

# USB device detection and management
def get_usb_devices():
    """Detect USB devices and return their information"""
    devices = []
    
    try:
        system = platform.system()
        
        if system == "Darwin":  # macOS
            # Use system_profiler to get USB device information
            try:
                result = subprocess.run(['system_profiler', 'SPUSBDataType'], 
                                     capture_output=True, text=True, timeout=10)
                if result.returncode == 0:
                    lines = result.stdout.split('\n')
                    current_device = {}
                    
                    for line in lines:
                        line = line.strip()
                        if line.startswith('Product ID:'):
                            if current_device:
                                # Add type field based on device characteristics
                                if 'Mass Storage' in current_device.get('product', '') or 'USB Drive' in current_device.get('product', ''):
                                    current_device['type'] = 'usb_storage'
                                else:
                                    current_device['type'] = 'usb_device'
                                devices.append(current_device)
                            current_device = {'product_id': line.split(':')[1].strip()}
                        elif line.startswith('Vendor ID:'):
                            current_device['vendor_id'] = line.split(':')[1].strip()
                        elif line.startswith('Manufacturer:'):
                            current_device['manufacturer'] = line.split(':')[1].strip()
                        elif line.startswith('Product:'):
                            current_device['product'] = line.split(':')[1].strip()
                        elif line.startswith('Serial Number:'):
                            current_device['serial'] = line.split(':')[1].strip()
                        elif line.startswith('Speed:'):
                            current_device['speed'] = line.split(':')[1].strip()
                    
                    if current_device:
                        # Add type field for the last device
                        if 'Mass Storage' in current_device.get('product', '') or 'USB Drive' in current_device.get('product', ''):
                            current_device['type'] = 'usb_storage'
                        else:
                            current_device['type'] = 'usb_device'
                        devices.append(current_device)
                        
            except subprocess.TimeoutExpired:
                print("⚠️ USB detection timed out on macOS")
            except Exception as e:
                print(f"⚠️ Error detecting USB devices on macOS: {e}")
                
        elif system == "Windows":
            # Use wmic to get USB device information
            try:
                result = subprocess.run(['wmic', 'path', 'Win32_USBHub', 'get', 'DeviceID,Name,Description'], 
                                     capture_output=True, text=True, timeout=10)
                if result.returncode == 0:
                    lines = result.stdout.split('\n')[1:]  # Skip header
                    for line in lines:
                        if line.strip():
                            parts = line.strip().split()
                            if len(parts) >= 2:
                                device_info = {
                                    'device_id': parts[0],
                                    'name': ' '.join(parts[1:]),
                                    'description': ' '.join(parts[1:]),
                                    'type': 'usb_device'  # Default type
                                }
                                # Try to detect if it's a storage device
                                if any(keyword in device_info['name'].lower() for keyword in ['drive', 'disk', 'storage', 'usb']):
                                    device_info['type'] = 'usb_storage'
                                devices.append(device_info)
            except subprocess.TimeoutExpired:
                print("⚠️ USB detection timed out on Windows")
            except Exception as e:
                print(f"⚠️ Error detecting USB devices on Windows: {e}")
                
        elif system == "Linux":
            # Use lsusb to get USB device information
            try:
                result = subprocess.run(['lsusb'], capture_output=True, text=True, timeout=10)
                if result.returncode == 0:
                    lines = result.stdout.split('\n')
                    for line in lines:
                        if line.strip():
                            parts = line.split()
                            if len(parts) >= 6:
                                device_info = {
                                    'bus': parts[1],
                                    'device': parts[3],
                                    'vendor_id': parts[5].split(':')[0],
                                    'product_id': parts[5].split(':')[1],
                                    'description': ' '.join(parts[6:]),
                                    'type': 'usb_device'  # Default type
                                }
                                # Try to detect if it's a storage device
                                if any(keyword in device_info['description'].lower() for keyword in ['drive', 'disk', 'storage', 'usb']):
                                    device_info['type'] = 'usb_storage'
                                devices.append(device_info)
            except subprocess.TimeoutExpired:
                print("⚠️ USB detection timed out on Linux")
            except Exception as e:
                print(f"⚠️ Error detecting USB devices on Linux: {e}")
        
        # Get disk usage information for mounted USB drives
        mounted_devices = get_mounted_usb_devices()
        devices.extend(mounted_devices)
        
    except Exception as e:
        print(f"⚠️ Error in USB device detection: {e}")
    
    return devices

def get_mounted_usb_devices():
    """Get information about mounted USB storage devices"""
    mounted_devices = []
    
    try:
        system = platform.system()
        
        if system == "Darwin":  # macOS
            # Check /Volumes for mounted devices
            volumes_dir = "/Volumes"
            if os.path.exists(volumes_dir):
                for item in os.listdir(volumes_dir):
                    volume_path = os.path.join(volumes_dir, item)
                    if os.path.ismount(volume_path):
                        try:
                            # Get disk usage information
                            statvfs = os.statvfs(volume_path)
                            total_space = statvfs.f_frsize * statvfs.f_blocks
                            free_space = statvfs.f_frsize * statvfs.f_bavail
                            used_space = total_space - free_space
                            
                            # Convert to GB
                            total_gb = total_space / (1024**3)
                            free_gb = free_space / (1024**3)
                            used_gb = used_space / (1024**3)
                            
                            mounted_devices.append({
                                'name': item,
                                'path': volume_path,
                                'total_space_gb': round(total_gb, 2),
                                'free_space_gb': round(free_gb, 2),
                                'used_space_gb': round(used_gb, 2),
                                'free_space_percent': round((free_space / total_space) * 100, 1),
                                'type': 'usb_storage'
                            })
                        except Exception as e:
                            print(f"⚠️ Error getting disk usage for {volume_path}: {e}")
                            
        elif system == "Windows":
            # Use wmic to get disk information
            try:
                result = subprocess.run(['wmic', 'logicaldisk', 'get', 'DeviceID,Size,FreeSpace,VolumeName'], 
                                     capture_output=True, text=True, timeout=10)
                if result.returncode == 0:
                    lines = result.stdout.split('\n')[1:]  # Skip header
                    for line in lines:
                        if line.strip():
                            parts = line.strip().split()
                            if len(parts) >= 4:
                                try:
                                    total_space = int(parts[1]) if parts[1].isdigit() else 0
                                    free_space = int(parts[2]) if parts[2].isdigit() else 0
                                    used_space = total_space - free_space
                                    
                                    # Convert to GB
                                    total_gb = total_space / (1024**3)
                                    free_gb = free_space / (1024**3)
                                    used_gb = used_space / (1024**3)
                                    
                                    mounted_devices.append({
                                        'name': parts[3] if parts[3] != 'None' else f"Drive {parts[0]}",
                                        'path': f"{parts[0]}\\",
                                        'total_space_gb': round(total_gb, 2),
                                        'free_space_gb': round(free_gb, 2),
                                        'used_space_gb': round(used_gb, 2),
                                        'free_space_percent': round((free_space / total_space) * 100, 1) if total_space > 0 else 0,
                                        'type': 'usb_storage'
                                    })
                                except (ValueError, IndexError):
                                    continue
            except subprocess.TimeoutExpired:
                print("⚠️ Disk usage detection timed out on Windows")
            except Exception as e:
                print(f"⚠️ Error detecting disk usage on Windows: {e}")
                
        elif system == "Linux":
            # Use df command to get disk usage
            try:
                result = subprocess.run(['df', '-h'], capture_output=True, text=True, timeout=10)
                if result.returncode == 0:
                    lines = result.stdout.split('\n')[1:]  # Skip header
                    for line in lines:
                        if line.strip():
                            parts = line.split()
                            if len(parts) >= 6:
                                try:
                                    # Parse size strings like "100G", "1.5T"
                                    total_str = parts[1]
                                    used_str = parts[2]
                                    available_str = parts[3]
                                    
                                    # Convert to GB (simplified conversion)
                                    def parse_size(size_str):
                                        if 'G' in size_str:
                                            return float(size_str.replace('G', ''))
                                        elif 'T' in size_str:
                                            return float(size_str.replace('T', '')) * 1024
                                        elif 'M' in size_str:
                                            return float(size_str.replace('M', '')) / 1024
                                        else:
                                            return 0
                                    
                                    total_gb = parse_size(total_str)
                                    used_gb = parse_size(used_str)
                                    available_gb = parse_size(available_str)
                                    
                                    mounted_devices.append({
                                        'name': parts[5] if len(parts) > 5 else parts[0],
                                        'path': parts[5] if len(parts) > 5 else parts[0],
                                        'total_space_gb': total_gb,
                                        'free_space_gb': available_gb,
                                        'used_space_gb': used_gb,
                                        'free_space_percent': round((available_gb / total_gb) * 100, 1) if total_gb > 0 else 0,
                                        'type': 'usb_storage'
                                    })
                                except (ValueError, IndexError):
                                    continue
            except subprocess.TimeoutExpired:
                print("⚠️ Disk usage detection timed out on Linux")
            except Exception as e:
                print(f"⚠️ Error detecting disk usage on Linux: {e}")
                
    except Exception as e:
        print(f"⚠️ Error in mounted USB device detection: {e}")
    
    return mounted_devices

def export_playlist_to_usb(playlist_data, usb_path, progress_callback=None):
    """Export playlist to USB device with real-time progress updates"""
    try:
        playlist_name = playlist_data.get('name', 'Unknown Playlist')
        songs = playlist_data.get('songs', [])
        
        # Create playlist folder on USB
        playlist_folder = os.path.join(usb_path, playlist_name)
        if not os.path.exists(playlist_folder):
            os.makedirs(playlist_folder)
        
        total_files = len(songs)
        copied_files = 0
        
        # Create M3U playlist file
        m3u_content = ['#EXTM3U']
        
        for song in songs:
            try:
                if progress_callback:
                    progress_callback({
                        'status': 'copying',
                        'current_file': song.get('filename', 'Unknown'),
                        'progress': (copied_files / total_files) * 100,
                        'copied_files': copied_files,
                        'total_files': total_files
                    })
                
                # Copy song file to USB
                source_path = song.get('file_path')
                if source_path and os.path.exists(source_path):
                    filename = song.get('filename', 'unknown.mp3')
                    dest_path = os.path.join(playlist_folder, filename)
                    
                    # Copy file with progress
                    shutil.copy2(source_path, dest_path)
                    
                    # Add to M3U playlist
                    m3u_content.append(f'#EXTINF:0,{filename}')
                    m3u_content.append(filename)
                    
                    copied_files += 1
                    
                    if progress_callback:
                        progress_callback({
                            'status': 'copying',
                            'current_file': filename,
                            'progress': (copied_files / total_files) * 100,
                            'copied_files': copied_files,
                            'total_files': total_files
                        })
                else:
                    print(f"⚠️ Source file not found: {source_path}")
                    
            except Exception as e:
                print(f"⚠️ Error copying file {song.get('filename', 'Unknown')}: {e}")
                if progress_callback:
                    progress_callback({
                        'status': 'error',
                        'error': f"Failed to copy {song.get('filename', 'Unknown')}: {str(e)}",
                        'progress': (copied_files / total_files) * 100,
                        'copied_files': copied_files,
                        'total_files': total_files
                    })
        
        # Write M3U playlist file
        m3u_path = os.path.join(playlist_folder, f"{playlist_name}.m3u")
        with open(m3u_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(m3u_content))
        
        if progress_callback:
            progress_callback({
                'status': 'completed',
                'progress': 100,
                'copied_files': copied_files,
                'total_files': total_files,
                'playlist_path': playlist_folder
            })
        
        return {
            'success': True,
            'playlist_path': playlist_folder,
            'copied_files': copied_files,
            'total_files': total_files
        }
        
    except Exception as e:
        error_msg = f"Export failed: {str(e)}"
        print(f"❌ {error_msg}")
        if progress_callback:
            progress_callback({
                'status': 'error',
                'error': error_msg,
                'progress': 0
            })
        return {
            'success': False,
            'error': error_msg
        }

# REST endpoints for USB device management
@app.route('/api/usb/devices', methods=['GET'])
def get_usb_devices_rest():
    """REST endpoint to get USB devices"""
    try:
        # Check signing key
        signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
        if signing_key != apiSigningKey:
            return jsonify({"error": "invalid signature"}), 401
        
        devices = get_usb_devices()
        return jsonify({
            'success': True,
            'devices': devices,
            'count': len(devices)
        })
        
    except Exception as e:
        print(f"❌ Error in USB devices REST endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/usb/export', methods=['POST'])
def export_playlist_to_usb_rest():
    """REST endpoint to export playlist to USB"""
    try:
        # Check signing key
        signing_key = request.headers.get('X-Signing-Key') or request.form.get('signingkey')
        if signing_key != apiSigningKey:
            return jsonify({"error": "invalid signature"}), 401
        
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        playlist_data = data.get('playlist')
        usb_path = data.get('usb_path')
        
        if not playlist_data or not usb_path:
            return jsonify({"error": "Missing playlist data or USB path"}), 400
        
        print(f"📤 REST export request for playlist '{playlist_data.get('name', 'Unknown')}' to USB: {usb_path}")
        
        # Perform the actual export
        try:
            result = export_playlist_to_usb(playlist_data, usb_path)
            
            if result['success']:
                print(f"✅ Export completed successfully: {result}")
                return jsonify({
                    'success': True,
                    'status': 'Export completed',
                    'playlist_name': playlist_data.get('name', 'Unknown'),
                    'usb_path': usb_path,
                    'result': result
                })
            else:
                print(f"❌ Export failed: {result.get('error', 'Unknown error')}")
                return jsonify({
                    'success': False,
                    'error': result.get('error', 'Export failed')
                }), 500
                
        except Exception as e:
            print(f"❌ Export error: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
        
    except Exception as e:
        print(f"❌ Error in USB export REST endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

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
        
        print(f"📁 Received file: {file.filename} (size: {file.content_length} bytes)")
        
        # Save uploaded file permanently for audio serving
        upload_dir = os.path.join(tempfile.gettempdir(), 'mixed_in_key_uploads')
        if not os.path.exists(upload_dir):
            os.makedirs(upload_dir)
        
        permanent_path = os.path.join(upload_dir, file.filename)
        print(f"💾 Saving file to: {permanent_path}")
        file.save(permanent_path)
        print(f"✅ File saved successfully")
        
        # Store file path for audio serving
        uploaded_files[file.filename] = permanent_path
        
        try:
            # Enhanced check using new database tracking system
            skip_check = db_manager.should_skip_analysis(permanent_path)
            track_id = db_manager.generate_unique_track_id(permanent_path, file.filename)
            
            if skip_check['should_skip']:
                # Song should be skipped - already analyzed or prevented
                print(f"✅ Song should be skipped - {skip_check['reason']}")
                
                if skip_check['song_data']:
                    song_data = skip_check['song_data']
                    print(f"📊 Existing metadata: Key={song_data.get('camelot_key')}, BPM={song_data.get('bpm')}, Energy={song_data.get('energy_level')}")
                    
                    # Update track_id for existing song
                    db_manager.update_track_id(str(song_data['id']), track_id)
                    
                    # Return existing metadata
                    analysis_result = {
                        'filename': song_data['filename'],
                        'file_path': permanent_path,
                        'key': song_data.get('key_signature'),
                        'camelot_key': song_data.get('camelot_key'),
                        'bpm': song_data.get('bpm'),
                        'energy_level': song_data.get('energy_level'),
                        'duration': song_data.get('duration'),
                        'analysis_date': song_data.get('analysis_date'),
                        'track_id': track_id,
                        'status': 'existing_metadata',
                        'message': f'Song already analyzed ({skip_check["reason"]})',
                        'skip_reason': skip_check['reason'],
                        'id3_tags_written': skip_check.get('id3_tags_written', False)
                    }
                else:
                    # File not found in database but should be skipped (error case)
                    analysis_result = {
                        'filename': file.filename,
                        'file_path': permanent_path,
                        'track_id': track_id,
                        'status': 'error',
                        'message': f'Analysis skipped due to {skip_check["reason"]}',
                        'skip_reason': skip_check['reason']
                    }
            else:
                # Check for duplicate content by hash
                file_hash = db_manager.calculate_file_hash(permanent_path)
                duplicate = db_manager.find_duplicate_by_hash(file_hash)
                
                if duplicate and duplicate['file_path'] != permanent_path:
                    # Found duplicate content - copy analysis from existing file
                    print(f"🔄 Found duplicate content - copying analysis from existing file")
                    print(f"📊 Duplicate metadata: Key={duplicate.get('camelot_key')}, BPM={duplicate.get('bpm')}, Energy={duplicate.get('energy_level')}")
                    
                    # Copy analysis data from duplicate
                    analysis_result = {
                        'filename': file.filename,
                        'file_path': permanent_path,
                        'key': duplicate.get('key_signature'),
                        'camelot_key': duplicate.get('camelot_key'),
                        'bpm': duplicate.get('bpm'),
                        'energy_level': duplicate.get('energy_level'),
                        'duration': duplicate.get('duration'),
                        'analysis_date': duplicate.get('analysis_date'),
                        'track_id': track_id,
                        'status': 'duplicate_content',
                        'message': 'Analysis copied from duplicate content',
                        'duplicate_of': duplicate['file_path']
                    }
                    
                    # Add to database with copied analysis
                    analysis_result['analysis_status'] = 'completed'
                    analysis_result['id3_tags_written'] = duplicate.get('id3_tags_written', 0)
                    analysis_result['file_hash'] = file_hash
                    db_manager.add_music_file(analysis_result)
                else:
                    # Analyze the uploaded file
                    print(f"🆕 Analyzing new song")
                    
                    # Mark analysis as started
                    db_manager.mark_analysis_started(permanent_path)
                    
                    try:
                        analysis_result = analyze_music_file(permanent_path)
                        analysis_result['track_id'] = track_id
                        analysis_result['file_hash'] = file_hash
                        analysis_result['analysis_status'] = 'completed'
                        
                        # Mark analysis as completed
                        db_manager.mark_analysis_completed(permanent_path, analysis_result)
                        
                    except Exception as analysis_error:
                        # Mark analysis as failed
                        db_manager.mark_analysis_failed(permanent_path, str(analysis_error))
                        raise analysis_error
            # Write tags and cue points to ID3 (only if not already written)
            try:
                # Check if ID3 tags should be written
                should_write_tags = True
                if skip_check['should_skip'] and skip_check.get('id3_tags_written', False):
                    should_write_tags = False
                    print(f"⏭️ Skipping ID3 tag writing - tags already written")
                elif analysis_result.get('status') == 'existing_metadata' and analysis_result.get('id3_tags_written', False):
                    should_write_tags = False
                    print(f"⏭️ Skipping ID3 tag writing - tags already written for existing metadata")
                
                if should_write_tags:
                    analyzer = MusicAnalyzer()
                    tag_result = analyzer.write_id3_tags(permanent_path, analysis_result)
                    analysis_result['tag_write'] = tag_result
                    
                    # Mark that ID3 tags have been written
                    if tag_result.get('updated'):
                        db_manager.mark_id3_tags_written(permanent_path)
                        print(f"✅ ID3 tags written and marked in database")
                    else:
                        print(f"⚠️ ID3 tag writing failed: {tag_result.get('error', 'Unknown error')}")
                else:
                    analysis_result['tag_write'] = {
                        'updated': False,
                        'skipped': True,
                        'reason': 'tags_already_written'
                    }
            except Exception as _e:
                print(f"Warning: Failed to write ID3 tags: {str(_e)}")
                analysis_result['tag_write'] = {
                    'updated': False,
                    'error': str(_e)
                }
            
            # Automatically rename file with key and BPM information
            rename_result = None
            try:
                if analysis_result.get('camelot_key') and analysis_result.get('bpm'):
                    rename_result = rename_file_with_metadata(permanent_path, analysis_result)
                    if rename_result.get('renamed'):
                        # Update the uploaded_files mapping with new filename
                        new_filename = rename_result['new_filename']
                        uploaded_files[new_filename] = rename_result['new_path']
                        analysis_result['filename'] = new_filename
                        analysis_result['file_path'] = rename_result['new_path']
                        print(f"✅ Automatically renamed file: {file.filename} → {new_filename}")
                    else:
                        print(f"⚠️ Failed to rename file: {rename_result.get('error', 'Unknown error')}")
            except Exception as rename_error:
                print(f"Warning: Failed to rename file: {str(rename_error)}")
            
            # Add file path to result for audio serving
            analysis_result['file_path'] = analysis_result.get('file_path', permanent_path)
            analysis_result['filename'] = analysis_result.get('filename', file.filename)
            analysis_result['auto_rename'] = rename_result
            
            # Save to database
            try:
                file_data = {
                    'filename': analysis_result['filename'],
                    'file_path': analysis_result['file_path'],
                    'file_size': analysis_result.get('file_size', 0),
                    'key': analysis_result.get('key', ''),
                    'scale': analysis_result.get('scale', ''),
                    'key_name': analysis_result.get('key_name', ''),
                    'camelot_key': analysis_result.get('camelot_key', ''),
                    'bpm': analysis_result.get('bpm', 0.0),
                    'energy_level': analysis_result.get('energy_level', 0.0),
                    'duration': analysis_result.get('duration', 0.0),
                    'cue_points': analysis_result.get('cue_points', []),
                    'id3': analysis_result.get('id3', {}),  # Include ID3 metadata
                    'status': 'found'
                }
                db_id = db_manager.add_music_file(file_data)
                analysis_result['db_id'] = db_id
                print(f"Saved file to database with ID: {db_id}")
                
                # Log ID3 metadata for debugging
                id3_data = analysis_result.get('id3', {})
                if id3_data.get('title') or id3_data.get('artist'):
                    print(f"📝 Saved ID3 metadata: '{id3_data.get('title', 'N/A')}' by '{id3_data.get('artist', 'N/A')}'")
                    
            except Exception as e:
                print(f"Failed to save to database: {str(e)}")
                # Continue without database save
            
            return jsonify(analysis_result)
            
        except Exception as e:
            # Keep file for potential retry but log the error
            import traceback
            print(f"❌ Analysis failed for {file.filename}: {str(e)}")
            print(f"📋 Full error traceback:")
            traceback.print_exc()
            
            # Generate track_id even for error cases to prevent Firestore sync issues
            try:
                track_id = db_manager.generate_unique_track_id(permanent_path, file.filename)
            except Exception as track_id_error:
                print(f"⚠️ Failed to generate track_id for error case: {track_id_error}")
                import time
                track_id = f"error_{int(time.time())}"
            
            return jsonify({
                "error": f"Analysis failed: {str(e)}",
                "status": "error",
                "filename": file.filename,
                "file_path": permanent_path,
                "track_id": track_id
            }), 500
            
    except Exception as e:
        import traceback
        import time
        print(f"❌ Upload and analysis failed: {str(e)}")
        print(f"📋 Full error traceback:")
        traceback.print_exc()
        
        # Generate a fallback track_id for outer exception cases
        track_id = f"error_{int(time.time())}"
        
        return jsonify({
            "error": f"Upload and analysis failed: {str(e)}",
            "status": "error",
            "track_id": track_id
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
                'cue_points': json.loads(file_record['cue_points']) if file_record['cue_points'] else [],
                # ID3 metadata
                'title': file_record.get('title'),
                'artist': file_record.get('artist'),
                'album': file_record.get('album'),
                'albumartist': file_record.get('albumartist'),
                'date': file_record.get('date'),
                'year': file_record.get('year'),
                'genre': file_record.get('genre'),
                'composer': file_record.get('composer'),
                'tracknumber': file_record.get('tracknumber'),
                'discnumber': file_record.get('discnumber'),
                'comment': file_record.get('comment'),
                'initialkey': file_record.get('initialkey'),
                'bpm_from_tags': file_record.get('bpm_from_tags'),
                'website': file_record.get('website'),
                'isrc': file_record.get('isrc'),
                'language': file_record.get('language'),
                'organization': file_record.get('organization'),
                'copyright': file_record.get('copyright'),
                'encodedby': file_record.get('encodedby'),
                # Cover art
                'cover_art': file_record.get('cover_art'),
                'cover_art_extracted': bool(file_record.get('cover_art_extracted', 0)),
                # Analysis tracking
                'analysis_status': file_record.get('analysis_status', 'pending'),
                'id3_tags_written': bool(file_record.get('id3_tags_written', 0)),
                'last_analysis_attempt': file_record.get('last_analysis_attempt'),
                'analysis_attempts': file_record.get('analysis_attempts', 0),
                'file_hash': file_record.get('file_hash'),
                'prevent_reanalysis': bool(file_record.get('prevent_reanalysis', 0))
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

@app.route('/library/delete', methods=['DELETE'])
def delete_song():
    """Delete a song from the database library by song ID."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        song_id = request_json.get('song_id')
        if not song_id:
            return jsonify({"error": "No song ID provided"}), 400
        
        # Delete from database
        success = db_manager.delete_music_file_by_id(song_id)
        
        if success:
            return jsonify({
                'status': 'success',
                'message': 'Song deleted successfully'
            })
        else:
            return jsonify({
                'error': 'Song not found or could not be deleted',
                'status': 'error'
            }), 404
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to delete song: {str(e)}",
            "status": "error"
        }), 500

@app.route('/library/delete-by-path', methods=['DELETE'])
def delete_song_by_path():
    """Delete a song from the database library by file path."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        file_path = request_json.get('file_path')
        if not file_path:
            return jsonify({"error": "No file path provided"}), 400
        
        # Delete from database
        success = db_manager.delete_music_file_by_path(file_path)
        
        if success:
            return jsonify({
                'status': 'success',
                'message': 'Song deleted successfully'
            })
        else:
            return jsonify({
                'error': 'Song not found or could not be deleted',
                'status': 'error'
            }), 404
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to delete song: {str(e)}",
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

# YouTube Music Search History and Trending Management
search_history = []  # Simple in-memory search history
trending_queries = [
    "shape of you", "blinding lights", "bad habits", "stay", "heat waves",
    "as it was", "about damn time", "unholy", "flowers", "creepin",
    "anti hero", "golden hour", "watermelon sugar", "drivers license", "positions",
    "levitating", "good 4 u", "industry baby", "montero", "peaches",
    "dua lipa", "the weeknd", "harry styles", "taylor swift", "ariana grande",
    "billie eilish", "olivia rodrigo", "doja cat", "post malone", "ed sheeran",
    "hip hop 2024", "pop hits", "electronic music", "indie rock", "jazz",
    "classical music", "country hits", "r&b soul", "reggaeton", "k-pop"
]

def add_to_search_history(query):
    """Add a search query to the history (limit to last 100)"""
    global search_history
    query = query.strip().lower()
    if query and query not in search_history:
        search_history.insert(0, query)
        search_history = search_history[:100]  # Keep only last 100 searches

def get_search_suggestions(query, limit=5):
    """Get search suggestions from history and trending"""
    query_lower = query.lower().strip()
    suggestions = []
    
    # Get matching search history
    history_matches = [
        h for h in search_history 
        if query_lower in h and h != query_lower
    ][:3]  # Limit history suggestions
    
    # Get matching trending queries
    trending_matches = [
        t for t in trending_queries 
        if query_lower in t.lower() and t.lower() != query_lower
    ][:4]  # Limit trending suggestions
    
    # Add history suggestions
    for match in history_matches:
        suggestions.append({
            'text': match,
            'type': 'history',
            'source': 'recent_search'
        })
    
    # Add trending suggestions
    for match in trending_matches:
        suggestions.append({
            'text': match,
            'type': 'trending',
            'source': 'popular'
        })
    
    return suggestions[:limit]

@app.route('/youtube/trending', methods=['GET'])
def get_trending_suggestions():
    """Get trending/popular search suggestions."""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        # Return a mix of trending and recent searches
        suggestions = []
        
        # Add recent search history (first 5)
        for query in search_history[:5]:
            suggestions.append({
                'text': query,
                'type': 'recent',
                'source': 'search_history'
            })
        
        # Add trending queries
        for query in trending_queries[:10]:
            suggestions.append({
                'text': query,
                'type': 'trending',
                'source': 'popular'
            })
        
        return jsonify({
            "suggestions": suggestions,
            "status": "success"
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to get trending suggestions: {str(e)}",
            "status": "error"
        }), 500

@app.route('/youtube/autocomplete', methods=['POST'])
def youtube_autocomplete():
    """Get autocomplete suggestions for YouTube Music search."""
    
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
        
        query = request_json.get('query', '').strip()
        if not query or len(query) < 2:  # Minimum 2 characters for autocomplete
            # Return trending/recent suggestions when no query
            trending_suggestions = get_search_suggestions('', 8)
            return jsonify({
                "suggestions": trending_suggestions,
                "status": "success"
            })
        
        # Limit results for autocomplete (faster response)
        limit = min(request_json.get('limit', 5), 10)
        
        print(f"🔍 Getting autocomplete suggestions for: '{query}'")
        
        # Get suggestions from search history and trending first (fast)
        history_suggestions = get_search_suggestions(query, 3)
        
        # Use ytmusicapi search for autocomplete with limited results
        if not ytmusic:
            return jsonify({
                "error": "YouTube Music API not available",
                "status": "error"
            }), 500
        
        search_results = ytmusic.search(query, filter='songs', limit=limit)
        
        # Transform results to autocomplete format
        suggestions = []
        seen_suggestions = set()  # Track duplicates
        
        for result in search_results:
            try:
                title = result.get('title', '').strip()
                artist_name = ''
                if result.get('artists') and len(result['artists']) > 0:
                    artist_name = result['artists'][0]['name'].strip()
                
                if title and artist_name:
                    # Create different suggestion formats
                    full_suggestion = f"{title} - {artist_name}"
                    title_suggestion = title
                    artist_suggestion = artist_name
                    
                    # Add suggestions (avoid duplicates)
                    if full_suggestion not in seen_suggestions and len(full_suggestion) <= 100:
                        suggestions.append({
                            'text': full_suggestion,
                            'type': 'song',
                            'title': title,
                            'artist': artist_name
                        })
                        seen_suggestions.add(full_suggestion)
                    
                    # Add title-only suggestion if different and relevant
                    if (title_suggestion not in seen_suggestions and 
                        title_suggestion.lower() != full_suggestion.lower() and
                        query.lower() in title_suggestion.lower()):
                        suggestions.append({
                            'text': title_suggestion,
                            'type': 'title',
                            'title': title,
                            'artist': artist_name
                        })
                        seen_suggestions.add(title_suggestion)
                    
                    # Add artist-only suggestion if different and relevant
                    if (artist_suggestion not in seen_suggestions and 
                        artist_suggestion.lower() != full_suggestion.lower() and
                        query.lower() in artist_suggestion.lower()):
                        suggestions.append({
                            'text': artist_suggestion,
                            'type': 'artist',
                            'title': title,
                            'artist': artist_name
                        })
                        seen_suggestions.add(artist_suggestion)
                    
                    if len(suggestions) >= limit:
                        break
                        
            except Exception as e:
                print(f"Error processing autocomplete result: {str(e)}")
                continue
        
        # Sort suggestions by relevance (exact matches first, then partial)
        query_lower = query.lower()
        suggestions.sort(key=lambda x: (
            0 if x['text'].lower().startswith(query_lower) else 1,  # Starts with query first
            len(x['text']),  # Shorter suggestions first
            x['text'].lower()  # Alphabetical order
        ))
        
        # Combine history suggestions with ytmusic suggestions
        all_suggestions = history_suggestions + suggestions
        
        # Remove duplicates while preserving order
        seen = set()
        unique_suggestions = []
        for suggestion in all_suggestions:
            text_lower = suggestion['text'].lower()
            if text_lower not in seen:
                unique_suggestions.append(suggestion)
                seen.add(text_lower)
        
        print(f"✅ Generated {len(unique_suggestions)} autocomplete suggestions for: '{query}'")
        
        return jsonify({
            "suggestions": unique_suggestions[:limit],
            "query": query,
            "status": "success"
        })
        
    except Exception as e:
        print(f"❌ YouTube autocomplete error: {str(e)}")
        return jsonify({
            "error": f"Autocomplete failed: {str(e)}",
            "status": "error"
        }), 500

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
        
        # Add successful search to history
        add_to_search_history(query)
        
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
def verify_audio_quality(file_path):
    """Verify the actual bitrate of an audio file"""
    try:
        from mutagen.mp3 import MP3
        
        # Try to get bitrate from MP3 file
        try:
            audio_file = MP3(file_path)
            if audio_file.info and hasattr(audio_file.info, 'bitrate'):
                actual_bitrate = getattr(audio_file.info, 'bitrate', None)
                if actual_bitrate:
                    print(f"📈 Verified MP3 bitrate: {actual_bitrate} bps ({actual_bitrate // 1000} kbps)")
                    return actual_bitrate // 1000  # Convert to kbps
        except Exception as e:
            print(f"🔍 Mutagen bitrate detection failed: {str(e)}")
        
        # Fallback: estimate from file size and duration using pydub
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_file(file_path)
            file_size = os.path.getsize(file_path)
            duration_seconds = len(audio) / 1000.0
            
            if duration_seconds > 0:
                # Calculate bitrate: (file_size_bytes * 8) / duration_seconds / 1000
                estimated_bitrate = int((file_size * 8) / duration_seconds / 1000)
                print(f"📏 Estimated bitrate from file analysis: {estimated_bitrate} kbps")
                return estimated_bitrate
        except Exception as e:
            print(f"🔍 Pydub bitrate estimation failed: {str(e)}")
        
        # Final fallback: try using ffprobe if available
        try:
            import subprocess
            result = subprocess.run([
                'ffprobe', '-v', 'quiet', '-show_entries', 
                'format=bit_rate', '-of', 'csv=p=0', file_path
            ], capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0 and result.stdout.strip():
                bitrate_bps = int(result.stdout.strip())
                bitrate_kbps = bitrate_bps // 1000
                print(f"📈 FFprobe verified bitrate: {bitrate_kbps} kbps")
                return bitrate_kbps
        except Exception as e:
            print(f"🔍 FFprobe bitrate detection failed: {str(e)}")
        
        print(f"⚠️ Could not verify audio quality for {file_path}")
        return None
        
    except Exception as e:
        print(f"❌ Quality verification failed: {str(e)}")
        return None

def convert_to_320kbps_mp3(temp_path, final_path, download_id=None):
    """Convert audio file to 320kbps MP3 format (CBR) and verify.
    We first try via pydub/ffmpeg; if the detected bitrate is < 320kbps
    we force a second pass using a direct ffmpeg command with CBR flags.
    """
    try:
        from pydub import AudioSegment
        
        print(f"🔄 Converting to guaranteed 320kbps MP3: {temp_path} -> {final_path}")
        
        # Emit conversion start progress
        if download_id:
            emit_progress(download_id, {
                'stage': 'converting',
                'progress': 92,
                'message': 'Converting to 320kbps MP3...',
                'quality': '320kbps',
                'format': 'mp3',
                'timestamp': time.time(),
                'percentage': 92
            })
        
        # Load audio file
        try:
            audio = AudioSegment.from_file(temp_path)
            if not audio:
                raise Exception("Could not load audio file")
            
            print(f"📈 Source audio info: {len(audio)}ms duration, {audio.frame_rate}Hz sample rate")
        except Exception as load_error:
            print(f"❌ Failed to load audio file: {str(load_error)}")
            # Fallback: just move the file
            try:
                import shutil
                shutil.move(temp_path, final_path)
                print(f"⚠️ Saved without conversion - format may not be guaranteed")
                return True
            except Exception as move_error:
                print(f"❌ Failed to move file: {str(move_error)}")
                return False
        
        # Export as MP3 with constant 320kbps using LAME
        # Note: do NOT mix -q:a with -b:a when forcing CBR
        print(f"🎧 Converting to 320kbps CBR MP3: {final_path}")
        audio.export(
            final_path,
            format="mp3",
            bitrate="320k",
            parameters=[
                "-vn",  # no video
                "-codec:a", "libmp3lame",
                "-b:a", "320k",
                "-minrate", "320k",
                "-maxrate", "320k",
                "-bufsize", "64k",
                "-ar", "44100",
                "-ac", "2",
                "-write_xing", "0"  # hint CBR by disabling Xing
            ],
        )
        
        if os.path.exists(final_path):
            output_size = os.path.getsize(final_path)
            print(f"✅ Initial MP3 conversion done: {final_path} ({output_size} bytes)")
            # Verify bitrate; if < 320, force ffmpeg CBR encode
            try:
                actual = verify_audio_quality(final_path)
            except Exception:
                actual = None
            if actual is None or actual < 320:
                print(f"⚠️ Verified bitrate {actual}kbps < 320; forcing CBR re-encode via ffmpeg...")
                try:
                    import subprocess
                    subprocess.run([
                        "ffmpeg", "-y", "-i", final_path,
                        "-vn",
                        "-codec:a", "libmp3lame",
                        "-b:a", "320k",
                        "-minrate", "320k",
                        "-maxrate", "320k",
                        "-bufsize", "64k",
                        "-ar", "44100",
                        "-ac", "2",
                        "-write_xing", "0",
                        final_path + ".tmp.mp3"
                    ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    # atomically replace
                    import os as _os
                    _os.replace(final_path + ".tmp.mp3", final_path)
                    actual2 = verify_audio_quality(final_path)
                    print(f"🎯 Final verified bitrate after force CBR: {actual2}kbps")
                except Exception as _e:
                    print(f"❌ Force CBR re-encode failed: {_e}")
            return True
        else:
            print(f"❌ Conversion failed - output file not created")
            return False
            
    except ImportError:
        print(f"⚠️ pydub not available, cannot guarantee 320kbps quality")
        # Move file as-is but warn about quality
        try:
            import shutil
            shutil.move(temp_path, final_path)
            print(f"⚠️ Saved without conversion - pydub not available")
            return True
        except Exception as move_error:
            print(f"❌ Failed to move file: {str(move_error)}")
            return False
    except Exception as e:
        print(f"❌ MP3 conversion failed: {str(e)}")
        # Fallback: try to move original file
        try:
            import shutil
            shutil.move(temp_path, final_path)
            print(f"⚠️ Saved as fallback without full conversion")
            return True
        except Exception as move_error:
            print(f"❌ Failed to save file: {str(move_error)}")
            return False

def enhance_metadata_with_artwork(file_path, metadata):
    """Enhance MP3 metadata and embed artwork"""
    try:
        from mutagen.mp3 import MP3
        from mutagen.id3 import ID3
        from PIL import Image
        import requests
        import io
        
        print(f"📝 Enhancing metadata for: {file_path}")
        
        # Load or create ID3 tags
        try:
            audio = MP3(file_path, ID3=ID3)
            if audio.tags is None:
                audio.add_tags()
        except Exception as load_error:
            print(f"⚠️ Could not load MP3 file for metadata: {str(load_error)}")
            return False
        
        # Ensure tags are properly initialized before writing
        if audio.tags is None:
            print(f"❌ Failed to initialize tags for {file_path}")
            return False
        
        # Write basic metadata
        if metadata.get('title'):
            audio.tags.add(TIT2(encoding=3, text=metadata['title']))
            print(f"📝 Added title: {metadata['title']}")
            
        if metadata.get('artist'):
            audio.tags.add(TPE1(encoding=3, text=metadata['artist']))
            print(f"📝 Added artist: {metadata['artist']}")
        
        if metadata.get('album'):
            audio.tags.add(TALB(encoding=3, text=metadata['album']))
            print(f"📝 Added album: {metadata['album']}")
        
        if metadata.get('release_year'):
            audio.tags.add(TDRC(encoding=3, text=str(metadata['release_year'])))
            print(f"📝 Added year: {metadata['release_year']}")
        
        # Download and embed artwork if available
        thumbnail_url = metadata.get('thumbnail_url')
        if thumbnail_url:
            try:
                print(f"🖼️ Downloading artwork from: {thumbnail_url}")
                
                # Download thumbnail
                response = requests.get(thumbnail_url, timeout=10)
                if response.status_code == 200:
                    # Process image
                    try:
                        img = Image.open(io.BytesIO(response.content))
                        
                        # Resize if too large
                        if img.width > 500 or img.height > 500:
                            img.thumbnail((500, 500), Image.Resampling.LANCZOS)
                        
                        # Convert to JPEG if not already
                        if img.format != 'JPEG':
                            img = img.convert('RGB')
                        
                        # Save to bytes
                        img_bytes = io.BytesIO()
                        img.save(img_bytes, format='JPEG', quality=90)
                        img_data = img_bytes.getvalue()
                        
                        # Embed artwork
                        if audio.tags is not None:
                            audio.tags.add(APIC(
                                encoding=3,
                                mime='image/jpeg',
                                type=3,  # Cover (front)
                                desc='Album cover',
                                data=img_data
                            ))
                            print(f"🖼️ Successfully embedded artwork ({len(img_data)} bytes)")
                        else:
                            print(f"⚠️ Cannot embed artwork - tags not initialized")
                        
                    except Exception as img_error:
                        print(f"⚠️ Image processing failed: {str(img_error)}")
                        
                else:
                    print(f"⚠️ Failed to download artwork: HTTP {response.status_code}")
                    
            except Exception as artwork_error:
                print(f"⚠️ Artwork download failed: {str(artwork_error)}")
        
        # Save all changes
        try:
            audio.save()
            print(f"✅ Enhanced metadata saved successfully")
            return True
        except Exception as save_error:
            print(f"⚠️ Failed to save metadata: {str(save_error)}")
            return False
            
    except ImportError as import_error:
        print(f"⚠️ Missing dependencies for metadata enhancement: {str(import_error)}")
        return False
    except Exception as e:
        print(f"⚠️ Metadata enhancement failed: {str(e)}")
        return False

def download_with_ytdlp(url, output_path, title, artist):
    """Download using yt-dlp (more reliable) - ensures highest quality available for 320kbps output"""
    try:
        ydl_opts = {
            # Prioritize high-quality audio formats, prefer 320kbps+ when available
            'format': 'bestaudio[abr>=320]/bestaudio[abr>=256]/bestaudio[abr>=192]/bestaudio/best[height<=720]',
            'outtmpl': output_path,
            'noplaylist': True,
            'extractaudio': True,
            'audioformat': 'mp4',  # Keep as MP4 for later conversion to 320kbps MP3
            'audioquality': '0',  # Best available quality
            'prefer_free_formats': False,  # Allow proprietary formats for better quality
            'postprocessors': [],  # Don't convert yet, we'll handle it with pydub at 320kbps
            'quiet': False,
            'no_warnings': False,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f"🎵 yt-dlp downloading with high-quality settings for 320kbps output: {url}")
            
            # First, get info to check available formats and show quality info
            try:
                info = ydl.extract_info(url, download=False)
                if info and info.get('formats'):
                    formats = info['formats']
                    audio_formats = [f for f in formats if f.get('acodec') and f.get('acodec') != 'none']
                    if audio_formats:
                        # Sort by bitrate and show what we're getting
                        best_audio = sorted(audio_formats, key=lambda x: x.get('abr', 0) or 0, reverse=True)
                        if best_audio:
                            best_bitrate = best_audio[0].get('abr', 'unknown')
                            print(f"🎧 Best available source quality: {best_bitrate} kbps (will convert to 320kbps MP3)")
            except Exception:
                print(f"🎧 Downloading best available quality for 320kbps conversion")
            
            # Now download
            ydl.download([url])
            
        return os.path.exists(output_path)
        
    except Exception as e:
        print(f"❌ yt-dlp download failed: {str(e)}")
        return False

def download_with_ytdlp_enhanced(url, output_path, title, artist, download_id):
    """Enhanced download using yt-dlp with real-time progress and metadata extraction"""
    try:
        # Emit initial progress
        emit_progress(download_id, {
            'stage': 'initializing',
            'progress': 0,
            'message': 'Initializing download...'
        })
        
        def progress_hook(d):
            if d['status'] == 'downloading':
                total_bytes = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                downloaded_bytes = d.get('downloaded_bytes', 0)
                speed = d.get('speed', 0)
                
                if total_bytes > 0:
                    # Enhanced progress calculation with more granular updates
                    progress = min(int((downloaded_bytes / total_bytes) * 90), 90)  # Cap at 90% for download
                    
                    # Calculate ETA with better accuracy
                    remaining_bytes = total_bytes - downloaded_bytes
                    eta_seconds = remaining_bytes / speed if speed > 0 else 0
                    
                    # Format speed for display
                    speed_mb = speed / (1024 * 1024) if speed > 0 else 0
                    
                    # Enhanced progress data with more details
                    progress_data = {
                        'stage': 'downloading',
                        'progress': progress,
                        'message': f'Downloading... {progress}%',
                        'downloaded_bytes': downloaded_bytes,
                        'total_bytes': total_bytes,
                        'speed': speed,
                        'speed_mb': speed_mb,
                        'eta_seconds': eta_seconds,
                        'fragment_index': d.get('fragment_index', 0),
                        'fragment_count': d.get('fragment_count', 0),
                        'quality': '320kbps',  # Target quality
                        'format': 'mp3',
                        'timestamp': time.time(),
                        'percentage': progress,
                        'bytes_per_second': speed,
                        'remaining_bytes': remaining_bytes
                    }
                    
                    # Emit progress with enhanced data
                    emit_progress(download_id, progress_data)
                else:
                    # No total size available, show indeterminate progress
                    progress_data = {
                        'stage': 'downloading',
                        'progress': 0,
                        'message': f'Downloading... {format_bytes(downloaded_bytes)}',
                        'downloaded_bytes': downloaded_bytes,
                        'total_bytes': 0,
                        'speed': speed,
                        'speed_mb': speed / (1024 * 1024) if speed > 0 else 0,
                        'quality': '320kbps',
                        'format': 'mp3',
                        'timestamp': time.time(),
                        'percentage': 0,
                        'bytes_per_second': speed,
                        'remaining_bytes': 0
                    }
                    emit_progress(download_id, progress_data)
            elif d['status'] == 'finished':
                emit_progress(download_id, {
                    'stage': 'converting',
                    'progress': 90,
                    'message': 'Download complete, converting to MP3...',
                    'quality': '320kbps',
                    'format': 'mp3',
                    'timestamp': time.time(),
                    'percentage': 90
                })
            elif d['status'] == 'error':
                emit_progress(download_id, {
                    'stage': 'error',
                    'progress': 0,
                    'message': f'Download error: {d.get("error", "Unknown error")}',
                    'timestamp': time.time(),
                    'percentage': 0
                })
        
        ydl_opts = {
            # Enhanced format selection for maximum quality
            'format': 'bestaudio[abr>=320]/bestaudio[abr>=256]/bestaudio[abr>=192]/bestaudio/best[height<=720]',
            'outtmpl': output_path,
            'noplaylist': True,
            'extractaudio': True,
            'audioformat': 'mp4',  # Keep as MP4 for later conversion to ensure 320kbps
            'audioquality': '0',  # Best available quality
            'prefer_free_formats': False,
            'postprocessors': [],  # Don't convert yet, we'll handle it with pydub at 320kbps
            'writeinfojson': True,  # Extract metadata
            'writethumbnail': True,  # Download thumbnail for artwork
            'embedthumbnail': False,  # We'll handle artwork manually
            'quiet': False,
            'no_warnings': False,
            'progress_hooks': [progress_hook],
            # Additional options for better compatibility
            'extractor_retries': 3,
            'fragment_retries': 3,
            'retries': 3,
            'socket_timeout': 30,
            'http_chunk_size': 10485760,  # 10MB chunks
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f"🎵 Enhanced yt-dlp downloading with 320kbps and metadata: {url}")
            
            # Extract info first for metadata
            try:
                info = ydl.extract_info(url, download=False)
                metadata = {'title': title, 'artist': artist}
                
                if info:
                    emit_progress(download_id, {
                        'stage': 'extracting',
                        'progress': 10,
                        'message': 'Extracting video information...'
                    })
                    
                    # Get enhanced metadata
                    metadata = {
                        'title': info.get('title', title),
                        'artist': info.get('uploader', artist),
                        'album': info.get('album'),
                        'release_year': info.get('release_year'),
                        'description': info.get('description'),
                        'duration': info.get('duration'),
                        'view_count': info.get('view_count'),
                        'thumbnail_url': info.get('thumbnail'),
                        'webpage_url': info.get('webpage_url'),
                        'upload_date': info.get('upload_date')
                    }
                    
                    print(f"📝 Enhanced metadata extracted: {metadata['title']} by {metadata['artist']}")
            except Exception as e:
                print(f"⚠️ Info extraction failed: {str(e)}")
                metadata = {'title': title, 'artist': artist}
            
            # Start download
            emit_progress(download_id, {
                'stage': 'starting',
                'progress': 15,
                'message': 'Starting download...'
            })
            
            try:
                ydl.download([url])
            except Exception as download_exception:
                print(f"❌ yt-dlp download exception: {str(download_exception)}")
                emit_progress(download_id, {
                    'stage': 'error',
                    'progress': 0,
                    'message': f'Download failed: {str(download_exception)}'
                })
                return False, metadata, None
            
            # Check for the actual downloaded file - yt-dlp might add .mp3 extension
            actual_output_path = output_path
            if not os.path.exists(output_path) and os.path.exists(output_path + '.mp3'):
                actual_output_path = output_path + '.mp3'
                print(f"🔄 Downloaded file found at: {actual_output_path}")
            
            return os.path.exists(actual_output_path), metadata, actual_output_path
            
    except Exception as e:
        print(f"❌ Enhanced yt-dlp download failed: {str(e)}")
        emit_progress(download_id, {
            'stage': 'error',
            'progress': 0,
            'message': f'Download failed: {str(e)}'
        })
        return False, {}, None

def write_enhanced_metadata(file_path, metadata, download_id):
    """Write enhanced metadata and artwork to MP3 file"""
    try:
        emit_progress(download_id, {
            'stage': 'metadata',
            'progress': 95,
            'message': 'Writing metadata and artwork...',
            'quality': '320kbps',
            'format': 'mp3',
            'timestamp': time.time(),
            'percentage': 95
        })
        
        # Load or create ID3 tags
        try:
            audio = MP3(file_path, ID3=ID3)
            if audio.tags is None:
                audio.add_tags()
        except Exception:
            return False
        
        # Ensure tags are properly initialized before writing
        if audio.tags is None:
            print(f"❌ Failed to initialize tags for {file_path}")
            return False
        
        # Write basic metadata
        audio.tags.add(TIT2(encoding=3, text=metadata.get('title', '')))
        audio.tags.add(TPE1(encoding=3, text=metadata.get('artist', '')))
        
        if metadata.get('album'):
            audio.tags.add(TALB(encoding=3, text=metadata['album']))
        
        if metadata.get('release_year'):
            audio.tags.add(TDRC(encoding=3, text=str(metadata['release_year'])))
        
        # Download and embed artwork if available
        thumbnail_url = metadata.get('thumbnail_url')
        if thumbnail_url:
            try:
                print(f"🇺️ Downloading artwork from: {thumbnail_url}")
                
                # Download thumbnail
                response = requests.get(thumbnail_url, timeout=10)
                if response.status_code == 200:
                    # Process image
                    img_data = response.content
                    
                    # Convert to JPEG if needed and resize
                    with Image.open(io.BytesIO(img_data)) as img:
                        # Convert to RGB if needed
                        if img.mode in ('RGBA', 'LA', 'P'):
                            img = img.convert('RGB')
                        
                        # Resize to reasonable size (500x500 max)
                        if img.size[0] > 500 or img.size[1] > 500:
                            img.thumbnail((500, 500), Image.Resampling.LANCZOS)
                        
                        # Save as JPEG
                        img_buffer = io.BytesIO()
                        img.save(img_buffer, format='JPEG', quality=90)
                        img_data = img_buffer.getvalue()
                    
                    # Embed artwork
                    if audio.tags is not None:
                        audio.tags.add(APIC(
                            encoding=3,
                            mime='image/jpeg',
                            type=3,  # Cover (front)
                            desc='Cover',
                            data=img_data
                        ))
                        print(f"✅ Artwork embedded successfully")
                    else:
                        print(f"⚠️ Cannot embed artwork - tags not initialized")
                else:
                    print(f"⚠️ Failed to download artwork: {response.status_code}")
            except Exception as e:
                print(f"⚠️ Artwork embedding failed: {str(e)}")
        
        # Save the tags
        audio.save()
        print(f"✅ Enhanced metadata written to {file_path}")
        return True
        
    except Exception as e:
        print(f"❌ Metadata writing failed: {str(e)}")
        return False

def download_with_pytube(url, output_path, title, artist):
    """Fallback download using pytube - ensures highest quality for 320kbps output"""
    try:
        print(f"🔍 Creating YouTube object with pytube for 320kbps conversion...")
        yt = YouTube(url, use_oauth=False, allow_oauth_cache=False)
        
        # Get video info first to validate
        print(f"📹 Video title: {yt.title}")
        print(f"⏱️ Video length: {yt.length} seconds")
        
        if yt.length and yt.length > 1200:  # 20 minutes
            print(f"⚠️ Video too long: {yt.length} seconds")
            return False
        
        # Get audio streams and prioritize highest quality
        print(f"🎧 Getting audio streams for 320kbps conversion...")
        
        # Try different stream selection strategies for best quality
        audio_streams = None
        
        # First: Try to get MP4 audio streams (usually highest quality)
        audio_streams = yt.streams.filter(only_audio=True, file_extension='mp4')
        
        # Second: Try webm audio streams if no MP4
        if not audio_streams:
            audio_streams = yt.streams.filter(only_audio=True, file_extension='webm')
        
        # Third: Try any audio-only streams
        if not audio_streams:
            audio_streams = yt.streams.filter(only_audio=True)
        
        # Fourth: Try progressive streams with video (as last resort)
        if not audio_streams:
            audio_streams = yt.streams.filter(progressive=True, file_extension='mp4')
        
        if not audio_streams:
            print(f"❌ No audio streams available")
            return False
        
        # Select the stream with highest bitrate
        audio_stream = audio_streams.order_by('abr').desc().first()
        
        if not audio_stream:
            print(f"❌ No suitable audio stream found")
            return False
        
        # Report the quality we're downloading
        source_bitrate = audio_stream.abr if hasattr(audio_stream, 'abr') else 'unknown'
        print(f"🎵 Selected source stream: {source_bitrate} kbps (will convert to 320kbps MP3)")
        
        # Download
        temp_dir = os.path.dirname(output_path)
        temp_filename = os.path.basename(output_path)
        
        audio_stream.download(output_path=temp_dir, filename=temp_filename)
        
        return os.path.exists(output_path)
        
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
            'format': 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
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
            best_format = sorted(audio_formats, key=lambda x: x.get('abr') or 0, reverse=True)[0]
            stream_url = best_format.get('url')
            
            if not stream_url:
                return jsonify({"error": "Could not extract stream URL"}), 500
            
            # Stream the audio directly
            import requests
            
            # Get the audio stream from YouTube
            stream_response = requests.get(stream_url, stream=True, timeout=30)
            
            if stream_response.status_code != 200:
                return jsonify({"error": "Failed to fetch audio stream"}), 500
            
            # Set appropriate headers for audio streaming
            def generate():
                try:
                    for chunk in stream_response.iter_content(chunk_size=8192):
                        if chunk:
                            yield chunk
                except Exception as e:
                    print(f"❌ Stream generation error: {str(e)}")
                    return
            
            # Return the audio stream with proper headers
            return app.response_class(
                generate(),
                mimetype='audio/mpeg',
                headers={
                    'Content-Type': 'audio/mpeg',
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Range, Content-Type',
                    'Access-Control-Expose-Headers': 'Content-Length, Content-Range'
                }
            )
            
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
        
        print(f"🎵 Downloading with 320kbps MP3 format enforcement: {title} by {artist}")
        print(f"📁 Download path: {download_path}")
        print(f"🔗 URL: {url}")
        print(f"🎧 Target format: 320kbps MP3 (guaranteed)")
        
        # Create safe filename
        safe_title = "".join(c for c in f"{artist} - {title}" if c.isalnum() or c in (' ', '-', '_')).rstrip()
        if len(safe_title) > 200:  # Limit filename length
            safe_title = safe_title[:200]
        temp_filename = f"{safe_title}.mp4"
        final_filename = f"{safe_title}.mp3"
        
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
        
        try:
            # Use yt-dlp first (more reliable)
            print(f"🔍 Attempting download with yt-dlp...")
            success = download_with_ytdlp(url, temp_path, title, artist)
            
            if not success:
                print(f"🔄 yt-dlp failed, trying pytube fallback...")
                success = download_with_pytube(url, temp_path, title, artist)
            
            if not success:
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
        
        # Convert to MP3 with guaranteed 320kbps using pydub
        try:
            print(f"🔄 Converting to guaranteed 320kbps MP3...")
            
            # Check if pydub is available
            try:
                from pydub import AudioSegment
            except ImportError:
                print(f"⚠️ pydub not available, cannot guarantee 320kbps quality")
                # Move file as-is but warn about quality
                try:
                    shutil.move(temp_path, final_path)
                    uploaded_files[final_filename] = final_path
                    return jsonify({
                        "error": "Audio conversion unavailable - file saved but quality not guaranteed to be 320kbps",
                        "status": "partial_success",
                        "file_path": final_path,
                        "bitrate": "unknown"  # Can't guarantee 320kbps without conversion
                    }), 200
                except Exception as move_error:
                    return jsonify({
                        "error": f"Failed to save file: {str(move_error)}",
                        "status": "error"
                    }), 500
            
            # Verify source file exists
            if not os.path.exists(temp_path):
                return jsonify({
                    "error": "Downloaded file not found for conversion",
                    "status": "error"
                }), 500
            
            # Load the downloaded audio file
            print(f"📁 Loading source audio file: {temp_path}")
            try:
                # Try different format detection methods
                audio = None
                file_extension = os.path.splitext(temp_path)[1].lower() if temp_path else '.unknown'
                
                if file_extension == '.mp4':
                    audio = AudioSegment.from_file(temp_path, format="mp4")
                elif file_extension == '.webm':
                    audio = AudioSegment.from_file(temp_path, format="webm")
                else:
                    # Auto-detect format
                    audio = AudioSegment.from_file(temp_path)
                
                if not audio:
                    raise Exception("Could not load audio file")
                
                print(f"📈 Source audio info: {len(audio)}ms duration, {audio.frame_rate}Hz sample rate")
                
            except Exception as load_error:
                print(f"❌ Failed to load audio file: {str(load_error)}")
                # Fallback: just move the file
                try:
                    shutil.move(temp_path, final_path)
                    uploaded_files[final_filename] = final_path
                    return jsonify({
                        "error": f"Audio conversion failed but file saved: {str(load_error)}",
                        "status": "partial_success",
                        "file_path": final_path,
                        "bitrate": "unknown"
                    }), 200
                except Exception as move_error:
                    return jsonify({
                        "error": f"Failed to process audio file: {str(move_error)}",
                        "status": "error"
                    }), 500
            
            # Export as MP3 with constant 320kbps using LAME
            print(f"🎧 Converting to 320kbps CBR MP3: {final_path}")
            audio.export(
                final_path,
                format="mp3",
                bitrate="320k",
                parameters=[
                    "-vn",
                    "-codec:a", "libmp3lame",
                    "-b:a", "320k",
                    "-minrate", "320k",
                    "-maxrate", "320k",
                    "-bufsize", "64k",
                    "-ar", "44100",
                    "-ac", "2",
                    "-write_xing", "0"
                ],
            )
            
            # Verify the output file was created and has content
            if not os.path.exists(final_path):
                raise Exception("MP3 conversion failed - output file not created")
            
            # Verify file is actually MP3 format
            if not final_path.lower().endswith('.mp3'):
                raise Exception("File format validation failed - not MP3")
            
            output_size = os.path.getsize(final_path)
            if output_size < 1024:  # Less than 1KB indicates failure
                raise Exception(f"MP3 conversion failed - output file too small ({output_size} bytes)")
            
            # Additional MP3 format verification using file header
            try:
                with open(final_path, 'rb') as f:
                    header = f.read(3)
                    # Check for MP3 file signature (ID3 tag or MP3 frame sync)
                    if not (header.startswith(b'ID3') or header.startswith(b'\xff\xfb') or header.startswith(b'\xff\xfa')):
                        print(f"⚠️ Warning: MP3 header validation inconclusive, but file should be MP3")
            except Exception:
                pass  # Header check is optional
            
            # Clean up temporary file
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
                
            print(f"✅ Successfully converted to 320kbps MP3 format: {final_path} ({output_size} bytes)")
            
        except Exception as e:
            # Enhanced fallback handling with MP3 format priority
            print(f"⚠️ MP3 conversion failed, attempting format-preserving fallback: {str(e)}")
            try:
                # Try to move original file but prefer MP3 naming
                if temp_path and os.path.exists(temp_path):
                    # Check if we can attempt a simple rename to MP3 (may work for some formats)
                    try:
                        # Attempt direct rename to MP3 (works for some compatible formats)
                        simple_mp3_path = final_path  # This already ends in .mp3
                        shutil.move(temp_path, simple_mp3_path)
                        uploaded_files[final_filename] = simple_mp3_path
                        
                        print(f"⚠️ Saved as MP3 without full conversion - format may not be guaranteed")
                        
                        return jsonify({
                            "error": f"320kbps MP3 conversion failed, saved as MP3 but quality not guaranteed: {str(e)}",
                            "status": "partial_success",
                            "file_path": simple_mp3_path,
                            "filename": final_filename,
                            "format_info": {
                                "format": "MP3 (unverified)",
                                "bitrate": "original_quality",
                                "conversion_status": "failed"
                            }
                        }), 200
                        
                    except Exception:
                        # If MP3 rename fails, save with original extension but warn
                        original_ext = os.path.splitext(temp_path)[1] if temp_path else '.unknown' or '.unknown'
                        fallback_path = final_path.replace('.mp3', f'_original{original_ext}')
                        shutil.move(temp_path, fallback_path)
                        uploaded_files[os.path.basename(fallback_path)] = fallback_path
                        
                        return jsonify({
                            "error": f"MP3 conversion failed, saved in original format{original_ext}: {str(e)}",
                            "status": "partial_success",
                            "file_path": fallback_path,
                            "filename": os.path.basename(fallback_path),
                            "format_info": {
                                "format": f"Original{original_ext.upper()}",
                                "bitrate": "original_quality",
                                "conversion_status": "failed",
                                "note": "Not in MP3 format - manual conversion recommended"
                            }
                        }), 200
                else:
                    return jsonify({
                        "error": f"File processing completely failed: {str(e)}",
                        "status": "error"
                    }), 500
            except Exception as move_error:
                print(f"❌ Failed to save any file: {str(move_error)}")
                return jsonify({
                    "error": f"Complete file processing failure: {str(move_error)}",
                    "status": "error"
                }), 500
        
        # Add to uploaded files for audio serving
        uploaded_files[final_filename] = final_path
        
        # Analyze the downloaded file
        print(f"🔍 Analyzing downloaded file...")
        try:
            analysis_result = analyze_music_file(final_path)
            
            # Verify actual audio quality
            actual_bitrate = verify_audio_quality(final_path)
            
            # Add download metadata
            analysis_result['filename'] = final_filename
            analysis_result['file_path'] = final_path
            analysis_result['youtube_url'] = url
            analysis_result['youtube_title'] = title
            analysis_result['youtube_artist'] = artist
            # Add standard title and artist fields for frontend compatibility
            analysis_result['title'] = title
            analysis_result['artist'] = artist
            
            # Set bitrate information
            if actual_bitrate and actual_bitrate >= 300:  # Close to 320kbps
                analysis_result['bitrate'] = actual_bitrate  # Use verified bitrate
                analysis_result['quality_verified'] = True
                print(f"✅ Quality verification successful: {actual_bitrate} kbps")
            elif actual_bitrate:
                analysis_result['bitrate'] = actual_bitrate
                analysis_result['quality_verified'] = False
                analysis_result['quality_warning'] = f"Lower than expected quality: {actual_bitrate} kbps"
                print(f"⚠️ Quality warning: {actual_bitrate} kbps (lower than 320kbps target)")
            else:
                analysis_result['bitrate'] = 320  # Assume 320kbps if verification failed
                analysis_result['quality_verified'] = False
                analysis_result['quality_warning'] = "Could not verify audio quality"
                print(f"⚠️ Could not verify quality, assuming 320kbps")
            
            # Write ID3 tags
            try:
                analyzer = MusicAnalyzer()
                tag_result = analyzer.write_id3_tags(final_path, analysis_result)
                analysis_result['tag_write'] = tag_result
            except Exception as e:
                print(f"Failed to write ID3 tags: {str(e)}")
            
            # Automatically rename file with key and BPM information
            rename_result = None
            try:
                if analysis_result.get('camelot_key') and analysis_result.get('bpm'):
                    rename_result = rename_file_with_metadata(final_path, analysis_result)
                    if rename_result.get('renamed'):
                        # Update the uploaded_files mapping with new filename
                        new_filename = rename_result['new_filename']
                        uploaded_files[new_filename] = rename_result['new_path']
                        analysis_result['filename'] = new_filename
                        analysis_result['file_path'] = rename_result['new_path']
                        print(f"✅ Automatically renamed YouTube download: {final_filename} → {new_filename}")
                    else:
                        print(f"⚠️ Failed to rename YouTube download: {rename_result.get('error', 'Unknown error')}")
            except Exception as rename_error:
                print(f"Warning: Failed to rename YouTube download: {str(rename_error)}")
            
            # Save to database
            try:
                file_data = {
                    'filename': analysis_result['filename'],
                    'file_path': analysis_result['file_path'],
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
            
            # Final quality and format report
            quality_status = "verified" if analysis_result.get('quality_verified', False) else "unverified"
            final_bitrate = analysis_result.get('bitrate', 'unknown')
            
            print(f"🎉 Successfully downloaded and analyzed: {analysis_result['filename']}")
            print(f"🎧 Final format and quality: {final_bitrate} kbps MP3 ({quality_status})")
            
            success_message = f"Successfully downloaded and analyzed {title} by {artist} as {final_bitrate} kbps MP3"
            if analysis_result.get('quality_warning'):
                success_message += f" (Warning: {analysis_result['quality_warning']})"
            
            return jsonify({
                "song": analysis_result,
                "status": "success",
                "message": success_message,
                "format_info": {
                    "format": "MP3",
                    "target_bitrate": "320 kbps",
                    "actual_bitrate": f"{final_bitrate} kbps",
                    "quality_verified": analysis_result.get('quality_verified', False),
                    "quality_warning": analysis_result.get('quality_warning'),
                    "file_extension": ".mp3",
                    "auto_rename": rename_result
                }
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

@app.route('/youtube/download-enhanced', methods=['POST'])
def youtube_download_enhanced():
    """Enhanced download with WebSocket progress tracking and comprehensive metadata extraction."""
    
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
        download_id = request_json.get('download_id')
        
        if not url:
            return jsonify({"error": "No URL provided"}), 400
            
        if not download_path:
            return jsonify({"error": "No download path provided"}), 400
        
        # Create download path if it doesn't exist
        if not os.path.exists(download_path):
            try:
                os.makedirs(download_path, exist_ok=True)
                print(f"📁 Created download directory: {download_path}")
            except Exception as e:
                return jsonify({"error": f"Failed to create download path: {str(e)}"}), 400
            
        if not download_id:
            download_id = f"download_{int(time.time())}"
        
        print(f"🚀 Enhanced download started: {title} by {artist}")
        print(f"📁 Download path: {download_path}")
        print(f"🔗 URL: {url}")
        print(f"🆔 Download ID: {download_id}")
        
        # Emit initial progress
        emit_progress(download_id, {
            'stage': 'initializing',
            'progress': 0,
            'message': 'Initializing enhanced download...'
        })
        
        # Create safe filename
        safe_title = "".join(c for c in f"{artist} - {title}" if c.isalnum() or c in (' ', '-', '_')).rstrip()
        if len(safe_title) > 200:  # Limit filename length
            safe_title = safe_title[:200]
        temp_filename = f"{safe_title}.mp4"
        final_filename = f"{safe_title}.mp3"
        
        temp_path = os.path.join(tempfile.gettempdir(), temp_filename)
        final_path = os.path.join(download_path, final_filename)
        
        # Check if file already exists
        if os.path.exists(final_path):
            print(f"⚠️ File already exists: {final_path}")
            # Add timestamp to make unique
            timestamp = int(time.time())
            final_filename = f"{safe_title}_{timestamp}.mp3"
            final_path = os.path.join(download_path, final_filename)
        
        try:
            # Use enhanced yt-dlp download
            print(f"🔍 Starting enhanced download with yt-dlp...")
            print(f"🔗 URL being processed: {url}")
            success, metadata, actual_temp_path = download_with_ytdlp_enhanced(url, temp_path, title, artist, download_id)
            
            if not success:
                print(f"❌ Download failed for URL: {url}")
                emit_progress(download_id, {
                    'stage': 'error',
                    'progress': 0,
                    'message': 'Download failed. Video may be unavailable or restricted.'
                })
                return jsonify({
                    "error": "Download failed. Video may be unavailable or restricted.",
                    "status": "error"
                }), 400
                
            # Use the actual downloaded file path
            temp_path = actual_temp_path
        except Exception as download_error:
            print(f"❌ Enhanced download error: {str(download_error)}")
            emit_progress(download_id, {
                'stage': 'error',
                'progress': 0,
                'message': f'Download failed: {str(download_error)}'
            })
            return jsonify({
                "error": f"Download failed: {str(download_error)}",
                "status": "error"
            }), 500
        
        # Convert to high-quality MP3
        emit_progress(download_id, {
            'stage': 'converting',
            'progress': 93,
            'message': 'Converting to 320kbps MP3...'
        })
        
        conversion_success = False
        try:
            conversion_success = convert_to_320kbps_mp3(temp_path, final_path, download_id)
        except Exception as conversion_error:
            print(f"❌ Conversion error: {str(conversion_error)}")
            emit_progress(download_id, {
                'stage': 'error',
                'progress': 0,
                'message': f'Conversion failed: {str(conversion_error)}'
            })
            return jsonify({
                "error": f"Conversion failed: {str(conversion_error)}",
                "status": "error"
            }), 500
        
        if not conversion_success:
            emit_progress(download_id, {
                'stage': 'error',
                'progress': 0,
                'message': 'Failed to convert to MP3 format'
            })
            return jsonify({
                "error": "Failed to convert to MP3 format",
                "status": "error"
            }), 500
        
        # Enhance metadata with artwork
        emit_progress(download_id, {
            'stage': 'metadata',
            'progress': 96,
            'message': 'Enhancing metadata and artwork...'
        })
        
        try:
            enhance_metadata_with_artwork(final_path, metadata)
            print(f"✅ Enhanced metadata and artwork applied")
        except Exception as metadata_error:
            print(f"⚠️ Metadata enhancement failed: {str(metadata_error)}")
            # Continue without enhanced metadata
        
        # Analyze the downloaded file
        emit_progress(download_id, {
            'stage': 'analyzing',
            'progress': 98,
            'message': 'Analyzing music for key and BPM...',
            'quality': '320kbps',
            'format': 'mp3',
            'timestamp': time.time(),
            'percentage': 98
        })
        
        analysis_result = {}
        try:
            analysis_result = analyze_music_file(final_path)
            print(f"✅ Music analysis completed")
            
            # Emit analysis completion
            emit_progress(download_id, {
                'stage': 'analyzing',
                'progress': 99,
                'message': 'Analysis completed successfully',
                'quality': '320kbps',
                'format': 'mp3',
                'timestamp': time.time(),
                'percentage': 99
            })
        except Exception as analysis_error:
            print(f"⚠️ Analysis failed: {str(analysis_error)}")
            # Continue without analysis
            analysis_result = {
                'key': 'Unknown',
                'scale': 'Unknown',
                'key_name': 'Unknown',
                'camelot_key': 'Unknown',
                'bpm': 0.0,
                'energy_level': 0.0,
                'duration': 0.0,
                'cue_points': []
            }
        
        # Verify audio quality
        actual_bitrate = verify_audio_quality(final_path)
        
        # Add download metadata
        analysis_result['filename'] = final_filename
        analysis_result['file_path'] = final_path
        analysis_result['youtube_url'] = url
        analysis_result['youtube_title'] = title
        analysis_result['youtube_artist'] = artist
        # Add standard title and artist fields for frontend compatibility
        analysis_result['title'] = title
        analysis_result['artist'] = artist

        # Ensure a stable track_id for robust frontend updates/deduplication
        try:
            generated_track_id = db_manager.generate_unique_track_id(final_path, final_filename)
            analysis_result['track_id'] = generated_track_id
        except Exception as _e:
            print(f"⚠️ Failed to generate track_id: {_e}")
        
        # Set bitrate information
        if actual_bitrate and actual_bitrate >= 300:  # Close to 320kbps
            analysis_result['bitrate'] = actual_bitrate  # Use verified bitrate
            analysis_result['quality_verified'] = True
            print(f"✅ Quality verification successful: {actual_bitrate} kbps")
        elif actual_bitrate:
            analysis_result['bitrate'] = actual_bitrate
            analysis_result['quality_verified'] = False
            analysis_result['quality_warning'] = f"Lower than expected quality: {actual_bitrate} kbps"
            print(f"⚠️ Quality warning: {actual_bitrate} kbps (lower than 320kbps target)")
        else:
            analysis_result['bitrate'] = 320  # Assume 320kbps if verification failed
            analysis_result['quality_verified'] = False
            analysis_result['quality_warning'] = "Could not verify audio quality"
        
        # Save to database
        emit_progress(download_id, {
            'stage': 'saving',
            'progress': 99,
            'message': 'Adding to collection...'
        })
        
        try:
            file_data = {
                'filename': final_filename,
                'file_path': final_path,
                'file_size': os.path.getsize(final_path) if os.path.exists(final_path) else 0,
                'key': analysis_result.get('key', 'Unknown'),
                'scale': analysis_result.get('scale', 'Unknown'),
                'key_name': analysis_result.get('key_name', 'Unknown'),
                'camelot_key': analysis_result.get('camelot_key', 'Unknown'),
                'bpm': analysis_result.get('bpm', 0.0),
                'energy_level': analysis_result.get('energy_level', 0.0),
                'duration': analysis_result.get('duration', 0.0),
                'cue_points': analysis_result.get('cue_points', []),
                'status': 'downloaded',
                'youtube_url': url,
                'youtube_title': title,
                'youtube_artist': artist,
                'bitrate': analysis_result.get('bitrate', 320),
                'track_id': analysis_result.get('track_id')
            }
            db_id = db_manager.add_music_file(file_data)
            analysis_result['db_id'] = db_id
            print(f"💾 Saved to database with ID: {db_id}")

            # Ensure 'Downloads' playlist exists and add this song
            try:
                playlists = db_manager.get_all_playlists()
                downloads_playlist = next((p for p in playlists if p.get('name') == 'Downloads'), None)
                if not downloads_playlist:
                    downloads_playlist_id = db_manager.create_playlist(
                        name='Downloads', description='Auto-added downloads', color='#4ecdc4',
                        is_query_based=False, query_criteria=None
                    )
                else:
                    downloads_playlist_id = downloads_playlist['id']
                try:
                    db_manager.add_song_to_playlist(downloads_playlist_id, int(db_id))
                except Exception:
                    pass
            except Exception as _e:
                print(f"⚠️ Failed to update Downloads playlist: {_e}")
        except Exception as e:
            print(f"⚠️ Failed to save to database: {str(e)}")
            # Continue without database save
        
        # Clean up temporary file
        try:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
                print(f"🧹 Cleaned up temporary file: {temp_path}")
        except Exception as cleanup_error:
            print(f"⚠️ Failed to clean up temporary file: {str(cleanup_error)}")
        
        # Final success progress
        final_bitrate = analysis_result.get('bitrate', 320)
        
        # Debug: Log the song payload being sent
        print(f"🎵 Backend sending completion with song payload: {analysis_result.get('title')} by {analysis_result.get('artist')}")
        print(f"🎵 Song payload keys: {list(analysis_result.keys())}")
        
        # Note: When using queue system, completion is handled by queue manager
        # Only emit direct completion if not using queue (for backward compatibility)
        if '_' not in download_id:  # Queue downloads have format "trackId_timestamp"
            emit_progress(download_id, {
                'stage': 'complete',
                'progress': 100,
                'message': f'Download complete! {final_bitrate}kbps MP3 ready.',
                'quality': f"{final_bitrate}kbps",
                'format': 'mp3',
                'timestamp': time.time(),
                'percentage': 100,
                'completed': True,
                'file_size': analysis_result.get('file_size', 0),
                'duration': analysis_result.get('duration', 0),
                'song': analysis_result,
                'download_path': download_path
            })
        
        print(f"🎉 Enhanced download completed successfully: {final_path}")
        
        return jsonify({
            "status": "success",
            "message": "Enhanced download completed successfully",
            "song": analysis_result,
            "enhanced_features": {
                "format": "MP3",
                "target_bitrate": "320 kbps",
                "actual_bitrate": f"{final_bitrate} kbps",
                "quality_verified": analysis_result.get('quality_verified', False),
                "quality_warning": analysis_result.get('quality_warning'),
                "metadata_enhanced": True,
                "artwork_embedded": True,
                "auto_analyzed": True,
                "added_to_collection": True,
                "file_extension": ".mp3"
            }
        })
        
    except Exception as e:
        print(f"❌ Enhanced download error: {str(e)}")
        # Use a fallback download_id if it's not defined
        error_download_id = locals().get('download_id', f"error_{int(time.time())}")
        emit_progress(error_download_id, {
            'stage': 'error',
            'progress': 0,
            'message': f'Download failed: {str(e)}'
        })
        return jsonify({
            "error": f"Enhanced download failed: {str(e)}",
            "status": "error"
        }), 500

@app.route('/youtube/download-queued', methods=['POST'])
def youtube_download_queued():
    """Add a download to the queue system for efficient multi-download handling."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        url = request_json.get('url')
        title = request_json.get('title', 'Unknown Title')
        artist = request_json.get('artist', 'Unknown Artist')
        album = request_json.get('album')
        download_path = request_json.get('download_path')
        download_id = request_json.get('download_id')
        priority = request_json.get('priority', 'normal')
        
        if not url:
            return jsonify({"error": "No URL provided"}), 400
            
        if not download_path:
            return jsonify({"error": "No download path provided"}), 400
        
        # Create download path if it doesn't exist
        if not os.path.exists(download_path):
            try:
                os.makedirs(download_path, exist_ok=True)
                print(f"📁 Created download directory: {download_path}")
            except Exception as e:
                return jsonify({"error": f"Failed to create download path: {str(e)}"}), 400
        
        if not download_id:
            download_id = f"download_{int(time.time())}_{hash(url) % 10000}"
        
        # Convert priority string to enum
        priority_map = {
            'low': DownloadPriority.LOW,
            'normal': DownloadPriority.NORMAL,
            'high': DownloadPriority.HIGH,
            'urgent': DownloadPriority.URGENT
        }
        download_priority = priority_map.get(priority.lower(), DownloadPriority.NORMAL)
        
        # Create download task
        task = DownloadTask(
            id=download_id,
            url=url,
            title=title,
            artist=artist,
            album=album,
            download_path=download_path,
            priority=download_priority,
            quality=request_json.get('quality', '320kbps'),
            format=request_json.get('format', 'mp3')
        )
        
        # Add to queue
        task_id = download_queue_manager.add_download(task)
        
        print(f"🚀 Added download to queue: {title} by {artist} (Priority: {priority})")
        print(f"📁 Download path: {download_path}")
        print(f"🔗 URL: {url}")
        print(f"🆔 Download ID: {task_id}")
        
        # Get queue stats
        stats = download_queue_manager.get_queue_stats()
        
        return jsonify({
            "status": "queued",
            "message": "Download added to queue successfully",
            "download_id": task_id,
            "queue_stats": stats,
            "estimated_wait_time": stats['queued'] * 30  # Rough estimate: 30 seconds per queued item
        })
        
    except Exception as e:
        print(f"❌ Queue download error: {str(e)}")
        return jsonify({
            "error": f"Failed to add download to queue: {str(e)}",
            "status": "error"
        }), 500

@app.route('/youtube/queue/status', methods=['GET'])
def get_queue_status():
    """Get the current status of the download queue"""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        stats = download_queue_manager.get_queue_stats()
        all_downloads = download_queue_manager.get_all_downloads()
        
        # Convert downloads to serializable format
        downloads_list = []
        for task_id, task in all_downloads.items():
            downloads_list.append({
                'id': task.id,
                'title': task.title,
                'artist': task.artist,
                'album': task.album,
                'status': task.status.value,
                'progress': task.progress,
                'stage': task.stage,
                'message': task.message,
                'priority': task.priority.value,
                'quality': task.quality,
                'format': task.format,
                'file_size': task.file_size,
                'start_time': task.start_time,
                'end_time': task.end_time,
                'error': task.error,
                'retry_count': task.retry_count,
                'can_cancel': task.can_cancel,
                'can_retry': task.can_retry,
                'created_at': task.created_at
            })
        
        return jsonify({
            "status": "success",
            "queue_stats": stats,
            "downloads": downloads_list
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to get queue status: {str(e)}",
            "status": "error"
        }), 500

@app.route('/youtube/queue/cancel', methods=['POST'])
def cancel_queued_download():
    """Cancel a download in the queue"""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        download_id = request_json.get('download_id')
        if not download_id:
            return jsonify({"error": "No download ID provided"}), 400
        
        success = download_queue_manager.cancel_download(download_id)
        
        if success:
            return jsonify({
                "status": "success",
                "message": "Download cancelled successfully"
            })
        else:
            return jsonify({
                "error": "Download not found or could not be cancelled",
                "status": "error"
            }), 404
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to cancel download: {str(e)}",
            "status": "error"
        }), 500

@app.route('/youtube/queue/retry', methods=['POST'])
def retry_queued_download():
    """Retry a failed download"""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        download_id = request_json.get('download_id')
        if not download_id:
            return jsonify({"error": "No download ID provided"}), 400
        
        success = download_queue_manager.retry_download(download_id)
        
        if success:
            return jsonify({
                "status": "success",
                "message": "Download retry initiated successfully"
            })
        else:
            return jsonify({
                "error": "Download not found or could not be retried",
                "status": "error"
            }), 404
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to retry download: {str(e)}",
            "status": "error"
        }), 500

@app.route('/youtube/queue/clear', methods=['POST'])
def clear_queue():
    """Clear completed or failed downloads from the queue"""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        clear_type = request_json.get('type', 'completed')  # 'completed', 'failed', or 'all'
        
        if clear_type == 'completed':
            download_queue_manager.clear_completed_downloads()
            message = "Cleared completed downloads"
        elif clear_type == 'failed':
            download_queue_manager.clear_failed_downloads()
            message = "Cleared failed downloads"
        elif clear_type == 'all':
            download_queue_manager.clear_completed_downloads()
            download_queue_manager.clear_failed_downloads()
            message = "Cleared all completed and failed downloads"
        else:
            return jsonify({"error": "Invalid clear type. Use 'completed', 'failed', or 'all'"}), 400
        
        return jsonify({
            "status": "success",
            "message": message
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to clear queue: {str(e)}",
            "status": "error"
        }), 500

@app.route('/youtube/queue/settings', methods=['POST'])
def update_queue_settings():
    """Update queue settings like max concurrent downloads"""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        max_concurrent = request_json.get('max_concurrent_downloads')
        
        if max_concurrent is not None:
            if not isinstance(max_concurrent, int) or max_concurrent < 1 or max_concurrent > 10:
                return jsonify({"error": "max_concurrent_downloads must be an integer between 1 and 10"}), 400
            
            download_queue_manager.update_max_concurrent_downloads(max_concurrent)
            
            return jsonify({
                "status": "success",
                "message": f"Updated max concurrent downloads to {max_concurrent}",
                "max_concurrent_downloads": max_concurrent
            })
        else:
            return jsonify({"error": "No settings provided"}), 400
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to update queue settings: {str(e)}",
            "status": "error"
        }), 500

@app.route('/youtube/cancel-download', methods=['POST'])
def youtube_cancel_download():
    """Cancel an active download"""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        download_id = request_json.get('download_id')
        
        if not download_id:
            return jsonify({"error": "No download ID provided"}), 400
        
        print(f"🚫 Cancelling download: {download_id}")
        
        # Emit cancellation progress
        emit_progress(download_id, {
            'stage': 'cancelled',
            'progress': 0,
            'message': 'Download cancelled by user'
        })
        
        # Remove from active downloads if it exists
        if download_id in active_downloads:
            del active_downloads[download_id]
            print(f"✅ Removed download {download_id} from active downloads")
        
        return jsonify({
            "status": "success",
            "message": "Download cancelled successfully",
            "download_id": download_id
        })
        
    except Exception as e:
        print(f"❌ Cancel download error: {str(e)}")
        return jsonify({
            "error": f"Failed to cancel download: {str(e)}",
            "status": "error"
        }), 500

# YouTube Preview Endpoint (placeholder for future implementation)
@app.route('/youtube/preview/<video_id>', methods=['GET'])
def youtube_preview(video_id):
    """Get YouTube video preview audio stream (placeholder implementation)"""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        # This is a placeholder - in a real implementation, you would:
        # 1. Use yt-dlp to get audio stream URL
        # 2. Stream the audio to the client
        # 3. Handle different audio formats and quality
        
        print(f"🎵 Preview requested for video: {video_id}")
        
        # For now, return a placeholder response
        return jsonify({
            "status": "success",
            "message": "Preview endpoint ready (placeholder)",
            "video_id": video_id,
            "note": "This endpoint will stream actual YouTube audio in production"
        })
        
    except Exception as e:
        print(f"❌ Preview error: {str(e)}")
        return jsonify({
            "error": f"Preview failed: {str(e)}",
            "status": "error"
        }), 500

# Health Check Endpoint
@app.route('/hello', methods=['GET'])
def hello():
    """Simple health check endpoint"""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    return jsonify({
        "status": "success",
        "message": "Backend is running",
        "timestamp": time.time(),
        "websocket_status": "ready",
        "features": {
            'music_analysis': True,
            'youtube_download': True,
            'usb_export': True,
            'websocket': True
        }
    })

@app.route('/websocket/status', methods=['GET'])
def websocket_status():
    """WebSocket connection status endpoint"""
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    return jsonify({
        'websocket_status': 'ready',
        'active_connections': len(active_downloads),
        'active_downloads': list(active_downloads.keys()),
        'timestamp': time.time()
    })

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

# AI Agent related endpoints - commented out for this version
# @app.route('/settings/gemini-api-key', methods=['GET'])
# def get_gemini_api_key():
#     """Get the saved Gemini API key setting."""
#     
#     # Check signing key
#     signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
#     if signing_key != apiSigningKey:
#         return jsonify({"error": "invalid signature"}), 401
#     
#     try:
#         # Try to get from database settings
#         api_key = db_manager.get_setting('gemini_api_key')
#         
#         return jsonify({
#             'api_key': api_key,
#             'status': 'success'
#         })
#         
#     except Exception as e:
#         return jsonify({
#             "error": f"Failed to get Gemini API key: {str(e)}",
#             "status": "error"
#         }), 500

# AI Agent related endpoints - commented out for this version
# @app.route('/settings/gemini-api-key', methods=['POST'])
# def save_gemini_api_key():
#     """Save the Gemini API key setting."""
#     
#     # Check signing key
#     request_json = request.get_json() or {}
#     signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
#     if signing_key != apiSigningKey:
#         return jsonify({"error": "invalid signature"}), 401
#     
#     try:
#         api_key = request_json.get('api_key')
#         
#         if not api_key:
#             return jsonify({"error": "No API key provided"}), 400
#         
#         # Basic validation - check if it looks like a valid API key
#         if len(api_key.strip()) < 10:
#             return jsonify({"error": "Invalid API key format"}), 400
#             
#         # Save to database settings
#         db_manager.set_setting('gemini_api_key', api_key.strip())
#         
#         return jsonify({
#             'status': 'success',
#             'message': 'Gemini API key saved successfully'
#         })
#         
#     except Exception as e:
#         return jsonify({
#             "error": f"Failed to save Gemini API key: {str(e)}",
#             "status": "error"
#         }), 500

# AI Agent related endpoints - commented out for this version
# @app.route('/settings/gemini-api-key', methods=['DELETE'])
# def clear_gemini_api_key():
#     """Clear the Gemini API key setting."""
#     
#     # Check signing key
#     request_json = request.get_json() or {}
#     signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
#     if signing_key != apiSigningKey:
#         return jsonify({"error": "invalid signature"}), 401
#     
#     try:
#         # Clear from database settings
#         db_manager.delete_setting('gemini_api_key')
#         
#         return jsonify({
#             'status': 'success',
#             'message': 'Gemini API key cleared successfully'
#         })
#         
#     except Exception as e:
#         return jsonify({
#             "error": f"Failed to clear Gemini API key: {str(e)}",
#             "status": "error"
#         }), 500

# AI Agent endpoints - commented out for this version
# @app.route('/ai-agent/create-playlist', methods=['POST'])
# def ai_create_playlist():
#     """Create an AI-generated playlist based on user request."""
#     
#     # Check signing key
#     request_json = request.get_json() or {}
#     signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
#     if signing_key != apiSigningKey:
#         return jsonify({"error": "invalid signature"}), 401
#     
#     try:
#         data = request_json
#         user_request = data.get('user_request')
#         genre = data.get('genre', 'electronic')
#         bpm_min = data.get('bpm_min', 120)
#         bpm_max = data.get('bpm_max', 130)
#         target_count = data.get('target_count', 10)
#         download_path = data.get('download_path')
#         
#         if not user_request:
#             return jsonify({"error": "User request is required"}), 400
#         
#         if not download_path:
#             return jsonify({"error": "Download path is required"}), 400
#         
#         # Get Gemini API key
#         gemini_api_key = db_manager.get_setting('gemini_api_key')
#         if not gemini_api_key:
#             return jsonify({"error": "Gemini API key not configured"}), 400
#         
#         # Import AI agent
#         from ai_playlist_agent import AIPlaylistAgent
#         
#         # Create AI agent
#         ai_agent = AIPlaylistAgent(
#             api_key=gemini_api_key,
#             download_path=download_path,
#             api_port=args.apiport,
#             signing_key=apiSigningKey
#         )
#         
#         # Start playlist creation using AI agent
#         try:
#             task_id = ai_agent.create_playlist(
#                 user_request=user_request,
#                 genre=genre,
#                 bpm_range=(bpm_min, bpm_max),
#                 target_count=target_count,
#                 download_path=download_path
#             )
#             
#             return jsonify({
#                 'status': 'success',
#                 'message': 'AI playlist creation started',
#                 'task_id': task_id
#             })
#         except Exception as e:
#             print(f"Error starting AI playlist creation: {e}")
#             return jsonify({
#                 'error': f'Failed to start AI playlist creation: {str(e)}',
#                 'status': 'error'
#             }), 500
#         
#     except Exception as e:
#         print(f"Error in AI playlist creation: {str(e)}")
#         return jsonify({
#             "error": f"Failed to start AI playlist creation: {str(e)}",
#             "status": "error"
#         }), 500

# @app.route('/ai-agent/task/<task_id>', methods=['GET'])
# def ai_get_task_status(task_id):
#     """Get status of an AI agent task."""
#     
#     # Check signing key
#     signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
#     if signing_key != apiSigningKey:
#         return jsonify({"error": "invalid signature"}), 401
#     
#     try:
#         # Get Gemini API key
#         gemini_api_key = db_manager.get_setting('gemini_api_key')
#         if not gemini_api_key:
#             return jsonify({"error": "Gemini API key not configured"}), 400
#         
#         # Import AI agent
#         from ai_playlist_agent import AIPlaylistAgent
#         
#         # Create AI agent
#         ai_agent = AIPlaylistAgent(
#             api_key=gemini_api_key,
#             download_path="/tmp",  # Dummy path for status check
#             api_port=args.apiport,
#             signing_key=apiSigningKey
#         )
#         
#         # Get task progress
#         progress = ai_agent.get_playlist_progress(task_id)
#         
#         return jsonify({
#             'status': 'success',
#             'task_progress': progress
#         })
#         
#     except Exception as e:
#         print(f"Error getting AI task status: {str(e)}")
#         return jsonify({
#             "error": f"Failed to get task status: {str(e)}",
#             "status": "error"
#         }), 500

# @app.route('/ai-agent/task/<task_id>/pause', methods=['POST'])
# def ai_pause_task(task_id):
#     """Pause an AI agent task."""
#     
#     # Check signing key
#     request_json = request.get_json() or {}
#     signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
#     if signing_key != apiSigningKey:
#         return jsonify({"error": "invalid signature"}), 401
#     
#     try:
#         # Get Gemini API key
#         gemini_api_key = db_manager.get_setting('gemini_api_key')
#         if not gemini_api_key:
#             return jsonify({"error": "Gemini API key not configured"}), 400
#         
#         # Import AI agent
#         from ai_playlist_agent import AIPlaylistAgent
#         
#         # Create AI agent
#         ai_agent = AIPlaylistAgent(
#             api_key=gemini_api_key,
#             download_path="/tmp",  # Dummy path for pause/resume
#             api_port=args.apiport,
#             signing_key=apiSigningKey
#         )
#         
#         # Pause task
#         ai_agent.pause_playlist_creation(task_id)
#         
#         return jsonify({
#             'status': 'success',
#             'message': 'Task paused successfully'
#         })
#         
#     except Exception as e:
#         print(f"Error pausing AI task: {str(e)}")
#         return jsonify({
#             "error": f"Failed to pause task: {str(e)}",
#             "status": "error"
#         }), 500

# @app.route('/ai-agent/task/<task_id>/resume', methods=['POST'])
# def ai_resume_task(task_id):
#     """Resume an AI agent task."""
#     
#     # Check signing key
#     request_json = request.get_json() or {}
#     signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
#     if signing_key != apiSigningKey:
#         return jsonify({"error": "invalid signature"}), 401
#     
#     try:
#         # Get Gemini API key
#         gemini_api_key = db_manager.get_setting('gemini_api_key')
#         if not gemini_api_key:
#             return jsonify({"error": "Gemini API key not configured"}), 400
#         
#         # Import AI agent
#         from ai_playlist_agent import AIPlaylistAgent
#         
#         # Create AI agent
#         ai_agent = AIPlaylistAgent(
#             api_key=gemini_api_key,
#             download_path="/tmp",  # Dummy path for pause/resume
#             api_port=args.apiport,
#             signing_key=apiSigningKey
#         )
#         
#         # Resume task
#         ai_agent.resume_playlist_creation(task_id)
#         
#         return jsonify({
#             'status': 'success',
#             'message': 'Task resumed successfully'
#         })
#         
#     except Exception as e:
#         print(f"Error resuming AI task: {str(e)}")
#         return jsonify({
#             "error": f"Failed to resume task: {str(e)}",
#             "status": "error"
#         }), 500

# @app.route('/ai-agent/task/<task_id>/cancel', methods=['POST'])
# def ai_cancel_task(task_id):
#     """Cancel an AI agent task."""
#     
#     # Check signing key
#     request_json = request.get_json() or {}
#     signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
#     if signing_key != apiSigningKey:
#         return jsonify({"error": "invalid signature"}), 401
#     
#     try:
#         # Get Gemini API key
#         gemini_api_key = db_manager.get_setting('gemini_api_key')
#         if not gemini_api_key:
#             return jsonify({"error": "Gemini API key not configured"}), 400
#         
#         # Import AI agent
#         from ai_playlist_agent import AIPlaylistAgent
#         
#         # Create AI agent
#         ai_agent = AIPlaylistAgent(
#             api_key=gemini_api_key,
#             download_path="/tmp",  # Dummy path for cancel
#             api_port=args.apiport,
#             signing_key=apiSigningKey
#         )
#         
#         # Cancel task
#         ai_agent.cancel_playlist_creation(task_id)
#         
#         return jsonify({
#             'status': 'success',
#             'message': 'Task cancelled successfully'
#         })
#         
#     except Exception as e:
#         print(f"Error cancelling AI task: {str(e)}")
#         return jsonify({
#             "error": f"Failed to cancel task: {str(e)}",
#             "status": "error"
#         }), 500

# @app.route('/ai-agent/active-sessions', methods=['GET'])
# def ai_get_active_sessions():
#     """Get all active AI agent sessions."""
#     
#     # Check signing key
#     signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
#     if signing_key != apiSigningKey:
#         return jsonify({"error": "invalid signature"}), 401
#     
#     try:
#         # Get Gemini API key
#         gemini_api_key = db_manager.get_setting('gemini_api_key')
#         if not gemini_api_key:
#             return jsonify({"error": "Gemini API key not configured"}), 400
#         
#         # Import AI agent
#         from ai_playlist_agent import AIPlaylistAgent
#         
#         # Create AI agent
#         ai_agent = AIPlaylistAgent(
#             api_key=gemini_api_key,
#             download_path="/tmp",  # Dummy path
#             api_port=args.apiport,
#             signing_key=apiSigningKey
#         )
#         
#         # Get active sessions
#         sessions = ai_agent.get_active_sessions()
#         
#         return jsonify({
#             'status': 'success',
#             'active_sessions': sessions
#         })
#         
#     except Exception as e:
#         print(f"Error getting active AI sessions: {str(e)}")
#         return jsonify({
#             "error": f"Failed to get active sessions: {str(e)}",
#             "status": "error"
#         }), 500

@app.route('/waveform/<filename>', methods=['GET'])
def serve_waveform(filename):
    """Generate and serve waveform data for audio files."""
    
    # Check signing key (header, query, or cookie for media element compatibility)
    signing_key = (
        request.headers.get('X-Signing-Key')
        or request.args.get('signingkey')
        or request.cookies.get('signingkey')
    )
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        # Decode the filename
        decoded_filename = unquote(filename)
        
        # Get number of samples from query parameter (default: 1000)
        samples = int(request.args.get('samples', 1000))
        samples = min(samples, 2000)  # Limit max samples for performance
        
        # Check if file exists in uploaded files or try to find it
        file_path = uploaded_files.get(decoded_filename)
        
        if not file_path or not os.path.exists(file_path):
            # Try to find the file in the database first
            try:
                # Query database for file with matching filename
                db_files = db_manager.get_all_music_files()
                for db_file in db_files:
                    if db_file['filename'] == decoded_filename:
                        db_file_path = db_file['file_path']
                        if db_file_path and os.path.exists(db_file_path):
                            file_path = db_file_path
                            print(f"📊 Found audio file for waveform: {file_path}")
                            break
            except Exception as db_error:
                print(f"⚠️ Failed to query database for waveform file: {str(db_error)}")
            
            # If still not found, try common music directories
            if not file_path or not os.path.exists(file_path):
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
                return jsonify({"error": "Audio file not found for waveform generation"}), 404
        
        print(f"📊 Generating waveform for: {decoded_filename} with {samples} samples")
        
        # Generate waveform data using MusicAnalyzer
        analyzer = MusicAnalyzer()
        waveform_data = analyzer.generate_waveform_data(file_path, samples)
        
        return jsonify({
            "status": "success",
            "filename": decoded_filename,
            "samples": len(waveform_data),
            "waveform_data": waveform_data
        })
        
    except Exception as e:
        print(f"❌ Failed to generate waveform for {filename}: {str(e)}")
        return jsonify({
            "error": f"Failed to generate waveform: {str(e)}",
            "status": "error"
        }), 500

@app.route('/audio/<filename>', methods=['GET'])
def serve_audio(filename):
    """Serve audio files for playback with Range support."""
    
    # Check signing key (header, query, or cookie for media element compatibility)
    signing_key = (
        request.headers.get('X-Signing-Key')
        or request.args.get('signingkey')
        or request.cookies.get('signingkey')
    )
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        def _resolve_path():
            explicit_path = request.args.get('path')
            if explicit_path and os.path.exists(explicit_path):
                return explicit_path
            decoded_filename = unquote(filename)
            path = uploaded_files.get(decoded_filename)
            if not path or not os.path.exists(path):
                try:
                    db_files = db_manager.get_all_music_files()
                    for db_file in db_files:
                        if db_file['filename'] == decoded_filename:
                            db_file_path = db_file['file_path']
                            if db_file_path and os.path.exists(db_file_path):
                                path = db_file_path
                                break
                except Exception as db_error:
                    print(f"⚠️ Failed to query database for audio file: {str(db_error)}")
                if not path or not os.path.exists(path):
                    possible_paths = [
                        os.path.join(os.path.expanduser('~'), 'Music', decoded_filename),
                        os.path.join(os.path.expanduser('~'), 'Downloads', decoded_filename),
                        os.path.join(tempfile.gettempdir(), decoded_filename),
                        decoded_filename
                    ]
                    for p in possible_paths:
                        if os.path.exists(p):
                            path = p
                            break
            return path
        
        file_path = _resolve_path()
        if not file_path or not os.path.exists(file_path):
            return jsonify({"error": "Audio file not found"}), 404
        
        file_size = os.path.getsize(file_path)
        range_header = request.headers.get('Range', None)
        mime = 'audio/mpeg'
        if file_path.lower().endswith('.wav'):
            mime = 'audio/wav'
        elif file_path.lower().endswith('.m4a') or file_path.lower().endswith('.mp4'):
            mime = 'audio/mp4'
        elif file_path.lower().endswith('.ogg'):
            mime = 'audio/ogg'
        
        if range_header:
            # Parse Range header: e.g., 'bytes=0-'
            import re
            match = re.match(r'bytes=(\d+)-(\d*)', range_header)
            if match:
                start = int(match.group(1))
                end = match.group(2)
                end = int(end) if end else file_size - 1
                start = max(0, start)
                end = min(end, file_size - 1)
                length = end - start + 1
                with open(file_path, 'rb') as f:
                    f.seek(start)
                    data = f.read(length)
                rv = Response(data, 206, mimetype=mime, direct_passthrough=True)
                rv.headers.add('Content-Range', f'bytes {start}-{end}/{file_size}')
                rv.headers.add('Accept-Ranges', 'bytes')
                rv.headers.add('Content-Length', str(length))
                rv.headers.add('Cache-Control', 'no-cache')
                return rv
        
        # No Range header, send whole file
        rv = send_file(file_path, as_attachment=False, mimetype=mime)
        rv.headers.add('Accept-Ranges', 'bytes')
        rv.headers.add('Cache-Control', 'no-cache')
        return rv
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to serve audio: {str(e)}"
        }), 500

@app.route('/library/update-metadata', methods=['PUT'])
def update_song_metadata():
    """Update song metadata and optionally rename the file."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        data = request_json
        song_id = data.get('song_id')
        file_path_hint = data.get('file_path')
        filename_hint = data.get('filename')
        metadata_updates = data.get('metadata', {})
        rename_file = data.get('rename_file', False)
        
        print(f"🔍 Update metadata request - song_id: {song_id}, file_path: {file_path_hint}, filename: {filename_hint}, metadata: {metadata_updates}")
        
        # Resolve song record by id, else by file_path, else by filename
        song_record = None
        if song_id:
            song_record = db_manager.get_music_file_by_id(song_id)
        if (not song_record) and file_path_hint:
            try:
                song_record = db_manager.get_music_file_by_path(file_path_hint)
            except Exception as e:
                print(f"⚠️ Lookup by file_path failed: {e}")
        if (not song_record) and filename_hint:
            try:
                # Fallback: scan all and match filename
                files = db_manager.get_all_music_files()
                for f in files:
                    if f.get('filename') == filename_hint:
                        song_record = f
                        break
            except Exception as e:
                print(f"⚠️ Lookup by filename failed: {e}")
        
        if not song_record:
            return jsonify({"error": "Song not found"}), 404
        
        file_id = song_record['id']
        file_path = song_record['file_path']
        
        # Include rating update if present (pass-through to DB layer later if supported)
        updated_song = db_manager.update_music_file_metadata(file_id, metadata_updates)
        # If metadata did not include rating but client sent 'rating' at root, handle here
        if (not updated_song) and 'rating' in data:
            try:
                with sqlite3.connect(db_manager.db_path) as conn:
                    cursor = conn.cursor()
                    cursor.execute("UPDATE music_files SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (int(data['rating']), int(file_id)))
                    conn.commit()
                updated_song = db_manager.get_music_file_by_id(str(file_id))
            except Exception as _:
                pass
        if not updated_song:
            return jsonify({"error": "Failed to update database"}), 500
        
        # Optional file rename using updated fields
        rename_result = None
        if rename_file and updated_song.get('camelot_key') and updated_song.get('bpm'):
            try:
                rename_result = rename_file_with_metadata(file_path, updated_song)
                if rename_result.get('renamed'):
                    updated_song = db_manager.update_music_file_path(file_id, rename_result['new_path']) or updated_song
            except Exception as e:
                print(f"Warning: Failed to rename file: {str(e)}")
                rename_result = {'renamed': False, 'error': str(e)}
        
        return jsonify({
            'status': 'success',
            'song': updated_song,
            'file_rename': rename_result
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to update metadata: {str(e)}",
            "status": "error"
        }), 500

@app.route('/library/rename-file', methods=['POST'])
def rename_song_file():
    """Rename a song file with key and BPM information."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        data = request_json
        song_id = data.get('song_id')
        file_path_hint = data.get('file_path')
        filename_hint = data.get('filename')
        new_filename = data.get('new_filename')
        
        if not new_filename:
            return jsonify({"error": "No new filename provided"}), 400
        
        # Resolve song record
        song_record = None
        if song_id:
            song_record = db_manager.get_music_file_by_id(song_id)
        if (not song_record) and file_path_hint:
            song_record = db_manager.get_music_file_by_path(file_path_hint)
        if (not song_record) and filename_hint:
            try:
                for f in db_manager.get_all_music_files():
                    if f.get('filename') == filename_hint:
                        song_record = f
                        break
            except Exception as e:
                print(f"⚠️ Lookup by filename failed: {e}")
        if not song_record:
            return jsonify({"error": "Song not found"}), 404
        
        file_id = song_record['id']
        file_path = song_record['file_path']
        if not os.path.exists(file_path):
            return jsonify({"error": "File not found on disk"}), 404
        
        # Rename the file
        rename_result = rename_file_with_custom_name(file_path, new_filename)
        if not rename_result['renamed']:
            return jsonify(rename_result), 500
        
        # Update database with new file path
        updated_song = db_manager.update_music_file_path(file_id, rename_result['new_path'])
        if not updated_song:
            return jsonify({"error": "Failed to update database"}), 500
        
        # Update in-memory map for serving
        try:
            old_name = rename_result.get('old_filename')
            new_name = rename_result.get('new_filename')
            if old_name and old_name in uploaded_files:
                uploaded_files.pop(old_name, None)
            if new_name:
                uploaded_files[new_name] = rename_result['new_path']
        except Exception as _:
            pass
        
        return jsonify({
            'status': 'success',
            'song': updated_song,
            'rename_result': rename_result
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to rename file: {str(e)}",
            "status": "error"
        }), 500

def rename_file_with_metadata(file_path: str, song_data: dict) -> dict:
    """Rename file with key and BPM information in the filename using format: 100BPM_11A_songname.mp3"""
    try:
        # Get directory and extension
        directory = os.path.dirname(file_path)
        file_ext = os.path.splitext(file_path)[1]
        
        # Get original filename without extension
        original_name = os.path.splitext(os.path.basename(file_path))[0]
        
        # Extract artist and title if available
        if ' - ' in original_name:
            artist, title = original_name.split(' - ', 1)
        else:
            artist = 'Unknown Artist'
            title = original_name
        
        # Get key and BPM information
        camelot_key = song_data.get('camelot_key', '')
        bpm = song_data.get('bpm', 0)
        
        # Create new filename format: "100BPM_11A_songname.mp3"
        if camelot_key and bpm:
            bpm_value = int(round(float(bpm)))
            # Clean song name (remove artist prefix if present)
            song_name = title
            if ' - ' in song_name:
                song_name = song_name.split(' - ', 1)[1]
            
            # Clean song name for filename (remove invalid characters)
            clean_song_name = "".join(c for c in song_name if c.isalnum() or c in (' ', '-', '_'))
            clean_song_name = clean_song_name.replace('  ', ' ').strip()
            
            new_filename = f"{bpm_value}BPM_{camelot_key}_{clean_song_name}{file_ext}"
        elif bpm:
            bpm_value = int(round(float(bpm)))
            clean_song_name = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_'))
            clean_song_name = clean_song_name.replace('  ', ' ').strip()
            new_filename = f"{bpm_value}BPM_{clean_song_name}{file_ext}"
        elif camelot_key:
            clean_song_name = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_'))
            clean_song_name = clean_song_name.replace('  ', ' ').strip()
            new_filename = f"{camelot_key}_{clean_song_name}{file_ext}"
        else:
            # Fallback to original name if no analysis data
            clean_song_name = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_'))
            clean_song_name = clean_song_name.replace('  ', ' ').strip()
            new_filename = f"{clean_song_name}{file_ext}"
        
        # Clean filename (remove invalid characters)
        new_filename = "".join(c for c in new_filename if c.isalnum() or c in (' ', '-', '_', '.'))
        new_filename = new_filename.replace('  ', ' ').strip()
        
        new_path = os.path.join(directory, new_filename)
        
        # Check if file already exists
        if os.path.exists(new_path) and new_path != file_path:
            # Add timestamp to make unique
            import time
            timestamp = int(time.time())
            name_without_ext = os.path.splitext(new_filename)[0]
            new_filename = f"{name_without_ext}_{timestamp}{file_ext}"
            new_path = os.path.join(directory, new_filename)
        
        # Rename the file
        os.rename(file_path, new_path)
        
        print(f"🔄 Renamed file: {os.path.basename(file_path)} → {new_filename}")
        
        return {
            'renamed': True,
            'old_path': file_path,
            'new_path': new_path,
            'old_filename': os.path.basename(file_path),
            'new_filename': new_filename
        }
        
    except Exception as e:
        print(f"❌ Error renaming file {file_path}: {str(e)}")
        return {
            'renamed': False,
            'error': str(e),
            'old_path': file_path
        }

def rename_file_with_custom_name(file_path: str, new_filename: str) -> dict:
    """Rename file with a custom filename."""
    try:
        # Get directory and extension
        directory = os.path.dirname(file_path)
        file_ext = os.path.splitext(file_path)[1]
        
        # Ensure new filename has the correct extension
        if not new_filename.endswith(file_ext):
            new_filename += file_ext
        
        # Clean filename (remove invalid characters)
        new_filename = "".join(c for c in new_filename if c.isalnum() or c in (' ', '-', '_', '.'))
        new_filename = new_filename.replace('  ', ' ').strip()
        
        new_path = os.path.join(directory, new_filename)
        
        # Check if file already exists
        if os.path.exists(new_path) and new_path != file_path:
            # Add timestamp to make unique
            import time
            timestamp = int(time.time())
            name_without_ext = os.path.splitext(new_filename)[0]
            new_filename = f"{name_without_ext}_{timestamp}{file_ext}"
            new_path = os.path.join(directory, new_filename)
        
        # Rename the file
        os.rename(file_path, new_path)
        
        return {
            'renamed': True,
            'old_path': file_path,
            'new_path': new_path,
            'old_filename': os.path.basename(file_path),
            'new_filename': new_filename
        }
        
    except Exception as e:
        return {
            'renamed': False,
            'error': str(e),
            'old_path': file_path
        }

@app.route('/test-database', methods=['GET'])
def test_database():
    """Test database connection and basic operations."""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        # Test database connection
        files = db_manager.get_all_music_files()
        
        # Test a simple query
        if files:
            first_file = files[0]
            test_id = first_file['id']
            
            # Test get by ID
            retrieved_file = db_manager.get_music_file_by_id(str(test_id))
            
            return jsonify({
                'status': 'success',
                'database_connected': True,
                'total_files': len(files),
                'test_file_id': test_id,
                'test_file_found': retrieved_file is not None,
                'test_file_name': retrieved_file.get('filename') if retrieved_file else None
            })
        else:
            return jsonify({
                'status': 'success',
                'database_connected': True,
                'total_files': 0,
                'message': 'Database is empty'
            })
            
    except Exception as e:
        print(f"❌ Database test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'database_connected': False,
            'error': str(e)
        }), 500

@app.route('/library/check-metadata', methods=['POST'])
def check_song_metadata():
    """Check if a song already has key and BPM metadata."""
    
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
        
        # Check if song already has metadata
        metadata_check = db_manager.check_song_has_metadata(file_path)
        
        # Generate unique track ID
        filename = os.path.basename(file_path)
        track_id = db_manager.generate_unique_track_id(file_path, filename)
        
        # If song exists and has complete metadata, update track_id
        if metadata_check['exists'] and metadata_check['has_complete_metadata']:
            db_manager.update_track_id(str(metadata_check['song_id']), track_id)
            print(f"✅ Song already has complete metadata - Track ID: {track_id}")
        elif metadata_check['exists']:
            db_manager.update_track_id(str(metadata_check['song_id']), track_id)
            print(f"⚠️ Song exists but has incomplete metadata - Track ID: {track_id}")
        else:
            print(f"🆕 New song detected - Track ID: {track_id}")
        
        return jsonify({
            'status': 'success',
            'metadata_check': metadata_check,
            'track_id': track_id,
            'should_analyze': not metadata_check['exists'] or not metadata_check['has_complete_metadata']
        })
        
    except Exception as e:
        print(f"❌ Error checking song metadata: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": f"Failed to check metadata: {str(e)}",
            "status": "error"
        }), 500

@app.route('/library/track/<track_id>', methods=['GET'])
def get_song_by_track_id(track_id):
    """Get a song by its unique track ID."""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        song = db_manager.get_song_by_track_id(track_id)
        
        if song:
            return jsonify({
                'status': 'success',
                'song': song
            })
        else:
            return jsonify({
                'status': 'not_found',
                'message': 'Song not found with this track ID'
            }), 404
        
    except Exception as e:
        print(f"❌ Error getting song by track ID: {str(e)}")
        return jsonify({
            "error": f"Failed to get song: {str(e)}",
            "status": "error"
        }), 500

# Playlist Management Endpoints

@app.route('/playlists', methods=['GET'])
def get_playlists():
    """Get all playlists."""
    signing_key = get_request_signing_key()
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        playlists = db_manager.get_all_playlists()
        
        # Get songs for each playlist
        for playlist in playlists:
            playlist['songs'] = db_manager.get_playlist_songs(playlist['id'])
        
        return jsonify({
            'status': 'success',
            'playlists': playlists
        })
        
    except Exception as e:
        print(f"❌ Error getting playlists: {str(e)}")
        return jsonify({
            "error": f"Failed to get playlists: {str(e)}",
            "status": "error"
        }), 500

@app.route('/playlists', methods=['POST'])
def create_playlist():
    """Create a new playlist."""
    signing_key = get_request_signing_key()
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        data = request.get_json()
        name = data.get('name')
        description = data.get('description')
        color = data.get('color')
        is_query_based = data.get('is_query_based', False)
        query_criteria = data.get('query_criteria')
        songs = data.get('songs', [])
        
        if not name:
            return jsonify({"error": "Playlist name is required"}), 400
        
        # Create playlist
        playlist_id = db_manager.create_playlist(
            name=name,
            description=description,
            color=color,
            is_query_based=is_query_based,
            query_criteria=query_criteria
        )
        
        if not playlist_id:
            return jsonify({"error": "Failed to create playlist"}), 500
        
        # Add songs to playlist if provided
        for song in songs:
            if isinstance(song, dict) and 'id' in song:
                # Song object with id
                db_manager.add_song_to_playlist(playlist_id, int(song['id']))
            elif isinstance(song, (int, str)):
                # Just song ID
                db_manager.add_song_to_playlist(playlist_id, int(song))
        
        # Get the created playlist with songs
        playlist = db_manager.get_playlist(playlist_id)
        if playlist:
            playlist['songs'] = db_manager.get_playlist_songs(playlist_id)
        
        return jsonify({
            'status': 'success',
            'playlist': playlist,
            'playlist_id': playlist_id
        })
        
    except Exception as e:
        print(f"❌ Error creating playlist: {str(e)}")
        return jsonify({
            "error": f"Failed to create playlist: {str(e)}",
            "status": "error"
        }), 500

@app.route('/playlists/<int:playlist_id>', methods=['GET'])
def get_playlist(playlist_id):
    """Get a specific playlist."""
    signing_key = get_request_signing_key()
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        playlist = db_manager.get_playlist(playlist_id)
        if not playlist:
            return jsonify({"error": "Playlist not found"}), 404
        
        playlist['songs'] = db_manager.get_playlist_songs(playlist_id)
        
        return jsonify({
            'status': 'success',
            'playlist': playlist
        })
        
    except Exception as e:
        print(f"❌ Error getting playlist: {str(e)}")
        return jsonify({
            "error": f"Failed to get playlist: {str(e)}",
            "status": "error"
        }), 500

@app.route('/playlists/<int:playlist_id>', methods=['PUT'])
def update_playlist(playlist_id):
    """Update a playlist."""
    signing_key = get_request_signing_key()
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        data = request.get_json()
        
        success = db_manager.update_playlist(
            playlist_id=playlist_id,
            name=data.get('name'),
            description=data.get('description'),
            color=data.get('color'),
            is_query_based=data.get('is_query_based'),
            query_criteria=data.get('query_criteria')
        )
        
        if not success:
            return jsonify({"error": "Failed to update playlist"}), 500
        
        # Get updated playlist
        playlist = db_manager.get_playlist(playlist_id)
        if playlist:
            playlist['songs'] = db_manager.get_playlist_songs(playlist_id)
        
        return jsonify({
            'status': 'success',
            'playlist': playlist
        })
        
    except Exception as e:
        print(f"❌ Error updating playlist: {str(e)}")
        return jsonify({
            "error": f"Failed to update playlist: {str(e)}",
            "status": "error"
        }), 500

@app.route('/playlists/<int:playlist_id>', methods=['DELETE'])
def delete_playlist(playlist_id):
    """Delete a playlist."""
    signing_key = get_request_signing_key()
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        success = db_manager.delete_playlist(playlist_id)
        
        if not success:
            return jsonify({"error": "Failed to delete playlist"}), 500
        
        return jsonify({
            'status': 'success',
            'message': 'Playlist deleted successfully'
        })
        
    except Exception as e:
        print(f"❌ Error deleting playlist: {str(e)}")
        return jsonify({
            "error": f"Failed to delete playlist: {str(e)}",
            "status": "error"
        }), 500

@app.route('/playlists/<int:playlist_id>/songs', methods=['POST'])
def add_song_to_playlist(playlist_id):
    """Add a song to a playlist."""
    signing_key = get_request_signing_key()
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        data = request.get_json()
        music_file_id = data.get('music_file_id')
        position = data.get('position')
        
        if not music_file_id:
            return jsonify({"error": "music_file_id is required"}), 400
        
        success = db_manager.add_song_to_playlist(playlist_id, int(music_file_id), position)
        
        if not success:
            return jsonify({"error": "Failed to add song to playlist"}), 500
        
        return jsonify({
            'status': 'success',
            'message': 'Song added to playlist successfully'
        })
        
    except Exception as e:
        print(f"❌ Error adding song to playlist: {str(e)}")
        return jsonify({
            "error": f"Failed to add song to playlist: {str(e)}",
            "status": "error"
        }), 500

@app.route('/playlists/<int:playlist_id>/songs/<int:music_file_id>', methods=['DELETE'])
def remove_song_from_playlist(playlist_id, music_file_id):
    """Remove a song from a playlist."""
    signing_key = get_request_signing_key()
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        success = db_manager.remove_song_from_playlist(playlist_id, music_file_id)
        
        if not success:
            return jsonify({"error": "Failed to remove song from playlist"}), 500
        
        return jsonify({
            'status': 'success',
            'message': 'Song removed from playlist successfully'
        })
        
    except Exception as e:
        print(f"❌ Error removing song from playlist: {str(e)}")
        return jsonify({
            "error": f"Failed to remove song from playlist: {str(e)}",
            "status": "error"
        }), 500

@app.route('/library/update-tags', methods=['POST'])
def update_song_tags():
    """Update ID3 tags for an existing song in the library."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        song_id = request_json.get('song_id')
        file_path = request_json.get('file_path')
        
        if not song_id and not file_path:
            return jsonify({"error": "Either song_id or file_path must be provided"}), 400
        
        # Get song data from database if song_id provided
        song_data = None
        if song_id:
            try:
                db_files = db_manager.get_all_music_files()
                for db_file in db_files:
                    if str(db_file['id']) == str(song_id):
                        song_data = {
                            'filename': db_file['filename'],
                            'file_path': db_file['file_path'],
                            'key': db_file['key_signature'],
                            'scale': db_file['scale'],
                            'key_name': db_file['key_name'],
                            'camelot_key': db_file['camelot_key'],
                            'bpm': db_file['bpm'],
                            'energy_level': db_file['energy_level'],
                            'duration': db_file['duration'],
                            'cue_points': json.loads(db_file['cue_points']) if db_file['cue_points'] else []
                        }
                        break
            except Exception as db_error:
                print(f"⚠️ Failed to get song data from database: {str(db_error)}")
        
        # If no song_data from database, try to analyze the file directly
        if not song_data and file_path:
            if not os.path.exists(file_path):
                return jsonify({"error": "File not found"}), 404
            
            try:
                song_data = analyze_music_file(file_path)
            except Exception as analysis_error:
                return jsonify({
                    "error": f"Failed to analyze file: {str(analysis_error)}",
                    "status": "error"
                }), 500
        
        if not song_data:
            return jsonify({"error": "Could not retrieve song data"}), 404
        
        # Check if ID3 tags should be written
        file_path_to_check = file_path or song_data['file_path']
        skip_check = db_manager.should_skip_analysis(file_path_to_check)
        
        # Update ID3 tags
        try:
            should_write_tags = True
            if skip_check['should_skip'] and skip_check.get('id3_tags_written', False):
                should_write_tags = False
                print(f"⏭️ Skipping ID3 tag writing - tags already written")
            
            if should_write_tags:
                analyzer = MusicAnalyzer()
                tag_result = analyzer.write_id3_tags(file_path_to_check, song_data)
                
                # Mark that ID3 tags have been written
                if tag_result.get('updated'):
                    db_manager.mark_id3_tags_written(file_path_to_check)
                    print(f"✅ ID3 tags written and marked in database")
            else:
                tag_result = {
                    'updated': False,
                    'skipped': True,
                    'reason': 'tags_already_written'
                }
            
            if tag_result.get('updated'):
                # Rename file with new metadata format
                rename_result = None
                try:
                    if song_data.get('camelot_key') and song_data.get('bpm'):
                        rename_result = rename_file_with_metadata(file_path or song_data['file_path'], song_data)
                        if rename_result.get('renamed'):
                            # Update database with new filename and path
                            new_filename = rename_result['new_filename']
                            new_path = rename_result['new_path']
                            try:
                                if song_id:
                                    db_manager.update_music_file_path(song_id, new_path)
                                song_data['filename'] = new_filename
                                song_data['file_path'] = new_path
                                print(f"✅ Updated database with new filename: {new_filename}")
                            except Exception as db_update_error:
                                print(f"⚠️ Failed to update database: {str(db_update_error)}")
                except Exception as rename_error:
                    print(f"Warning: Failed to rename file: {str(rename_error)}")
                
                return jsonify({
                    'status': 'success',
                    'message': 'ID3 tags updated successfully',
                    'tag_result': tag_result,
                    'rename_result': rename_result,
                    'song_data': song_data
                })
            else:
                return jsonify({
                    'error': f'Failed to update ID3 tags: {tag_result.get("error", "Unknown error")}',
                    'status': 'error'
                }), 500
                
        except Exception as tag_error:
            return jsonify({
                'error': f'Failed to update ID3 tags: {str(tag_error)}',
                'status': 'error'
            }), 500
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to update song tags: {str(e)}",
            "status": "error"
        }), 500

@app.route('/library/batch-update-tags', methods=['POST'])
def batch_update_song_tags():
    """Update ID3 tags for multiple songs in the library."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        song_ids = request_json.get('song_ids', [])
        update_all = request_json.get('update_all', False)
        
        if not song_ids and not update_all:
            return jsonify({"error": "Either song_ids array or update_all=true must be provided"}), 400
        
        # Get all songs to update
        songs_to_update = []
        if update_all:
            try:
                db_files = db_manager.get_all_music_files()
                songs_to_update = db_files
            except Exception as db_error:
                return jsonify({
                    "error": f"Failed to get all songs from database: {str(db_error)}",
                    "status": "error"
                }), 500
        else:
            try:
                db_files = db_manager.get_all_music_files()
                for song_id in song_ids:
                    for db_file in db_files:
                        if str(db_file['id']) == str(song_id):
                            songs_to_update.append(db_file)
                            break
            except Exception as db_error:
                return jsonify({
                    "error": f"Failed to get songs from database: {str(db_error)}",
                    "status": "error"
                }), 500
        
        if not songs_to_update:
            return jsonify({"error": "No songs found to update"}), 404
        
        # Process each song
        results = []
        analyzer = MusicAnalyzer()
        
        for song in songs_to_update:
            try:
                song_data = {
                    'filename': song['filename'],
                    'file_path': song['file_path'],
                    'key': song['key_signature'],
                    'scale': song['scale'],
                    'key_name': song['key_name'],
                    'camelot_key': song['camelot_key'],
                    'bpm': song['bpm'],
                    'energy_level': song['energy_level'],
                    'duration': song['duration'],
                    'cue_points': json.loads(song['cue_points']) if song['cue_points'] else []
                }
                
                # Update ID3 tags
                tag_result = analyzer.write_id3_tags(song['file_path'], song_data)
                
                if tag_result.get('updated'):
                    # Rename file with new metadata format
                    rename_result = None
                    try:
                        if song_data.get('camelot_key') and song_data.get('bpm'):
                            rename_result = rename_file_with_metadata(song['file_path'], song_data)
                            if rename_result.get('renamed'):
                                # Update database with new filename and path
                                new_filename = rename_result['new_filename']
                                new_path = rename_result['new_path']
                                try:
                                    db_manager.update_music_file_path(song['id'], new_path)
                                    song_data['filename'] = new_filename
                                    song_data['file_path'] = new_path
                                except Exception as db_update_error:
                                    print(f"⚠️ Failed to update database for song {song['id']}: {str(db_update_error)}")
                    except Exception as rename_error:
                        print(f"Warning: Failed to rename file for song {song['id']}: {str(rename_error)}")
                    
                    results.append({
                        'song_id': song['id'],
                        'filename': song_data['filename'],
                        'status': 'success',
                        'tag_result': tag_result,
                        'rename_result': rename_result
                    })
                else:
                    results.append({
                        'song_id': song['id'],
                        'filename': song['filename'],
                        'status': 'failed',
                        'error': tag_result.get('error', 'Unknown error')
                    })
                    
            except Exception as song_error:
                results.append({
                    'song_id': song['id'],
                    'filename': song['filename'],
                    'status': 'error',
                    'error': str(song_error)
                })
        
        # Count results
        successful = len([r for r in results if r['status'] == 'success'])
        failed = len([r for r in results if r['status'] in ['failed', 'error']])
        
        return jsonify({
            'status': 'success',
            'message': f'Batch update completed: {successful} successful, {failed} failed',
            'total_processed': len(results),
            'successful': successful,
            'failed': failed,
            'results': results
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to batch update song tags: {str(e)}",
            "status": "error"
        }), 500

@app.route('/library/force-update-tags', methods=['POST'])
def force_update_song_tags():
    """Force update ID3 tags for existing songs using their current analysis data."""
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        song_id = request_json.get('song_id')
        file_path = request_json.get('file_path')
        force_rename = request_json.get('force_rename', True)
        
        if not song_id and not file_path:
            return jsonify({"error": "Either song_id or file_path must be provided"}), 400
        
        # Get song data from database if song_id provided
        song_data = None
        if song_id:
            try:
                db_files = db_manager.get_all_music_files()
                for db_file in db_files:
                    if str(db_file['id']) == str(song_id):
                        song_data = {
                            'filename': db_file['filename'],
                            'file_path': db_file['file_path'],
                            'key': db_file['key_signature'],
                            'scale': db_file['scale'],
                            'key_name': db_file['key_name'],
                            'camelot_key': db_file['camelot_key'],
                            'bpm': db_file['bpm'],
                            'energy_level': db_file['energy_level'],
                            'duration': db_file['duration'],
                            'cue_points': json.loads(db_file['cue_points']) if db_file['cue_points'] else []
                        }
                        break
            except Exception as db_error:
                print(f"⚠️ Failed to get song data from database: {str(db_error)}")
        
        # If no song_data from database, try to analyze the file directly
        if not song_data and file_path:
            if not os.path.exists(file_path):
                return jsonify({"error": "File not found"}), 404
            
            try:
                song_data = analyze_music_file(file_path)
            except Exception as analysis_error:
                return jsonify({
                    "error": f"Failed to analyze file: {str(analysis_error)}",
                    "status": "error"
                }), 500
        
        if not song_data:
            return jsonify({"error": "Could not retrieve song data"}), 404
        
        # Check if we have the required data for ID3 updates
        if not song_data.get('camelot_key') or not song_data.get('bpm'):
            return jsonify({
                "error": "Song missing required data (camelot_key or bpm) for ID3 updates",
                "status": "error",
                "missing_data": {
                    "camelot_key": bool(song_data.get('camelot_key')),
                    "bpm": bool(song_data.get('bpm'))
                }
            }), 400
        
        # Check if ID3 tags should be written (force update bypasses some checks)
        file_path_to_check = file_path or song_data['file_path']
        skip_check = db_manager.should_skip_analysis(file_path_to_check)
        
        # Update ID3 tags
        try:
            should_write_tags = True
            if not force_update and skip_check['should_skip'] and skip_check.get('id3_tags_written', False):
                should_write_tags = False
                print(f"⏭️ Skipping ID3 tag writing - tags already written (use force_update=true to override)")
            
            if should_write_tags:
                analyzer = MusicAnalyzer()
                tag_result = analyzer.write_id3_tags(file_path_to_check, song_data)
                
                # Mark that ID3 tags have been written
                if tag_result.get('updated'):
                    db_manager.mark_id3_tags_written(file_path_to_check)
                    print(f"✅ ID3 tags written and marked in database")
            else:
                tag_result = {
                    'updated': False,
                    'skipped': True,
                    'reason': 'tags_already_written',
                    'message': 'Use force_update=true to override'
                }
            
            if tag_result.get('updated'):
                # Rename file with new metadata format if requested
                rename_result = None
                if force_rename:
                    try:
                        rename_result = rename_file_with_metadata(file_path or song_data['file_path'], song_data)
                        if rename_result.get('renamed'):
                            # Update database with new filename and path
                            new_filename = rename_result['new_filename']
                            new_path = rename_result['new_path']
                            try:
                                if song_id:
                                    db_manager.update_music_file_path(song_id, new_path)
                                song_data['filename'] = new_filename
                                song_data['file_path'] = new_path
                                print(f"✅ Updated database with new filename: {new_filename}")
                            except Exception as db_update_error:
                                print(f"⚠️ Failed to update database: {str(db_update_error)}")
                    except Exception as rename_error:
                        print(f"Warning: Failed to rename file: {str(rename_error)}")
                
                return jsonify({
                    'status': 'success',
                    'message': 'ID3 tags updated successfully',
                    'tag_result': tag_result,
                    'rename_result': rename_result,
                    'song_data': song_data,
                    'force_rename': force_rename
                })
            else:
                return jsonify({
                    'error': f'Failed to update ID3 tags: {tag_result.get("error", "Unknown error")}',
                    'status': 'error'
                }), 500
                
        except Exception as tag_error:
            return jsonify({
                'error': f'Failed to update ID3 tags: {str(tag_error)}',
                'status': 'error'
            }), 500
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to force update song tags: {str(e)}",
            "status": "error"
        }), 500

@app.route('/library/extract-cover-art', methods=['POST', 'OPTIONS'])
def extract_cover_art():
    """Extract cover art from MP3 file and return as base64 encoded image."""
    
    # Handle CORS preflight requests
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type, X-Signing-Key')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        data = request_json
        file_path = data.get('file_path')
        
        print(f"🖼️ Extracting cover art from: {file_path}")
        
        if not file_path:
            return jsonify({"error": "No file path provided"}), 400
        
        if not os.path.exists(file_path):
            print(f"❌ File not found: {file_path}")
            return jsonify({"error": "File not found"}), 404
        
        # Check if cover art already exists in database
        existing_cover_art = db_manager.get_cover_art(file_path)
        if existing_cover_art:
            print(f"✅ Cover art already exists in database for: {file_path}")
            return jsonify({
                'status': 'success',
                'cover_art': existing_cover_art,
                'mime_type': 'image/jpeg',  # Default assumption
                'from_cache': True
            })
        
        # Extract cover art using mutagen
        try:
            from mutagen.mp3 import MP3
            from mutagen.id3 import ID3, APIC
            import base64
            import io
            
            # Load MP3 file with ID3 tags
            audio = MP3(file_path, ID3=ID3)
            
            if audio.tags is None:
                print(f"⚠️ No ID3 tags found in: {file_path}")
                return jsonify({
                    'status': 'no_tags',
                    'message': 'No ID3 tags found in file',
                    'cover_art': None
                })
            
            print(f"📋 Found ID3 tags in: {file_path}")
            print(f"📋 Available tags: {list(audio.tags.keys())}")
            
            # Look for cover art (APIC frames)
            cover_art = None
            mime_type = 'image/jpeg'  # Default
            
            for key in audio.tags.keys():
                if key.startswith('APIC:'):
                    apic = audio.tags[key]
                    print(f"🖼️ Found APIC frame: {key}, type: {apic.type}, mime: {apic.mime}")
                    
                    # Prefer cover (front) but accept any image
                    if apic.type == 3 or cover_art is None:  # Cover (front) or first image found
                        # Convert to base64
                        cover_art = base64.b64encode(apic.data).decode('utf-8')
                        mime_type = apic.mime or 'image/jpeg'
                        print(f"✅ Successfully extracted cover art ({len(apic.data)} bytes, {mime_type})")
                        
                        # If this is a cover (front), we're done
                        if apic.type == 3:
                            break
            
            if cover_art:
                # Save cover art to database
                if db_manager.update_cover_art(file_path, cover_art):
                    print(f"✅ Cover art saved to database for: {file_path}")
                else:
                    print(f"⚠️ Failed to save cover art to database for: {file_path}")
                
                return jsonify({
                    'status': 'success',
                    'cover_art': cover_art,
                    'mime_type': mime_type,
                    'size': len(base64.b64decode(cover_art)),
                    'from_cache': False
                })
            else:
                print(f"⚠️ No cover art found in: {file_path}")
                return jsonify({
                    'status': 'no_cover_art',
                    'message': 'No cover art found in file',
                    'cover_art': None
                })
                
        except ImportError:
            print(f"❌ Mutagen library not available")
            return jsonify({
                'error': 'mutagen library not available',
                'status': 'error'
            }), 500
        except Exception as extract_error:
            print(f"❌ Failed to extract cover art: {str(extract_error)}")
            return jsonify({
                'error': f'Failed to extract cover art: {str(extract_error)}',
                'status': 'error'
            }), 500
        
    except Exception as e:
        print(f"❌ Error extracting cover art: {str(e)}")
        return jsonify({
            "error": f"Failed to extract cover art: {str(e)}",
            "status": "error"
        }), 500

@app.route('/library/update-cover-art', methods=['POST', 'OPTIONS'])
def update_cover_art():
    """Update cover art in database for a music file."""
    
    # Handle CORS preflight requests
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type, X-Signing-Key')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
    
    # Check signing key
    request_json = request.get_json() or {}
    signing_key = request.headers.get('X-Signing-Key') or request_json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        data = request_json
        file_path = data.get('file_path')
        cover_art = data.get('cover_art')
        
        if not file_path:
            return jsonify({"error": "No file path provided"}), 400
        
        if not cover_art:
            return jsonify({"error": "No cover art provided"}), 400
        
        # Update cover art in database
        if db_manager.update_cover_art(file_path, cover_art):
            print(f"✅ Cover art updated in database for: {file_path}")
            return jsonify({
                'status': 'success',
                'message': 'Cover art updated successfully'
            })
        else:
            print(f"❌ Failed to update cover art in database for: {file_path}")
            return jsonify({
                'status': 'error',
                'message': 'Failed to update cover art in database'
            }), 500
            
    except Exception as e:
        print(f"❌ Error updating cover art: {str(e)}")
        return jsonify({
            "error": f"Failed to update cover art: {str(e)}",
            "status": "error"
        }), 500

# Auto Mix API Endpoints
@app.route('/automix/next-track', methods=['POST'])
def automix_next_track():
    """Get the next track recommendation for automix."""
    automix_api = get_automix_api()
    return automix_api.get_next_track(request)

@app.route('/automix/analyze-playlist', methods=['POST'])
def automix_analyze_playlist():
    """Analyze a playlist for automix compatibility."""
    automix_api = get_automix_api()
    return automix_api.analyze_playlist(request)

@app.route('/automix/ai-status', methods=['GET'])
def automix_ai_status():
    """Get the current status of the AI system."""
    automix_api = get_automix_api()
    return automix_api.get_ai_status(request)

@app.route('/automix/transition-types', methods=['GET'])
def automix_transition_types():
    """Get available transition types for automix."""
    automix_api = get_automix_api()
    return automix_api.get_transition_types(request)

if __name__ == "__main__":
    print(f"🎆 Starting Enhanced Mixed In Key API Server with WebSocket support...")
    print(f"📞 Port: {args.apiport}")
    print(f"🔐 Signing Key: {args.signingkey}")
    print(f"🔌 WebSocket: Enabled for real-time download progress")
    print(f"🎧 Enhanced Features: 320kbps MP3, metadata extraction, auto-analysis")
    print(f"🤖 Auto Mix: AI-powered track selection with smollm2-135M")
    
    # Run with SocketIO support
    socketio.run(
        app, 
        host='127.0.0.1',
        port=args.apiport, 
        debug=False,
        allow_unsafe_werkzeug=True
    )
