# Mixed In Key - Music Analyzer

A powerful desktop application for analyzing music files and providing harmonic mixing capabilities for DJs and music enthusiasts. Built with Electron, React, and Python for comprehensive music analysis.

## ✨ Features

### 🎵 Music Analysis
- **Key Detection**: Identifies musical key using both Essentia and Librosa algorithms
- **Camelot Wheel Integration**: Provides Camelot notation (e.g., 8A, 5B) for easy harmonic mixing
- **BPM Detection**: Accurate tempo analysis for beatmatching
- **Energy Level Rating**: 1-10 scale energy analysis for perfect set progression
- **File Format Support**: MP3, WAV, FLAC, AAC, OGG, M4A

### 🎚️ Harmonic Mixing Tools
- **Interactive Camelot Wheel**: Visual representation of harmonic relationships
- **Compatible Key Suggestions**: Find songs that mix harmonically
- **Energy Level Matching**: Sort and filter by energy for smooth transitions
- **Advanced Filtering**: Search by key, BPM, energy, or filename

### 💻 User Interface
- **Modern Design**: Clean, intuitive interface with drag-and-drop file upload
- **Real-time Analysis**: Fast processing with visual feedback
- **Library Management**: Organize and manage your music collection
- **Detailed Results**: Comprehensive analysis information for each track

## 🚀 Quick Start

### Prerequisites
- **Python 3.7+** with pip
- **Node.js 14+** with npm
- **macOS/Windows/Linux** (tested on macOS)

### Installation

1. **Clone and setup**
   ```bash
   git clone <repository-url>
   cd mixed_in_key
   ```

2. **Install dependencies**
   ```bash
   # Python dependencies
   pip3 install -r requirements.txt
   
   # Node.js dependencies
   npm install
   ```

3. **Run the application**
   ```bash
   npm run start
   ```

## 🎯 How to Use

1. **Upload Music**: Drag and drop audio files or use the \"Add Songs\" tab
2. **View Analysis**: Check the results in your Music Library
3. **Find Compatible Songs**: Use the Camelot Wheel to find harmonic matches
4. **Sort and Filter**: Organize by key, BPM, or energy level

## 🔧 Technical Details

### Architecture
- **Frontend**: React + TypeScript with modern UI components
- **Backend**: Python Flask with GraphQL and REST APIs
- **Desktop**: Electron for cross-platform desktop application
- **Analysis**: Librosa and Essentia for music analysis

### Music Analysis Engine
- **Key Detection**: Combined Essentia KeyExtractor and Librosa chroma analysis
- **BPM Analysis**: Essentia RhythmExtractor2013 with Librosa verification
- **Energy Calculation**: Multi-factor analysis including RMS, spectral features
- **Camelot Mapping**: Automatic conversion to harmonic mixing notation

### API Endpoints
- `POST /upload-analyze`: Upload and analyze music files
- `POST /analyze-file`: Analyze existing files by path
- `GET /compatible-keys`: Get harmonically compatible keys

## 🎛️ Harmonic Mixing Guide

The Camelot Wheel system simplifies harmonic mixing:

- **Perfect Match**: Same key (e.g., 8A → 8A)
- **Energy Up**: +1 key (e.g., 8A → 9A)
- **Energy Down**: -1 key (e.g., 8A → 7A)
- **Mood Change**: Same number, different letter (e.g., 8A → 8B)

### Energy Levels (1-10)
1-3: **Chill/Ambient** - Perfect for warm-ups
4-6: **Moderate** - Good for building energy
7-8: **High Energy** - Peak time tracks
9-10: **Maximum** - Festival anthems and drops

## 🛠️ Development

### Project Structure
```
mixed_in_key/
├── src/                 # React frontend
│   ├── components/      # UI components
│   ├── App.tsx         # Main application
│   └── App.css         # Styling
├── python/             # Python backend
│   ├── api.py          # Flask server
│   └── music_analyzer.py # Analysis engine
├── main/               # Electron main process
└── package.json        # Configuration
```

### Testing Backend Separately
```bash
cd python
python3 api.py --apiport 5000 --signingkey devkey
```

Visit `http://127.0.0.1:5000/graphiql/` for GraphQL interface.

## 🐛 Troubleshooting

### Common Issues

1. **OpenSSL Error (Node.js 17+)**
   ```bash
   export NODE_OPTIONS=\"--openssl-legacy-provider\"
   npm run start
   ```

2. **Python Dependencies Missing**
   ```bash
   pip3 install librosa essentia mutagen flask flask-cors flask-graphql
   ```

3. **Port 5000 in Use**
   - The backend will automatically find an available port
   - Or manually specify: `python3 api.py --apiport 5001`

4. **Audio File Not Supported**
   - Supported: MP3, WAV, FLAC, AAC, OGG, M4A
   - Try converting with audio conversion software

## 📦 Building for Distribution

```bash
npm run build
```

This creates:
- Packaged Python backend (PyInstaller)
- Built React frontend
- Platform-specific installer in `dist/`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add your improvements
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE.txt for details

## 🙏 Acknowledgments

- Built on [electron-python](https://github.com/yoDon/electron-python) boilerplate
- Inspired by [Mixed In Key](https://mixedinkey.com/) software
- Music analysis by [Librosa](https://librosa.org/) and [Essentia](https://essentia.upf.edu/)
- Harmonic mixing concepts from the Camelot Wheel system

## 📊 Example Output

```json
{
  \"filename\": \"track.mp3\",
  \"key\": \"A\",
  \"scale\": \"minor\", 
  \"key_name\": \"A minor\",
  \"camelot_key\": \"8A\",
  \"bpm\": 128,
  \"energy_level\": 7,
  \"duration\": 240.5,
  \"status\": \"success\"
}
```

---

**Ready to mix harmonically? Upload your first track and discover the magic of musical key analysis!** 🎶