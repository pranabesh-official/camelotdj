# 🚀 Quick Reference - CamelotDJ Testing

## ⚡ Quick Commands

### Start Backend
```bash
cd /Users/pranabeshsarkar/Desktop/camelotdj/python
python3 api.py --apiport 5002 --signingkey devkey
```

### Start Frontend
```bash
cd /Users/pranabeshsarkar/Desktop/camelotdj
npm run start
```

### Run All Tests
```bash
cd /Users/pranabeshsarkar/Desktop/camelotdj/python

# Test downloads
python3 test_download_robust.py

# Test preview/streaming
python3 test_preview_robust.py

# Test validators
python3 download_validators.py
```

### Check System Health
```bash
# Check if backend is running
curl http://127.0.0.1:5002/health | python3 -m json.tool

# Check FFmpeg
which ffmpeg

# Check disk space
df -h

# Check queue status
curl -H "X-Signing-Key: devkey" \
  "http://127.0.0.1:5002/youtube/queue/status?signingkey=devkey" | python3 -m json.tool
```

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `TESTING_SUMMARY.md` | Complete summary of testing work |
| `PROJECT_FLOW_ANALYSIS.md` | Architecture documentation |
| `TESTING_AND_FIXING_GUIDE.md` | Detailed testing guide |
| `python/test_download_robust.py` | Download tests |
| `python/test_preview_robust.py` | Preview tests |
| `python/download_validators.py` | Validation utilities |

---

## 🎯 Test a Download (Manual)

```bash
# 1. Start backend (if not running)
cd /Users/pranabeshsarkar/Desktop/camelotdj/python
python3 api.py --apiport 5002 --signingkey devkey

# 2. In another terminal, test download
curl -X POST http://127.0.0.1:5002/youtube/download-queued \
  -H "Content-Type: application/json" \
  -H "X-Signing-Key: devkey" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "title": "Never Gonna Give You Up",
    "artist": "Rick Astley",
    "download_path": "/tmp/camelotdj_test",
    "priority": "normal"
  }'

# 3. Check queue status
curl -H "X-Signing-Key: devkey" \
  "http://127.0.0.1:5002/youtube/queue/status?signingkey=devkey" | python3 -m json.tool
```

---

## 🎵 Test Preview (Manual)

```bash
# Stream audio to file
curl -H "X-Signing-Key: devkey" \
  "http://127.0.0.1:5002/youtube/stream/dQw4w9WgXcQ?signingkey=devkey" \
  --output /tmp/test_preview.mp3

# Check file
ls -lh /tmp/test_preview.mp3

# Play it (macOS)
afplay /tmp/test_preview.mp3
```

---

## 🐛 Quick Troubleshooting

### Backend won't start
```bash
# Check if port is in use
lsof -i :5002

# Kill existing process
pkill -f "api.py"

# Try again
cd python
python3 api.py --apiport 5002 --signingkey devkey
```

### Downloads failing
```bash
# Check FFmpeg
which ffmpeg
# If not found: brew install ffmpeg

# Check disk space
df -h

# Check system resources
python3 -c "from download_validators import DownloadValidator; print(DownloadValidator.check_system_resources())"
```

### Preview not working
```bash
# Test streaming endpoint
curl -I -H "X-Signing-Key: devkey" \
  "http://127.0.0.1:5002/youtube/stream/dQw4w9WgXcQ?signingkey=devkey"

# Should return 200 OK with Content-Type: audio/mpeg
```

---

## ✅ Success Indicators

### Backend is healthy:
```bash
curl http://127.0.0.1:5002/health
# Should return: {"status": "healthy", "ffmpeg_available": true, ...}
```

### Downloads working:
- ✅ Progress updates in real-time
- ✅ Files appear in download folder
- ✅ Analysis completes (key, BPM shown)
- ✅ No errors in backend logs

### Preview working:
- ✅ Audio starts playing within 5 seconds
- ✅ Playback controls work
- ✅ Can preview multiple songs

---

## 📊 Expected Test Results

### test_download_robust.py
```
📊 Total: 7 tests
✅ Passed: 7
❌ Failed: 0
🎉 All tests passed!
```

### test_preview_robust.py
```
📊 Total: 7 tests
✅ Passed: 7
❌ Failed: 0
🎉 All tests passed!
```

### download_validators.py
```
✅ FFmpeg: Found at /usr/local/bin/ffmpeg
✅ Disk Space: 155025 MB available
✅ System Resources: Healthy
✅ URL Validation: Working
✅ Video ID Validation: Working
```

---

## 🎓 Next Steps After Testing

1. ✅ Run all tests
2. ✅ Verify manual download works
3. ✅ Verify preview works
4. ✅ Check all files are created correctly
5. ✅ Review logs for any warnings
6. 🚀 Start using CamelotDJ!

---

**Quick Help:** See `TESTING_AND_FIXING_GUIDE.md` for detailed troubleshooting
