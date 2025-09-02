# Google OAuth Setup for External Browser Authentication

This guide explains how to set up Google OAuth for the VS Code/Cursor-style external browser authentication flow.

## Step 1: Create Google OAuth Client

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: `camelotdj-f5efd`
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client IDs**
5. Choose **Desktop application** as the application type
6. Name it: `CAMELOTDJ Desktop App`
7. Click **Create**

## Step 2: Configure OAuth Client

After creating the client, you'll get:
- **Client ID**: `899064011372-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com`
- **Client Secret**: `GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx`

## Step 3: Update Configuration

### Option A: Environment Variables (Recommended)
1. Copy `env.example` to `.env.local`:
   ```bash
   cp env.example .env.local
   ```

2. Edit `.env.local` and replace the placeholder values:
   ```bash
   GOOGLE_OAUTH_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=your-actual-client-secret
   ```

### Option B: Direct Code Update
Replace the placeholder values in `main/index.ts`:

```typescript
// Replace these values with your actual OAuth client credentials
client_id: 'your-actual-client-id.apps.googleusercontent.com',
client_secret: 'your-actual-client-secret',
```

## Step 4: Configure Authorized Redirect URIs

In your OAuth client settings, add these redirect URIs:
- `camelotdj://auth-callback`
- `http://localhost:3000/__/auth/handler` (for development)

## Step 5: Environment Variables (Optional)

Create a `.env.local` file with:

```bash
REACT_APP_GOOGLE_OAUTH_CLIENT_ID=899064011372-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
REACT_APP_GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
```

## How It Works

1. **User clicks "Sign in with Google"** in the Electron app
2. **App generates PKCE parameters** for enhanced security (OAuth 2.0 PKCE)
3. **App opens system browser** with Google OAuth URL + PKCE challenge
4. **User authenticates** in their default browser
5. **Google redirects** to `camelotdj://auth-callback` with auth code
6. **Electron app receives** the callback via custom protocol
7. **App exchanges** auth code + PKCE verifier for tokens
8. **App signs into Firebase** with the received tokens

### Security Features

- **PKCE (Proof Key for Code Exchange)**: Prevents authorization code interception attacks
- **Custom Protocol**: Secure redirect mechanism for desktop apps
- **Token Cleanup**: Code verifiers are immediately destroyed after use
- **Scope Validation**: Only requests necessary permissions (email, profile)

## Testing

1. **Development**: `npm run start`
2. **Production**: `npm run build` then open the app
3. Click "Sign in with Google" → should open your browser
4. Complete login in browser → should return to app automatically

## Troubleshooting

### "Invalid redirect_uri" Error
- Ensure `camelotdj://auth-callback` is in your OAuth client's authorized redirect URIs
- Check that the client ID matches exactly

### "Client ID not found" Error
- Verify the client ID in `main/index.ts` matches your OAuth client
- Ensure the OAuth client is in the same Google Cloud project as your Firebase project

### Protocol Handler Issues
- On macOS: The app should register the `camelotdj://` protocol automatically
- On Windows: May need to run as administrator for protocol registration
- On Linux: May need to create desktop entry for protocol handling

## Security Notes

- **Client Secret**: Keep this secure, but it's okay to include in desktop apps
- **Redirect URI**: The custom protocol `camelotdj://` is secure for desktop apps
- **Tokens**: Received tokens are used immediately to sign into Firebase, not stored

## References

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Electron Protocol Handler](https://www.electronjs.org/docs/latest/api/protocol)
- [Firebase Auth with Custom Tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens)
