# Mixed In Key - Professional Music Analysis Desktop Application

A professional desktop music analysis application built with Electron + Python + React, following the [electron-python boilerplate](n) pattern.

## 🚀 Quick Start

### One-Click Launch (Electron Desktop App)c
```bash
npm start
```
This automatically:
- Starts React frontend on port 3000
- Spawns Python backend on port 5002 via Electron
- Opens desktop application window
- Handles all IPC communication between components

### Alternative: Web Development Mode
```bash
npm run dev
```
This starts both services independently for web browser testing.

## ✨ Features

### 🎵 Real Music Analysis
- **Key Detection**: Accurate musical key analysis using Librosa + Essentia
- **BPM Analysis**: Precise tempo detection for DJ mixing
- **Energy Calculation**: Track energy levels for set planning
- **Cue Point Detection**: Automatic intro/outro identification

### 🎡 Camelot Wheel Harmonic Mixing
- **Visual Key Mapping**: Interactive Camelot Wheel with 24 keys
- **Harmonic Highlighting**: 
  - 🔥 **Selected track key** - Bright orange with glow
  - 💙 **Compatible keys** - Bright blue highlighting
  - ⚪ **Dimmed non-compatible** - Reduced opacity
- **Smart Compatibility**: Adjacent keys (±1) + relative major/minor
- **Click to Select**: Click any key to select songs in that key

### 🎛️ Professional UI
- **Dark Mode Design**: Professional Mixed In Key aesthetic
- **Real-time Analysis**: No demo tracks - analyze your actual music
- **Drag & Drop Upload**: Easy file and folder upload
- **Playlist Management**: Create and organize your music library
- **Audio Playback**: Built-in player with waveform visualization

### 🏷️ ID3 Tag Integration
- **Automatic Writing**: Saves analysis results to your music files
- **Key & BPM Tags**: Stores Camelot key, musical key, and BPM
- **Cue Points**: Embeds intro/outro points for DJ software
- **Compatible Formats**: MP3, WAV, FLAC, AAC, OGG, M4A

## 🏗️ Architecture

Following the proven [electron-python boilerplate](https://github.com/yoDon/electron-python):

- **Electron Main Process**: Spawns Python backend, manages IPC
- **React Frontend**: Professional UI with TypeScript
- **Python Backend**: Flask server with music analysis engines
- **Automatic Process Management**: Python exits gracefully with Electron

## 🛠️ Development

### Requirements
- Node.js & npm
- Python 3 with pip
- All dependencies auto-installed via npm

### Project Structure
```
mixed_in_key/
├── main/                   # Electron main process
│   ├── index.ts           # Main window creation
│   └── with-python.ts     # Python process management
├── src/                   # React frontend
│   ├── components/        # UI components
│   └── App.tsx           # Main application
├── python/               # Python backend
│   ├── api.py           # Flask server + GraphQL
│   ├── music_analyzer.py # Analysis engine
│   └── requirements.txt  # Python dependencies
└── package.json         # Node.js dependencies + scripts
```

### Available Scripts
- `npm start` - Launch full Electron desktop app
- `npm run dev` - Development mode (web browser)
- `npm run build` - Build for production distribution

## 🎯 Usage

1. **Launch Application**: `npm start`
2. **Upload Music**: Drag files to Playlist Manager or click "Add Music Files"
3. **View Analysis**: See key, BPM, energy in track table
4. **Select Track**: Click any song to see its key highlighted on Camelot Wheel
5. **Find Compatible**: Blue highlighted keys show harmonic mixing options
6. **Create Playlists**: Organize compatible tracks for seamless mixing

## 🎚️ Harmonic Mixing Guide

The Camelot Wheel shows compatible keys for smooth DJ transitions:
- **Same Key**: Perfect match (e.g., 8A → 8A)
- **Adjacent Keys**: ±1 position (e.g., 8A → 7A or 9A)
- **Relative Major/Minor**: Same number, opposite letter (e.g., 8A → 8B)

## 🔧 Troubleshooting

If you see connection errors:
1. Ensure Python 3 is installed
2. Check that port 5002 is available
3. Restart with `npm start`

The application automatically handles Python backend startup and shutdown.