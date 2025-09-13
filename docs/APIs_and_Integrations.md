# 🎵 Mixed In Key - APIs and Integrations Documentation

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Python Backend API](#python-backend-api)
4. [React Frontend Integration](#react-frontend-integration)
5. [External Service Integrations](#external-service-integrations)
6. [WebSocket Communication](#websocket-communication)
7. [Authentication & Security](#authentication--security)
8. [Database Integration](#database-integration)
9. [File Management](#file-management)
10. [Development Setup](#development-setup)
11. [API Reference](#api-reference)

## 🎯 Overview

Mixed In Key is a professional desktop music analysis application built with:
- **Frontend**: React + TypeScript + Electron
- **Backend**: Python Flask + GraphQL + WebSocket
- **Database**: SQLite (local) + Firebase Firestore (cloud sync)
- **Authentication**: Firebase Auth + Google OAuth
- **External APIs**: YouTube Music API, YouTube Download APIs

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React App     │    │  Python Flask   │    │   External      │
│   (Electron)    │◄──►│   Backend       │◄──►│   Services      │
│                 │    │                 │    │                 │
│ • UI Components │    │ • GraphQL API   │    │ • YouTube API   │
│ • State Mgmt    │    │ • REST Endpoints│    │ • Firebase      │
│ • WebSocket     │    │ • WebSocket     │    │ • Supabase      │
│ • File Upload   │    │ • Music Analysis│    │ • USB Detection │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Local Storage │    │   SQLite DB     │    │   Cloud Sync    │
│                 │    │                 │    │                 │
│ • Settings      │    │ • Music Library │    │ • User Data     │
│ • Cache         │    │ • Playlists     │    │ • Track Metadata│
│ • Downloads     │    │ • Analysis Data │    │ • Preferences   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🐍 Python Backend API

### Core Framework
- **Flask**: Web framework with CORS support
- **GraphQL**: Primary API interface using Graphene
- **WebSocket**: Real-time communication via Flask-SocketIO
- **SQLite**: Local database for music library and metadata

### Key Components

#### 1. GraphQL API (`/graphql/`)
```graphql
type Query {
  awake: String
  hello(signingkey: String!): String
  calc(signingkey: String!, math: String!): String
  echo(signingkey: String!, text: String!): String
  analyze_music(signingkey: String!, file_path: String!): String
  get_compatible_keys(signingkey: String!, camelot_key: String!): String
}
```

#### 2. REST Endpoints

**Music Analysis**
- `POST /upload-analyze` - Upload and analyze music files
- `POST /analyze-file` - Analyze existing files by path
- `GET /compatible-keys` - Get harmonically compatible keys

**Library Management**
- `GET /library` - Get all music files
- `GET /library/stats` - Get library statistics
- `POST /library/verify` - Verify file existence
- `DELETE /library/delete` - Delete song by ID
- `DELETE /library/delete-by-path` - Delete song by file path
- `PUT /library/update-metadata` - Update song metadata
- `POST /library/rename-file` - Rename song file
- `POST /library/update-tags` - Update ID3 tags
- `POST /library/batch-update-tags` - Batch update tags
- `POST /library/force-update-tags` - Force update existing songs

**Playlist Management**
- `GET /playlists` - Get all playlists
- `POST /playlists` - Create new playlist
- `GET /playlists/<id>` - Get specific playlist
- `PUT /playlists/<id>` - Update playlist
- `DELETE /playlists/<id>` - Delete playlist
- `POST /playlists/<id>/songs` - Add song to playlist
- `DELETE /playlists/<id>/songs/<song_id>` - Remove song from playlist

**YouTube Integration**
- `GET /youtube/trending` - Get trending suggestions
- `POST /youtube/autocomplete` - Get search autocomplete
- `POST /youtube/search` - Search YouTube videos
- `POST /youtube/download` - Download YouTube audio
- `POST /youtube/download-enhanced` - Enhanced download with progress
- `POST /youtube/cancel-download` - Cancel active download
- `GET /youtube/preview/<video_id>` - Preview video metadata
- `GET /youtube/stream/<video_id>` - Stream audio preview

**USB & Export**
- `GET /api/usb/devices` - Get USB devices
- `POST /api/usb/export` - Export playlist to USB

**Settings & Utilities**
- `GET /settings/download-path` - Get download path
- `POST /settings/download-path` - Set download path
- `DELETE /settings/download-path` - Clear download path
- `GET /waveform/<filename>` - Serve waveform images
- `GET /audio/<filename>` - Serve audio files
- `GET /hello` - Health check

### Music Analysis Engine

**Core Libraries:**
- `librosa`: Audio analysis and feature extraction
- `essentia`: Advanced music information retrieval
- `mutagen`: ID3 tag manipulation
- `pydub`: Audio processing

**Analysis Features:**
- **Key Detection**: Combined Essentia KeyExtractor + Librosa chroma analysis
- **BPM Analysis**: Essentia RhythmExtractor2013 with Librosa verification
- **Energy Calculation**: Multi-factor analysis including RMS, spectral features
- **Camelot Mapping**: Automatic conversion to harmonic mixing notation

## ⚛️ React Frontend Integration

### Core Services

#### 1. DatabaseService (`src/services/DatabaseService.ts`)
```typescript
export class DatabaseService {
  private apiPort: number;
  private apiSigningKey: string;
  
  // Library Management
  async getLibrary(statusFilter?: string): Promise<any[]>
  async getLibraryStats(): Promise<LibraryStats>
  async verifyLibrary(): Promise<{found: number; missing: number; total: number}>
  
  // Playlist Management
  async getPlaylists(): Promise<any[]>
  async createPlaylist(playlistData: PlaylistData): Promise<any>
  async updatePlaylist(playlistId: string, updates: PlaylistUpdates): Promise<any>
  async deletePlaylist(playlistId: string): Promise<void>
  
  // Settings
  async saveDownloadPath(path: string): Promise<void>
  async getDownloadPath(): Promise<string | null>
}
```

#### 2. Authentication Context (`src/services/AuthContext.tsx`)
```typescript
export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: (method?: 'primary' | 'popup' | 'redirect') => Promise<void>;
  signOutUser: () => Promise<void>;
  checkIsDesktopEnvironment: () => boolean;
}
```

#### 3. Track Sync Service (`src/services/TrackSyncService.ts`)
```typescript
export interface TrackMetadataPayload {
  id: string;
  filename: string;
  file_path?: string;
  key?: string;
  scale?: string;
  key_name?: string;
  camelot_key?: string;
  bpm?: number;
  energy_level?: number;
  duration?: number;
  file_size?: number;
  bitrate?: number;
  analysis_date?: string;
  cue_points?: number[];
  track_id?: string;
  id3?: any;
}

// Firebase sync functions
export async function upsertUserTrack(userId: string, track: TrackMetadataPayload): Promise<void>
export async function upsertManyUserTracks(userId: string, tracks: TrackMetadataPayload[]): Promise<void>
export async function saveToAnalysisSongs(userId: string, track: TrackMetadataPayload): Promise<void>
```

### API Integration Patterns

#### 1. File Upload & Analysis
```typescript
const handleFileUpload = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('signingkey', apiSigningKey);

  const response = await fetch(`http://127.0.0.1:${apiPort}/upload-analyze`, {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  // Handle analysis results
};
```

#### 2. WebSocket Integration
```typescript
// Real-time download progress
const socket = io(`http://127.0.0.1:${apiPort}`);
socket.on('download_progress', (data) => {
  setDownloadProgress(data);
});
```

#### 3. GraphQL Integration
```typescript
const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new HttpLink({
    uri: `http://127.0.0.1:${apiPort}/graphql/`,
  }),
});
```

## 🔌 External Service Integrations

### 1. Firebase Integration

**Configuration** (`src/firebase.ts`):
```typescript
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};
```

**Services Used:**
- **Authentication**: Google OAuth, email/password
- **Firestore**: User data, track metadata, playlists
- **Analytics**: Usage tracking and performance metrics
- **Storage**: File uploads and media assets

**Data Structure:**
```
users/{userId}/
├── tracks/{trackId}/
│   ├── filename: string
│   ├── key: string
│   ├── bpm: number
│   ├── energy_level: number
│   └── analysis_date: timestamp
├── playlists/{playlistId}/
│   ├── name: string
│   ├── description: string
│   ├── songs: array
│   └── created_at: timestamp
└── _meta/
    └── health/
        ├── ok: boolean
        └── at: timestamp

analysis_songs/{trackId}/
├── user_id: string
├── title: string
├── artist: string
├── album: string
├── key: string
├── bpm: number
└── energy_level: number
```

### 2. Supabase Integration

**Configuration** (`src/services/supabaseClient.ts`):
```typescript
import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const anon = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = url && anon ? createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true }
}) : null;
```

**Features:**
- Real-time subscriptions
- Row-level security
- PostgreSQL database
- Built-in authentication

### 3. YouTube Music API Integration

**Libraries Used:**
- `ytmusicapi`: YouTube Music API wrapper
- `pytube`: YouTube video download
- `yt-dlp`: Enhanced YouTube downloader

**Endpoints:**
```python
# Search and autocomplete
@app.route('/youtube/trending', methods=['GET'])
@app.route('/youtube/autocomplete', methods=['POST'])
@app.route('/youtube/search', methods=['POST'])

# Download and streaming
@app.route('/youtube/download', methods=['POST'])
@app.route('/youtube/download-enhanced', methods=['POST'])
@app.route('/youtube/stream/<video_id>', methods=['GET'])
@app.route('/youtube/preview/<video_id>', methods=['GET'])
```

**Features:**
- Search YouTube Music catalog
- Download audio in multiple formats
- Real-time download progress
- Audio quality verification
- Metadata extraction and enhancement

## 🔌 WebSocket Communication

### Real-time Features

**Connection Management:**
```python
@socketio.on('connect')
def handle_connect():
    client_id = getattr(request, 'sid', 'unknown')
    emit('connected', {'status': 'Connected to download server'})

@socketio.on('disconnect')
def handle_disconnect():
    # Clean up active downloads
    if client_id in active_downloads:
        del active_downloads[client_id]
```

**Download Progress:**
```python
@socketio.on('join_download')
def handle_join_download(data):
    download_id = data.get('download_id')
    # Send current progress if download is active
    if download_id in active_downloads:
        emit('download_progress', active_downloads[download_id])
```

**USB Device Detection:**
```python
@socketio.on('get_usb_devices')
def handle_get_usb_devices():
    devices = get_usb_devices()
    emit('usb_devices', {'devices': devices})
```

### Frontend WebSocket Usage

```typescript
// Initialize WebSocket connection
const socket = io(`http://127.0.0.1:${apiPort}`);

// Listen for events
socket.on('download_progress', (data) => {
  setDownloadProgress(data);
});

socket.on('usb_devices', (data) => {
  setUsbDevices(data.devices);
});

// Emit events
socket.emit('join_download', { download_id: 'unique_id' });
socket.emit('get_usb_devices');
```

## 🔐 Authentication & Security

### Authentication Flow

1. **Google OAuth**: Primary authentication method
2. **Firebase Auth**: Token management and session persistence
3. **API Signing**: All backend requests require signing key

### Security Measures

**API Signing Key:**
```python
def get_request_signing_key():
    return (
        request.headers.get('X-Signing-Key')
        or request.args.get('signingkey')
        or request.form.get('signingkey')
        or request.get_json().get('signingkey')
    )
```

**CORS Configuration:**
```python
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}}, 
     expose_headers=["X-Signing-Key"])
