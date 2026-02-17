# Testing and Fixing Guide for CamelotDJ

This guide provides step-by-step instructions for testing and fixing download and song preview functionality.

---

## 🚀 Quick Start

### 1. Prerequisites Check

```bash
# Check if FFmpeg is installed
which ffmpeg
# If not found, install it:
# macOS:
brew install ffmpeg
# Ubuntu/Debian:
sudo apt-get install ffmpeg
```

### 2. Start the Backend

```bash
cd /Users/pranabeshsarkar/Desktop/camelotdj
conda activate camelotdj  # or your Python environment
cd python
python api.py --apiport 5002 --signingkey devkey
```

### 3. Start the Frontend

```bash
# In a new terminal
cd /Users/pranabeshsarkar/Desktop/camelotdj
npm run start
```

---

## 🧪 Running Tests

### Test 1: Download Queue Manager

```bash
cd /Users/pranabeshsarkar/Desktop/camelotdj/python
python test_download_robust.py
```

**What it tests:**
- ✅ Basic queue functionality
- ✅ Priority handling
- ✅ Concurrent downloads
- ✅ Download cancellation
- ✅ Retry mechanism
- ✅ Queue statistics
- ✅ Get all downloads

**Expected output:**
```
🧪 CAMELOTDJ DOWNLOAD TEST SUITE
============================================================
TEST 1: Basic Queue Functionality
✅ Added task to queue: test_basic_1
📊 Final status: completed
📊 Progress: 100%

...

📊 TEST SUMMARY
============================================================
✅ PASS: Basic Queue Functionality
✅ PASS: Priority Queue Handling
...
📊 Total: 7 tests
✅ Passed: 7
❌ Failed: 0

🎉 All tests passed!
```

### Test 2: Preview and Streaming

```bash
cd /Users/pranabeshsarkar/Desktop/camelotdj/python
python test_preview_robust.py
```

**What it tests:**
- ✅ Basic streaming endpoint
- ✅ Invalid video handling
- ✅ Authentication
- ✅ Preview endpoint
- ✅ Response headers
- ✅ Stream performance
- ✅ Concurrent streaming

**Expected output:**
```
🎵 CAMELOTDJ PREVIEW & STREAMING TEST SUITE
============================================================
🔍 Checking server health...
✅ Server is healthy
📊 Status: healthy
📊 FFmpeg: True
📊 Database: connected

TEST 1: Basic Streaming Endpoint
✅ Successfully streamed 10 chunks (81920 bytes)

...

📊 TEST SUMMARY
✅ PASS: Basic Streaming Endpoint
...
🎉 All tests passed!
```

### Test 3: Validators

```bash
cd /Users/pranabeshsarkar/Desktop/camelotdj/python
python download_validators.py
```

**What it tests:**
- ✅ FFmpeg availability
- ✅ Disk space
- ✅ System resources
- ✅ URL validation
- ✅ Video ID validation

---

## 🔧 Common Issues and Fixes

### Issue 1: FFmpeg Not Found

**Symptoms:**
```
⚠️ WARNING: FFmpeg not found! High-quality conversion and analysis features will be limited.
```

**Fix:**
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install ffmpeg

# Verify installation
which ffmpeg
ffmpeg -version
```

### Issue 2: Downloads Failing

**Symptoms:**
- Downloads stuck at 0%
- "yt-dlp failed" errors
- No progress updates

**Diagnosis:**
```bash
# Check backend logs
cd /Users/pranabeshsarkar/Desktop/camelotdj/python
python api.py --apiport 5002 --signingkey devkey

