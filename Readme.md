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

- **Node.js** (v14 or higher)
- **Python 3.8+** (Anaconda recommended)
- **Git**
- **Firebase Account** (for authentication and data storage)

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
   
   # Or use pip directly
   pip install -r requirements.txt
   ```

4. **Configure environment variables**
   ```bash
   # Copy the example environment file
   cp env.example .env.local
   
   # Edit .env.local with your Firebase credentials
   # The file should contain:
   REACT_APP_FIREBASE_API_KEY=your_api_key_here
   REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   REACT_APP_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.region.firebasedatabase.app
   REACT_APP_FIREBASE_PROJECT_ID=your_project_id
   REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   REACT_APP_FIREBASE_APP_ID=your_app_id
   REACT_APP_FIREBASE_MEASUREMENT_ID=your_measurement_id
   ```

5. **Start the development server**
   ```bash
   npm run start
   ```

## 🔧 Configuration

### Firebase Setup

1. **Create a Firebase project** at [Firebase Console](https://console.firebase.google.com/)
2. **Enable services**:
   - Authentication (with Google sign-in)
   - Firestore Database
   - Realtime Database
   - Storage
   - Analytics (optional)
3. **Get your configuration**:
   - Go to Project Settings → General → Your apps
   - Click the web app icon (</>) to add a web app
   - Copy the config object
4. **Update `.env.local`** with your Firebase credentials

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. **Enable APIs**:
   - Google+ API
   - Google Identity Toolkit API
3. **Create OAuth 2.0 credentials**:
   - Go to APIs & Services → Credentials
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - Set application type to "Web application"
   - Add authorized origins: `http://localhost:3001`, `http://127.0.0.1:3001`
   - Add authorized redirect URIs: `http://localhost:3001/auth/callback`
4. **Copy credentials** to `.env.local`:
   ```
   GOOGLE_OAUTH_CLIENT_ID=your_client_id.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
   ```

## 🚨 Troubleshooting

### Common Issues

#### 1. **Firebase Configuration Errors**
If you see "Missing required Firebase environment variables":
```bash
# Check if .env.local exists and has correct content
cat .env.local

# Ensure all REACT_APP_FIREBASE_* variables are set
grep "REACT_APP_FIREBASE" .env.local

# Restart the development server after making changes
npm run start
```

#### 2. **Port Conflicts**
If you see "Something is already running on port 3001":
```bash
# Check what's using port 3001
lsof -i :3001

# Kill conflicting processes
pkill -f "react-scripts"
pkill -f "craco"

# Or use a different port
PORT=3002 npm run start
```

#### 3. **Blank Screen in Production Build**
If the app shows a blank screen after building:
```bash
# Clean and rebuild
npm run build
npm run main-build

# Check the console for build directory errors
# Ensure all build files are properly unpacked
```

#### 4. **Python Backend Issues**
If the Python backend fails to start:
```bash
# Check Python environment
conda activate camelotdj
python --version

# Install missing dependencies
pip install -r requirements.txt

# Test Python API directly
cd python
python api.py --apiport 5002 --signingkey devkey
```

### Environment Variable Debugging

The app includes comprehensive debugging for environment variables. Check the console for:
```
🔍 Environment Variables Debug:
REACT_APP_FIREBASE_API_KEY: ✅ Set
REACT_APP_FIREBASE_AUTH_DOMAIN: ✅ Set
🔥 Firebase Config: { apiKey: "✅ Set", ... }
```

If you see ❌ Missing, check your `.env.local` file.

## 🏗️ Development

### Available Scripts

```bash
# Development
npm run start          # Start both React and Electron
npm run react-start    # Start only React development server
npm run main-start     # Start only Electron main process
npm run dev            # Start Python backend + React

# Building
npm run build          # Build React app
npm run python-build   # Build Python backend
npm run main-build     # Build Electron app
npm run build:mac      # Build for macOS

# Linting
npm run lint           # Lint all code
npm run react-lint     # Lint React code
npm run main-lint      # Lint Electron code
```

### Project Structure

```
camelotdj/
├── main/              # Electron main process
│   ├── index.ts      # Main process entry point
│   └── with-python.ts # Python integration
├── src/               # React frontend
│   ├── components/    # React components
│   ├── services/      # Firebase and API services
│   ├── firebase.ts    # Firebase configuration
│   └── App.tsx        # Main React app
├── python/            # Python backend
│   ├── api.py         # FastAPI server
│   ├── music_analyzer.py # Audio analysis engine
│   └── calc.py        # Key detection algorithms
├── build/             # React build output
├── buildMain/         # Electron build output
├── pythondist/        # Python build output
├── .env.local         # Environment variables (not in git)
├── env.example        # Environment variables template
└── package.json       # Project configuration
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `REACT_APP_FIREBASE_API_KEY` | Firebase API key | ✅ |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | ✅ |
| `REACT_APP_FIREBASE_PROJECT_ID` | Firebase project ID | ✅ |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | ✅ |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | Firebase sender ID | ✅ |
| `REACT_APP_FIREBASE_APP_ID` | Firebase app ID | ✅ |
| `REACT_APP_FIREBASE_DATABASE_URL` | Realtime database URL | ❌ |
| `REACT_APP_FIREBASE_MEASUREMENT_ID` | Analytics measurement ID | ❌ |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID | ❌ |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret | ❌ |

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

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Test thoroughly: `npm run lint && npm run build`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

## 🙏 Acknowledgments

- Inspired by [Mixed In Key](https://mixedinkey.com/)
- Built with Electron, React, and Python
- Audio analysis powered by advanced signal processing libraries

## 📞 Support

If you encounter any issues or have questions, please:

1. **Check the troubleshooting section** above
2. **Check the documentation** in the `docs/` folder
3. **Search existing issues** on GitHub
4. **Create a new issue** with:
   - Detailed error description
   - Console output/logs
   - Steps to reproduce
   - Environment details (OS, Node.js version, Python version)

### Quick Support Checklist

- [ ] Environment variables are set in `.env.local`
- [ ] Firebase project is configured correctly
- [ ] Python environment is activated
- [ ] All dependencies are installed
- [ ] No port conflicts (3001, 5002)
- [ ] Console shows no Firebase errors

---

**Note**: This is an open-source project inspired by Mixed In Key. For the original commercial software, please visit [mixedinkey.com](https://mixedinkey.com/).