```

**Environment Variables:**
```bash
# Required for Firebase
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_domain
REACT_APP_FIREBASE_PROJECT_ID=your_project_id

# Required for Google OAuth
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
```

## 🗄️ Database Integration

### SQLite Database (Local)

**Tables:**
- `music_files`: Main music library
- `playlists`: User playlists
- `playlist_songs`: Playlist-song relationships
- `scan_locations`: Remembered scan paths
- `settings`: Application settings

**Database Manager** (`python/database_manager.py`):
```python
class DatabaseManager:
    def init_database(self)
    def add_music_file(self, file_path: str, metadata: dict)
    def get_music_files(self, status_filter: str = None)
    def update_file_status(self, file_path: str, status: str)
    def create_playlist(self, name: str, description: str = None)
    def get_playlists(self)
    def add_song_to_playlist(self, playlist_id: int, music_file_id: int)
```

### Firebase Firestore (Cloud)

**Collections:**
- `users/{userId}/tracks/{trackId}`: User-specific track data
- `users/{userId}/playlists/{playlistId}`: User playlists
- `analysis_songs/{trackId}`: Global analysis data
- `users/{userId}/_meta/health`: Health check data

## 📁 File Management

### File Operations

**Upload & Analysis:**
```python
@app.route('/upload-analyze', methods=['POST'])
def upload_and_analyze():
    file = request.files['file']
    # Save file, analyze, update database, sync to cloud