# In another terminal, check health
curl http://127.0.0.1:5002/health
```

**Fixes:**

1. **Check FFmpeg:**
```bash
python -c "from download_validators import DownloadValidator; print(DownloadValidator.check_ffmpeg())"
```

2. **Check disk space:**
```bash
df -h
```

3. **Check system resources:**
```bash
python -c "from download_validators import DownloadValidator; import json; print(json.dumps(DownloadValidator.check_system_resources()[1], indent=2))"
```

4. **Test with a known working video:**
```bash
curl -X POST http://127.0.0.1:5002/youtube/download-queued \
  -H "Content-Type: application/json" \
  -H "X-Signing-Key: devkey" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "title": "Test Song",
    "artist": "Test Artist",
    "download_path": "/tmp/camelotdj_test"
  }'
```

### Issue 3: Preview Not Working

**Symptoms:**
- Preview returns placeholder message
- No audio plays

**Fix:**

The `/youtube/preview/<video_id>` endpoint is a placeholder. Use the streaming endpoint instead:

```javascript
// Frontend code
const videoId = "dQw4w9WgXcQ";
const audioUrl = `http://127.0.0.1:${apiPort}/youtube/stream/${videoId}?signingkey=${apiSigningKey}`;

const audio = new Audio(audioUrl);
audio.play();
```

**Test streaming endpoint:**
```bash
# This should start streaming audio
curl -H "X-Signing-Key: devkey" \
  "http://127.0.0.1:5002/youtube/stream/dQw4w9WgXcQ?signingkey=devkey" \
  --output test_stream.mp3

# Check if file was created
ls -lh test_stream.mp3
```

### Issue 4: WebSocket Not Connecting

**Symptoms:**
- No progress updates in UI
- Downloads appear stuck

**Diagnosis:**
```bash
# Check WebSocket connection
cd /Users/pranabeshsarkar/Desktop/camelotdj
open debug_websocket.html
# Or use the test script
python test_websocket_connection.py
```

**Fix:**

1. **Check if backend is running:**
```bash
lsof -i :5002
```

2. **Check WebSocket events in browser console:**
```javascript
// In browser console
const socket = io('http://127.0.0.1:5002');
socket.on('connect', () => console.log('✅ Connected'));
socket.on('download_progress', (data) => console.log('📊 Progress:', data));
socket.on('download_complete', (data) => console.log('✅ Complete:', data));
socket.on('download_error', (data) => console.log('❌ Error:', data));
```

3. **Restart backend with verbose logging:**
```bash
cd python
FLASK_ENV=development python api.py --apiport 5002 --signingkey devkey
```

### Issue 5: Database Errors

**Symptoms:**
- "Database locked" errors
- "Connection failed" errors

**Fix:**

1. **Check database file:**
```bash
ls -lh /Users/pranabeshsarkar/Desktop/camelotdj/ai_agent.db
```

2. **Test database connection:**
```bash
cd python
python -c "from database_manager import DatabaseManager; db = DatabaseManager(); print('✅ Database connected')"
```

3. **If corrupted, backup and recreate:**
```bash
cd /Users/pranabeshsarkar/Desktop/camelotdj
mv ai_agent.db ai_agent.db.backup
# Database will be recreated on next backend start
```

---

## 🎯 Manual Testing Checklist

### Download Functionality

- [ ] **Single Download**
  1. Start backend and frontend
  2. Search for a song
  3. Click download
  4. Verify progress updates in real-time
  5. Verify file appears in download folder
  6. Verify song analysis (key, BPM) is displayed

- [ ] **Multiple Downloads**
  1. Queue 5 downloads
  2. Verify only 3 run concurrently (default limit)
  3. Verify queue shows correct counts
  4. Verify all downloads complete

- [ ] **Download Cancellation**
  1. Start a download
  2. Click cancel while in progress
  3. Verify download stops
  4. Verify file is not created

- [ ] **Download Retry**
  1. Download a restricted/unavailable video
  2. Verify error message
  3. Click retry
  4. Verify retry attempt

- [ ] **Priority Downloads**
  1. Queue 5 normal priority downloads
  2. Add 1 urgent priority download
  3. Verify urgent download starts immediately

### Preview Functionality

- [ ] **Basic Preview**
  1. Search for a song
  2. Click preview/play button
  3. Verify audio starts playing
  4. Verify playback controls work

- [ ] **Preview Multiple Songs**
  1. Play preview for song A
  2. Click preview for song B
  3. Verify song A stops and song B starts

- [ ] **Preview During Download**
  1. Start downloading a song
  2. Preview a different song
  3. Verify both work simultaneously

### Analysis Functionality

- [ ] **Key Detection**
  1. Download a song
  2. Verify key is detected (e.g., "8A", "C major")
  3. Verify key is shown in UI

- [ ] **BPM Detection**
  1. Download a song
  2. Verify BPM is detected
  3. Verify BPM is accurate (±5 BPM)

- [ ] **Energy Level**
  1. Download a song
  2. Verify energy level is calculated (1-10)
  3. Verify energy level makes sense for the song

---

## 🐛 Debugging Tips

### Enable Verbose Logging

**Backend:**
```python
# In api.py, add at the top:
import logging
logging.basicConfig(level=logging.DEBUG)
```

**Frontend:**
```javascript
// In DownloadManager.tsx, add:
console.log('🔍 Download state:', downloads);
console.log('🔍 WebSocket connected:', socketRef.current?.connected);
```

### Monitor System Resources

```bash
# CPU and memory
top

