import sys
print("Starting import test...")
try:
    print("Testing flask...")
    from flask import Flask, request, jsonify, send_file, Response, make_response
    print("Testing flask_cors...")
    from flask_cors import CORS
    print("Testing flask_socketio...")
    from flask_socketio import SocketIO, emit
    print("Testing graphene...")
    from graphene import ObjectType, String, Schema, Field, List, Mutation
    print("Testing flask_graphql...")
    from flask_graphql import GraphQLView
    print("Testing calc...")
    from calc import calc as real_calc
    print("Testing music_analyzer...")
    from music_analyzer import MusicAnalyzer, analyze_music_file
    print("Testing database_manager...")
    from database_manager import DatabaseManager
    print("Testing ytmusicapi...")
    import ytmusicapi
    print("Testing pytube...")
    from pytube import YouTube
    print("Testing yt_dlp...")
    import yt_dlp
    print("Testing download_queue_manager...")
    from download_queue_manager import download_queue_manager
    print("✅ All imports successful!")
except ImportError as e:
    print(f"❌ Import failed: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Other error: {e}")
    sys.exit(1)
