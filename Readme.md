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

## 🌟 Why Open Source?

This project is inspired by the amazing work of Mixed In Key, but built as an open-source alternative. We believe that powerful music analysis tools should be accessible to everyone in the music community.

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines and feel free to submit pull requests or open issues.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

## 🙏 Acknowledgments

- Inspired by [Mixed In Key](https://mixedinkey.com/)
- Built with Electron, React, and Python
- Audio analysis powered by advanced signal processing libraries

## 📞 Support

If you encounter any issues or have questions, please:
1. Check the documentation in the `docs/` folder
2. Search existing issues on GitHub
3. Create a new issue with detailed information

---

**Note**: This is an open-source project inspired by Mixed In Key. For the original commercial software, please visit [mixedinkey.com](https://mixedinkey.com/).
