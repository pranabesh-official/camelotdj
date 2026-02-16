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
    totalMixTime: number;
    favoriteGenres: string[];
  };
}

// Local storage key
const PROFILE_STORAGE_KEY = 'camelotdj_user_profile';

export class UserProfileService {
  private static instance: UserProfileService;

  public static getInstance(): UserProfileService {
    if (!UserProfileService.instance) {
      UserProfileService.instance = new UserProfileService();
    }
    return UserProfileService.instance;
  }

  /**
   * Get user profile from Local Storage
   */
  async getUserProfile(user: any): Promise<UserProfile | null> {
    const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Error parsing stored profile', e);
      }
    }

    // Default profile
    return {
      stageName: '',
      realName: '',
      email: '',
      experienceLevel: 'professional',
      musicGenres: [],
      preferredBPM: { min: 120, max: 140 },
      setupComplete: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async saveUserProfile(user: any, profileData: Partial<UserProfile>): Promise<void> {
    const current = await this.getUserProfile(user);
    const updated = { ...current, ...profileData, updatedAt: new Date().toISOString() };
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated));
  }

  async hasCompletedOnboarding(user: any): Promise<boolean> {
    return true; // Skipping onboarding in simple mode
  }

  async updateUserStats(user: any, statsUpdate: Partial<UserProfile['stats']>): Promise<void> {
    const profile = await this.getUserProfile(user);
    if (profile) {
      profile.stats = { ...profile.stats, ...statsUpdate } as any;
      await this.saveUserProfile(user, profile);
    }
  }

  async updateUserPreferences(user: any, preferences: Partial<UserProfile['preferences']>): Promise<void> {
    const profile = await this.getUserProfile(user);
    if (profile) {
      profile.preferences = { ...profile.preferences, ...preferences } as any;
      await this.saveUserProfile(user, profile);
    }
  }

  async getUserPreferredBPM(user: any): Promise<{ min: number; max: number }> {
    const profile = await this.getUserProfile(user);
    return profile?.preferredBPM || { min: 120, max: 140 };
  }

  async getUserPreferredGenres(user: any): Promise<string[]> {
    const profile = await this.getUserProfile(user);
    return profile?.musicGenres || [];
  }

  async initializeDefaultProfile(user: any): Promise<void> {
    const defaultProfile: UserProfile = {
      stageName: '',
      email: '',
      experienceLevel: 'professional',
      musicGenres: [],
      preferredBPM: { min: 120, max: 140 },
      setupComplete: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(defaultProfile));
  }
}

export default UserProfileService;
