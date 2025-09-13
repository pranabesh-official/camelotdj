import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from 'firebase/auth';

export interface UserProfile {
  stageName: string;
  realName?: string;
  email: string;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'professional';
  musicGenres: string[];
  preferredBPM: { min: number; max: number };
  setupComplete: boolean;
  createdAt: any;
  updatedAt: any;
  // Additional profile fields
  bio?: string;
  location?: string;
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    soundcloud?: string;
    spotify?: string;
  };
  preferences?: {
    theme: 'dark' | 'light' | 'auto';
    notifications: boolean;
    autoSync: boolean;
    defaultBPMRange: { min: number; max: number };
  };
  stats?: {
    totalTracksAnalyzed: number;
    totalPlaylistsCreated: number;
    totalMixTime: number; // in minutes
    favoriteGenres: string[];
  };
}

export class UserProfileService {
  private static instance: UserProfileService;
  
  public static getInstance(): UserProfileService {
    if (!UserProfileService.instance) {
      UserProfileService.instance = new UserProfileService();
    }
    return UserProfileService.instance;
  }

  /**
   * Get user profile from Firestore
   */
  async getUserProfile(user: User): Promise<UserProfile | null> {
    try {
      const userDoc = await getDoc(doc(db, 'userProfiles', user.uid));
      if (userDoc.exists()) {
        return userDoc.data() as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Error getting user profile:', error);
      throw new Error('Failed to get user profile');
    }
  }

  /**
   * Create or update user profile
   */
  async saveUserProfile(user: User, profileData: Partial<UserProfile>): Promise<void> {
    try {
      const profileRef = doc(db, 'userProfiles', user.uid);
      
      // Check if profile exists
      const existingProfile = await this.getUserProfile(user);
      
      const profileToSave = {
        ...profileData,
        email: user.email || '',
        updatedAt: serverTimestamp(),
        ...(existingProfile ? {} : { createdAt: serverTimestamp() })
      };

      await setDoc(profileRef, profileToSave, { merge: true });
    } catch (error) {
      console.error('Error saving user profile:', error);
      throw new Error('Failed to save user profile');
    }
  }

  /**
   * Check if user has completed onboarding
   */
  async hasCompletedOnboarding(user: User): Promise<boolean> {
    try {
      const profile = await this.getUserProfile(user);
      return profile?.setupComplete || false;
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      return false;
    }
  }

  /**
   * Update user stats (called after actions like analyzing tracks, creating playlists)
   */
  async updateUserStats(user: User, statsUpdate: Partial<UserProfile['stats']>): Promise<void> {
    try {
      const profileRef = doc(db, 'userProfiles', user.uid);
      const currentProfile = await this.getUserProfile(user);
      
      const updatedStats = {
        ...currentProfile?.stats,
        ...statsUpdate,
        updatedAt: serverTimestamp()
      };

      await updateDoc(profileRef, {
        stats: updatedStats,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating user stats:', error);
      // Don't throw error for stats updates as they're not critical
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(user: User, preferences: Partial<UserProfile['preferences']>): Promise<void> {
    try {
      const profileRef = doc(db, 'userProfiles', user.uid);
      const currentProfile = await this.getUserProfile(user);
      
      const updatedPreferences = {
        ...currentProfile?.preferences,
        ...preferences,
        updatedAt: serverTimestamp()
      };

      await updateDoc(profileRef, {
        preferences: updatedPreferences,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating user preferences:', error);
      throw new Error('Failed to update user preferences');
    }
  }

  /**
   * Get user's preferred BPM range for track suggestions
   */
  async getUserPreferredBPM(user: User): Promise<{ min: number; max: number }> {
    try {
      const profile = await this.getUserProfile(user);
      return profile?.preferredBPM || { min: 120, max: 140 };
    } catch (error) {
      console.error('Error getting user BPM preferences:', error);
      return { min: 120, max: 140 };
    }
  }

  /**
   * Get user's preferred music genres for filtering
   */
  async getUserPreferredGenres(user: User): Promise<string[]> {
    try {
      const profile = await this.getUserProfile(user);
      return profile?.musicGenres || [];
    } catch (error) {
      console.error('Error getting user genre preferences:', error);
      return [];
    }
  }

  /**
   * Initialize default profile for new user
   */
  async initializeDefaultProfile(user: User): Promise<void> {
    try {
      const defaultProfile: Partial<UserProfile> = {
        stageName: user.displayName || 'DJ',
        realName: user.displayName || '',
        email: user.email || '',
        experienceLevel: 'beginner',
        musicGenres: [],
        preferredBPM: { min: 120, max: 140 },
        setupComplete: false,
        preferences: {
          theme: 'dark',
          notifications: true,
          autoSync: true,
          defaultBPMRange: { min: 120, max: 140 }
        },
        stats: {
          totalTracksAnalyzed: 0,
          totalPlaylistsCreated: 0,
          totalMixTime: 0,
          favoriteGenres: []
        }
      };

      await this.saveUserProfile(user, defaultProfile);
    } catch (error) {
      console.error('Error initializing default profile:', error);
      throw new Error('Failed to initialize user profile');
    }
  }
}

export default UserProfileService;
