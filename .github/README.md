# GitHub Actions Workflows

This directory contains automated CI/CD workflows for the CAMELOTDJ - Music Analyzer project.

## 🚀 Available Workflows

### 1. Build and Release (`build-and-release.yml`)
**Automated builds and releases for all platforms**

**Triggers:**
- Push to tags (e.g., `v1.0.0`)
- Manual workflow dispatch

**Builds:**
- ✅ macOS x64 and ARM64
- ✅ Windows x64 and ARM64
- ✅ Creates GitHub releases with all artifacts

**Usage:**
```bash
# Create and push a tag to trigger release
git tag v1.0.0
git push origin v1.0.0

# Or trigger manually from GitHub Actions tab
```

### 2. Build and Test (`build-test.yml`)
**Continuous integration for pull requests and main branches**

**Triggers:**
- Push to `main`, `staging`, `develop` branches
- Pull requests to `main`, `staging` branches

**Features:**
- ✅ Runs on macOS, Windows, and Linux
- ✅ TypeScript linting
- ✅ Python backend testing
- ✅ Build verification
- ✅ Uploads test artifacts

### 3. Nightly Build (`nightly-build.yml`)
**Scheduled builds to catch issues early**

**Triggers:**
- Daily at 2 AM UTC
- Manual workflow dispatch

**Features:**
- ✅ Builds all platforms and architectures
- ✅ Tests build process regularly
- ✅ Uploads nightly artifacts

### 4. Security and Dependencies (`security-and-deps.yml`)
**Security audits and dependency management**

**Triggers:**
- Weekly on Mondays at 9 AM UTC
- Changes to `package.json`, `package-lock.json`, `requirements.txt`
- Pull requests with dependency changes

**Features:**
- ✅ npm audit for Node.js dependencies
- ✅ Python safety checks
- ✅ Outdated package detection
- ✅ Dependency review for PRs
- ✅ CodeQL security analysis

### 5. Publish Packages (`publish-packages.yml`)
**Publish to package registries (optional)**

**Triggers:**
- Manual workflow dispatch only

**Features:**
- ✅ Publish to npm registry (optional)
- ✅ Publish to GitHub Packages
- ✅ Create release asset archives

## 🏗️ Build Matrix

| Platform | Architecture | Status |
|----------|-------------|--------|
| macOS    | x64         | ✅     |
| macOS    | ARM64       | ✅     |
| Windows  | x64         | ✅     |
| Windows  | ARM64       | ✅     |
| Linux    | x64         | ✅     |

## 📦 Build Artifacts

### macOS
- `CAMELOTDJ-Music-Analyzer-{version}-x64-mac.zip`
- `CAMELOTDJ-Music-Analyzer-{version}-arm64-mac.zip`

### Windows
- `CAMELOTDJ-Music-Analyzer-Setup-{version}.exe` (x64)
- `CAMELOTDJ-Music-Analyzer-Setup-{version}-arm64.exe` (ARM64)

### Linux
- `CAMELOTDJ-Music-Analyzer-{version}-x64.AppImage`
- `CAMELOTDJ-Music-Analyzer-{version}-x64.deb`

## 🔧 Environment Variables

### Required Secrets
- `GITHUB_TOKEN` - Automatically provided by GitHub
- `NPM_TOKEN` - Required for npm publishing (optional)

### Build Environment
- **Node.js**: 18.x
- **Python**: 3.9
- **Electron**: Latest stable
- **PyInstaller**: Latest

## 🚀 How to Create a Release

### Method 1: Git Tag (Recommended)
```bash
# 1. Update version in package.json
npm version patch  # or minor, major

# 2. Create and push tag
git tag v1.0.0
git push origin v1.0.0

# 3. GitHub Actions will automatically build and release
```

### Method 2: Manual Workflow
1. Go to GitHub Actions tab
2. Select "Build and Release" workflow
3. Click "Run workflow"
4. Enter version (e.g., `v1.0.0`)
5. Click "Run workflow"

## 📋 Workflow Status

Check workflow status at: `https://github.com/{owner}/{repo}/actions`

### Status Badges
Add these to your README:

```markdown
![Build Status](https://github.com/{owner}/{repo}/workflows/Build%20and%20Test/badge.svg)
![Release Status](https://github.com/{owner}/{repo}/workflows/Build%20and%20Release/badge.svg)
```

## 🔍 Troubleshooting

### Common Issues

1. **Build Fails on Python Dependencies**
   ```yaml
   # Check requirements.txt is up to date
   pip install -r requirements.txt
   ```

2. **Node.js Build Fails**
   ```yaml
   # Check package.json and package-lock.json
   npm install
   npm run build
   ```

3. **Electron Build Fails**
   ```yaml
   # Check electron-builder configuration
   npx electron-builder --help
   ```

4. **Artifact Upload Fails**
   ```yaml
   # Check file paths and permissions
   ls -la dist/
   ```

### Debug Workflows

1. **Enable Debug Logging**
   ```yaml
   env:
     ACTIONS_STEP_DEBUG: true
   ```

2. **Check Workflow Logs**
   - Go to Actions tab
   - Click on failed workflow
   - Check individual step logs

3. **Test Locally**
   ```bash
   # Test build scripts locally first
   ./build.sh
   ./quick-build.sh
   ```

## 📚 Workflow Configuration

### Customizing Builds

Edit workflow files to:
- Change Node.js/Python versions
- Add/remove build targets
- Modify artifact paths
- Add custom build steps

### Adding New Platforms

1. Add new job to workflow
2. Configure build matrix
3. Add platform-specific build commands
4. Update artifact upload paths

### Security Considerations

- Never commit secrets to workflow files
- Use GitHub Secrets for sensitive data
- Enable dependency review for PRs
- Regular security audits

## 🎯 Best Practices

1. **Version Management**
   - Use semantic versioning (semver)
   - Tag releases consistently
   - Update CHANGELOG.md

2. **Build Optimization**
   - Cache dependencies
   - Use build matrices efficiently
   - Clean up artifacts regularly

3. **Security**
   - Regular dependency updates
   - Security audits
   - Code scanning

4. **Documentation**
   - Keep README updated
   - Document build requirements
   - Provide troubleshooting guides

---

**Need help?** Check the [GitHub Actions documentation](https://docs.github.com/en/actions) or open an issue.
