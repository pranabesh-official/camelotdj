# Onboarding Feature

## Overview
The onboarding feature provides a comprehensive first-time user experience that collects essential DJ profile information and integrates seamlessly with Firebase Firestore.

## Features

### 1. Multi-Step Onboarding Flow
- **Welcome Screen**: Introduction to CAMELOTDJ with feature highlights
- **Stage Name Setup**: Collect DJ stage name and optional real name
- **Experience Level**: Beginner, Intermediate, Advanced, or Professional
- **Music Genres**: Multi-select from 25+ popular genres
- **BPM Preferences**: Set preferred tempo range for track suggestions
- **Profile Summary**: Review and confirm all settings

### 2. Firebase Firestore Integration
- **User Profiles Collection**: Stores complete user profile data
- **Security Rules**: Users can only access their own profile data
- **Real-time Sync**: Profile data syncs across all devices
- **Default Profiles**: Automatic initialization for new users

### 3. Profile Data Structure
```typescript
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
  // Additional fields for future features
  bio?: string;
  location?: string;
  socialLinks?: { instagram?, twitter?, soundcloud?, spotify? };
  preferences?: { theme?, notifications?, autoSync?, defaultBPMRange? };
  stats?: { totalTracksAnalyzed?, totalPlaylistsCreated?, totalMixTime?, favoriteGenres? };
}
```

## Components

### OnboardingScreen.tsx
- Main onboarding component with step-by-step flow
- Form validation and error handling
- Responsive design matching app theme
- Progress indicator and navigation

### UserProfileService.ts
- Service class for all profile operations
- CRUD operations for user profiles
- Stats tracking and preferences management
- Error handling and fallbacks

### UserProfileDisplay.tsx
- Reusable component for showing profile information
- Compact and full display modes
- Stage name, experience level, and genre display
- Loading states and error handling

## Integration

### Authentication Flow
1. User signs in with Google
2. System checks if profile exists in Firestore
3. If no profile or incomplete, shows onboarding
4. After completion, user proceeds to main app
5. Profile data is used throughout the app

### App Integration
- **AuthGate**: Checks onboarding status and shows screen
- **Header**: Displays user's stage name instead of email
- **Future Features**: Profile data can be used for:
  - Personalized track recommendations
  - Genre-based filtering
  - BPM range suggestions
  - Experience-appropriate features

## Styling
- Follows existing app theme (dark mode)
- Uses CSS variables for consistent colors
- Responsive design for different screen sizes
- Smooth animations and transitions
- Professional DJ-focused aesthetic

## Security
- Firestore security rules ensure users can only access their own data
- Profile data is validated before saving
- Error handling prevents data corruption
- Graceful fallbacks for network issues

## Future Enhancements
- Profile editing after onboarding
- Social features (following other DJs)
- Advanced preferences (theme, notifications)
- Statistics dashboard
- Profile sharing and discovery
- Integration with social media platforms

## Usage

### For Developers
```typescript
// Get user profile
const userProfileService = UserProfileService.getInstance();
const profile = await userProfileService.getUserProfile(user);

// Check onboarding status
const hasCompleted = await userProfileService.hasCompletedOnboarding(user);

// Update profile
await userProfileService.saveUserProfile(user, { stageName: 'New Name' });
```

### For Users
1. Sign in with Google
2. Complete the 6-step onboarding process
3. Your profile is automatically saved
4. Start using CAMELOTDJ with personalized experience

## Files Modified
- `src/components/OnboardingScreen.tsx` (new)
- `src/services/UserProfileService.ts` (new)
- `src/components/UserProfileDisplay.tsx` (new)
- `src/components/AuthGate.tsx` (updated)
- `firestore.rules` (updated)
