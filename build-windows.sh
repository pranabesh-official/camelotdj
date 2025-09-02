#!/bin/bash

# CAMELOTDJ - Windows Build Script
# This script builds the application for Windows

set -e

echo "🎵 CAMELOTDJ - Windows Build Script"
echo "==================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root directory."
    exit 1
fi

print_status "Starting Windows build process..."

# Clean previous builds
print_status "Cleaning previous builds..."
rm -rf dist/
rm -rf build/
rm -rf buildMain/
rm -rf pythondist/
rm -rf build-py-temp/

# Build Python backend
print_status "Building Python backend with PyInstaller..."
npm run python-build

# Build React frontend
print_status "Building React frontend..."
npm run react-build

# Build Electron main process
print_status "Building Electron main process..."
tsc -p tsconfig.electronMain.json

# Build Windows app
print_status "Building Windows application..."
cross-env npm_config_arch=x64 ELECTRON_BUILDER_ARCH=x64 electron-builder --win

# Check if build was successful
if [ -d "dist/win-unpacked" ] && [ -f "dist/CAMELOTDJ - Music Analyzer Setup 1.0.0.exe" ]; then
    print_success "Windows build completed successfully!"
    echo ""
    echo "📦 Build artifacts:"
    echo "  • App Folder: dist/win-unpacked/"
    echo "  • Installer: dist/CAMELOTDJ - Music Analyzer Setup 1.0.0.exe"
    echo ""
    
    # Show file sizes
    if [ -d "dist/win-unpacked" ]; then
        APP_SIZE=$(du -sh "dist/win-unpacked" | cut -f1)
        echo "  • App Folder Size: $APP_SIZE"
    fi
    
    if [ -f "dist/CAMELOTDJ - Music Analyzer Setup 1.0.0.exe" ]; then
        INSTALLER_SIZE=$(du -sh "dist/CAMELOTDJ - Music Analyzer Setup 1.0.0.exe" | cut -f1)
        echo "  • Installer Size: $INSTALLER_SIZE"
    fi
    
    echo ""
    print_success "🎉 Windows build process completed successfully!"
    
else
    print_error "Windows build failed! Check the output above for errors."
    exit 1
fi
