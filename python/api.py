from flask import Flask, request, jsonify
from flask_cors import CORS
from graphene import ObjectType, String, Schema, Field, List, Mutation
from flask_graphql import GraphQLView
from calc import calc as real_calc
from music_analyzer import MusicAnalyzer, analyze_music_file
import argparse
import os
import json
import tempfile
import base64

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
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
            file.save(tmp_file.name)
            temp_path = tmp_file.name
        
        try:
            # Analyze the uploaded file
            analysis_result = analyze_music_file(temp_path)
            
            # Clean up temporary file
            os.unlink(temp_path)
            
            return jsonify(analysis_result)
            
        except Exception as e:
            # Clean up temporary file on error
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            raise e
            
    except Exception as e:
        return jsonify({
            "error": f"Upload and analysis failed: {str(e)}",
            "status": "error"
        }), 500

@app.route('/analyze-file', methods=['POST'])
def analyze_existing_file():
    """REST endpoint for analyzing existing music files by path."""
    
    # Check signing key
    signing_key = request.headers.get('X-Signing-Key') or request.json.get('signingkey')
    if signing_key != apiSigningKey:
        return jsonify({"error": "invalid signature"}), 401
    
    try:
        data = request.get_json()
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

if __name__ == "__main__":
    app.run(port=args.apiport)
