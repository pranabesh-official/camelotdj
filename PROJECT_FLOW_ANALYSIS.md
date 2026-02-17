# CamelotDJ Project Flow Analysis

## Overview
CamelotDJ is a music analysis platform with YouTube download capabilities, built using:
- **Frontend**: React + TypeScript (Electron)
- **Backend**: Python Flask with WebSocket support
- **Audio Processing**: yt-dlp, FFmpeg, librosa, essentia
- **Database**: SQLite (via database_manager.py)

---

## 🎵 Download Flow Architecture

### 1. **Download Endpoints**

#### a) `/youtube/download` (Basic Download)
- **Purpose**: Simple synchronous download with analysis
- **Flow**:
  1. Validates signing key
  2. Downloads audio using yt-dlp or pytube fallback
  3. Converts to 320kbps MP3 using pydub/FFmpeg
  4. Analyzes music (key, BPM, energy)
  5. Writes ID3 tags
  6. Saves to database
  7. Returns complete analysis

#### b) `/youtube/download-enhanced` (WebSocket Progress)
- **Purpose**: Download with real-time progress updates
- **Flow**:
  1. Creates download ID
  2. Emits progress via WebSocket (`emit_progress`)
  3. Uses `download_with_ytdlp_enhanced()` for metadata extraction
  4. Converts to 320kbps MP3
  5. Enhances metadata with artwork
  6. Analyzes music
  7. Emits completion event

#### c) `/youtube/download-queued` (Queue System) ⭐ **RECOMMENDED**
- **Purpose**: Efficient multi-download handling with queue management
- **Flow**:
  1. Creates `DownloadTask` object
  2. Adds to `download_queue_manager`
  3. Queue processes downloads based on priority
  4. Manages concurrent downloads (default: 3)
  5. Handles retries and resource management
  6. Emits WebSocket events for progress

---

## 🔄 Download Queue Manager Architecture

### Core Components

#### `DownloadTask` (dataclass)
```python
- id: str
- url: str
- title: str
- artist: str
- status: DownloadStatus (queued, downloading, converting, analyzing, completed, failed)
- progress: float (0-100)
- priority: DownloadPriority (LOW=1, NORMAL=2, HIGH=3, URGENT=4)
- quality: str (default: "320kbps")
- format: str (default: "mp3")
```

#### `DownloadQueueManager`
**Key Features**:
- Priority-based queue (uses `PriorityQueue`)
- Concurrent download management (ThreadPoolExecutor)
- System resource monitoring (CPU, memory, disk)
- Automatic retry mechanism (max 3 retries)
- Callback system for progress/completion/error

**Main Methods**:
- `add_download(task)` - Add task to queue
- `start()` - Start queue processor
- `cancel_download(task_id)` - Cancel specific download
- `retry_download(task_id)` - Retry failed download
- `get_queue_stats()` - Get queue statistics

---

## 🎧 Song Preview Architecture

### Current Implementation

#### `/youtube/stream/<video_id>` (Streaming Endpoint)
- **Status**: ✅ Implemented
- **Purpose**: Stream YouTube audio without downloading
- **Flow**:
  1. Validates signing key
  2. Uses yt-dlp to extract stream URL
  3. Fetches audio stream from YouTube
  4. Streams to client in chunks (8KB)
  5. Returns audio/mpeg with CORS headers

