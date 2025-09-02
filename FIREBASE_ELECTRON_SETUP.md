# Firebase Authentication Setup for Electron

This guide explains how to properly configure Firebase authentication in your Electron desktop application.

## Current Configuration

Your project is configured as an **Electron desktop app** that runs locally, not a web app deployed to Firebase hosting. The authentication issues are related to how Firebase Auth works in the Electron environment.

## Key Changes Made

### 1. Enhanced Environment Detection
- Improved detection of Electron/desktop environment
- Added support for file:// protocol (packaged Electron apps)
- Environment variable support for configuration

### 2. Firebase Configuration Updates
- Environment variable support with fallbacks
- Better Electron-specific auth provider configuration
- Improved error handling and logging

### 3. Authentication Flow Improvements
- Popup-first approach (works better in Electron)
- Fallback to redirect for problematic scenarios
- Better error messages for common issues

## Setup Steps

### 1. Create Environment File
Copy `env.example` to `.env.local` in your project root:

```bash
cp env.example .env.local
```

### 2. Firebase Console Configuration

#### A. Authorized Domains
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `camelotdj-f5efd`
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Add these domains:
   - `localhost`
   - `127.0.0.1`
   - `camelotdj-f5efd.firebaseapp.com`

#### B. Google Sign-in Provider
1. In **Authentication** → **Sign-in method**
2. Ensure **Google** is enabled
3. Add your support email if not already set

### 3. Build and Test

#### Development Mode:
```bash
# Start the Electron app with Python backend
npm run start
```

#### Production Build:
```bash
# Build the entire application
npm run build

# For macOS ARM64
npm run build:mac
```

## Troubleshooting

### Common Issues

#### 1. "Unauthorized Domain" Error
**Cause**: Firebase doesn't recognize your domain
**Solution**: 
- Add `localhost` and `127.0.0.1` to authorized domains
- Check that your Firebase project ID matches

#### 2. Popup Blocked
**Cause**: Browser/Electron blocks popup windows
**Solution**: 
- The app automatically falls back to redirect
- Check browser popup settings

#### 3. Authentication State Not Persisting
**Cause**: Electron app restart loses auth state
**Solution**: 
- Firebase persistence is configured
- Check console for persistence errors

### Debug Steps

1. **Check Console Logs**
   - Look for `[Auth]` prefixed messages
   - Environment detection messages
   - Firebase initialization logs

2. **Verify Environment**
   - Confirm you're running in Electron
   - Check if `isDesktopEnvironment()` returns `true`

3. **Test Authentication Flow**
   - Try signing in with Google
   - Check for specific error codes
   - Monitor network requests

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_USE_AUTH_EMULATOR` | Use Firebase Auth emulator | `false` |
| `REACT_APP_IS_ELECTRON` | Force Electron mode | `true` |
| `REACT_APP_ELECTRON_AUTH_MODE` | Auth mode preference | `popup` |

## Firebase Auth Emulator (Optional)

For development, you can use Firebase Auth emulator:

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Start emulator:
```bash
firebase emulators:start --only auth
```

3. Set environment variable:
```bash
REACT_APP_USE_AUTH_EMULATOR=true npm run start
```

## Production Deployment

### Building for Distribution
```bash
# Build the entire app
npm run build

# Build macOS app
npm run build:mac
```

### Distribution Files
- **macOS**: `dist/CAMELOTDJ - Music Analyzer.app`
- **Windows**: `dist/win-unpacked/CAMELOTDJ - Music Analyzer.exe`
- **Linux**: `dist/linux-unpacked/CAMELOTDJ - Music Analyzer`

## Security Notes

1. **API Keys**: Firebase API keys are safe to expose in client code
2. **Domain Restrictions**: Firebase Auth enforces domain restrictions server-side
3. **User Data**: User authentication data is stored locally with persistence

## Support

If you continue to have issues:

1. Check the browser console for detailed error messages
2. Verify Firebase project configuration
3. Test with a fresh Firebase project
4. Check Electron version compatibility

## References

- [Firebase Auth Documentation](https://firebase.google.com/docs/auth)
- [Electron Security Guidelines](https://www.electronjs.org/docs/latest/tutorial/security)
- [Firebase Auth Emulator](https://firebase.google.com/docs/emulator-suite/install_and_configure)
