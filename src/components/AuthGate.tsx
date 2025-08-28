import React from 'react';
import { useAuth } from '../services/AuthContext';

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading, error, signInWithGoogle, signOutUser } = useAuth();

    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const handleSignIn = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await signInWithGoogle();
        } finally {
            // In redirect flow, component may reload; safe to reset anyway
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
                Loading...
            </div>
        );
    }

    if (!user) {
        return (
            <div style={{ position: 'relative', display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)' }}>
                <div style={{
                    width: 380,
                    padding: 24,
                    background: 'rgba(17, 24, 39, 0.75)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 12,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                    backdropFilter: 'blur(8px)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'url(/applogo.png) center/cover, #111827', border: '1px solid rgba(255,255,255,0.08)' }} />
                        <div>
                            <div style={{ color: 'white', fontWeight: 700, fontSize: 18, letterSpacing: 0.3 }}>CAMELOTDJ</div>
                            <div style={{ color: '#9ca3af', fontSize: 12 }}>Music Analyzer</div>
                        </div>
                    </div>

                    <div style={{ color: 'white', fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Welcome back</div>
                    <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>Sign in to access your music library and playlists.</div>

                    <button
                        onClick={handleSignIn}
                        disabled={isSubmitting}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            padding: '12px 16px',
                            background: isSubmitting ? '#f3f4f6' : 'white',
                            color: '#111827',
                            border: '1px solid #e5e7eb',
                            borderRadius: 10,
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                            letterSpacing: 0.2
                        }}
                    >
                        {isSubmitting ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" style={{ animation: 'spin 1s linear infinite' }}>
                                <circle cx="12" cy="12" r="10" stroke="#9ca3af" strokeWidth="4" fill="none"/>
                                <path d="M22 12a10 10 0 0 1-10 10" stroke="#111827" strokeWidth="4" fill="none"/>
                            </svg>
                        ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20">
                            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12 s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C33.64,6.053,29.083,4,24,4C12.955,4,4,12.955,4,24 s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,16.108,18.961,13,24,13c3.059,0,5.842,1.154,7.961,3.039 l5.657-5.657C33.64,6.053,29.083,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36 c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
                            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.094,5.571 c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.982,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
                        </svg>
                        )}
                        {isSubmitting ? 'Signing in…' : 'Continue with Google'}
                    </button>

                    {error && (
                        <div style={{ marginTop: 12, color: '#fca5a5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', padding: '8px 10px', borderRadius: 8, fontSize: 12 }}>
                            {error}
                        </div>
                    )}

                    <div style={{ marginTop: 16, color: '#6b7280', fontSize: 11, textAlign: 'center' }}>
                        By continuing you agree to the Terms and Privacy Policy
                    </div>
                </div>

                {(isSubmitting || loading) && (
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 2, background: 'linear-gradient(90deg, #22c55e, #3b82f6, #a855f7)', opacity: 0.7, animation: 'progress 1.4s ease-in-out infinite' }} />
                    </div>
                )}
                <style>{`
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    @keyframes progress {
                        0% { transform: translateX(-100%); }
                        50% { transform: translateX(-40%); }
                        100% { transform: translateX(100%); }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div style={{ height: '100%' }}>
            <div style={{ position: 'fixed', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 8, zIndex: 1000 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{user.displayName || user.email}</span>
                <button onClick={signOutUser} style={{ padding: '6px 10px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer' }}>Sign out</button>
            </div>
            {children}
        </div>
    );
};

export default AuthGate;


