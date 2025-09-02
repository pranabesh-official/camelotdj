# Mixed In Key - ID3 Tag Update System

This document describes the new ID3 tag update functionality that automatically formats metadata according to specific requirements and renames files with key and BPM information.

## Features

### 🎵 ID3 Tag Format
- **Title**: `100BPM_11A_songname` (BPM + Camelot Key + Song Name)
- **Comment**: `8A - Energy 8` (Camelot Key + Energy Level)
- **Track Number**: Automatically set based on harmonic key position (1-12)
- **Preserved Metadata**: Original artist, album, and genre are maintained
- **Additional Fields**: BPM, initial key, analysis timestamp

### 📁 File Renaming
- **Format**: `100BPM_11A_songname.mp3`
- **Automatic**: Happens after analysis and ID3 tag updates
- **Database Sync**: File paths are automatically updated in the database

### 🔄 Batch Operations
- Update single song tags
- Update multiple songs at once
- Update entire library in one operation

## API Endpoints

### 1. Update Single Song Tags
```http
POST /library/update-tags
```

**Request Body:**
```json
{
  "song_id": "123"
}
```
or
```json
{
  "file_path": "/path/to/song.mp3"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "ID3 tags updated successfully",
  "tag_result": {
    "updated": true,
    "metadata_written": {
      "title": "128BPM_8A_Shape of You",
      "comment": "8A - Energy 7",
      "track_number": "8"
    }
  },
  "rename_result": {
    "renamed": true,
    "new_filename": "128BPM_8A_Shape of You.mp3"
  }
}
```

### 2. Batch Update Tags
```http
POST /library/batch-update-tags
```

**Request Body:**
```json
{
  "update_all": true
}
```
or
```json
{
  "song_ids": ["123", "456", "789"]
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Batch update completed: 15 successful, 2 failed",
  "total_processed": 17,
  "successful": 15,
  "failed": 2,
  "results": [
    {
      "song_id": "123",
      "filename": "128BPM_8A_Shape of You.mp3",
      "status": "success"
    }
  ]
}
```

## Implementation Details

### ID3 Tag Writing (`music_analyzer.py`)
The `write_id3_tags` method in `MusicAnalyzer` class:

1. **Preserves Original Metadata**: Artist, album, genre from original file
2. **Creates New Title**: Combines BPM, Camelot key, and song name
3. **Sets Comment**: Format: `{CamelotKey} - Energy {Level}`
4. **Calculates Track Number**: Based on Camelot wheel position (1-12)
5. **Adds Analysis Info**: Timestamp and duration in grouping field

### File Renaming (`api.py`)
The `rename_file_with_metadata` function:

1. **Extracts Song Name**: Removes artist prefix if present
2. **Creates New Filename**: `{BPM}BPM_{CamelotKey}_{SongName}.mp3`
3. **Handles Conflicts**: Adds timestamp if filename already exists
4. **Updates Database**: Syncs new file path and filename

### Database Integration
- **Automatic Updates**: File paths updated after renaming
- **Metadata Sync**: Analysis results stored with file information
- **Error Handling**: Graceful fallback if database updates fail

## Usage Examples

### Python Script Example
```python
import requests

# Update single song
response = requests.post(
    "http://127.0.0.1:5000/library/update-tags",
    json={"song_id": "123"},
    headers={"X-Signing-Key": "your_key"}
)

# Update entire library
response = requests.post(
    "http://127.0.0.1:5000/library/batch-update-tags",
    json={"update_all": True},
    headers={"X-Signing-Key": "your_key"}
)
```

### Frontend Integration
```javascript
// Update single song
const updateTags = async (songId) => {
  const response = await fetch('/library/update-tags', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signing-Key': signingKey
    },
    body: JSON.stringify({ song_id: songId })
  });
  
  const result = await response.json();
  if (result.status === 'success') {
    console.log('Tags updated:', result.tag_result);
    console.log('File renamed:', result.rename_result);
  }
};

// Batch update all songs
const updateAllTags = async () => {
  const response = await fetch('/library/batch-update-tags', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signing-Key': signingKey
    },
    body: JSON.stringify({ update_all: true })
  });
  
  const result = await response.json();
  console.log(`Updated ${result.successful} songs, ${result.failed} failed`);
};
```

## File Naming Examples

### Before (Original)
- `Ed Sheeran - Shape of You.mp3`
- `The Weeknd - Blinding Lights.mp3`
- `Dua Lipa - Levitating.mp3`

### After (New Format)
- `128BPM_8A_Shape of You.mp3`
- `171BPM_11A_Blinding Lights.mp3`
- `92BPM_4A_Levitating.mp3`

## ID3 Tag Examples

### Title Field
- `128BPM_8A_Shape of You`
- `171BPM_11A_Blinding Lights`
- `92BPM_4A_Levitating`

### Comment Field
- `8A - Energy 7`
- `11A - Energy 9`
- `4A - Energy 6`

### Track Number
- `8` (for 8A key)
- `11` (for 11A key)
- `4` (for 4A key)

## Error Handling

### Common Issues
1. **File Not Found**: Check if file path exists and is accessible
2. **Permission Denied**: Ensure write permissions for file and directory
3. **Database Errors**: Check database connection and table structure
4. **Analysis Failures**: Verify audio file format and integrity

### Fallback Behavior
- **ID3 Write Fails**: Returns error but doesn't crash
- **Rename Fails**: Continues with original filename
- **Database Update Fails**: Logs warning but continues processing

## Testing

Use the provided test script:
```bash
cd python
python test_id3_update.py
```

Make sure to:
1. Update `SIGNING_KEY` in the test script
2. Have the API server running
3. Have some songs in your library

## Dependencies

- **mutagen**: ID3 tag manipulation
- **librosa**: Audio analysis
- **essentia**: Advanced audio features (optional)
- **Flask**: Web framework
- **SQLite**: Database storage

## Security

- **Signing Key Required**: All endpoints require valid signing key
- **File Path Validation**: Prevents directory traversal attacks
- **Error Sanitization**: Sensitive information not exposed in errors

## Performance

- **Batch Processing**: Efficient for large libraries
- **Database Optimization**: Minimal database queries
- **File I/O**: Optimized for sequential processing
- **Memory Management**: Processes files one at a time

## Future Enhancements

- **Progress Tracking**: Real-time updates for batch operations
- **Custom Formats**: User-configurable naming patterns
- **Backup System**: Automatic backup before modifications
- **Undo Functionality**: Revert changes if needed
- **Scheduled Updates**: Automatic updates at specified intervals
