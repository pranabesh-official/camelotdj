# CamelotDJ - Music Analyzer

An open-source music analysis platform inspired by [Mixed In Key](https://mixedinkey.com/), designed to help DJs and music producers discover the key, BPM, and energy level of their tracks for harmonic mixing.

## 🎵 Features

- **Key Detection**: Automatically detect musical keys using advanced audio analysis
- **BPM Analysis**: Accurate BPM detection for beat matching
- **Energy Level Rating**: Unique energy level ratings to help create dynamic DJ sets
- **Harmonic Mixing**: Use the Camelot Wheel system for seamless track transitions
- **Cross-Platform**: Built with Electron for Windows, macOS, and Linux
- **Python Backend**: Powerful audio analysis engine built with Python
- **React Frontend**: Modern, responsive user interface
- **Firebase Integration**: Cloud-based user authentication and data storage
- **USB Export**: Export analyzed tracks to USB devices for DJ software

## 🎯 What is Harmonic Mixing?

Harmonic mixing is a technique used by professional DJs to create seamless transitions between tracks by matching their musical keys. When tracks are in compatible keys, they blend together naturally, creating a more professional and enjoyable listening experience.

CamelotDJ helps you:
- Identify the key of any track in your music library
- Find tracks that will mix harmonically together
- Create playlists that flow seamlessly from one track to the next
- Understand the energy progression of your sets

## 🏗️ Architecture

This application uses a hybrid architecture:
- **Frontend**: React + TypeScript with modern UI components
- **Backend**: Python Flask with music analysis engines (Librosa, Essentia)
- **Desktop**: Electron for cross-platform compatibility
- **Database**: Firebase Firestore for cloud storage and authentication

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- Python 3.8+ (Anaconda recommended)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/pranabesh-official/camelotdj.git
   cd camelotdj
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   npm rebuild
   ```

3. **Set up Python environment**
   ```bash
   # On Windows, use cmd instead of PowerShell
   conda env create -f environment.yml
   conda activate camelotdj
   ```

4. **Configure environment variables**
   ```bash
   cp env.example .env.local
   # Edit .env.local with your Firebase and Google OAuth credentials
   ```

5. **Start the development server**
   ```bash
   npm run start
   ```

### Building for Production

```bash
npm run build
```

This will create platform-specific installers in the `dist/` folder.

## 🔧 Configuration

### Firebase Setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication and Firestore
3. Copy your Firebase config to `.env.local`

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add your client ID and secret to `.env.local`

## 📁 Project Structure

```
camelotdj/
├── main/           # Electron main process
├── src/            # React frontend
├── python/         # Python backend (audio analysis)
├── docs/           # Documentation
├── build/          # Build outputs
└── dist/           # Distribution packages
```

## 🎧 How It Works

1. **Audio Analysis**: Python backend analyzes audio files using advanced signal processing
2. **Key Detection**: Identifies musical keys using the Camelot Wheel system
3. **BPM Analysis**: Detects tempo and beat patterns
4. **Energy Rating**: Assigns energy levels based on audio characteristics
5. **Harmonic Matching**: Suggests compatible tracks for mixing
6. **Export**: Generate playlists compatible with major DJ software

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
   - Ensure all environment variables are set in `.env.local`
   - Check Firebase project settings and permissions

4. **Port 5000 in Use**
   - Backend will automatically find an available port
   - Or manually specify: `python3 api.py --apiport 5001`

## 🌟 Why Open Source?

This project is inspired by the amazing work of Mixed In Key, but built as an open-source alternative. We believe that powerful music analysis tools should be accessible to everyone in the music community.

## 🤝 Contributing

We welcome contributions! This is an open-source project inspired by Mixed In Key, and we'd love your help to make it even better.

1. Fork the repository
2. Create a feature branch
3. Add your improvements
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

## 🙏 Acknowledgments

- **Inspired by**: [Mixed In Key](https://mixedinkey.com/) - The industry standard for harmonic mixing software
- **Built on**: [electron-python](https://github.com/yoDon/electron-python) boilerplate
- **Music analysis**: [Librosa](https://librosa.org/) and [Essentia](https://essentia.upf.edu/)
- Built with Electron, React, and Python
- Audio analysis powered by advanced signal processing libraries

## 🔗 Related Projects

- [Mixed In Key](https://mixedinkey.com/) - Commercial software that inspired this project
- [Camelot Wheel](https://en.wikipedia.org/wiki/Circle_of_fifths) - Harmonic mixing system
- [Essentia](https://essentia.upf.edu/) - Music analysis library
- [Librosa](https://librosa.org/) - Audio analysis library

## 📞 Support

If you encounter any issues or have questions, please:
1. Check the documentation in the `docs/` folder
2. Search existing issues on GitHub
3. Create a new issue with detailed information

---

**Ready to mix harmonically? Upload your first track and discover the magic of musical key analysis!** 🎶

*This project is not affiliated with Mixed In Key LLC. It's an open-source alternative inspired by their excellent software.*

For detailed documentation, see [README_MIXED_IN_KEY.md](README_MIXED_IN_KEY.md).

**Note**: This is an open-source project inspired by Mixed In Key. For the original commercial software, please visit [mixedinkey.com](https://mixedinkey.com/).
