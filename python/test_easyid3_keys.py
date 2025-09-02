#!/usr/bin/env python3
"""
Test script to check what EasyID3 keys are actually supported.
"""

from mutagen.easyid3 import EasyID3
import tempfile
import os

def test_easyid3_keys():
    """Test what EasyID3 keys are actually supported."""
    print("🔍 Testing EasyID3 supported keys...")
    
    # Create a temporary file for testing
    temp_file = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
    temp_path = temp_file.name
    temp_file.close()
    
    try:
        # Create EasyID3 tags
        tags = EasyID3()
        
        # Show valid_keys specifically
        print(f"\n🎯 Valid EasyID3 keys:")
        print("-" * 40)
        try:
            valid_keys = tags.valid_keys
            for key in valid_keys:
                print(f"  {key}")
        except Exception as e:
            print(f"  Could not get valid_keys: {str(e)}")
        
        # Test various keys
        test_keys = [
            'title', 'artist', 'album', 'genre', 'year', 'tracknumber',
            'bpm', 'key', 'description', 'comment', 'grouping',
            'composer', 'lyricist', 'encodedby', 'initialkey'
        ]
        
        print(f"\n📝 Testing EasyID3 keys:")
        print("-" * 40)
        
        for key in test_keys:
            try:
                tags[key] = [f"Test {key}"]
                print(f"✅ {key}: Supported")
            except Exception as e:
                print(f"❌ {key}: Not supported - {str(e)}")
        
        # Try to save tags
        try:
            tags.save(temp_path)
            print(f"\n✅ Successfully saved tags to temporary file")
        except Exception as e:
            print(f"\n❌ Failed to save tags: {str(e)}")
            
    except Exception as e:
        print(f"❌ Error testing EasyID3: {str(e)}")
    
    finally:
        # Clean up
        if os.path.exists(temp_path):
            os.unlink(temp_path)
            print(f"🧹 Cleaned up temporary file")

if __name__ == "__main__":
    test_easyid3_keys()
