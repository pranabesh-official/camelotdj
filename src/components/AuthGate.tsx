import React from 'react';
import { useAuth } from '../services/AuthContext';
import logoWhite from '../assets/logwhite.png';
import { useState } from 'react';

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading, error, signInWithGoogle, signInWithEmailLink, checkIsDesktopEnvironment, signOutUser } = useAuth();

    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [showEmailOption, setShowEmailOption] = useState(false);
    const [email, setEmail] = useState('');
    const [isDesktop, setIsDesktop] = useState(false);
    const [showFallbackOptions, setShowFallbackOptions] = useState(false);
    const [authMethod, setAuthMethod] = useState<'primary' | 'popup' | 'redirect'>('primary');

    // Check if we're in a desktop environment on component mount
    React.useEffect(() => {
        setIsDesktop(checkIsDesktopEnvironment());
    }, [checkIsDesktopEnvironment]);

    const handleSignIn = async (method: 'primary' | 'popup' | 'redirect' = 'primary') => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        setAuthMethod(method);
        
        try {
            await signInWithGoogle();
        } catch (e: any) {
            console.log(`[AuthGate] ${method} authentication failed:`, e?.code);
            
            // Show fallback options if primary method fails
            if (method === 'primary' && !showFallbackOptions) {
                setShowFallbackOptions(true);
            }
            
            // If we get an unauthorized domain error and we're in a desktop environment,
            // show the email option as a fallback
            if (e?.code === 'auth/unauthorized-domain' && isDesktop) {
                setShowEmailOption(true);
            }
        } finally {
            // In redirect flow, component may reload; safe to reset anyway
            setIsSubmitting(false);
        }
    };
    
    const handleEmailSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || isSubmitting) return;
        
        setIsSubmitting(true);
        try {
            await signInWithEmailLink(email);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div style={{ 
                display: 'flex', 
                height: '100vh', 
                alignItems: 'center', 
                justifyContent: 'center', 
                color: 'var(--text-primary)', 
                background: 'var(--app-bg)',
                backdropFilter: 'blur(5px)'
            }}>
                <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    gap: 30,
                    animation: 'fadeIn 0.5s ease-out'
                }}>
                    <div style={{
                        width: 150,
                        height: 150,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 70%)',
                        borderRadius: '50%',
                        padding: 20
                    }}>
                        <img 
                            src={logoWhite} 
                            alt="CAMELOTDJ" 
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                objectFit: 'contain', 
                                filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.2))',
                                animation: 'pulse 2s infinite ease-in-out'
                            }} 
                        />
                    </div>
                    <div style={{ 
                        position: 'relative', 
                        width: 180, 
                        height: 4, 
                        background: 'rgba(255,255,255,0.1)', 
                        borderRadius: 4, 
                        overflow: 'hidden',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ 
                            position: 'absolute', 
                            top: 0, 
                            left: 0, 
                            height: '100%', 
                            width: '30%', 
                            background: 'linear-gradient(to right, var(--brand-primary), var(--brand-secondary))', 
                            borderRadius: 4, 
                            animation: 'loading 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite' 
                        }}></div>
                    </div>
                </div>
                <style>{`
                    @keyframes loading {
                        0% { left: -30%; width: 30%; }
                        50% { width: 30%; }
                        100% { left: 100%; width: 30%; }
                    }
                    @keyframes pulse {
                        0% { opacity: 0.8; transform: scale(0.98); }
                        50% { opacity: 1; transform: scale(1); }
                        100% { opacity: 0.8; transform: scale(0.98); }
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    @keyframes progress {
                        0% { left: -30%; width: 30%; }
                        50% { width: 30%; }
                        100% { left: 100%; width: 30%; }
                    }
                `}</style>
            </div>
        );
    }

    if (!user) {
        return (
            <div style={{ position: 'relative', display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)', backgroundImage: 'radial-gradient(circle at 50% 10%, rgba(100, 100, 255, 0.08), transparent 50%)' }}>
                <div style={{
                    width: 420,
                    padding: 40,
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 20,
                    boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset'
                }}>
                    {isDesktop && (
                        <div style={{
                            position: 'absolute',
                            top: 10,
                            right: 10,
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: 'rgba(255, 255, 255, 0.7)',
                            padding: '4px 8px',
                            borderRadius: 4,
                            fontSize: 12,
                        }}>
                            Desktop Mode
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 36 }}>
                        <div style={{ width: 150, height: 150, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                            <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', background: 'radial-gradient(circle at center, rgba(100, 100, 255, 0.1), transparent 70%)', filter: 'blur(15px)' }}></div>
                            <img src={logoWhite} alt="CAMELOTDJ" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))' }} />
                        </div>
                    </div>

                    <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 22, marginBottom: 12, letterSpacing: '0.01em', textAlign: 'center' }}>Welcome back</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 32, lineHeight: 1.5, textAlign: 'center', maxWidth: '90%', margin: '0 auto 32px' }}>Sign in to access your music library and playlists.</div>

                    {!showEmailOption ? (
                        <div>
                            <button
                                onClick={() => handleSignIn('primary')}
                                disabled={isSubmitting}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 14,
                                    padding: '16px 24px',
                                    background: isSubmitting ? 'rgba(255,255,255,0.8)' : 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
                                    color: '#111827',
                                    border: 'none',
                                    borderRadius: 14,
                                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                    fontWeight: 600,
                                    fontSize: 15,
                                    letterSpacing: 0.3,
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.08)',
                                    transition: 'all 0.2s ease',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    WebkitTapHighlightColor: 'transparent',
                                    marginBottom: showFallbackOptions ? 12 : 0,
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSubmitting) {
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.08)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSubmitting) {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.08)';
                                    }
                                }}
                            >
                            {isSubmitting ? (
                                <div style={{ position: 'relative', width: 24, height: 24 }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" style={{ animation: 'spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite', position: 'absolute', top: 0, left: 0 }}>
                                        <circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,0.15)" strokeWidth="2.5" fill="none"/>
                                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#4285F4" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                                    </svg>
                                </div>
                            ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, position: 'relative' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24" height="24" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.05))' }}>
                                    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12 s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C33.64,6.053,29.083,4,24,4C12.955,4,4,12.955,4,24 s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                                    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,16.108,18.961,13,24,13c3.059,0,5.842,1.154,7.961,3.039 l5.657-5.657C33.64,6.053,29.083,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                                    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36 c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
                                    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.094,5.571 c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.982,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
                                </svg>
                            </div>
                            )}
                            <span style={{ fontWeight: 600, position: 'relative', zIndex: 2 }}>
                                {isSubmitting ? 'Signing in...' : 'Sign in with Google'}
                            </span>
                        </button>

                        {/* Fallback Authentication Options */}
                        {showFallbackOptions && (
                            <div style={{ marginTop: 16, padding: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12, textAlign: 'center' }}>
                                    Having trouble signing in? Try these alternatives:
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                                    <button
                                        onClick={() => handleSignIn('popup')}
                                        disabled={isSubmitting}
                                        style={{
                                            width: '100%',
                                            padding: '12px 16px',
                                            background: 'rgba(59, 130, 246, 0.1)',
                                            color: 'var(--text-primary)',
                                            border: '1px solid rgba(59, 130, 246, 0.3)',
                                            borderRadius: 8,
                                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                            fontSize: 14,
                                            fontWeight: 500,
                                        }}
                                    >
                                        Try Popup Login
                                    </button>
                                    <button
                                        onClick={() => handleSignIn('redirect')}
                                        disabled={isSubmitting}
                                        style={{
                                            width: '100%',
                                            padding: '12px 16px',
                                            background: 'rgba(16, 185, 129, 0.1)',
                                            color: 'var(--text-primary)',
                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                            borderRadius: 8,
                                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                            fontSize: 14,
                                            fontWeight: 500,
                                        }}
                                    >
                                        Try Browser Redirect
                                    </button>
                                    <button
                                        onClick={() => setShowEmailOption(true)}
                                        disabled={isSubmitting}
                                        style={{
                                            width: '100%',
                                            padding: '12px 16px',
                                            background: 'rgba(168, 85, 247, 0.1)',
                                            color: 'var(--text-primary)',
                                            border: '1px solid rgba(168, 85, 247, 0.3)',
                                            borderRadius: 8,
                                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                            fontSize: 14,
                                            fontWeight: 500,
                                        }}
                                    >
                                        Try Email Link
                                    </button>
                                </div>
                            </div>
                        )}
                        </div>

                    ) : (
                        <form onSubmit={handleEmailSignIn} style={{ width: '100%' }}>
                            <div style={{ marginBottom: 16, textAlign: 'center' }}>
                                <div style={{ color: 'var(--text-primary)', fontSize: 16, marginBottom: 8 }}>Sign in with Email Link</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
                                    We'll send a sign-in link to your email
                                </div>
                            </div>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    borderRadius: 8,
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(0,0,0,0.2)',
                                    color: 'var(--text-primary)',
                                    fontSize: 16,
                                    marginBottom: 16,
                                    outline: 'none',
                                }}
                                required
                            />
                            <button
                                type="submit"
                                disabled={isSubmitting || !email}
                                style={{
                                    width: '100%',
                                    padding: '14px 24px',
                                    background: isSubmitting ? 'rgba(59, 130, 246, 0.5)' : 'var(--brand-primary)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 8,
                                    cursor: isSubmitting || !email ? 'not-allowed' : 'pointer',
                                    fontWeight: 600,
                                    fontSize: 16,
                                    marginBottom: 16,
                                }}
                            >
                                {isSubmitting ? 'Sending...' : 'Send Sign-in Link'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowEmailOption(false)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: 'transparent',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    fontSize: 14,
                                }}
                            >
                                Back to Google Sign-in
                            </button>
                        </form>
                    )}

                    {error && (
                        <div style={{ 
                            color: 'rgb(220, 38, 38)', 
                            marginTop: 16, 
                            padding: '12px 16px',
                            backgroundColor: 'rgba(220, 38, 38, 0.08)',
                            borderRadius: 10,
                            fontSize: 14,
                            fontWeight: 500,
                            lineHeight: 1.4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                        }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                            <div>
                                {error}
                                {error.includes('unauthorized-domain') && isDesktop && (
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#f87171' }}>
                                        Desktop app authentication requires additional configuration. 
                                        Try using the email sign-in option by clicking the button below.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {error && error.includes('unauthorized-domain') && isDesktop && !showEmailOption && (
                        <button 
                            onClick={() => setShowEmailOption(true)}
                            style={{
                                marginTop: 12,
                                padding: '8px 16px',
                                background: 'rgba(59, 130, 246, 0.1)',
                                color: '#3b82f6',
                                border: '1px solid rgba(59, 130, 246, 0.2)',
                                borderRadius: 8,
                                cursor: 'pointer',
                                fontSize: 14,
                                width: '100%',
                            }}
                        >
                            Try Email Sign-in Instead
                        </button>
                    )}

                    <div style={{ marginTop: 24, color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', lineHeight: 1.6, letterSpacing: '0.03em' }}>
                        By continuing, you agree to our <a href="#" style={{ color: 'var(--brand-primary)', textDecoration: 'none', fontWeight: 500, borderBottom: '1px dotted var(--brand-primary)', paddingBottom: 1, transition: 'opacity 0.2s ease' }}>Terms of Service</a> and <a href="#" style={{ color: 'var(--brand-primary)', textDecoration: 'none', fontWeight: 500, borderBottom: '1px dotted var(--brand-primary)', paddingBottom: 1, transition: 'opacity 0.2s ease' }}>Privacy Policy</a>
                    </div>
                </div>

                {(isSubmitting || loading) && (
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-secondary), var(--accent-purple))', opacity: 0.8, animation: 'progress 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite', boxShadow: '0 0 8px rgba(0,0,0,0.2)' }} />
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
            <div style={{ position: 'fixed', top: 0, right: 0, display: 'flex', alignItems: 'center', gap: 10, zIndex: 1000, height: 48, padding: '0 16px', background: 'var(--header-bg)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.displayName || user.email}</span>
                <button 
                    onClick={signOutUser} 
                    style={{ 
                        padding: '6px 12px', 
                        background: 'var(--elevated-bg)', 
                        border: '1px solid var(--border-color)', 
                        color: 'var(--text-primary)', 
                        borderRadius: 6, 
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 500,
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--hover-bg)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--elevated-bg)';
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    Sign out
                </button>
            </div>
            {children}
        </div>
    );
};

export default AuthGate;


