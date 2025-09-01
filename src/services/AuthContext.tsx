import React from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut, setPersistence, browserLocalPersistence, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { auth, googleProvider, isDesktopEnvironment } from '../firebase';
import { writeAuthHealth } from './TrackSyncService';

export interface AuthContextValue {
    user: User | null;
    loading: boolean;
    error: string | null;
    signInWithGoogle: () => Promise<void>;
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

    // Use the isDesktopEnvironment function from firebase.ts
    const checkIsDesktopEnvironment = React.useCallback(() => {
        return isDesktopEnvironment();
    }, []);
    
    // Fallback authentication method for desktop environments
    const signInWithEmailLink = React.useCallback(async (email: string) => {
        try {
            setError(null);
            console.log('[Auth] Attempting email link authentication');
            // This is just a placeholder - in a real implementation, you would:
            // 1. Send an email with a sign-in link
            // 2. Handle the redirect when the user clicks the link
            // For now, we'll just show an error message
            setError('Email link authentication is not implemented yet. Please contact support.');
        } catch (e: any) {
            console.error('[Auth] Email link authentication failed:', e);
            setError('Email link authentication failed. Please try again.');
        }
    }, []);

    const signInWithGoogle = React.useCallback(async () => {
        setError(null);
        try {
            console.log('[Auth] Starting Google sign-in');
            
            // Set custom parameters for desktop environment
            if (checkIsDesktopEnvironment()) {
                console.log('[Auth] Using desktop authentication flow');
                googleProvider.setCustomParameters({
                    prompt: 'select_account',
                    // Adding these parameters can help with desktop auth
                    login_hint: 'user@example.com',
                    // Force a new window which can help with desktop auth
                    authType: 'reauthenticate'
                });
            }
            
            await signInWithPopup(auth, googleProvider);
            console.log('[Auth] Google sign-in completed');
        } catch (e: any) {
            console.error('[Auth] Google sign-in failed:', e);
            const code = e?.code as string | undefined;
            
            // Handle unauthorized domain error specifically
            if (code === 'auth/unauthorized-domain') {
                console.log('[Auth] Unauthorized domain, attempting alternative sign-in method');
                try {
                    // Force a different auth flow that might work better in desktop environments
                    googleProvider.setCustomParameters({
                        prompt: 'select_account',
                        login_hint: 'user@example.com'
                    });
                    await signInWithPopup(auth, googleProvider);
                    return;
                } catch (ue: any) {
                    console.error('[Auth] Alternative sign-in failed:', ue);
                    setError('Authentication failed. Please ensure you have an internet connection and try again.');
                    return;
                }
            }
            
            if (code === 'auth/popup-closed-by-user' || code === 'auth/popup-blocked') {
                console.log('[Auth] Falling back to redirect sign-in');
                try {
                    await signInWithRedirect(auth, googleProvider);
                    return;
                } catch (re: any) {
                    console.error('[Auth] Redirect sign-in failed:', re);
                    setError(re?.message || 'Sign-in failed');
                    throw re;
                }
            } else if (code === 'auth/network-request-failed') {
                setError('Network error. Please check your internet connection and try again.');
            } else if (code === 'auth/too-many-requests') {
                setError('Too many sign-in attempts. Please try again later.');
            } else if (code === 'auth/user-disabled') {
                setError('This account has been disabled. Please contact support.');
            } else if (code === 'auth/operation-not-allowed') {
                setError('This sign-in method is not enabled. Please try another method.');
            } else if (code?.includes('auth/')) {
                // Handle any other auth errors with a more specific message
                setError(`Authentication error: ${code.replace('auth/', '')}. Please try again.`);
            } else {
                setError(e?.message || 'Sign-in failed');
            }
            throw e;
        }
    }, []);

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


