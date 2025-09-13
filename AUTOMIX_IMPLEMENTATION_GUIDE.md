# Auto Mix Feature Implementation Guide

## Overview

The Auto Mix feature provides AI-powered track selection for seamless DJ mixing based on harmonic compatibility (Camelot notation), BPM closeness, and energy levels using the smollm2-135M AI model.

## Architecture

### Frontend Components
- **AudioPlayer.tsx**: Enhanced with Auto Mix toggle button and controls
- **App.tsx**: Integrated Auto Mix state management and API calls
- **CSS**: Professional styling for Auto Mix controls

### Backend Components
- **automix_ai.py**: Core AI model integration and track recommendation logic
- **automix_api.py**: REST API endpoints for Auto Mix functionality
- **api.py**: Integrated Auto Mix endpoints into main Flask application

### Dependencies
- **llm**: Python library for AI model integration
- **smollm2-135M**: Lightweight AI model for track recommendation

## Installation

### 1. Install Dependencies

```bash
# Install Python dependencies
pip install -r requirements.txt

# The llm library will automatically download smollm2-135M on first use
```

### 2. Start the Backend Server

```bash
python api.py
```

The server will start on `http://127.0.0.1:5002` with Auto Mix endpoints available.

### 3. Start the Frontend

```bash
npm start
```

## API Endpoints

### 1. Get Next Track Recommendation
```
POST /automix/next-track
```

**Request Body:**
```json
{
  "current_song": {
    "id": "song_id",
    "filename": "song.mp3",
    "camelot_key": "8B",
    "bpm": 128.0,
    "energy_level": 7,
    "duration": 240.0,
    "artist": "Artist Name",
    "title": "Song Title"
  },
  "playlist": [
    // Array of song objects with same structure
  ],
  "transition_type": "smooth_transition" // Optional
}
```

**Response:**
```json
{
  "status": "success",
  "recommended_track": {
    "id": "recommended_song_id",
    "filename": "recommended.mp3",
    "camelot_key": "8B",
    "bpm": 130.0,
    "energy_level": 8,
    "duration": 200.0,
    "artist": "Recommended Artist",
    "title": "Recommended Title"
  },
  "transition_type": "smooth_transition",
  "ai_status": {
    "is_initialized": true,
    "model_name": "smollm2-135M",
    "ai_library_available": true
  }
}
```

### 2. Analyze Playlist
```
POST /automix/analyze-playlist
```

**Request Body:**
```json
{
  "playlist": [
    // Array of song objects
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "playlist_analysis": {
    "total_tracks": 10,
    "key_diversity": 3,
    "unique_keys": ["8B", "9B", "7B"],
    "bpm_range": {
      "min": 120.0,
      "max": 140.0,
      "average": 130.0
    },
    "energy_range": {
      "min": 5,
      "max": 9,
      "average": 7.2
    },
    "compatibility_score": 85,
    "recommendations": [
      "Analyze 2 tracks for key detection",
      "Consider grouping tracks by BPM range for smoother transitions"
    ]
  },
  "track_count": 10
}
```

### 3. Get AI Status
```
GET /automix/ai-status
```

**Response:**
```json
{
  "status": "success",
  "ai_status": {
    "is_initialized": true,
    "model_name": "smollm2-135M",
    "ai_library_available": true,
    "initialization_error": null,
    "available_transitions": [
      "smooth_transition",
      "energy_raise",
      "peak_buildup",
      "cooldown",
      "random"
    ]
  }
}
```

### 4. Get Transition Types
```
GET /automix/transition-types
```

**Response:**
```json
{
  "status": "success",
  "transition_types": [
    {
      "type": "smooth_transition",
      "name": "Smooth Transition",
      "description": "Harmonic key match with minimal BPM and energy changes",
      "key_difference": 0,
      "bpm_range": [-3, 3],
      "energy_change": [-1, 1]
    }
    // ... other transition types
  ]
}
```

## Transition Types

### 1. Smooth Transition
- **Key Change**: 0 Camelot steps (same key)
- **BPM Range**: ±3 BPM
- **Energy Change**: ±1 level
- **Use Case**: Seamless mixing between similar tracks

### 2. Energy Raise
- **Key Change**: +2 Camelot steps
- **BPM Range**: ±5 BPM
- **Energy Change**: +1 to +3 levels
- **Use Case**: Building energy gradually

### 3. Peak Buildup
- **Key Change**: 0 Camelot steps (same key)
- **BPM Range**: +3 to +7 BPM
- **Energy Change**: +2 to +4 levels
- **Use Case**: Intense buildup maintaining harmonic stability

