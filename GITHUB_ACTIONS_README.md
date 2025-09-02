# GitHub Actions Build & Release Workflow

This repository includes a comprehensive GitHub Actions workflow for automatically building and releasing the CAMELOTDJ Music Analyzer application for multiple platforms and architectures.

## Supported Platforms

- **macOS**: Intel (x64) and Apple Silicon (arm64)
- **Windows**: Intel (x64) and ARM64

## How It Works

### Automatic Release (Recommended)

1. **Create a Git Tag**: When you want to release a new version, create and push a git tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **Workflow Triggers**: The workflow automatically:
   - Builds the app for all supported platforms
   - Creates a GitHub release with the tag
   - Uploads all build artifacts
   - Generates release notes

### Manual Release

You can also trigger the workflow manually:

1. Go to the **Actions** tab in your GitHub repository
2. Select **Build and Release** workflow
3. Click **Run workflow**
4. Enter the version number (e.g., `1.0.0`)
5. Click **Run workflow**

## Workflow Steps

### Build Job
1. **Setup**: Installs Node.js 18 and Python 3.9
2. **Dependencies**: Installs Python and Node.js dependencies
3. **Build Process**:
   - Builds Python backend using PyInstaller
   - Builds React frontend
   - Builds Electron main process
   - Packages everything into platform-specific builds
4. **Artifacts**: Uploads build artifacts for later use

### Release Job
1. **Artifact Download**: Downloads all build artifacts
2. **Release Creation**: Creates a GitHub release with:
   - Version tag
   - Release notes
   - Download links for all platforms
   - Build files attached

## Build Outputs

### macOS
- `CAMELOTDJ-Music-Analyzer-{version}-x64-mac.zip` (Intel)
- `CAMELOTDJ-Music-Analyzer-{version}-arm64-mac.zip` (Apple Silicon)

### Windows
- `CAMELOTDJ-Music-Analyzer-{version}-x64-win.exe` (Intel)
- `CAMELOTDJ-Music-Analyzer-{version}-arm64-win.exe` (ARM64)

## Configuration

### Package.json Updates
The workflow requires these configurations in your `package.json`:

```json
{
  "build": {
    "mac": {
      "target": [
        {
          "target": "zip",
          "arch": ["x64", "arm64"]
        }
      ]
    },
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64", "arm64"]
        }
      ]
    }
  }
}
```

### Requirements
- Python 3.9+
- Node.js 18+
- All dependencies listed in `requirements.txt` and `package.json`

## Troubleshooting

### Common Issues

1. **Build Failures**: Check the Actions logs for specific error messages
2. **Missing Dependencies**: Ensure all Python and Node.js dependencies are properly listed
3. **Architecture Issues**: Verify that your code doesn't have platform-specific dependencies

### Debugging

1. **Local Testing**: Test builds locally before pushing tags:
   ```bash
   npm run build:mac  # Test macOS build
   npm run build      # Test all builds
   ```

2. **Workflow Debugging**: Use the workflow dispatch feature to test without creating tags

## Security Notes

- The workflow runs on GitHub-hosted runners
- No sensitive data should be included in build artifacts
- Consider code signing for production releases

## Performance

- Builds run in parallel for different platforms
- Uses GitHub's caching for faster dependency installation
- Artifacts are retained for 30 days

## Next Steps

1. **Push the workflow file** to your repository
2. **Test locally** with `npm run build`
3. **Create your first release** by pushing a tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

The workflow will automatically handle the rest!
