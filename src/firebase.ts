import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence, initializeFirestore } from "firebase/firestore";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBRFKQHU_3C_LGJprIlKWByaRzQTQza-80",
  authDomain: "camelotdj-f5efd.firebaseapp.com",
  projectId: "camelotdj-f5efd",
  storageBucket: "camelotdj-f5efd.firebasestorage.app",
  messagingSenderId: "899064011372",
  appId: "1:899064011372:web:c0567c1b6e5d4a6a3e9649",
  measurementId: "G-D83Y7FEX4X",
};

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig);

// Initialize Auth and provider
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

// Set language preference
auth.useDeviceLanguage();

// Check if we're in a desktop environment (Electron)
const isDesktopEnvironment = () => {
  return !window.location.hostname || 
         window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         // Additional checks for Electron environment
         (window as any).process?.type === 'renderer' ||
         (navigator as any).userAgent.toLowerCase().indexOf(' electron/') > -1;
};

// Handle authentication for both web and desktop environments
if (isDesktopEnvironment()) {
  // For desktop app (Electron) or local development
  // This helps bypass the domain restriction when running as a desktop app
  googleProvider.setCustomParameters({
    // Allow sign-in to occur regardless of domain
    prompt: 'select_account',
    // Adding these parameters can help with desktop auth
    login_hint: 'user@example.com',
    // Force a new window which can help with desktop auth
    authType: 'reauthenticate'
  });
  
  console.log('Running in desktop or development mode - applying special auth configuration');
}

// Export the helper function for use in other components
export { isDesktopEnvironment };

// Initialize Firestore with offline persistence
// In Electron/webviews, long polling improves reliability
export const db = initializeFirestore(firebaseApp, {
  ignoreUndefinedProperties: true,
  experimentalForceLongPolling: true,
});

enableIndexedDbPersistence(db).catch(() => {
  // Ignore persistence errors (e.g., multiple tabs/electron windows)
});