### 4. Cooldown
- **Key Change**: 0 Camelot steps (same key)
- **BPM Range**: -5 to +3 BPM
- **Energy Change**: -2 to 0 levels
- **Use Case**: Gentle cooldown with maintained harmonic flow

### 5. Random
- **Key Change**: Variable
- **BPM Range**: Variable
- **Energy Change**: Variable
- **Use Case**: Surprise factor and variety

## Usage

### 1. Enable Auto Mix
1. Click the "Auto Mix" toggle button in the audio player
2. The system will analyze the current playlist for compatibility
3. Auto Mix will be enabled and ready to recommend tracks

### 2. Get Next Track
1. When Auto Mix is enabled, click the "Next" button
2. The AI will analyze the current track and recommend the next one
3. The recommended track will automatically start playing

### 3. Disable Auto Mix
1. Click the "Auto Mix" toggle button again
2. The system will return to manual track selection

## Testing

### Unit Tests
```bash
# Run unit tests
python run_automix_tests.py

# Run with verbose output
python run_automix_tests.py --verbose

# Run specific test class
python run_automix_tests.py --specific TestAutoMixAI
```

### End-to-End Tests
```bash
# Make sure the API server is running first
python api.py

# In another terminal, run E2E tests
python test_automix_e2e.py
```

### Test Coverage
The test suite covers:
- ✅ Track analysis and conversion
- ✅ Transition scenario definitions
- ✅ AI model integration (with fallback)
- ✅ API endpoint functionality
- ✅ Playlist analysis
- ✅ Error handling
- ✅ Performance benchmarks
- ✅ Concurrent request handling
- ✅ Large playlist processing

## Performance Optimization

### 1. Model Caching
- The AI model is loaded once and cached for subsequent requests
- First request may take longer due to model initialization

### 2. Fallback Strategy
- If AI model fails, the system falls back to rule-based selection
- Ensures the feature works even without AI model

### 3. Request Optimization
- Playlist analysis is cached to avoid repeated processing
- Large playlists are limited to first 20 tracks for AI processing

### 4. Error Handling
- Comprehensive error handling with user-friendly messages
- Graceful degradation when services are unavailable

## Troubleshooting

### Common Issues

#### 1. AI Model Not Loading
**Symptoms**: Auto Mix shows "AI not available" status
**Solutions**:
- Check if `llm` library is installed: `pip install llm`
- Verify internet connection for model download
- Check server logs for initialization errors

#### 2. No Track Recommendations
**Symptoms**: Auto Mix returns "No suitable track found"
**Solutions**:
- Ensure playlist has tracks with analysis data (key, BPM, energy)
- Try different transition types
- Check if tracks have compatible musical characteristics

#### 3. Slow Performance
**Symptoms**: Long delays when getting recommendations
**Solutions**:
- Check server resources (CPU, memory)
- Reduce playlist size
- Ensure AI model is properly cached

#### 4. API Connection Errors
**Symptoms**: "Failed to get next track" errors
**Solutions**:
- Verify API server is running on correct port
- Check API signing key configuration
- Ensure network connectivity

### Debug Mode

Enable debug logging by setting environment variable:
```bash
export AUTOMIX_DEBUG=1
python api.py
```

## Configuration

### Environment Variables
- `AUTOMIX_DEBUG`: Enable debug logging (0/1)
- `AUTOMIX_MODEL`: AI model name (default: smollm2-135M)
- `AUTOMIX_CACHE_SIZE`: Model cache size (default: 100)

### API Configuration
- **Port**: 5002 (configurable in api.py)
- **Signing Key**: "devkey" (configurable in api.py)
- **Timeout**: 30 seconds for AI requests

## Future Enhancements

### Planned Features
1. **Custom Transition Types**: User-defined transition scenarios
2. **Learning Mode**: AI learns from user preferences
3. **Batch Processing**: Process multiple recommendations at once
4. **Advanced Analytics**: Detailed mixing statistics and insights
5. **Real-time Collaboration**: Multiple users sharing Auto Mix sessions

### Performance Improvements
1. **Model Optimization**: Quantized models for faster inference
2. **Caching Layer**: Redis-based caching for better performance
3. **Async Processing**: Non-blocking AI model calls
4. **Load Balancing**: Multiple AI model instances

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review server logs for error details
3. Run the test suite to verify functionality
4. Check API endpoint responses for specific errors

## License

This Auto Mix feature is part of the Mixed In Key application and follows the same licensing terms.