```

**ID3 Tag Updates:**
```python
@app.route('/library/update-tags', methods=['POST'])
def update_song_tags():
    # Update ID3 tags with analysis results
    # Format: "100BPM_11A_songname"
```

**File Renaming:**
```python
@app.route('/library/rename-file', methods=['POST'])
def rename_song_file():
    # Rename files to analysis format
    # Example: "song.mp3" → "128BPM_8A_song.mp3"
```

### Supported Formats

**Audio Formats:**
- MP3, WAV, FLAC, AAC, OGG, M4A

**Analysis Output:**
- Key detection (Camelot notation)
- BPM analysis
- Energy level (1-10)
- Duration and file size
- ID3 tag updates

## 🛠️ Development Setup

### Prerequisites

**Node.js Dependencies:**
```json
{
  "dependencies": {
    "react": "^16.8.4",
    "firebase": "^12.1.0",
    "@supabase/supabase-js": "^2.56.0",
    "socket.io-client": "^4.8.1",
    "apollo-client": "^2.5.1",
    "graphql": "^14.2.0"
  }
}
```

**Python Dependencies:**
```txt
flask
flask-cors
flask-graphql
graphene
librosa
essentia
mutagen
pydub
ytmusicapi
pytube
yt-dlp
```

### Environment Configuration

**Create `.env.local`:**
```bash
cp env.example .env.local
# Edit with your Firebase and Google OAuth credentials
```

**Start Development:**
```bash
# Start Python backend
./start_backend.sh

