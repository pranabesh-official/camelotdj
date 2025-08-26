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
