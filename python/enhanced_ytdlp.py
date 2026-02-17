#!/usr/bin/env python3
"""
Enhanced yt-dlp download with robust error handling and workarounds for YouTube restrictions.
This module provides fixes for common YouTube download issues.
"""

import yt_dlp
import os
import time
import random

def get_enhanced_ydl_opts(output_path, use_cookies=False):
    """
    Get enhanced yt-dlp options with workarounds for YouTube restrictions
    
    Args:
        output_path: Path where the file should be saved
        use_cookies: Whether to use browser cookies (helps with age-restricted videos)
    
    Returns:
        dict: yt-dlp options
    """
    
    # User agents to rotate
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ]
    
    opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
        'outtmpl': output_path,
        'quiet': False,
        'no_warnings': False,
        'extract_flat': False,
        'nocheckcertificate': True,
        'ignoreerrors': False,
        'logtostderr': False,
        'no_color': True,
        'user_agent': random.choice(user_agents),
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'web'],
                'player_skip': ['webpage', 'configs'],
            }
        },
        'http_headers': {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-us,en;q=0.5',
            'Sec-Fetch-Mode': 'navigate',
        }
    }
    
    # Add cookies if requested (helps with age-restricted content)
    if use_cookies:
        # Try to find browser cookies
        cookie_paths = [
            os.path.expanduser('~/Library/Application Support/Google/Chrome/Default/Cookies'),  # macOS Chrome
            os.path.expanduser('~/Library/Application Support/Firefox/Profiles/*/cookies.sqlite'),  # macOS Firefox
        ]
        
        for cookie_path in cookie_paths:
            if os.path.exists(cookie_path):
                opts['cookiefile'] = cookie_path
                print(f"✅ Using cookies from: {cookie_path}")
                break
    
    return opts


def download_with_enhanced_ytdlp(url, output_path, progress_callback=None, max_retries=3):
    """
    Download YouTube video with enhanced error handling and retries
    
    Args:
        url: YouTube video URL
        output_path: Where to save the file
        progress_callback: Optional callback for progress updates
        max_retries: Maximum number of retry attempts
    
    Returns:
        tuple: (success: bool, error_message: str or None, actual_path: str or None)
    """
    
    for attempt in range(max_retries):
        try:
            print(f"\n🔄 Download attempt {attempt + 1}/{max_retries}")
            
            # Use cookies on retry attempts
            use_cookies = attempt > 0
            
            # Get options
            ydl_opts = get_enhanced_ydl_opts(output_path, use_cookies=use_cookies)
            
            # Add progress hook if provided
            if progress_callback:
                def progress_hook(d):
                    if d['status'] == 'downloading':
                        progress_callback({
                            'status': 'downloading',
                            'downloaded_bytes': d.get('downloaded_bytes', 0),
                            'total_bytes': d.get('total_bytes') or d.get('total_bytes_estimate', 0),
                            'speed': d.get('speed', 0),
                            'eta': d.get('eta', 0)
                        })
                    elif d['status'] == 'finished':
                        progress_callback({
                            'status': 'finished',
                            'filename': d.get('filename')
                        })
                
                ydl_opts['progress_hooks'] = [progress_hook]
            
            # Attempt download
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                print(f"🎵 Downloading: {url}")
                info = ydl.extract_info(url, download=True)
                
                if info:
                    # Find the downloaded file
                    actual_path = None
                    base_path = os.path.splitext(output_path)[0]
                    
                    # Check for common extensions
                    for ext in ['.m4a', '.webm', '.mp3', '.opus', '.wav']:
                        test_path = base_path + ext
                        if os.path.exists(test_path):
                            actual_path = test_path
                            break
                    
                    if actual_path and os.path.exists(actual_path):
                        print(f"✅ Download successful: {actual_path}")
                        return True, None, actual_path
                    else:
                        print(f"⚠️ Download completed but file not found")
                        return False, "File not found after download", None
                else:
                    return False, "No video information retrieved", None
                    
        except yt_dlp.utils.DownloadError as e:
            error_str = str(e).lower()
            
            # Categorize error
            if '403' in error_str or 'forbidden' in error_str:
                error_msg = "YouTube blocked the request (403 Forbidden)"
                suggestion = "Try updating yt-dlp: pip install --upgrade yt-dlp"
                
            elif '404' in error_str or 'not found' in error_str:
                error_msg = "Video not found (404)"
                suggestion = "Check if the video URL is correct and the video is still available"
                
            elif 'private' in error_str or 'unavailable' in error_str:
                error_msg = "Video is private or unavailable"
                suggestion = "This video cannot be downloaded"
                
            elif 'age' in error_str or 'restricted' in error_str:
                error_msg = "Age-restricted video"
                suggestion = "Trying with browser cookies..."
                
            else:
                error_msg = f"Download error: {str(e)}"
                suggestion = "Check your internet connection and try again"
            
            print(f"❌ {error_msg}")
            print(f"💡 {suggestion}")
            
            # Don't retry for certain errors
            if '404' in error_str or 'private' in error_str:
                return False, error_msg, None
            
            # Wait before retry with exponential backoff
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) + random.uniform(0, 1)
                print(f"⏳ Waiting {wait_time:.1f}s before retry...")
                time.sleep(wait_time)
            else:
                return False, error_msg, None
                
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            print(f"❌ {error_msg}")
            
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) + random.uniform(0, 1)
                print(f"⏳ Waiting {wait_time:.1f}s before retry...")
                time.sleep(wait_time)
            else:
                return False, error_msg, None
    
    return False, "All retry attempts failed", None


# Test function
if __name__ == "__main__":
    import sys
    import tempfile
    
    if len(sys.argv) < 2:
        print("Usage: python enhanced_ytdlp.py <youtube_url>")
        print("Example: python enhanced_ytdlp.py https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        sys.exit(1)
    
    url = sys.argv[1]
    output_dir = tempfile.mkdtemp(prefix="ytdlp_test_")
    output_path = os.path.join(output_dir, "test_download.m4a")
    
    print(f"🧪 Testing enhanced yt-dlp download")
    print(f"📁 Output directory: {output_dir}")
    print(f"🔗 URL: {url}")
    
    success, error, actual_path = download_with_enhanced_ytdlp(url, output_path)
    
    if success:
        print(f"\n✅ Test successful!")
        print(f"📁 File: {actual_path}")
        print(f"📊 Size: {os.path.getsize(actual_path) / (1024*1024):.2f} MB")
    else:
        print(f"\n❌ Test failed: {error}")
        sys.exit(1)