# Start React frontend
npm start

# Or start both concurrently
npm run dev
```

### API Testing

**GraphQL Interface:**
```
http://127.0.0.1:5002/graphiql/
```

**Health Check:**
```bash
curl -X POST "http://127.0.0.1:5002/graphql/" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ awake }"}'
```

## 📚 API Reference

### GraphQL Schema

```graphql
type Query {
  awake: String
  hello(signingkey: String!): String
  calc(signingkey: String!, math: String!): String
  echo(signingkey: String!, text: String!): String
  analyze_music(signingkey: String!, file_path: String!): String
  get_compatible_keys(signingkey: String!, camelot_key: String!): String
}
```

### REST Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload-analyze` | Upload and analyze music file |
| POST | `/analyze-file` | Analyze existing file |
| GET | `/library` | Get music library |
| GET | `/library/stats` | Get library statistics |
| POST | `/library/verify` | Verify file existence |
| POST | `/playlists` | Create playlist |
| GET | `/playlists` | Get all playlists |
| POST | `/youtube/search` | Search YouTube |
| POST | `/youtube/download` | Download YouTube audio |
| GET | `/api/usb/devices` | Get USB devices |
| POST | `/api/usb/export` | Export to USB |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `connect` | Server → Client | Connection established |
| `disconnect` | Server → Client | Connection lost |
| `download_progress` | Server → Client | Download progress update |
| `usb_devices` | Server → Client | USB device list |
| `join_download` | Client → Server | Join download session |
| `get_usb_devices` | Client → Server | Request USB devices |

### Error Handling

**Common Error Responses:**
```json
{
  "status": "error",
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

**HTTP Status Codes:**
- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized (invalid signing key)
- `404`: Not Found
- `500`: Internal Server Error

---

## 🚀 Getting Started

1. **Clone the repository**
2. **Install dependencies**: `npm install && pip install -r requirements.txt`
3. **Configure environment**: Copy `env.example` to `.env.local`
4. **Start backend**: `./start_backend.sh`
5. **Start frontend**: `npm start`
6. **Access application**: `http://localhost:3001`

For detailed setup instructions, see the main README files in the project root.

---

*This documentation covers the complete API and integration architecture of the Mixed In Key application. For specific implementation details, refer to the source code in the respective directories.*

