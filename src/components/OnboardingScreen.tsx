import React, { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../services/AuthContext';
import UserProfileService from '../services/UserProfileService';
import logoWhite from '../assets/logwhite.png';

interface UserProfile {
  stageName: string;
  realName?: string;
  email: string;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'professional';
  musicGenres: string[];
  preferredBPM: { min: number; max: number };
  setupComplete: boolean;
  createdAt: any;
  updatedAt: any;
}

interface OnboardingScreenProps {
  onComplete: () => void;
}

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Safe event handler to prevent null target errors
  const handleInputChange = (field: keyof UserProfile, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };
  
  const [profile, setProfile] = useState<UserProfile>({
    stageName: '',
    realName: user?.displayName || '',
    email: user?.email || '',
    experienceLevel: 'beginner',
    musicGenres: [],
    preferredBPM: { min: 120, max: 140 },
    setupComplete: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  const musicGenres = [
    'House', 'Techno', 'Trance', 'Progressive', 'Deep House',
    'Tech House', 'Minimal', 'Dubstep', 'Drum & Bass', 'Breakbeat',
    'Ambient', 'Downtempo', 'Chillout', 'Lounge', 'Disco',
    'Funk', 'Soul', 'Jazz', 'Hip Hop', 'R&B', 'Pop', 'Rock',
    'Electronic', 'Experimental', 'Other'
  ];

  const experienceLevels = [
    { value: 'beginner', label: 'Beginner', description: 'New to DJing, learning the basics' },
    { value: 'intermediate', label: 'Intermediate', description: 'Some experience, comfortable with mixing' },
    { value: 'advanced', label: 'Advanced', description: 'Experienced DJ, can handle complex transitions' },
    { value: 'professional', label: 'Professional', description: 'Professional DJ, performing regularly' }
  ];

  const steps = [
    { title: 'Your Stage Name', subtitle: 'What should we call you?' },
    { title: 'Experience Level', subtitle: 'How would you describe your DJing experience?' },
    { title: 'Music Genres', subtitle: 'What genres do you play?' },
    { title: 'All Set!', subtitle: 'Your profile is ready to go' }
  ];

  useEffect(() => {
    // Initialize default profile for new user
    const initializeProfile = async () => {
      if (!user) return;
      
      try {
        const userProfileService = UserProfileService.getInstance();
        const existingProfile = await userProfileService.getUserProfile(user);
        
        if (!existingProfile) {
          // Initialize default profile
          await userProfileService.initializeDefaultProfile(user);
        } else if (existingProfile.setupComplete) {
          onComplete();
          return;
        }
      } catch (error) {
        console.error('Error initializing profile:', error);
      }
    };

    // Small delay to ensure smooth transition
    const timer = setTimeout(() => {
      initializeProfile();
    }, 100);

    return () => clearTimeout(timer);
  }, [user, onComplete]);

  const handleSaveProfile = async () => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      const userProfileService = UserProfileService.getInstance();
      const userProfileData = {
        ...profile,
        setupComplete: true
      };

      await userProfileService.saveUserProfile(user, userProfileData);
      
      // Trigger database cleanup after profile save
      await triggerDatabaseCleanup();
      
      onComplete();
    } catch (error: any) {
      console.error('Error saving profile:', error);
      setError('Failed to save your profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const triggerDatabaseCleanup = async () => {
    try {
      console.log('🧹 Triggering database cleanup after onboarding...');
      
      // Get API port and signing key from the app context
      const apiPort = 5002; // Default port
      const apiSigningKey = 'devkey'; // Default key
      
      // Call the database clear endpoint
      const response = await fetch(`http://127.0.0.1:${apiPort}/database/clear-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signing-Key': apiSigningKey
        },
        body: JSON.stringify({})
      });

      if (response.ok) {
        console.log('✅ Database cleaned successfully after onboarding');
      } else {
        console.warn('⚠️ Database cleanup failed, but continuing with onboarding');
      }
    } catch (error) {
      console.warn('⚠️ Database cleanup error (non-critical):', error);
      // Don't fail onboarding if cleanup fails
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSaveProfile();
    }
  };

  const handleSkip = () => {
    // Set default values and complete onboarding quickly
    setProfile(prev => ({
      ...prev,
      stageName: prev.stageName || 'DJ',
      experienceLevel: prev.experienceLevel || 'intermediate',
      musicGenres: prev.musicGenres.length > 0 ? prev.musicGenres : ['Electronic']
    }));
    
    // Complete onboarding immediately
    handleSaveProfile();
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleGenreToggle = (genre: string) => {
    setProfile(prev => ({
      ...prev,
      musicGenres: prev.musicGenres.includes(genre)
        ? prev.musicGenres.filter(g => g !== genre)
        : [...prev.musicGenres, genre]
    }));
    
    // Auto-advance after selecting at least one genre
    setTimeout(() => {
      if (currentStep === 2 && !profile.musicGenres.includes(genre)) {
        const newGenres = [...profile.musicGenres, genre];
        if (newGenres.length > 0) {
          handleNext();
        }
      }
    }, 800);
  };


  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div style={{ maxWidth: '400px', margin: '0 auto' }}>
            <h2 style={{ 
              color: 'var(--text-primary)', 
              fontSize: '24px', 
              fontWeight: '700', 
              marginBottom: '8px',
              textAlign: 'center'
            }}>
              What's your stage name?
            </h2>
            <p style={{ 
              color: 'var(--text-secondary)', 
              fontSize: '16px', 
              marginBottom: '32px',
              textAlign: 'center'
            }}>
              This is how you'll be known in the DJ community
            </p>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ 
                display: 'block', 
                color: 'var(--text-primary)', 
                fontSize: '13px', 
                fontWeight: '500', 
                marginBottom: '6px' 
              }}>
                Stage Name *
              </label>
              <input
                type="text"
                value={profile.stageName}
                onChange={(e) => {
                  e.persist();
                  const value = e.target?.value || '';
                  handleInputChange('stageName', value);
                }}
                placeholder="Enter your stage name"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontWeight: '400',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--brand-blue)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(74, 144, 226, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border-color)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ 
                display: 'block', 
                color: 'var(--text-primary)', 
                fontSize: '13px', 
                fontWeight: '500', 
                marginBottom: '6px' 
              }}>
                Real Name (Optional)
              </label>
              <input
                type="text"
                value={profile.realName || ''}
                onChange={(e) => {
                  e.persist();
                  const value = e.target?.value || '';
                  handleInputChange('realName', value);
                }}
                placeholder="Enter your real name"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontWeight: '400',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--brand-blue)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(74, 144, 226, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border-color)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>
        );

      case 1:
        return (
          <div style={{ maxWidth: '500px', margin: '0 auto' }}>
            <h2 style={{ 
              color: 'var(--text-primary)', 
              fontSize: '24px', 
              fontWeight: '700', 
              marginBottom: '8px',
              textAlign: 'center'
            }}>
              What's your experience level?
            </h2>
            <p style={{ 
              color: 'var(--text-secondary)', 
              fontSize: '16px', 
              marginBottom: '32px',
              textAlign: 'center'
            }}>
              This helps us customize your experience
            </p>
            <div style={{ display: 'grid', gap: '12px' }}>
              {experienceLevels.map((level) => (
                <button
                  key={level.value}
                  onClick={() => handleExperienceLevelSelect(level.value as 'beginner' | 'intermediate' | 'advanced' | 'professional')}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: profile.experienceLevel === level.value 
                      ? '2px solid var(--brand-blue)' 
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    background: profile.experienceLevel === level.value 
                      ? 'rgba(74, 144, 226, 0.1)' 
                      : 'rgba(255, 255, 255, 0.02)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: profile.experienceLevel === level.value 
                      ? '0 4px 12px rgba(74, 144, 226, 0.15)' 
                      : '0 2px 8px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseEnter={(e) => {
                    if (profile.experienceLevel !== level.value) {
                      e.currentTarget.style.background = 'var(--hover-bg)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (profile.experienceLevel !== level.value) {
                      e.currentTarget.style.background = 'var(--card-bg)';
                    }
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: profile.experienceLevel === level.value 
                      ? '2px solid var(--brand-blue)' 
                      : '2px solid var(--border-color)',
                    background: profile.experienceLevel === level.value 
                      ? 'var(--brand-blue)' 
                      : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {profile.experienceLevel === level.value && (
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'white'
                      }} />
                    )}
                  </div>
                  <div>
                    <div style={{ 
                      fontWeight: '600', 
                      fontSize: '16px', 
                      marginBottom: '4px' 
                    }}>
                      {level.label}
                    </div>
                    <div style={{ 
                      fontSize: '14px', 
                      color: 'var(--text-secondary)' 
                    }}>
                      {level.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      case 2:
        return (
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h2 style={{ 
              color: 'var(--text-primary)', 
              fontSize: '24px', 
              fontWeight: '700', 
              marginBottom: '8px',
              textAlign: 'center'
            }}>
              What genres do you play?
            </h2>
            <p style={{ 
              color: 'var(--text-secondary)', 
              fontSize: '16px', 
              marginBottom: '32px',
              textAlign: 'center'
            }}>
              Select all that apply (you can change this later)
            </p>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
              gap: '8px',
              marginBottom: '24px'
            }}>
              {musicGenres.map((genre) => (
                <button
                  key={genre}
                  onClick={() => handleGenreToggle(genre)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: profile.musicGenres.includes(genre) 
                      ? '2px solid var(--brand-blue)' 
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    background: profile.musicGenres.includes(genre) 
                      ? 'rgba(74, 144, 226, 0.1)' 
                      : 'rgba(255, 255, 255, 0.02)',
                    color: profile.musicGenres.includes(genre) 
                      ? 'var(--brand-blue)' 
                      : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                    textAlign: 'center',
                    boxShadow: profile.musicGenres.includes(genre) 
                      ? '0 3px 12px rgba(74, 144, 226, 0.15)' 
                      : '0 1px 4px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseEnter={(e) => {
                    if (!profile.musicGenres.includes(genre)) {
                      e.currentTarget.style.background = 'var(--hover-bg)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!profile.musicGenres.includes(genre)) {
                      e.currentTarget.style.background = 'var(--card-bg)';
                    }
                  }}
                >
                  {genre}
                </button>
              ))}
            </div>
            {profile.musicGenres.length > 0 && (
              <div style={{
                background: 'rgba(74, 144, 226, 0.1)',
                border: '1px solid rgba(74, 144, 226, 0.2)',
                borderRadius: '8px',
                padding: '12px 16px',
                textAlign: 'center'
              }}>
                <span style={{ color: 'var(--brand-blue)', fontSize: '14px', fontWeight: '500' }}>
                  {profile.musicGenres.length} genre{profile.musicGenres.length !== 1 ? 's' : ''} selected
                </span>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div style={{ textAlign: 'center', maxWidth: '500px', margin: '0 auto' }}>
            <div style={{ 
              width: 100, 
              height: 100, 
              margin: '0 auto 32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'radial-gradient(circle, rgba(0, 208, 132, 0.1), transparent 70%)',
              borderRadius: '50%',
              padding: 20
            }}>
              <svg 
                width="60" 
                height="60" 
                viewBox="0 0 24 24" 
                fill="none" 
                style={{ color: 'var(--accent-green)' }}
              >
                <path 
                  d="M9 12l2 2 4-4" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
                <circle 
                  cx="12" 
                  cy="12" 
                  r="10" 
                  stroke="currentColor" 
                  strokeWidth="2"
                />
              </svg>
            </div>
            <h2 style={{ 
              color: 'var(--text-primary)', 
              fontSize: '28px', 
              fontWeight: '700', 
              marginBottom: '16px',
              letterSpacing: '-0.02em'
            }}>
              All Set, {profile.stageName}!
            </h2>
            <p style={{ 
              color: 'var(--text-secondary)', 
              fontSize: '16px', 
              lineHeight: '1.6',
              marginBottom: '32px'
            }}>
              Your DJ profile is ready. You can now start analyzing music, creating playlists, and mixing like a pro!
            </p>
            <div style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '32px'
            }}>
              <h3 style={{ 
                color: 'var(--text-primary)', 
                fontSize: '16px', 
                fontWeight: '600', 
                marginBottom: '12px' 
              }}>
                Profile Summary
              </h3>
              <div style={{ 
                color: 'var(--text-secondary)', 
                fontSize: '14px',
                lineHeight: '1.6'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Stage Name:</strong> {profile.stageName}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Experience:</strong> {experienceLevels.find(l => l.value === profile.experienceLevel)?.label}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Genres:</strong> {profile.musicGenres.length > 0 ? profile.musicGenres.join(', ') : 'None selected'}
                </div>
                <div>
                  <strong>BPM Range:</strong> {profile.preferredBPM.min} - {profile.preferredBPM.max}
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return profile.stageName.trim().length > 0;
      case 1:
        return ['beginner', 'intermediate', 'advanced', 'professional'].includes(profile.experienceLevel);
      case 2:
        return profile.musicGenres.length > 0;
      case 3:
        return true; // Profile summary step
      default:
        return true;
    }
  };

  // Auto-advance for simple steps to make onboarding faster
  const handleExperienceLevelSelect = (level: 'beginner' | 'intermediate' | 'advanced' | 'professional') => {
    setProfile(prev => ({ ...prev, experienceLevel: level }));
    
    // Auto-advance after selection with a short delay
    setTimeout(() => {
      if (currentStep === 1) {
        handleNext();
      }
    }, 500);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'var(--app-bg)',
      backgroundImage: `
        radial-gradient(circle at 20% 20%, rgba(74, 144, 226, 0.15) 0%, transparent 50%),
        radial-gradient(circle at 80% 80%, rgba(168, 85, 247, 0.12) 0%, transparent 50%),
        radial-gradient(circle at 40% 60%, rgba(0, 208, 132, 0.08) 0%, transparent 50%)
      `,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
      fontFamily: 'var(--font-primary)',
      animation: 'fadeIn 0.5s ease-out'
    }}>
      {/* Animated background elements */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `
          radial-gradient(circle at 30% 30%, rgba(74, 144, 226, 0.05) 0%, transparent 60%),
          radial-gradient(circle at 70% 70%, rgba(168, 85, 247, 0.04) 0%, transparent 60%)
        `,
        animation: 'backgroundFloat 20s ease-in-out infinite'
      }} />
      
      <div style={{
        width: '100%',
        maxWidth: '600px',
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        boxShadow: `
          0 20px 40px rgba(0, 0, 0, 0.3),
          0 0 0 1px rgba(255, 255, 255, 0.05)
        `,
        overflow: 'hidden',
        position: 'relative',
        animation: 'slideInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Header */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '24px 32px',
          textAlign: 'center',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              background: 'linear-gradient(135deg, var(--brand-blue) 0%, var(--accent-purple) 100%)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              fontWeight: '700',
              color: 'white'
            }}>
              {currentStep + 1}
            </div>
            <h1 style={{ 
              color: 'var(--text-primary)', 
              fontSize: '22px', 
              fontWeight: '700', 
              margin: 0,
              letterSpacing: '-0.01em'
            }}>
              {steps[currentStep].title}
            </h1>
          </div>
          <p style={{ 
            color: 'var(--text-secondary)', 
            fontSize: '14px',
            fontWeight: '400',
            margin: 0,
            opacity: 0.8
          }}>
            {steps[currentStep].subtitle}
          </p>
        </div>

        {/* Progress Bar */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          height: '3px',
          position: 'relative'
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${((currentStep + 1) / steps.length) * 100}%`,
            background: 'linear-gradient(90deg, var(--brand-blue) 0%, var(--accent-purple) 100%)',
            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            borderRadius: '0 2px 2px 0'
          }} />
        </div>

        {/* Content */}
        <div style={{
          padding: '32px',
          minHeight: '320px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}>
          <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
            {renderStepContent()}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '0 32px 16px',
            color: 'var(--accent-red)',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '20px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            style={{
              padding: '10px 20px',
              background: currentStep === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.03)',
              color: currentStep === 0 ? 'var(--text-disabled)' : 'var(--text-primary)',
              border: currentStep === 0 ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s ease',
              opacity: currentStep === 0 ? 0.5 : 1
            }}
          >
            Back
          </button>

          <div style={{ 
            color: 'var(--text-tertiary)', 
            fontSize: '12px' 
          }}>
            Step {currentStep + 1} of {steps.length}
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {currentStep < steps.length - 1 && (
              <button
                onClick={handleSkip}
                disabled={isLoading}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-secondary)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  opacity: isLoading ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  }
                }}
              >
                Skip Setup
              </button>
            )}

            <button
              onClick={handleNext}
              disabled={!canProceed() || isLoading}
              style={{
                padding: '10px 24px',
                background: !canProceed() || isLoading 
                  ? 'rgba(255, 255, 255, 0.1)' 
                  : 'linear-gradient(135deg, var(--brand-blue) 0%, var(--accent-purple) 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: !canProceed() || isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: !canProceed() || isLoading 
                ? 'none' 
                : '0 4px 16px rgba(74, 144, 226, 0.2)'
            }}
          >
            {isLoading ? (
              <>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Saving...
              </>
            ) : currentStep === steps.length - 1 ? (
              'Get Started'
            ) : (
              'Next'
            )}
          </button>
        </div>
      </div>
    </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes fadeIn {
          from { 
            opacity: 0; 
            transform: translateY(20px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }
        
        @keyframes slideInUp {
          from { 
            opacity: 0; 
            transform: translateY(40px) scale(0.95); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0) scale(1); 
          }
        }
        
        @keyframes backgroundFloat {
          0%, 100% { 
            transform: translateX(0) translateY(0); 
          }
          25% { 
            transform: translateX(10px) translateY(-10px); 
          }
          50% { 
            transform: translateX(-5px) translateY(5px); 
          }
          75% { 
            transform: translateX(5px) translateY(-5px); 
          }
        }
        
        @keyframes progressGlow {
          0%, 100% { 
            opacity: 0.3; 
          }
          50% { 
            opacity: 0.8; 
          }
        }
        
        /* Button hover effects */
        button:hover:not(:disabled) {
          transform: translateY(-2px) !important;
          box-shadow: 0 12px 40px rgba(74, 144, 226, 0.4) !important;
        }
        
        /* Input focus effects */
        input:focus {
          border-color: var(--brand-blue) !important;
          box-shadow: 0 0 0 4px rgba(74, 144, 226, 0.1) !important;
          transform: translateY(-1px) !important;
        }
      `}</style>
    </div>
  );
};

export default OnboardingScreen;
