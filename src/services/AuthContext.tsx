import React from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut, setPersistence, browserLocalPersistence, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { writeAuthHealth } from './TrackSyncService';

export interface AuthContextValue {
    user: User | null;
    loading: boolean;
    error: string | null;
    signInWithGoogle: () => Promise<void>;
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

    const signInWithGoogle = React.useCallback(async () => {
        setError(null);
        try {
            console.log('[Auth] Starting Google sign-in');
            await signInWithPopup(auth, googleProvider);
            console.log('[Auth] Google sign-in completed');
        } catch (e: any) {
            console.error('[Auth] Google sign-in failed:', e);
            const code = e?.code as string | undefined;
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
            }
            setError(e?.message || 'Sign-in failed');
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

    const value = React.useMemo<AuthContextValue>(() => ({ user, loading, error, signInWithGoogle, signOutUser }), [user, loading, error, signInWithGoogle, signOutUser]);

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


