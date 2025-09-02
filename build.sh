#!/bin/bash

# CAMELOTDJ - Music Analyzer Build Script
# This script automates the build process for macOS

set -e  # Exit on any error

echo "🎵 CAMELOTDJ - Music Analyzer Build Script"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root directory."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is not installed. Please install Python 3 first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

print_status "Starting build process..."

# Clean previous builds
print_status "Cleaning previous builds..."
rm -rf dist/
rm -rf build/
rm -rf buildMain/
rm -rf pythondist/
rm -rf build-py-temp/

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing Node.js dependencies..."
    npm install
    npm rebuild
else
    print_status "Node.js dependencies already installed"
fi

# Check Python dependencies
print_status "Checking Python dependencies..."
if ! python3 -c "import flask, flask_cors, flask_graphql, graphene, pyinstaller, librosa, mutagen, pydub, scipy, numpy, pandas, essentia" 2>/dev/null; then
    print_warning "Some Python dependencies may be missing. Installing from requirements.txt..."
    pip3 install -r requirements.txt
else
    print_success "Python dependencies are installed"
fi

# Build Python backend
print_status "Building Python backend with PyInstaller..."
npm run python-build

# Build React frontend
print_status "Building React frontend..."
npm run react-build

# Build Electron main process
print_status "Building Electron main process..."
tsc -p tsconfig.electronMain.json

# Build macOS app
print_status "Building macOS application..."
cross-env npm_config_arch=arm64 ELECTRON_BUILDER_ARCH=arm64 electron-builder --mac

# Check if build was successful
if [ -d "dist/mac-arm64" ] && [ -f "dist/CAMELOTDJ - Music Analyzer-1.0.0-arm64-mac.zip" ]; then
    print_success "Build completed successfully!"
    echo ""
    echo "📦 Build artifacts:"
    echo "  • App Bundle: dist/mac-arm64/CAMELOTDJ - Music Analyzer.app"
    echo "  • Zip Archive: dist/CAMELOTDJ - Music Analyzer-1.0.0-arm64-mac.zip"
    echo ""
    
    # Show file sizes
    if [ -d "dist/mac-arm64/CAMELOTDJ - Music Analyzer.app" ]; then
        APP_SIZE=$(du -sh "dist/mac-arm64/CAMELOTDJ - Music Analyzer.app" | cut -f1)
        echo "  • App Bundle Size: $APP_SIZE"
    fi
    
    if [ -f "dist/CAMELOTDJ - Music Analyzer-1.0.0-arm64-mac.zip" ]; then
        ZIP_SIZE=$(du -sh "dist/CAMELOTDJ - Music Analyzer-1.0.0-arm64-mac.zip" | cut -f1)
        echo "  • Zip Archive Size: $ZIP_SIZE"
    fi
    
    echo ""
    print_success "🎉 Build process completed successfully!"
    echo ""
    echo "To run the app:"
    echo "  open \"dist/mac-arm64/CAMELOTDJ - Music Analyzer.app\""
    echo ""
    echo "To distribute:"
    echo "  Share the zip file: dist/CAMELOTDJ - Music Analyzer-1.0.0-arm64-mac.zip"
    
else
    print_error "Build failed! Check the output above for errors."
    exit 1
fi
