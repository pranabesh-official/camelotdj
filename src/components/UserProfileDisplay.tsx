import React, { useState, useEffect } from 'react';
import { useAuth } from '../services/AuthContext';
import UserProfileService, { UserProfile } from '../services/UserProfileService';

interface UserProfileDisplayProps {
  showStageName?: boolean;
  showExperience?: boolean;
  showGenres?: boolean;
  compact?: boolean;
  className?: string;
}

const UserProfileDisplay: React.FC<UserProfileDisplayProps> = ({
  showStageName = true,
  showExperience = false,
  showGenres = false,
  compact = false,
  className = ''
}) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const userProfileService = UserProfileService.getInstance();
        const userProfile = await userProfileService.getUserProfile(user);
        setProfile(userProfile);
      } catch (error) {
        console.error('Error loading user profile:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  if (loading) {
    return (
      <div className={className} style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: 'var(--text-secondary)',
        fontSize: compact ? '12px' : '14px'
      }}>
        <div style={{
          width: compact ? '12px' : '16px',
          height: compact ? '12px' : '16px',
          border: '2px solid var(--border-color)',
          borderTop: '2px solid var(--brand-blue)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        Loading...
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const getExperienceColor = (level: string) => {
    switch (level) {
      case 'beginner': return 'var(--accent-green)';
      case 'intermediate': return 'var(--accent-yellow)';
      case 'advanced': return 'var(--accent-orange)';
      case 'professional': return 'var(--brand-blue)';
      default: return 'var(--text-tertiary)';
    }
  };

  const getExperienceLabel = (level: string) => {
    switch (level) {
      case 'beginner': return 'Beginner';
      case 'intermediate': return 'Intermediate';
      case 'advanced': return 'Advanced';
      case 'professional': return 'Professional';
      default: return level;
    }
  };

  if (compact) {
    return (
      <div className={className} style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: 'var(--text-primary)',
        fontSize: '12px',
        fontWeight: '500'
      }}>
        {showStageName && (
          <span style={{ color: 'var(--brand-blue)' }}>
            {profile.stageName}
          </span>
        )}
        {showExperience && (
          <span style={{ 
            color: getExperienceColor(profile.experienceLevel),
            fontSize: '10px',
            padding: '2px 6px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '4px'
          }}>
            {getExperienceLabel(profile.experienceLevel)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={className} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      color: 'var(--text-primary)'
    }}>
      {showStageName && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ 
            fontSize: '16px', 
            fontWeight: '600',
            color: 'var(--brand-blue)'
          }}>
            {profile.stageName}
          </span>
          {profile.realName && profile.realName !== profile.stageName && (
            <span style={{ 
              fontSize: '14px', 
              color: 'var(--text-secondary)',
              fontStyle: 'italic'
            }}>
              ({profile.realName})
            </span>
          )}
        </div>
      )}

      {showExperience && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ 
            fontSize: '12px', 
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Level:
          </span>
          <span style={{ 
            fontSize: '12px',
            color: getExperienceColor(profile.experienceLevel),
            padding: '2px 8px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '4px',
            fontWeight: '500'
          }}>
            {getExperienceLabel(profile.experienceLevel)}
          </span>
        </div>
      )}

      {showGenres && profile.musicGenres.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          marginTop: '4px'
        }}>
          {profile.musicGenres.slice(0, 3).map((genre, index) => (
            <span
              key={index}
              style={{
                fontSize: '10px',
                color: 'var(--text-secondary)',
                padding: '2px 6px',
                background: 'var(--elevated-bg)',
                borderRadius: '4px',
                border: '1px solid var(--border-color)'
              }}
            >
              {genre}
            </span>
          ))}
          {profile.musicGenres.length > 3 && (
            <span style={{
              fontSize: '10px',
              color: 'var(--text-tertiary)',
              padding: '2px 6px'
            }}>
              +{profile.musicGenres.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default UserProfileDisplay;
