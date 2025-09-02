import React from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut, setPersistence, browserLocalPersistence, signInWithRedirect, getRedirectResult, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider, isDesktopEnvironment } from '../firebase';
import { writeAuthHealth } from './TrackSyncService';

export interface AuthContextValue {
    user: User | null;
    loading: boolean;
    error: string | null;
    signInWithGoogle: (method?: 'primary' | 'popup' | 'redirect') => Promise<void>;
    signInWithEmailLink: (email: string) => Promise<void>;
    checkIsDesktopEnvironment: () => boolean;
    signOutUser: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = React.useState<User | null>(null);
    const [loading, setLoading] = React.useState<boolean>(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let unsub = () => {};
        (async () => {
            try {
                // Ensure persistence so state is restored on reload
                await setPersistence(auth, browserLocalPersistence);
            } catch (e) {
                console.error('Auth persistence error:', e);
            }
            try {
                // Handle redirect result if present
                const result = await getRedirectResult(auth);
                if (result?.user) {
                    console.log('[Auth] Redirect sign-in completed:', result.user.uid);
                }
            } catch (e: any) {
                console.error('[Auth] getRedirectResult error:', e);
                setError(e?.message || 'Sign-in redirect failed');
            }
            unsub = onAuthStateChanged(auth, async (firebaseUser) => {
                console.log('[Auth] onAuthStateChanged user:', !!firebaseUser, firebaseUser?.uid);
                setUser(firebaseUser);
                setLoading(false);
                if (firebaseUser?.uid) {
                    try {
                        await writeAuthHealth(firebaseUser.uid);
                    } catch (e) {
                        // Rules issues will show here in console
                    }
                }
            });
        })();
        return () => unsub();
    }, []);

    // Set up IPC listeners for external OAuth flow
    React.useEffect(() => {
        // Check if we're in Electron environment
        if (typeof window !== 'undefined' && (window as any).require) {
            try {
                const { ipcRenderer } = (window as any).require('electron');
                
                // Listen for OAuth tokens from main process
                const handleOAuthTokens = async (_event: any, tokens: any) => {
                    try {
                        console.log('[Auth] Received OAuth tokens, signing into Firebase...');
                        const credential = GoogleAuthProvider.credential(tokens.id_token);
                        await signInWithCredential(auth, credential);
                        console.log('[Auth] Successfully signed in with OAuth tokens');
                    } catch (err: any) {
                        console.error('[Auth] Error signing in with OAuth tokens:', err);
                        setError('Failed to sign in with external authentication. Please try again.');
                    }
                };
                
                // Listen for OAuth errors from main process
                const handleOAuthError = (_event: any, error: string) => {
                    console.error('[Auth] OAuth error from main process:', error);
                    setError(`External authentication failed: ${error}. Please try again.`);
                };
                
                ipcRenderer.on('oauth-tokens', handleOAuthTokens);
                ipcRenderer.on('oauth-error', handleOAuthError);
                
                return () => {
                    ipcRenderer.removeListener('oauth-tokens', handleOAuthTokens);
                    ipcRenderer.removeListener('oauth-error', handleOAuthError);
                };
            } catch (error) {
                console.log('[Auth] Not in Electron environment or IPC not available');
            }
        }
    }, []);

    // Use the isDesktopEnvironment function from firebase.ts
    const checkIsDesktopEnvironment = React.useCallback(() => {
        return isDesktopEnvironment();
    }, []);
    
    // Fallback authentication method for desktop environments
    const signInWithEmailLink = React.useCallback(async (email: string) => {
        try {
            setError(null);
            console.log('[Auth] Attempting email link authentication');
            setError('Email link authentication is not implemented yet. Please contact support.');
        } catch (e: any) {
            console.error('[Auth] Email link authentication failed:', e);
            setError('Email link authentication failed. Please try again.');
        }
    }, []);

    const signInWithGoogle = React.useCallback(async (method: 'primary' | 'popup' | 'redirect' = 'primary') => {
        setError(null);
        const isDesktop = checkIsDesktopEnvironment();
        console.log(`[Auth] Starting Google sign-in with method: ${method}. Origin:`, window.location.origin, 'Protocol:', window.location.protocol, 'Env:', isDesktop ? 'Desktop/Electron' : 'Web');
        
        // Configure Google provider
        googleProvider.setCustomParameters({ prompt: 'select_account', authType: 'reauthenticate' });
        googleProvider.addScope('email');
        googleProvider.addScope('profile');

        // Handle specific method requests
        if (method === 'popup') {
            console.log('[Auth] Using Firebase popup authentication (requested)');
            try {
                await signInWithPopup(auth, googleProvider);
                console.log('[Auth] Firebase popup authentication successful');
                return;
            } catch (popupError: any) {
                console.error('[Auth] Firebase popup failed:', popupError);
                throw popupError;
            }
        }

        if (method === 'redirect') {
            console.log('[Auth] Using Firebase redirect authentication (requested)');
            try {
                await signInWithRedirect(auth, googleProvider);
                console.log('[Auth] Firebase redirect authentication initiated');
                return;
            } catch (redirectError: any) {
                console.error('[Auth] Firebase redirect failed:', redirectError);
                throw redirectError;
            }
        }

        // Primary method: Try External Browser OAuth first (Electron only), then fallback
        if (isDesktop) {
            console.log('[Auth] Primary method: Trying external browser OAuth flow');
            try {
                if (typeof window !== 'undefined' && (window as any).require) {
                    const { ipcRenderer } = (window as any).require('electron');
                    await ipcRenderer.invoke('start-external-oauth');
                    console.log('[Auth] External browser OAuth initiated successfully');
                    return;
                } else {
                    throw new Error('Electron IPC not available');
                }
            } catch (ipcError) {
                console.log('[Auth] External browser OAuth failed:', ipcError);
                console.log('[Auth] Falling back to Firebase popup method');
            }
        }

        // Fallback: Try Firebase Popup
        console.log('[Auth] Fallback: Trying Firebase popup authentication');
        try {
            await signInWithPopup(auth, googleProvider);
            console.log('[Auth] Firebase popup authentication successful');
            return;
        } catch (popupError: any) {
            console.log('[Auth] Firebase popup failed:', popupError?.code);
            
            // If popup fails due to blocking or domain issues, try redirect
            if (popupError?.code === 'auth/popup-blocked' || 
                popupError?.code === 'auth/popup-closed-by-user' ||
                popupError?.code === 'auth/unauthorized-domain') {
                
                console.log('[Auth] Final fallback: Trying Firebase redirect authentication');
                try {
                    await signInWithRedirect(auth, googleProvider);
                    console.log('[Auth] Firebase redirect authentication initiated');
                    return;
                } catch (redirectError: any) {
                    console.error('[Auth] Firebase redirect failed:', redirectError);
                    // Fall through to error handling
                }
            }
            
            // Handle all authentication errors
            const code = popupError?.code as string | undefined;
            if (code === 'auth/unauthorized-domain') {
                setError('This domain is not authorized for Firebase authentication. Please add localhost and 127.0.0.1 to Authorized domains.');
            } else if (code === 'auth/popup-closed-by-user') {
                setError('Sign-in was cancelled. Please try again.');
            } else if (code === 'auth/popup-blocked') {
                setError('Pop-up was blocked by your browser. Please allow pop-ups and try again.');
            } else if (code === 'auth/network-request-failed') {
                setError('Network error. Please check your internet connection and try again.');
            } else if (code === 'auth/too-many-requests') {
                setError('Too many sign-in attempts. Please try again later.');
            } else if (code === 'auth/user-disabled') {
                setError('This account has been disabled. Please contact support.');
            } else if (code === 'auth/operation-not-allowed') {
                setError('Google sign-in is not enabled. Please contact support.');
            } else if (code?.includes('auth/')) {
                setError(`Authentication error: ${code.replace('auth/', '')}. Please try again.`);
            } else {
                setError(popupError?.message || 'All authentication methods failed. Please try again.');
            }
            throw popupError;
        }
    }, [checkIsDesktopEnvironment]);

    const signOutUser = React.useCallback(async () => {
        setError(null);
        try {
            await signOut(auth);
        } catch (e: any) {
            console.error('[Auth] Sign-out failed:', e);
            setError(e?.message || 'Sign-out failed');
            throw e;
        }
    }, []);

    const value = React.useMemo<AuthContextValue>(() => ({ user, loading, error, signInWithGoogle, signOutUser, signInWithEmailLink, checkIsDesktopEnvironment }), [user, loading, error, signInWithGoogle, signOutUser, signInWithEmailLink, checkIsDesktopEnvironment]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextValue => {
    const ctx = React.useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};


