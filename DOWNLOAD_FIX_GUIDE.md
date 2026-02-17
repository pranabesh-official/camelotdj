# 🚀 CamelotDJ Download Fix - Complete Guide

## 📋 Current Status

✅ **Backend**: Running and healthy  
✅ **FFmpeg**: Installed and working  
✅ **Database**: Connected  
❌ **Downloads**: Failing with YouTube 403 Forbidden error  

## 🔍 Root Cause

YouTube has implemented stricter anti-bot measures that block automated downloads. The current yt-dlp version (2025.10.14) is encountering:

1. **HTTP 403 Forbidden** - YouTube blocking requests
2. **SABR streaming enforcement** - New streaming protocol
3. **Missing authentication** - Requires browser cookies for some videos

## ✅ Solutions Implemented

### 1. Enhanced yt-dlp Module (`enhanced_ytdlp.py`)
- ✅ User-agent rotation
- ✅ Retry logic with exponential backoff
- ✅ Cookie support for age-restricted videos
- ✅ Better error categorization
- ✅ Multiple player client strategies

### 2. Download Validators (`download_validators.py`)
- ✅ Pre-flight checks (FFmpeg, disk space, system resources)
- ✅ URL validation
- ✅ Error handling and categorization

### 3. Integration Tests (`test_download_integration.py`)
- ✅ Real download testing
- ✅ 320kbps MP3 verification
- ✅ Analysis quality checks

## 🛠️ Recommended Fixes

### Option 1: Use Browser Cookies (RECOMMENDED)

This is the most reliable solution for bypassing YouTube restrictions.

**Steps:**

1. **Export cookies from your browser:**
   ```bash
   # Install browser cookie extension
   # Chrome: "Get cookies.txt LOCALLY" extension
   # Firefox: "cookies.txt" extension
   
   # Export cookies for youtube.com
   # Save to: ~/youtube_cookies.txt
   ```

2. **Update api.py to use cookies:**
   ```python
   # In download_with_ytdlp function, add:
   ydl_opts = {
       'format': 'bestaudio[ext=m4a]/bestaudio',
       'cookiefile': os.path.expanduser('~/youtube_cookies.txt'),
       # ... rest of options
   }
   ```

### Option 2: Use Alternative Download Method

Use `youtube-dl` fork or `pytube` as primary method:

```bash
pip3 install --upgrade pytube
```

### Option 3: Use Proxy/VPN

If YouTube is blocking your IP:

```python
ydl_opts = {
    'proxy': 'http://proxy-server:port',
    # ... rest of options
}
```

### Option 4: Rate Limiting

Add delays between downloads to avoid rate limiting:

```python
import time
time.sleep(random.uniform(2, 5))  # Random delay between downloads
```

## 📝 Implementation Steps

### Step 1: Get Browser Cookies

**For Chrome:**
1. Install "Get cookies.txt LOCALLY" extension
2. Go to youtube.com and make sure you're logged in
3. Click the extension icon
4. Click "Export" → Save to `~/youtube_cookies.txt`

**For Firefox:**
1. Install "cookies.txt" extension  
2. Go to youtube.com
3. Click extension → Export cookies
4. Save to `~/youtube_cookies.txt`

### Step 2: Update Download Function

Edit `/Users/pranabeshsarkar/Desktop/camelotdj/python/api.py`:

Find the `download_with_ytdlp` function and update `ydl_opts`:

```python
def download_with_ytdlp(url, output_path, progress_callback=None):
    """Download with yt-dlp using cookies"""
    
    cookie_file = os.path.expanduser('~/youtube_cookies.txt')
    
    ydl_opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
        'outtmpl': output_path,
        'quiet': False,
        'no_warnings': False,
        'nocheckcertificate': True,
        'user_agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'web'],
                'player_skip': ['webpage'],
            }
        },
    }
    
    # Add cookies if file exists
    if os.path.exists(cookie_file):
        ydl_opts['cookiefile'] = cookie_file
        print(f"✅ Using cookies from: {cookie_file}")
    else:
        print(f"⚠️ No cookies file found at: {cookie_file}")
        print(f"💡 Export cookies from your browser to fix download issues")
    
    # ... rest of function
```

### Step 3: Test Download

```bash
cd /Users/pranabeshsarkar/Desktop/camelotdj/python
python3 test_download_integration.py
```

## 🎯 Alternative: Use YouTube Music API

Instead of downloading from YouTube directly, use YouTube Music's official API (requires API key):

```python
from ytmusicapi import YTMusic

ytmusic = YTMusic()
search_results = ytmusic.search("Never Gonna Give You Up", filter="songs")
# Get official stream URL
```

## 📊 Testing Checklist

After implementing fixes:

- [ ] Export browser cookies to `~/youtube_cookies.txt`
- [ ] Update `api.py` with cookie support
- [ ] Restart backend
- [ ] Test download with integration test
- [ ] Test download from UI
- [ ] Verify 320kbps MP3 conversion
- [ ] Verify song analysis (key, BPM)
- [ ] Test with multiple songs
- [ ] Test queue system

## 🐛 Troubleshooting

### Still getting 403 errors?

1. **Update yt-dlp:**
   ```bash
   pip3 install --upgrade --force-reinstall yt-dlp
   ```

2. **Clear yt-dlp cache:**
   ```bash
   rm -rf ~/.cache/yt-dlp/
   ```

3. **Try different video:**
   Some videos have stricter restrictions. Try a different one.

4. **Check if video is available:**
   ```bash
   yt-dlp --list-formats "https://www.youtube.com/watch?v=VIDEO_ID"
   ```

### Cookies not working?

1. Make sure you're logged into YouTube in your browser
2. Re-export cookies (they expire)
3. Check cookie file format (Netscape format)
4. Try cookies from a different browser

### Downloads very slow?

1. Check internet connection
2. Try different time of day (less YouTube traffic)
3. Use proxy/VPN if ISP is throttling

## 📞 Quick Commands

```bash
# Start backend
cd /Users/pranabeshsarkar/Desktop/camelotdj/python
python3 api.py --apiport 5002 --signingkey devkey

# Test download
python3 test_download_integration.py

# Check yt-dlp version
python3 -c "import yt_dlp; print(yt_dlp.version.__version__)"

# Test single video
python3 enhanced_ytdlp.py "https://www.youtube.com/watch?v=VIDEO_ID"

# Check backend health
curl http://127.0.0.1:5002/health | python3 -m json.tool
```

## ✨ Expected Results After Fix

✅ Downloads complete successfully  
✅ 320kbps MP3 files created  
✅ Song analysis works (key, BPM, energy)  
✅ Files saved with proper metadata  
✅ Queue system processes downloads  
✅ Progress updates in real-time  

## 🎓 Next Steps

1. **Immediate**: Export browser cookies and update api.py
2. **Short-term**: Test with multiple videos
3. **Long-term**: Consider YouTube Music API for better reliability

---

**Last Updated:** 2026-02-17  
**Status:** Awaiting cookie implementation  
**Priority:** HIGH - Blocking core functionality