**Usage**:
```javascript
const audioUrl = `http://127.0.0.1:${apiPort}/youtube/stream/${videoId}?signingkey=${apiSigningKey}`;
audioElement.src = audioUrl;
```

#### `/youtube/preview/<video_id>` (Placeholder)
- **Status**: ⚠️ Placeholder only
- **Purpose**: Future implementation for preview features
- **Current**: Returns JSON placeholder response

---

## 📊 Frontend Integration (DownloadManager.tsx)

### State Management
```typescript
- downloads: Map<string, DownloadTask>
- activeTab: 'active' | 'completed' | 'failed'
- stats: DownloadStats
```

### WebSocket Events
1. **`download_progress`** - Progress updates
2. **`download_complete`** - Download finished
3. **`download_error`** - Download failed
4. **`download_cancelled`** - Download cancelled

### Key Functions
- `addDownload(track)` - Add new download
- `handleDownloadProgress(data)` - Update progress
- `syncWithBackendQueue()` - Sync with backend state
- `cancelDownload(id)` - Cancel download
- `retryDownload(id)` - Retry failed download

---

## 🔧 Critical Dependencies

### Python Backend
```
yt-dlp          # YouTube download
ffmpeg          # Audio conversion (REQUIRED)
pydub           # Audio processing
librosa         # Music analysis
essentia        # Advanced audio analysis
mutagen         # ID3 tag writing
flask-socketio  # WebSocket support
```

### FFmpeg Check
```python
# api.py checks for FFmpeg on startup
FFMPEG_PATH = check_ffmpeg()
HAS_FFMPEG = FFMPEG_PATH is not None
```

**Common FFmpeg Locations (macOS)**:
- `/usr/local/bin/ffmpeg`
- `/opt/homebrew/bin/ffmpeg`
- `/usr/bin/ffmpeg`

---

## 🐛 Known Issues & Fixes

### Issue 1: Download Failures
**Symptoms**: Downloads fail silently or with "yt-dlp failed"
**Causes**:
- FFmpeg not installed or not in PATH
- Network issues
- Age-restricted videos
- Geo-blocked content

**Fixes**:
1. Install FFmpeg: `brew install ffmpeg`
2. Check health endpoint: `GET /health`
3. Enable verbose logging in yt-dlp
4. Use queue system for better error handling

### Issue 2: Preview Not Working
**Symptoms**: Preview endpoint returns placeholder
**Cause**: `/youtube/preview` is not fully implemented

**Fix**: Use `/youtube/stream/<video_id>` instead

### Issue 3: Progress Not Updating
**Symptoms**: Frontend shows stuck progress
**Causes**:
- WebSocket disconnection
- Backend not emitting progress
- Frontend not listening to correct events

**Fixes**:
1. Check WebSocket connection status
2. Verify `emit_progress()` is called in backend
3. Ensure frontend is subscribed to `download_progress` event
4. Use queue system which has built-in progress tracking

### Issue 4: Database Connection Issues
**Symptoms**: "Database locked" or connection errors
**Cause**: SQLite concurrent access issues

**Fix**: Use `database_manager.py` which has connection pooling

---

## 🧪 Testing Strategy

### 1. Unit Tests
```bash
# Test download queue manager
python python/test_download_queue.py

# Test music analysis
python python/test_music_analyzer.py
```

### 2. Integration Tests
```bash
# Test full download flow
python python/test_download_integration.py

# Test WebSocket events
python python/test_websocket_connection.py
```

### 3. Manual Testing Checklist
- [ ] Single download works
- [ ] Multiple concurrent downloads work
- [ ] Progress updates in real-time
- [ ] Cancellation works
- [ ] Retry works for failed downloads
- [ ] Preview/streaming works
- [ ] Analysis completes successfully
- [ ] ID3 tags are written correctly
- [ ] Files are saved to correct location

---

## 🚀 Recommended Improvements

### 1. Make Download Robust
**Priority**: HIGH

**Changes**:
1. **Add comprehensive error handling**:
   - Network timeout handling
   - Disk space checks
   - FFmpeg availability checks
   - Graceful degradation

2. **Improve retry logic**:
   - Exponential backoff
   - Different retry strategies per error type
   - Max retry limits per download

3. **Add download validation**:
   - Verify file integrity
   - Check audio quality
   - Validate metadata

### 2. Make Preview Robust
**Priority**: MEDIUM

**Changes**:
1. **Implement full preview endpoint**:
   - Replace placeholder with actual implementation
   - Add caching for frequently previewed tracks
   - Support seek/range requests

2. **Add preview features**:
   - 30-second preview clips
   - Waveform generation
   - Preview quality selection

### 3. Add Comprehensive Testing
**Priority**: HIGH

**Changes**:
1. **Create test suite**:
   - Unit tests for all download functions
   - Integration tests for full flow
   - WebSocket event tests
   - Database operation tests

2. **Add test fixtures**:
   - Mock YouTube responses
   - Sample audio files
   - Test database

---

## 📝 API Endpoints Summary

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/youtube/download` | POST | Basic download | ✅ Working |
| `/youtube/download-enhanced` | POST | Download with progress | ✅ Working |
| `/youtube/download-queued` | POST | Queue-based download | ✅ Working |
| `/youtube/stream/<id>` | GET | Stream audio | ✅ Working |
| `/youtube/preview/<id>` | GET | Preview (placeholder) | ⚠️ Placeholder |
| `/youtube/queue/status` | GET | Get queue status | ✅ Working |
| `/youtube/queue/cancel` | POST | Cancel download | ✅ Working |
| `/health` | GET | System health check | ✅ Working |

---

## 🎯 Next Steps

1. **Create comprehensive test suite** (see test files below)
2. **Fix FFmpeg detection and installation**
3. **Improve error messages and user feedback**
4. **Add download resume capability**
5. **Implement full preview endpoint**
6. **Add download history and statistics**
7. **Optimize concurrent download limits based on system resources**

---

## 📚 Key Files Reference

### Backend
- `python/api.py` - Main Flask API with all endpoints
- `python/download_queue_manager.py` - Queue management system
- `python/music_analyzer.py` - Audio analysis engine
- `python/database_manager.py` - Database operations

### Frontend
- `src/components/DownloadManager.tsx` - Download UI and WebSocket handling
- `src/services/api.ts` - API client (if exists)

### Configuration
- `.env.local` - Environment variables
- `requirements.txt` - Python dependencies
- `package.json` - Node.js dependencies
