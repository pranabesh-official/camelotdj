#!/bin/bash

# Quick Build Script for CAMELOTDJ
# Use this for faster builds when you know dependencies are already installed

set -e

echo "🚀 Quick Build - CAMELOTDJ"
echo "=========================="

# Clean and build
echo "🧹 Cleaning previous builds..."
rm -rf dist/ build/ buildMain/ pythondist/ build-py-temp/

echo "🐍 Building Python backend..."
npm run python-build

echo "⚛️  Building React frontend..."
npm run react-build

echo "⚡ Building Electron app..."
tsc -p tsconfig.electronMain.json
cross-env npm_config_arch=arm64 ELECTRON_BUILDER_ARCH=arm64 electron-builder --mac

echo "✅ Quick build completed!"
echo "📦 App: dist/mac-arm64/CAMELOTDJ - Music Analyzer.app"
echo "📁 Zip: dist/CAMELOTDJ - Music Analyzer-1.0.0-arm64-mac.zip"
