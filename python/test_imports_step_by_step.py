import time
def test_import(module_name):
    print(f"Importing {module_name}...")
    start = time.time()
    try:
        __import__(module_name)
        print(f"✅ {module_name} imported in {time.time() - start:.2f}s")
    except ImportError as e:
        print(f"❌ {module_name} failed: {e}")

test_import("flask")
test_import("flask_cors")
test_import("flask_socketio")
test_import("graphene")
test_import("flask_graphql")
test_import("librosa")
test_import("numpy")
test_import("scipy")
test_import("mutagen")
test_import("essentia")
test_import("essentia.standard")
test_import("ytmusicapi")
test_import("yt_dlp")
test_import("psutil")
test_import("llm")
