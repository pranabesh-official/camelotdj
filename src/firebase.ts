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

// Initialize Firestore with offline persistence
// In Electron/webviews, long polling improves reliability
export const db = initializeFirestore(firebaseApp, {
  ignoreUndefinedProperties: true,
  experimentalForceLongPolling: true,
});

enableIndexedDbPersistence(db).catch(() => {
  // Ignore persistence errors (e.g., multiple tabs/electron windows)
});