# Disk space
df -h

# Network connections
lsof -i :5002
netstat -an | grep 5002
```

### Check Backend Health

```bash
# Health check endpoint
curl http://127.0.0.1:5002/health | python -m json.tool

# Queue status
curl -H "X-Signing-Key: devkey" \
  "http://127.0.0.1:5002/youtube/queue/status?signingkey=devkey" | python -m json.tool
```

### Inspect Database

```bash
cd /Users/pranabeshsarkar/Desktop/camelotdj
sqlite3 ai_agent.db

# In SQLite shell:
.tables
SELECT * FROM music_files LIMIT 5;
.quit
```

---

## 📊 Performance Benchmarks

### Expected Performance

| Operation | Expected Time | Notes |
|-----------|--------------|-------|
| Download (3-4 min song) | 30-60 seconds | Depends on internet speed |
| Audio conversion | 5-10 seconds | Requires FFmpeg |
| Music analysis | 10-20 seconds | CPU intensive |
| Preview start | 2-5 seconds | First chunk |
| Database save | < 1 second | Should be instant |

### If Performance is Slow

1. **Check internet speed:**
```bash
# macOS
networkQuality
# Or use speedtest-cli
pip install speedtest-cli
speedtest-cli
```

2. **Check CPU usage:**
```bash
top -o cpu
```

3. **Reduce concurrent downloads:**
```python
# In api.py or when initializing queue manager:
download_queue_manager = DownloadQueueManager(
    max_concurrent_downloads=2,  # Reduce from 3 to 2
    max_retries=3
)
```

---

## 🎓 Next Steps

After testing and fixing:

1. **Run all tests** to ensure everything works
2. **Document any new issues** you find
3. **Update this guide** with new fixes
4. **Consider implementing:**
   - Download resume capability
   - Better progress estimation
   - Thumbnail caching
   - Batch download operations
   - Download history and statistics

---

## 📞 Getting Help

If you encounter issues not covered here:

1. Check the logs in terminal
2. Check browser console for frontend errors
3. Run the health check endpoint
4. Run the test suites
5. Check the PROJECT_FLOW_ANALYSIS.md for architecture details

---

## ✅ Success Criteria

Your download and preview functionality is working correctly if:

- ✅ All test suites pass
- ✅ Downloads complete successfully
- ✅ Progress updates in real-time
- ✅ Preview/streaming works
- ✅ Analysis completes (key, BPM, energy)
- ✅ Files are saved correctly
- ✅ No errors in logs
- ✅ UI is responsive

---

**Last Updated:** 2026-02-17
**Version:** 1.0
