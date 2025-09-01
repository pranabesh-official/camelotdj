# CamelotDJ - Open Source Music Analyzer

**An open-source desktop application for analyzing music files and providing harmonic mixing capabilities for DJs and music enthusiasts, inspired by [Mixed In Key](https://mixedinkey.com/).**

This project combines the power of Python music analysis with a modern React frontend, all wrapped in an Electron desktop application. It provides professional-grade music analysis tools that are typically expensive, making them accessible to everyone in the DJ and music production community.

## 🎯 What is CamelotDJ?

CamelotDJ is a desktop application that analyzes your music files to provide:
- **Musical Key Detection** (with Camelot Wheel notation)
- **BPM Analysis** for beatmatching
- **Energy Level Ratings** for perfect set progression
- **Harmonic Mixing Suggestions** for seamless transitions

## 🏗️ Architecture

This application uses a hybrid architecture:
- **Frontend**: React + TypeScript with modern UI components
- **Backend**: Python Flask with music analysis engines (Librosa, Essentia)
- **Desktop**: Electron for cross-platform compatibility
- **Database**: Firebase Firestore for cloud storage and authentication

## 🚀 Quick Start

### Prerequisites
- **Python 3.7+** with pip
- **Node.js 14+** with npm
- **Firebase project** (for authentication and data storage)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/pranabesh-official/camelotdj.git
   cd camelotdj
   ```

2. **Setup environment**
   ```bash
   # Copy environment template
   cp .env.example .env
   
   # Edit .env with your Firebase configuration
   # Get config from: https://console.firebase.google.com/
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

## 🔐 Firebase Setup

This application requires Firebase for authentication and data storage:

1. **Create a Firebase project** at [Firebase Console](https://console.firebase.google.com/)
2. **Enable Authentication** with Google sign-in
3. **Create a Firestore database**
4. **Copy your config** to the `.env` file

**⚠️ Important**: Never commit your `.env` file. It's already excluded in `.gitignore`.

## 🎵 Music Analysis Features

### Key Detection
- Uses both Essentia KeyExtractor and Librosa chroma analysis
- Provides both traditional notation (A minor) and Camelot notation (8A)
- Supports all major and minor keys

### BPM Analysis
- Essentia RhythmExtractor2013 for accurate tempo detection
- Librosa verification for consistency
- Perfect for beatmatching and set planning

### Energy Level Rating
- 1-10 scale energy analysis
- Based on multiple factors: RMS, spectral features, dynamics
- Helps create perfect energy progression in your sets

## 🎛️ Harmonic Mixing

The application includes a visual Camelot Wheel that shows:
- **Perfect matches**: Same key (8A → 8A)
- **Energy progression**: +1 key (8A → 9A)
- **Mood changes**: Same number, different letter (8A → 8B)

## 🛠️ Development

### Project Structure
```
camelotdj/
├── src/                 # React frontend
│   ├── components/      # UI components
│   ├── services/        # Firebase and API services
│   └── App.tsx         # Main application
├── python/             # Python backend
│   ├── api.py          # Flask server
│   └── music_analyzer.py # Analysis engine
├── main/               # Electron main process
└── package.json        # Configuration
```

### Testing the Python Backend
```bash
cd python
python3 api.py --apiport 5000 --signingkey devkey
```

Visit `http://127.0.0.1:5000/graphiql/` for the GraphQL interface.

### Building for Distribution
```bash
npm run build
```

This creates a packaged application with:
- Python backend compiled with PyInstaller
- React frontend built and optimized
- Platform-specific installer in `dist/`

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

4. **Port 5000 in Use**
   - Backend will automatically find an available port
   - Or manually specify: `python3 api.py --apiport 5001`

## 🤝 Contributing

We welcome contributions! This is an open-source project inspired by Mixed In Key, and we'd love your help to make it even better.

1. Fork the repository
2. Create a feature branch
3. Add your improvements
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE.txt for details

## 🙏 Acknowledgments

- **Inspired by**: [Mixed In Key](https://mixedinkey.com/) - The industry standard for harmonic mixing software
- **Built on**: [electron-python](https://github.com/yoDon/electron-python) boilerplate
- **Music analysis**: [Librosa](https://librosa.org/) and [Essentia](https://essentia.upf.edu/)

## 🔗 Related Projects

- [Mixed In Key](https://mixedinkey.com/) - Commercial software that inspired this project
- [Camelot Wheel](https://en.wikipedia.org/wiki/Circle_of_fifths) - Harmonic mixing system
- [Essentia](https://essentia.upf.edu/) - Music analysis library
- [Librosa](https://librosa.org/) - Audio analysis library

---

**Ready to mix harmonically? Upload your first track and discover the magic of musical key analysis!** 🎶

*This project is not affiliated with Mixed In Key LLC. It's an open-source alternative inspired by their excellent software.*

For detailed documentation, see [README_MIXED_IN_KEY.md](README_MIXED_IN_KEY.md).
