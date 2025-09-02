# CamelotDJ - Music Analyzer

An open-source platform inspired by [Mixed In Key](https://mixedinkey.com/), designed for harmonic mixing and music analysis. CamelotDJ helps DJs and music producers analyze tracks, find compatible keys, and create harmonious mixes.

## 🎯 Features

- **Harmonic Key Detection**: Automatically detects musical keys using advanced algorithms
- **Camelot Wheel Integration**: Visual representation of musical keys and compatibility
- **Track Analysis**: Analyze individual tracks for key, BPM, and musical characteristics
- **Playlist Management**: Create and manage playlists with harmonic compatibility
- **USB Export**: Export analyzed tracks to USB devices for live performance
- **Cross-Platform**: Works on macOS and Windows
- **Open Source**: Fully open-source with community-driven development

## 🔧 Prerequisites

- **Node.js** 16.x or higher
- **Python** 3.8 or higher
- **npm** or **yarn** package manager
- **Git** for version control

## 📦 Installation

### 1. Clone the Repository
```bash
git clone https://github.com/pranabesh-official/camelotdj.git
cd camelotdj
```

### 2. Install Dependencies
```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt
```

### 3. Environment Configuration
Create a `.env.local` file in the project root with your Firebase configuration:

```bash
# Copy the example environment file
cp env.example .env.local

# Edit .env.local with your actual Firebase credentials
nano .env.local
```

**Required Firebase Configuration:**
```bash
# Firebase Configuration
REACT_APP_FIREBASE_API_KEY=your_api_key_here
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Google OAuth (Optional)
GOOGLE_OAUTH_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret

# Development Settings
NODE_ENV=development
REACT_APP_IS_ELECTRON=true
```

## 🚀 Development

### Start Development Server
```bash
# Start both React frontend and Electron main process
npm run start

# Start only React development server
npm run react-start

# Start only Electron main process
npm run main-start
```

### Build for Production
```bash
# Build for all platforms
npm run build

# Build for macOS (ARM64)
npm run build:mac
```

### Development Scripts
```bash
# Lint code
npm run lint

# Watch for changes
npm run watch

# Python backend
npm run python-start
```

## 🎵 How to Use

### 1. **Initial Setup**
- Launch the application
- Sign in with your Google account (Firebase authentication)
- Configure your music library path

### 2. **Adding Music**
- Use the **File Upload** component to add individual tracks
- Drag and drop MP3 files into the application
- The system will automatically analyze each track for:
  - Musical key (Camelot notation)
  - BPM (Beats Per Minute)
  - Audio quality metrics

### 3. **Track Analysis**
- **Analysis Queue**: View tracks being processed
- **Analysis Results**: See detailed information about each track
- **Metadata Editor**: Modify track information if needed

### 4. **Harmonic Mixing**
- **Camelot Wheel**: Visual representation of musical keys
- **Compatible Keys**: Find tracks that will mix harmonically
- **Key Transitions**: Plan smooth key changes between tracks

### 5. **Playlist Management**
- Create playlists based on harmonic compatibility
- Organize tracks by key, BPM, or genre
- Export playlists for different performance scenarios

### 6. **USB Export**
- Prepare tracks for live performance
- Export analyzed tracks to USB devices
- Maintain all metadata and analysis results

## 🔍 Troubleshooting

### Common Issues and Solutions

#### 1. **Blank Screen After Build**
**Problem**: Application shows blank screen after `npm run build`
**Solution**: 
- Ensure `.env.local` file exists with Firebase configuration
- Check that `src/firebase.ts` file is present
- Verify environment variables are loaded correctly

#### 2. **Port 3002 Already in Use**
**Problem**: `Something is already running on port 3002`
**Solution**:
```bash
# Kill processes using port 3002
lsof -ti:3002 | xargs kill -9

# Or change the port in package.json
# Edit the react-start script to use a different port
```

#### 3. **Firebase Configuration Errors**
**Problem**: `Missing required Firebase environment variables`
**Solution**:
- Verify `.env.local` file exists and contains all required variables
- Ensure file is in the project root directory
- Restart the development server after making changes

#### 4. **Python Backend Issues**
**Problem**: Python API not responding
**Solution**:
- Check if Python dependencies are installed: `pip install -r requirements.txt`
- Verify Python version: `python3 --version`
- Check API logs in the terminal output

#### 5. **Environment Variables Not Loading**
**Problem**: Firebase config shows "❌ Missing" for all variables
**Solution**:
- Ensure `.env.local` file exists (not just `.env`)
- Check file permissions: `ls -la .env*`
- Restart the development server
- Verify the file contains the correct variable names (REACT_APP_ prefix)

### Debug Mode

Enable debug logging by checking the browser console for:
- 🔍 Environment Variables Debug
- 🔥 Firebase Config status
- 📱 Environment detection
- 🔧 Development mode status

## 🏗️ Project Structure

```
mixed_in_key/
├── src/                    # React frontend source
│   ├── components/        # React components
│   ├── services/          # Firebase and API services
│   ├── firebase.ts        # Firebase configuration
│   └── App.tsx           # Main application component
├── main/                  # Electron main process
│   └── index.ts          # Main process entry point
├── python/                # Python backend
│   ├── api.py            # Flask API server
│   └── music_analyzer.py # Music analysis logic
├── .env.local            # Environment variables (create this)
├── env.example           # Environment template
├── package.json          # Node.js dependencies
└── requirements.txt      # Python dependencies
```

## 🔐 Firebase Setup

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Authentication, Firestore, and Storage

### 2. Configure Authentication
1. Go to Authentication > Sign-in method
2. Enable Google sign-in
3. Add your domain to authorized domains

### 3. Get Configuration
1. Go to Project Settings > General
2. Scroll down to "Your apps"
3. Copy the Firebase configuration object
4. Update your `.env.local` file

## 🚀 Deployment

### Build for Distribution
```bash
# Build for macOS
npm run build:mac

# Build for Windows
npm run build:win

# Build for Linux
npm run build:linux
```

### Distribution Files
Built applications are available in the `dist/` directory:
- **macOS**: `.app` bundle and `.dmg` installer
- **Windows**: `.exe` installer
- **Linux**: AppImage and other formats

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### 1. Fork the Repository
1. Fork the project on GitHub
2. Clone your fork locally
3. Create a feature branch

### 2. Development Workflow
```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and test
npm run start

# Commit changes
git add .
git commit -m "feat: add your feature description"

# Push to your fork
git push origin feature/your-feature-name
```

### 3. Submit Pull Request
1. Create a pull request from your feature branch
2. Describe your changes clearly
3. Include any relevant issue numbers

### 4. Code Standards
- Follow existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass

## 🐛 Reporting Issues

When reporting issues, please include:
- **Operating System**: macOS/Windows/Linux version
- **Node.js Version**: `node --version`
- **Python Version**: `python3 --version`
- **Steps to Reproduce**: Detailed steps to trigger the issue
- **Expected vs Actual Behavior**: What you expected vs what happened
- **Console Logs**: Any error messages or console output
- **Screenshots**: Visual evidence of the issue

## 📚 Additional Resources

- **Harmonic Mixing Guide**: Learn about musical key compatibility
- **Camelot Wheel Explanation**: Understanding the circle of fifths
- **DJ Techniques**: Advanced mixing strategies
- **Music Theory**: Basic music theory for DJs

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

## 🙏 Acknowledgments

- **Mixed In Key**: Inspiration for this open-source platform
- **Firebase**: Backend services and authentication
- **Electron**: Cross-platform desktop application framework
- **React**: Frontend user interface
- **Python**: Music analysis and backend services

## 💬 Support

- **GitHub Issues**: [Report bugs and request features](https://github.com/pranabesh-official/camelotdj/issues)
- **Discussions**: [Join community discussions](https://github.com/pranabesh-official/camelotdj/discussions)
- **Documentation**: [Read the full documentation](https://github.com/pranabesh-official/camelotdj/wiki)

## 🔄 Changelog

### Version 1.0.0
- Initial release with core music analysis features
- Firebase integration for authentication and data storage
- Cross-platform Electron application
- Python backend for music processing
- Comprehensive user interface for track management

---

**Happy Mixing! 🎧🎵**
