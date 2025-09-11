import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

// Debug: Log all environment variables to see what's available
console.log('🔍 Environment Variables Debug:');
// Safe access to process.env with fallback
const safeProcessEnv = (typeof process !== 'undefined' && process.env) ? process.env : {} as Record<string, string | undefined>;

console.log('NODE_ENV:', safeProcessEnv.NODE_ENV);
console.log('process.env keys:', Object.keys(safeProcessEnv).filter(key => key.startsWith('REACT_APP_')));
console.log('REACT_APP_FIREBASE_API_KEY:', safeProcessEnv.REACT_APP_FIREBASE_API_KEY ? '✅ Set' : '❌ Missing');
console.log('REACT_APP_FIREBASE_AUTH_DOMAIN:', safeProcessEnv.REACT_APP_FIREBASE_AUTH_DOMAIN ? '✅ Set' : '❌ Missing');
console.log('REACT_APP_FIREBASE_PROJECT_ID:', safeProcessEnv.REACT_APP_FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing');
console.log('REACT_APP_FIREBASE_STORAGE_BUCKET:', safeProcessEnv.REACT_APP_FIREBASE_STORAGE_BUCKET ? '✅ Set' : '❌ Missing');
console.log('REACT_APP_FIREBASE_MESSAGING_SENDER_ID:', safeProcessEnv.REACT_APP_FIREBASE_MESSAGING_SENDER_ID ? '✅ Set' : '❌ Missing');
console.log('REACT_APP_FIREBASE_APP_ID:', safeProcessEnv.REACT_APP_FIREBASE_APP_ID ? '✅ Set' : '❌ Missing');

// Alternative: Try to access environment variables from window object (for web builds)
const getEnvVar = (key: string): string | undefined => {
  // Try process.env first (for Node.js/Electron)
  if (safeProcessEnv[key]) {
    return safeProcessEnv[key];
  }
  
  // Try window.__ENV__ if available (for web builds)
  if (typeof window !== 'undefined' && (window as any).__ENV__ && (window as any).__ENV__[key]) {
    return (window as any).__ENV__[key];
  }
  
  // Try window.ENV if available
  if (typeof window !== 'undefined' && (window as any).ENV && (window as any).ENV[key]) {
    return (window as any).ENV[key];
  }
  
  return undefined;
};

console.log('🔍 Alternative env var access test:');
console.log('getEnvVar REACT_APP_FIREBASE_API_KEY:', getEnvVar('REACT_APP_FIREBASE_API_KEY') ? '✅ Found' : '❌ Not found');

// Check for required environment variables
const requiredEnvVars = [
  'REACT_APP_FIREBASE_API_KEY',
  'REACT_APP_FIREBASE_AUTH_DOMAIN',
  'REACT_APP_FIREBASE_PROJECT_ID',
  'REACT_APP_FIREBASE_STORAGE_BUCKET',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  'REACT_APP_FIREBASE_APP_ID'
];

const missingVars = requiredEnvVars.filter(varName => !getEnvVar(varName));

if (missingVars.length > 0) {
  const errorMessage = `Missing required Firebase environment variables: ${missingVars.join(', ')}. Please check your .env.local file.`;
  console.error('❌', errorMessage);
  console.error('🔍 Make sure you have a .env.local file with the Firebase configuration');
  console.error('🔍 You can copy from env.example: cp env.example .env.local');
  console.error('🔍 Current working directory:', typeof process !== 'undefined' ? process.cwd() : 'N/A (browser)');
  console.error('🔍 .env.local exists:', require('fs').existsSync('.env.local'));
  throw new Error(errorMessage);
}

// Firebase configuration using environment variables
const firebaseConfig = {
  apiKey: getEnvVar('REACT_APP_FIREBASE_API_KEY'),
  authDomain: getEnvVar('REACT_APP_FIREBASE_AUTH_DOMAIN'),
  databaseURL: getEnvVar('REACT_APP_FIREBASE_DATABASE_URL'),
  projectId: getEnvVar('REACT_APP_FIREBASE_PROJECT_ID'),
  storageBucket: getEnvVar('REACT_APP_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnvVar('REACT_APP_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnvVar('REACT_APP_FIREBASE_APP_ID'),
  measurementId: getEnvVar('REACT_APP_FIREBASE_MEASUREMENT_ID')
};

console.log('🔥 Firebase Config:', {
  apiKey: getEnvVar('REACT_APP_FIREBASE_API_KEY') ? '✅ Set' : '❌ Missing',
  authDomain: getEnvVar('REACT_APP_FIREBASE_AUTH_DOMAIN') ? '✅ Set' : '❌ Missing',
  projectId: getEnvVar('REACT_APP_FIREBASE_PROJECT_ID') ? '✅ Set' : '❌ Missing',
  storageBucket: getEnvVar('REACT_APP_FIREBASE_STORAGE_BUCKET') ? '✅ Set' : '❌ Missing',
  messagingSenderId: getEnvVar('REACT_APP_FIREBASE_MESSAGING_SENDER_ID') ? '✅ Set' : '❌ Missing',
  appId: getEnvVar('REACT_APP_FIREBASE_APP_ID') ? '✅ Set' : '❌ Missing'
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const database = getDatabase(app);
export const storage = getStorage(app);

// Initialize Analytics conditionally (only if supported and measurementId is provided)
export const analytics = getEnvVar('REACT_APP_FIREBASE_MEASUREMENT_ID') ? 
  (async () => {
    try {
      const analyticsSupported = await isSupported();
      return analyticsSupported ? getAnalytics(app) : null;
    } catch (error) {
      console.warn('Analytics not supported:', error);
      return null;
    }
  })() : null;

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

// Check if running in desktop/Electron environment
export const isDesktopEnvironment = (): boolean => {
  return typeof window !== 'undefined' && 
         (window as any).require && 
         (window as any).require('electron');
};

// Check if running in development mode
export const isDevelopment = (): boolean => {
  return safeProcessEnv.NODE_ENV === 'development';
};

// Log Firebase initialization status
console.log('🔥 Firebase initialized successfully');
console.log('📱 Environment:', isDesktopEnvironment() ? 'Desktop/Electron' : 'Web');
console.log('🔧 Mode:', isDevelopment() ? 'Development' : 'Production');
console.log('📊 Analytics:', getEnvVar('REACT_APP_FIREBASE_MEASUREMENT_ID') ? 'Enabled' : 'Disabled');

export default app;
