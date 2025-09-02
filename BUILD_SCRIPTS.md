# Build Scripts for CAMELOTDJ - Music Analyzer

This directory contains automated build scripts to create distributable versions of the CAMELOTDJ application.

## Available Build Scripts

### 1. `build.sh` - Full macOS Build
**Complete build script with dependency checking and error handling**

```bash
./build.sh
```

**Features:**
- ✅ Checks for required dependencies (Node.js, Python, npm)
- ✅ Installs missing dependencies automatically
- ✅ Cleans previous builds
- ✅ Builds Python backend with PyInstaller
- ✅ Builds React frontend
- ✅ Builds Electron main process
- ✅ Creates macOS app bundle and zip archive
- ✅ Shows build artifacts and file sizes
- ✅ Comprehensive error handling and colored output

### 2. `quick-build.sh` - Fast macOS Build
**Quick build for when dependencies are already installed**

```bash
./quick-build.sh
```

**Features:**
- ⚡ Faster execution (skips dependency checks)
- 🧹 Cleans previous builds
- 🐍 Builds Python backend
- ⚛️ Builds React frontend
- ⚡ Builds Electron app
- ✅ Creates macOS build artifacts

### 3. `build-windows.sh` - Windows Build
**Builds the application for Windows**

```bash
./build-windows.sh
```

**Features:**
- 🪟 Creates Windows executable and installer
- 📦 Generates NSIS installer
- 📁 Creates unpacked app folder
- ✅ Cross-platform build support

## Prerequisites

### Required Software
- **Node.js** (v14 or higher)
- **Python 3.7+** with pip
- **npm** (comes with Node.js)

### Python Dependencies
The build scripts will automatically install Python dependencies from `requirements.txt`:
- flask, flask-cors, flask-graphql, graphene
- pyinstaller, librosa, essentia, mutagen
- pydub, scipy, numpy, pandas
- And other required packages

## Build Outputs

### macOS Build (`build.sh` or `quick-build.sh`)
```
dist/
├── mac-arm64/
│   └── CAMELOTDJ - Music Analyzer.app    # App bundle (843MB)
├── CAMELOTDJ - Music Analyzer-1.0.0-arm64-mac.zip    # Zip archive (273MB)
└── CAMELOTDJ - Music Analyzer-1.0.0-arm64-mac.zip.blockmap
```

### Windows Build (`build-windows.sh`)
```
dist/
├── win-unpacked/                          # Unpacked app folder
└── CAMELOTDJ - Music Analyzer Setup 1.0.0.exe    # NSIS installer
```

## Usage Examples

### First-time Build (Recommended)
```bash
# Use the full build script for first-time builds
./build.sh
```

### Quick Rebuild
```bash
# Use quick build for subsequent builds
./quick-build.sh
```

### Cross-platform Builds
```bash
# Build for macOS
./build.sh

# Build for Windows (on macOS with Wine or Windows machine)
./build-windows.sh
```

## Running the Built App

### macOS
```bash
# Run the app bundle
open "dist/mac-arm64/CAMELOTDJ - Music Analyzer.app"

# Or double-click the app in Finder
```

### Windows
```bash
# Run the installer
./dist/CAMELOTDJ - Music Analyzer Setup 1.0.0.exe

# Or run the unpacked app directly
./dist/win-unpacked/CAMELOTDJ - Music Analyzer.exe
```

## Troubleshooting

### Common Issues

1. **Permission Denied**
   ```bash
   chmod +x build.sh quick-build.sh build-windows.sh
   ```

2. **Python Dependencies Missing**
   ```bash
   pip3 install -r requirements.txt
   ```

3. **Node.js Dependencies Missing**
   ```bash
   npm install
   npm rebuild
   ```

4. **Build Fails with PyInstaller**
   ```bash
   # Clean and retry
   rm -rf pythondist/ build-py-temp/
   ./build.sh
   ```

### Build Script Features

- **Automatic Cleanup**: Removes previous builds before starting
- **Dependency Checking**: Verifies required software is installed
- **Error Handling**: Stops on first error with clear messages
- **Progress Indicators**: Shows build progress with colored output
- **File Size Reporting**: Displays sizes of build artifacts
- **Cross-platform Support**: Works on macOS, Linux, and Windows

## Manual Build Commands

If you prefer to run build steps manually:

```bash
# Clean previous builds
rm -rf dist/ build/ buildMain/ pythondist/ build-py-temp/

# Build Python backend
npm run python-build

# Build React frontend
npm run react-build

# Build Electron main process
tsc -p tsconfig.electronMain.json

# Build macOS app
cross-env npm_config_arch=arm64 ELECTRON_BUILDER_ARCH=arm64 electron-builder --mac

# Build Windows app
cross-env npm_config_arch=x64 ELECTRON_BUILDER_ARCH=x64 electron-builder --win
```

## Notes

- The macOS build creates an unsigned app (no Developer ID)
- Users may need to right-click → Open on first run due to Gatekeeper
- The build includes all USB export fixes and latest features
- Python backend is fully packaged with PyInstaller
- React frontend is optimized for production
