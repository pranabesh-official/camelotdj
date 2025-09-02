#!/usr/bin/env python3
"""
Demonstration script showing the exact ID3 tag format being applied.
This script shows examples of how files will be renamed and tagged.
"""

def demonstrate_id3_format():
    """Demonstrate the ID3 tag format being applied."""
    
    print("🎵 Mixed In Key - ID3 Tag Format Demonstration")
    print("=" * 50)
    
    # Example song data
    example_songs = [
        {
            "original_title": "Ed Sheeran - Shape of You",
            "bpm": 128.0,
            "camelot_key": "8A",
            "energy_level": 7,
            "artist": "Ed Sheeran",
            "album": "÷ (Divide)",
            "genre": "Pop"
        },
        {
            "original_title": "The Weeknd - Blinding Lights",
            "bpm": 171.0,
            "camelot_key": "11A",
            "energy_level": 9,
            "artist": "The Weeknd",
            "album": "After Hours",
            "genre": "R&B"
        },
        {
            "original_title": "Dua Lipa - Levitating",
            "bpm": 92.0,
            "camelot_key": "4A",
            "energy_level": 6,
            "artist": "Dua Lipa",
            "album": "Future Nostalgia",
            "genre": "Pop"
        },
        {
            "original_title": "Post Malone - Circles",
            "bpm": 120.0,
            "camelot_key": "10B",
            "energy_level": 5,
            "artist": "Post Malone",
            "album": "Hollywood's Bleeding",
            "genre": "Hip-Hop"
        }
    ]
    
    print("\n📁 FILE RENAMING EXAMPLES:")
    print("-" * 30)
    
    for song in example_songs:
        # Extract song name (remove artist prefix)
        if ' - ' in song["original_title"]:
            song_name = song["original_title"].split(' - ', 1)[1]
        else:
            song_name = song["original_title"]
        
        # Clean song name for filename
        clean_song_name = "".join(c for c in song_name if c.isalnum() or c in (' ', '-', '_'))
        clean_song_name = clean_song_name.replace('  ', ' ').strip()
        
        # Create new filename
        new_filename = f"{int(song['bpm'])}BPM_{song['camelot_key']}_{clean_song_name}.mp3"
        
        print(f"Original: {song['original_title']}.mp3")
        print(f"New:     {new_filename}")
        print()
    
    print("\n📝 ID3 TAG EXAMPLES:")
    print("-" * 30)
    
    for song in example_songs:
        # Extract song name
        if ' - ' in song["original_title"]:
            song_name = song["original_title"].split(' - ', 1)[1]
        else:
            song_name = song["original_title"]
        
        # Create new title
        new_title = f"{int(song['bpm'])}BPM_{song['camelot_key']}_{song_name}"
        
        # Create comment
        comment = f"{song['camelot_key']} - Energy {song['energy_level']}"
        
        # Calculate track number from camelot key
        track_num = int(''.join(filter(str.isdigit, song['camelot_key'])))
        
        print(f"🎵 {song['original_title']}")
        print(f"   Title:     {new_title}")
        print(f"   Comment:   {comment}")
        print(f"   Track #:   {track_num}")
        print(f"   Artist:    {song['artist']} (preserved)")
        print(f"   Album:     {song['album']} (preserved)")
        print(f"   Genre:     {song['genre']} (preserved)")
        print()
    
    print("\n🔧 TECHNICAL DETAILS:")
    print("-" * 30)
    print("• Title format: {BPM}BPM_{CamelotKey}_{SongName}")
    print("• Comment format: {CamelotKey} - Energy {Level}")
    print("• Track number: Extracted from Camelot key (1-12)")
    print("• Original metadata: Artist, Album, Genre preserved")
    print("• File renaming: Automatic after ID3 tag updates")
    print("• Database sync: File paths updated automatically")
    
    print("\n📊 CAMELOT WHEEL TRACK NUMBERS:")
    print("-" * 30)
    camelot_keys = ["1A", "2A", "3A", "4A", "5A", "6A", "7A", "8A", "9A", "10A", "11A", "12A"]
    for key in camelot_keys:
        track_num = int(''.join(filter(str.isdigit, key)))
        print(f"  {key} → Track {track_num}")
    
    print("\n🎯 WHAT HAPPENS AUTOMATICALLY:")
    print("-" * 30)
    print("1. Song is analyzed for key, BPM, and energy")
    print("2. ID3 tags are updated with new format")
    print("3. File is renamed to new format")
    print("4. Database is updated with new file path")
    print("5. All operations happen in the Python backend")
    
    print("\n✨ READY TO USE!")
    print("The system will automatically apply this format to every analyzed song.")

if __name__ == "__main__":
    demonstrate_id3_format()
