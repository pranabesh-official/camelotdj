# Mixed In Key - Music Analysis Application

A professional desktop music analysis application with harmonic mixing capabilities.

## Quick Start

### 1. Start the Python Backend
```bash
# Make the startup script executable (first time only)
chmod +x start_backend.sh

# Start the backend (automatically restarts if it stops)
./start_backend.sh
```

**Alternative manual start:**
```bash
cd python
python3 api.py --apiport 5002 --signingkey devkey
```

### 2. Start the React Frontend
```bash
npm start
```

The application will be available at: http://localhost:3000

## Troubleshooting

### "Cannot connect to backend server" Error

This error occurs when the Python backend is not running or has stopped. To fix:

1. **Check if backend is running:**
   ```bash
   curl -X POST "http://127.0.0.1:5002/graphql/" -H "Content-Type: application/json" -d '{"query": "{ awake }"}'
   ```
   
2. **If not running, start it:**
   ```bash
   ./start_backend.sh
   ```

3. **If the error persists:**
   - Check that Python 3 is installed
   - Ensure all dependencies are installed: `pip3 install -r requirements.txt`
   - Check that port 5002 is not used by another application

### Backend Keeps Stopping

The `start_backend.sh` script automatically restarts the backend if it stops unexpectedly. If this continues:

1. Check Python console output for error messages
2. Ensure sufficient system resources (RAM/CPU)
3. Check file permissions on the python directory

## Features

- **Real Music Analysis**: Key detection, BPM analysis, energy calculation
- **Harmonic Mixing**: Camelot Wheel with compatible key highlighting  
- **ID3 Tag Writing**: Automatically saves analysis results to music files
- **Professional UI**: Dark mode interface matching Mixed In Key design
- **Playlist Management**: Create and manage playlists with analyzed tracks
- **Audio Playback**: Built-in player with waveform visualization

## File Formats Supported

- MP3, WAV, FLAC, AAC, OGG, M4A

## Dependencies

### Python Backend
- Flask, librosa, essentia-tensorflow, mutagen
- See `requirements.txt` for complete list

### Frontend  
- React, TypeScript, Electron
- See `package.json` for complete list