/**
 * Firebase configuration bypassed for simple app mode
 */

// Dummy objects to maintain compatibility with existing imports if any remain
export const auth: any = {
  currentUser: { uid: 'local-user-id', displayName: 'Local User' },
  onAuthStateChanged: () => () => { },
  signOut: async () => { },
};

export const db: any = {};
export const storage: any = {};
export const googleProvider: any = {};

export const isDesktopEnvironment = () => true;

console.log('Firebase services bypassed in simple mode');
