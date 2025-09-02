# CamelotDJ - Open Source Music Analyzer

**An open-source desktop application for analyzing music files and providing harmonic mixing capabilities for DJs and music enthusiasts, inspired by [Mixed In Key](https://mixedinkey.com/).**

Built with Electron, React, TypeScript, and Python for comprehensive music analysis. This project aims to provide the powerful music analysis capabilities of Mixed In Key as a free, open-source alternative.

## 🎯 Project Mission

CamelotDJ is designed to democratize access to professional-grade music analysis tools. While [Mixed In Key](https://mixedinkey.com/) offers excellent commercial software, this open-source project provides similar functionality for the community, allowing DJs and producers to analyze their music without financial barriers.

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
   git clone https://github.com/pranabesh-official/camelotdj.git
   cd camelotdj
   ```

2. **Environment Setup**
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env with your Firebase configuration
   # Get Firebase config from: https://console.firebase.google.com/
   ```

3. **Install dependencies**
   ```bash
   # Python dependencies
   pip3 install -r requirements.txt
   
   # Node.js dependencies
   npm install
   ```

4. **Run the application**
   ```bash
   npm run start
   ```

## 🔐 Firebase Configuration

This application uses Firebase for authentication and data storage. You'll need to:

1. **Create a Firebase project** at [Firebase Console](https://console.firebase.google.com/)
2. **Enable Authentication** with Google sign-in
3. **Create a Firestore database**
4. **Copy your config** to the `.env` file

Your `.env` file should look like this:
```bash
REACT_APP_FIREBASE_API_KEY=your_actual_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
# ... other Firebase config values
```

**⚠️ Important**: Never commit your `.env` file to version control. It's already excluded in `.gitignore`.

## 🎯 How to Use

1. **Upload Music**: Drag and drop audio files or use the "Add Songs" tab
2. **View Analysis**: Check the results in your Music Library
3. **Find Compatible Songs**: Use the Camelot Wheel to find harmonic matches
4. **Sort and Filter**: Organize by key, BPM, or energy level

## 🔧 Technical Details

### Architecture
- **Frontend**: React + TypeScript with modern UI components
- **Backend**: Python Flask with GraphQL and REST APIs
- **Desktop**: Electron for cross-platform desktop application
- **Analysis**: Librosa and Essentia for music analysis
- **Database**: Firebase Firestore with offline persistence

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
camelotdj/
├── src/                 # React frontend
│   ├── components/      # UI components
│   ├── services/        # Firebase and API services
│   ├── App.tsx         # Main application
│   └── App.css         # Styling
├── python/             # Python backend
│   ├── api.py          # Flask server
│   └── music_analyzer.py # Analysis engine
├── main/               # Electron main process
├── .env.example        # Environment variables template
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
   export NODE_OPTIONS="--openssl-legacy-provider"
   npm run start
   ```

2. **Python Dependencies Missing**
   ```bash
   pip3 install librosa essentia mutagen flask flask-cors flask-graphql
   ```

3. **Firebase Configuration Error**
   - Ensure all environment variables are set in `.env`
   - Check Firebase project settings and permissions
   - Verify API keys are correct

4. **Port 5000 in Use**
   - The backend will automatically find an available port
   - Or manually specify: `python3 api.py --apiport 5001`

5. **Audio File Not Supported**
   - Supported: MP3, WAV, FLAC, AAC, OGG, M4A
   - Try converting with audio conversion software

## 📦 Building for Distribution

### Quick Build (Recommended)
```bash
# Use the automated build script
./build.sh
```

### Manual Build
```bash
npm run build
```

### Available Build Scripts
- **`./build.sh`** - Full macOS build with dependency checking
- **`./quick-build.sh`** - Fast macOS build (when dependencies are installed)
- **`./build-windows.sh`** - Windows build
- See `BUILD_SCRIPTS.md` for detailed usage instructions

This creates:
- Packaged Python backend (PyInstaller)
- Built React frontend
- Platform-specific installer in `dist/`

## 🤝 Contributing

We welcome contributions! This is an open-source project inspired by Mixed In Key, and we'd love your help to make it even better.

1. Fork the repository
2. Create a feature branch
3. Add your improvements
4. Test thoroughly
5. Submit a pull request

### Development Guidelines
- Follow TypeScript best practices
- Add tests for new features
- Update documentation as needed
- Ensure Firebase security rules are maintained

## 📄 License

MIT License - see LICENSE.txt for details

## 🙏 Acknowledgments

- **Inspired by**: [Mixed In Key](https://mixedinkey.com/) - The industry standard for harmonic mixing software
- **Built on**: [electron-python](https://github.com/yoDon/electron-python) boilerplate
- **Music analysis**: [Librosa](https://librosa.org/) and [Essentia](https://essentia.upf.edu/)
- **Harmonic mixing concepts**: From the Camelot Wheel system and DJ community

## 🔗 Related Projects

- [Mixed In Key](https://mixedinkey.com/) - Commercial software that inspired this project
- [Camelot Wheel](https://en.wikipedia.org/wiki/Circle_of_fifths) - Harmonic mixing system
- [Essentia](https://essentia.upf.edu/) - Music analysis library
- [Librosa](https://librosa.org/) - Audio analysis library

## 📊 Example Output

```json
{
  "filename": "track.mp3",
  "key": "A",
  "scale": "minor", 
  "key_name": "A minor",
  "camelot_key": "8A",
  "bpm": 128,
  "energy_level": 7,
  "duration": 240.5,
  "status": "success"
}
```

---

**Ready to mix harmonically? Upload your first track and discover the magic of musical key analysis!** 🎶

*This project is not affiliated with Mixed In Key LLC. It's an open-source alternative inspired by their excellent software.*