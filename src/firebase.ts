import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence, initializeFirestore } from "firebase/firestore";

// Firebase configuration - use environment variables
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

// Validate that all required environment variables are present
const requiredEnvVars = [
  'REACT_APP_FIREBASE_API_KEY',
  'REACT_APP_FIREBASE_AUTH_DOMAIN',
  'REACT_APP_FIREBASE_PROJECT_ID',
  'REACT_APP_FIREBASE_STORAGE_BUCKET',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  'REACT_APP_FIREBASE_APP_ID'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing required Firebase environment variables: ${missingVars.join(', ')}. Please check your .env file.`);
}

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig);

// Initialize Auth and provider
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

// Set language preference
auth.useDeviceLanguage();

// Enhanced Electron environment detection
const isDesktopEnvironment = () => {
  // Check for Electron-specific properties
  const isElectron = !!(window as any).process?.type || 
                     (navigator as any).userAgent.toLowerCase().indexOf(' electron/') > -1 ||
                     (window as any).__ELECTRON__ ||
                     process.env.REACT_APP_IS_ELECTRON === 'true';
  
  // Check for localhost/development
  const isLocalhost = !window.location.hostname || 
                     window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1';
  
  // Check if running from file:// protocol (packaged Electron)
  const isFileProtocol = window.location.protocol === 'file:';
  
  return isElectron || isLocalhost || isFileProtocol;
};

// Handle authentication for both web and desktop environments
if (isDesktopEnvironment()) {
  console.log('🔧 Running in desktop/Electron environment - applying special auth configuration');
  
  // Configure Google provider for desktop/Electron
  googleProvider.setCustomParameters({
    prompt: 'select_account',
    // Force new window for better Electron compatibility
    authType: 'reauthenticate'
  });
  
  // Add scopes if needed
  googleProvider.addScope('email');
  googleProvider.addScope('profile');
  
  // For development, you can connect to Firebase Auth emulator
  if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_AUTH_EMULATOR === 'true') {
    try {
      connectAuthEmulator(auth, 'http://localhost:9099');
      console.log('🔧 Connected to Firebase Auth emulator');
    } catch (error) {
      console.log('⚠️ Auth emulator connection failed, using production auth');
    }
  }
} else {
  console.log('🌐 Running in web environment - using standard auth configuration');
}

// Export the helper function for use in other components
export { isDesktopEnvironment };

// Initialize Firestore with offline persistence
// In Electron/webviews, long polling improves reliability
export const db = initializeFirestore(firebaseApp, {
  ignoreUndefinedProperties: true,
  experimentalForceLongPolling: true,
});

enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open, persistence can only be enabled in one tab at a time
    console.log('⚠️ Firestore persistence failed - multiple tabs may be open');
  } else if (err.code === 'unimplemented') {
    // Browser doesn't support persistence
    console.log('⚠️ Firestore persistence not supported in this browser');
  }
});
