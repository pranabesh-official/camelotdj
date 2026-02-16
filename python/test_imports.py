try:
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
    # from automix_api import get_automix_api
    print("✅ All imports successful!")
except ImportError as e:
    print(f"❌ Import failed: {e}")
except Exception as e:
    print(f"❌ Other error: {e}")
