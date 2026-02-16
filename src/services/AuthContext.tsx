import React from 'react';

// Mock User interface to match Firebase User's minimal properties
export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
}

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

// Local User constant - this makes it a "simple app" with no login required
const LOCAL_USER: User = {
    uid: 'local-user-id',
    email: '',
    displayName: '',
    photoURL: null
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // We always have a user in "simple" mode
    const [user] = React.useState<User | null>(LOCAL_USER);
    const [loading] = React.useState<boolean>(false);
    const [error] = React.useState<string | null>(null);

    const checkIsDesktopEnvironment = React.useCallback(() => {
        return true; // Simplified
    }, []);

    const signInWithEmailLink = React.useCallback(async (email: string) => {
        console.log('SignIn with email link bypassed in simple mode');
    }, []);

    const signInWithGoogle = React.useCallback(async (method: 'primary' | 'popup' | 'redirect' = 'primary') => {
        console.log('SignIn with Google bypassed in simple mode');
    }, []);

    const signOutUser = React.useCallback(async () => {
        console.log('SignOut bypassed in simple mode');
    }, []);

    const value = React.useMemo<AuthContextValue>(() => ({
        user,
        loading,
        error,
        signInWithGoogle,
        signOutUser,
        signInWithEmailLink,
        checkIsDesktopEnvironment
    }), [user, loading, error, signInWithGoogle, signOutUser, signInWithEmailLink, checkIsDesktopEnvironment]);

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
