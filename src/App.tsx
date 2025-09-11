import './App.css';
import FileUpload from './components/FileUpload';
import CamelotWheel from './components/CamelotWheel';
import AnalysisResults from './components/AnalysisResults';
import AnalysisQueue, { QueuedFile } from './components/AnalysisQueue';
import AudioPlayer from './components/AudioPlayer';
import PlaylistManager, { Playlist } from './components/PlaylistManager';
import TrackTable from './components/TrackTable';
import YouTubeMusic from './components/YouTubeMusic';
import USBExport from './components/USBExport';
// import AIAgent from './components/AIAgent';
// import LibraryStatus from './components/LibraryStatus';
import DatabaseService from './services/DatabaseService';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Volume2 } from 'lucide-react';
import AuthGate from './components/AuthGate';
import { useAuth } from './services/AuthContext';
import { upsertUserTrack, upsertManyUserTracks, saveToAnalysisSongs } from './services/TrackSyncService';
import { getMatchingQueryPlaylists, isSongInPlaylist, getUniqueSongs, validatePlaylistSongs } from './utils/queryPlaylistUtils';
import logoWhite from './assets/logwhite.png';

export interface Song {
    id: string;
    filename: string;
    file_path?: string;
    title?: string; // Song title
    artist?: string; // Artist name
    key?: string;
    scale?: string;
    key_name?: string;
    camelot_key?: string;
    bpm?: number;
    energy_level?: number;
    duration?: number;
    file_size?: number;
    bitrate?: number; // In kbps
    status?: string;
    analysis_date?: string;
    cue_points?: number[];
    track_id?: string; // Unique track identifier
    id3?: any; // Raw ID3/metadata blob for cloud sync
    cover_art?: string; // Base64 encoded cover art image
    cover_art_extracted?: boolean; // Flag to track if cover art has been extracted
    // Enhanced analysis tracking
    analysis_status?: 'pending' | 'analyzing' | 'completed' | 'failed';
    id3_tags_written?: boolean;
    last_analysis_attempt?: string;
    analysis_attempts?: number;
    file_hash?: string;
    prevent_reanalysis?: boolean;
}

// Function to get the correct logo path for both development and production
const getLogoPath = () => {
    // Return the bundled asset path resolved by Webpack
    return logoWhite as unknown as string;
};

// Alternative approach: Use a simple text logo if image fails
const LogoComponent = () => {
    const [imageError, setImageError] = useState(false);
    
    if (imageError) {
        return <div className="logo-text">CAMELOTDJ</div>;
    }
    
    return (
        <img 
            src={getLogoPath()} 
            alt="CAMELOTDJ" 
            className="logo-image"
            onError={() => setImageError(true)}
        />
    );
};

const App: React.FC = () => {
    const { user } = useAuth();
    console.log('App component rendering...');
    const [songs, setSongs] = useState<Song[]>([]);
    const [selectedSong, setSelectedSong] = useState<Song | null>(null);
    const [currentlyPlaying, setCurrentlyPlaying] = useState<Song | null>(null);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
    const [apiPort, setApiPort] = useState(5002); // Default fallback
    const [apiSigningKey, setApiSigningKey] = useState("devkey"); // Default fallback
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [currentView, setCurrentView] = useState<'library' | 'upload' | 'wheel' | 'settings' | 'youtube'>('library');
    const [isElectronMode, setIsElectronMode] = useState(false);
    const [showCompatibleOnly, setShowCompatibleOnly] = useState(false);
    const [databaseService, setDatabaseService] = useState<DatabaseService | null>(null);
    const [isLibraryLoaded, setIsLibraryLoaded] = useState(false);
    const [isCoverArtExtractionComplete, setIsCoverArtExtractionComplete] = useState(true);
    
    // Audio Player Settings
    const [volume, setVolume] = useState(1);
    
    // Auto Mix Settings
    const [isAutoMixEnabled, setIsAutoMixEnabled] = useState(false);
    const [autoMixPlaylist, setAutoMixPlaylist] = useState<Song[]>([]);
    const [isAutoMixLoading, setIsAutoMixLoading] = useState(false);
    const [autoMixError, setAutoMixError] = useState<string | null>(null);
    const [autoPlay, setAutoPlay] = useState(false);
    
    // YouTube Music Settings
    const [downloadPath, setDownloadPath] = useState<string>('');
    const [isDownloadPathSet, setIsDownloadPathSet] = useState(false);
    const [isLoadingSettings, setIsLoadingSettings] = useState(false);
    const [showSaveSuccess, setShowSaveSuccess] = useState(false);
    
    // Gemini API Settings
    // AI Agent related state - commented out for this version
    // const [geminiApiKey, setGeminiApiKey] = useState<string>('');
    // const [isGeminiApiKeySet, setIsGeminiApiKeySet] = useState(false);
    const [isLoadingGeminiSettings, setIsLoadingGeminiSettings] = useState(false);
    const [showGeminiSaveSuccess, setShowGeminiSaveSuccess] = useState(false);
    
    // Analysis Queue State
    const [analysisQueue, setAnalysisQueue] = useState<QueuedFile[]>([]);
    const [isProcessingQueue, setIsProcessingQueue] = useState(false);
    const [isQueuePaused, setIsQueuePaused] = useState(false);
    
    // USB Export State
    const [showUSBExport, setShowUSBExport] = useState(false);
    const [playlistToExport, setPlaylistToExport] = useState<Playlist | null>(null);
    const queueProcessingRef = useRef<boolean>(false);
    const downloadManagerRef = useRef<any>(null);
    const [listRefreshKey, setListRefreshKey] = useState<number>(0);

    const goToLibraryAndRefresh = useCallback(() => {
        setListRefreshKey(prev => prev + 1);
        setCurrentView('library');
    }, []);

    // Check if running in Electron and get API details
    useEffect(() => {
        const isElectron = !!(window as any).require;
        setIsElectronMode(isElectron);
        
        if (isElectron) {
            try {
                const { ipcRenderer } = (window as any).require('electron');
                
                // Request API details from Electron main process
                ipcRenderer.send('getApiDetails');
                
                // Listen for API details response
                ipcRenderer.on('apiDetails', (event: any, details: string) => {
                    try {
                        const apiInfo = JSON.parse(details);
                        console.log(' Received API details from Electron:', apiInfo);
                        setApiPort(apiInfo.port);
                        setApiSigningKey(apiInfo.signingKey);

                        // Also expose signing key via cookie so <audio> range requests include it
                        try {
                            document.cookie = `signingkey=${apiInfo.signingKey}; path=/; SameSite=Lax`;
                        } catch (e) {
                            console.warn('Failed to set signing key cookie', e);
                        }
                        
                        // Initialize database service with API details
                        const dbService = new DatabaseService(apiInfo.port, apiInfo.signingKey);
                        setDatabaseService(dbService);
                        
                        // Validate/clean first, then load library (longer delay for Electron)
                        validateAndCleanLibrary(dbService).finally(() => {
                            loadLibraryFromDatabase(dbService, 2000);
                        });
                    } catch (error) {
                        console.error('❌ Error parsing API details:', error);
                        // Fallback to default values
                        initializeDatabaseService();
                    }
                });
                
                // Listen for API details error
                ipcRenderer.on('apiDetailsError', (event: any, error: string) => {
                    console.error('❌ Error getting API details:', error);
                    // Initialize database service with default values as fallback
                    initializeDatabaseService();
                });
                
                // Timeout fallback in case IPC doesn't respond quickly
                // Give the backend more time on cold start and keep listening for late replies
                const ipcTimeout = setTimeout(() => {
                    console.warn('⚠️ IPC timeout, initializing with defaults while still waiting for apiDetails');
                    initializeDatabaseService();
                    // Proactively retry asking for details once more after a short delay
                    setTimeout(() => {
                        try {
                            ipcRenderer.send('getApiDetails');
                        } catch (e) {
                            console.warn('Retry getApiDetails failed', e);
                        }
                    }, 1500);
                }, 8000);
                
                // Cleanup listeners and timeout
                return () => {
                    clearTimeout(ipcTimeout);
                    ipcRenderer.removeAllListeners('apiDetails');
                    ipcRenderer.removeAllListeners('apiDetailsError');
                };
            } catch (error) {
                console.error('❌ Error setting up Electron IPC:', error);
                // Fallback to default initialization
                initializeDatabaseService();
            }
        } else {
            // Running in web mode, use default values
            initializeDatabaseService();
        }
    }, []);

    // Keep cookie in sync if key changes for any reason
    useEffect(() => {
        try {
            document.cookie = `signingkey=${apiSigningKey}; path=/; SameSite=Lax`;
        } catch (e) {
            console.warn('Failed to update signing key cookie', e);
        }
    }, [apiSigningKey]);

    // Validate and clean library before loading
    const validateAndCleanLibrary = React.useCallback(async (dbService: DatabaseService) => {
        try {
            console.log('🧹 Validating library and cleaning missing files...');
            // Ask backend to verify current files (best-effort)
            try {
                const stats = await dbService.verifyLibrary();
                console.log(`📊 Verification complete: total=${stats.total}, found=${stats.found}, missing=${stats.missing}`);
            } catch (verifyErr) {
                console.warn('⚠️ Library verification failed (continuing with cleanup):', verifyErr);
            }

            // Fetch songs marked as missing and delete them from DB
            try {
                const missingSongs = await dbService.getLibrary('missing');
                if (missingSongs && missingSongs.length > 0) {
                    console.log(`🗑️ Removing ${missingSongs.length} missing song(s) from database...`);
                    for (const ms of missingSongs) {
                        try {
                            if (ms.id) {
                                await dbService.deleteSong(ms.id.toString());
                            } else if (ms.file_path) {
                                await dbService.deleteSongByPath(ms.file_path);
                            }
                        } catch (delErr) {
                            console.warn('Failed to delete missing song record:', { id: ms.id, file_path: ms.file_path, error: delErr });
                        }
                    }
                    console.log('✅ Cleanup of missing songs completed.');
                } else {
                    console.log('✅ No missing songs to clean.');
                }
            } catch (missErr) {
                console.warn('⚠️ Could not query missing songs for cleanup:', missErr);
            }
        } catch (error) {
            console.warn('⚠️ Validation and cleanup encountered an issue (continuing):', error);
        }
    }, []);

    // Helper function to initialize database service with defaults
    const initializeDatabaseService = () => {
        console.log('🔧 Initializing database service with defaults...');
        const dbService = new DatabaseService(5002, 'devkey');
        setDatabaseService(dbService);
        // Validate/clean first, then load
        validateAndCleanLibrary(dbService).finally(() => {
            loadLibraryFromDatabase(dbService, 1500);
        });
    };

    // Load library from database
    const loadLibraryFromDatabase = useCallback(async (dbService: DatabaseService, delay: number = 1000) => {
        try {
            console.log('🔄 Loading music library from database...');
            
            // Wait for backend to be fully ready
            console.log(`⏱️ Waiting ${delay}ms for backend to be ready...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Test backend connectivity first
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                const testResponse = await fetch(`http://127.0.0.1:${apiPort}/graphql/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({query: '{ awake }'}),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!testResponse.ok) {
                    throw new Error(`Backend not ready: ${testResponse.status}`);
                }
                
                console.log(' Backend connectivity confirmed');
            } catch (connectError) {
                console.warn('Backend connectivity issue:', connectError);
                // Try again with longer delay
                if (delay < 5000) {
                    console.log('🔄 Retrying database load with longer delay...');
                    setTimeout(() => loadLibraryFromDatabase(dbService, delay + 1500), 2000);
                    return;
                }
                throw connectError;
            }
            
            // Load library songs
            const librarySongs = await dbService.loadLibraryFromDatabase();
            
            if (librarySongs && librarySongs.length > 0) {
                // Transform database songs to match Song interface
                const transformedSongs = librarySongs.map((song: any) => {
                    // Calculate estimated bitrate if not provided
                    let estimatedBitrate = song.bitrate;
                    if (!estimatedBitrate && song.file_size && song.duration) {
                        estimatedBitrate = Math.round((song.file_size * 8) / (song.duration * 1000));
                    }
                    if (!estimatedBitrate) {
                        estimatedBitrate = 320; // Default to high quality
                    }
                    
                    // Normalize metadata to avoid placeholder values like "Unknown Artist"
                    const isMeaningless = (val: any) => {
                        if (!val) return true;
                        const s = String(val).trim().toLowerCase();
                        return s === 'unknown' || s === 'unknown artist' || s === 'n/a' || s === 'null' || s === 'undefined';
                    };
                    const parseFromFilename = (filename?: string) => {
                        if (!filename) return { artist: undefined as any, title: undefined as any };
                        const base = filename.replace(/\.[^/.]+$/, '');
                        if (base.includes(' - ')) {
                            const [artistPart, ...rest] = base.split(' - ');
                            return { artist: artistPart, title: rest.join(' - ') };
                        }
                        return { artist: undefined as any, title: base };
                    };
                    const parsed = parseFromFilename(song.filename);
                    const normalizedTitle = !isMeaningless(song.title) ? song.title : ((song.id3 && !isMeaningless(song.id3.title) && song.id3.title) || parsed.title || song.filename);
                    const normalizedArtist = !isMeaningless(song.artist) ? song.artist : ((song.id3 && !isMeaningless(song.id3.artist) && song.id3.artist) || parsed.artist || 'Unknown Artist');

                    return {
                        id: song.id ? song.id.toString() : Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        filename: song.filename,
                        file_path: song.file_path,
                        title: normalizedTitle,
                        artist: normalizedArtist,
                        key: song.key,
                        scale: song.scale,
                        key_name: song.key_name,
                        camelot_key: song.camelot_key,
                        bpm: song.bpm,
                        energy_level: song.energy_level,
                        duration: song.duration,
                        file_size: song.file_size,
                        bitrate: estimatedBitrate,
                        status: song.status || 'found',
                        analysis_date: song.analysis_date,
                        cue_points: song.cue_points || [],
                        track_id: song.track_id // Ensure track_id is included
                    };
                });
                
                // If running in Electron, do a local filesystem existence check to hide missing files immediately
                let finalSongs = transformedSongs;
                try {
                    const isElectron = !!(window as any).require;
                    if (isElectron) {
                        const fs = (window as any).require('fs') as typeof import('fs');
                        const pathExists = (p?: string) => (p ? fs.existsSync(p) : false);
                        const missingNow = transformedSongs.filter(s => !pathExists(s.file_path));
                        if (missingNow.length > 0) {
                            console.log(`🧼 Filtering ${missingNow.length} locally-missing song(s) from UI and deleting in DB...`);
                            // Delete missing ones in the background to keep DB clean
                            (async () => {
                                for (const ms of missingNow) {
                                    try {
                                        if (ms.id) {
                                            await dbService.deleteSong(ms.id.toString());
                                        } else if (ms.file_path) {
                                            await dbService.deleteSongByPath(ms.file_path);
                                        }
                                    } catch (e) {
                                        console.warn('Background delete failed for:', { id: ms.id, file_path: ms.file_path, error: e });
                                    }
                                }
                            })();
                        }
                        finalSongs = transformedSongs.filter(s => pathExists(s.file_path));
                    }
                } catch (e) {
                    console.warn('Electron FS check failed or not available (continuing):', e);
                }

                setSongs(finalSongs);
                console.log(`🎵 Successfully loaded ${transformedSongs.length} songs from database:`);
                transformedSongs.forEach((song, i) => {
                    console.log(`   ${i+1}. ${song.filename} (${song.camelot_key})`);
                });
                
                // Load scan locations
                try {
                    const locations = await dbService.getScanLocations();
                    if (locations.length > 0) {
                        console.log(`📁 Found ${locations.length} remembered scan locations`);
                    }
                } catch (locError) {
                    console.warn('⚠️ Could not load scan locations:', locError);
                }
            } else {
                console.log('📭 No songs found in database - starting with empty library');
            }
            
            setIsLibraryLoaded(true);
        } catch (error) {
            console.error('❌ Failed to load library from database:', error);
            console.error('Error details:', {
                message: error instanceof Error ? error.message : String(error),
                apiPort: apiPort,
                hasDBService: !!dbService
            });
            setIsLibraryLoaded(true); // Continue with empty library
        }
    }, [apiPort]);

    // Backend connectivity monitoring
    React.useEffect(() => {
        const checkBackendHealth = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
                
                const response = await fetch(`http://127.0.0.1:${apiPort}/graphql/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({query: '{ awake }'}),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    console.warn('Backend health check failed:', response.status);
                }
            } catch (error) {
                console.warn('Backend connectivity issue detected:', error);
            }
        };

        // Check backend health every 60 seconds
        const healthCheckInterval = setInterval(checkBackendHealth, 60000);
        
        // Initial health check
        checkBackendHealth();

        return () => clearInterval(healthCheckInterval);
    }, [apiPort]);

    // Test backend connectivity
    const testBackendConnection = useCallback(async () => {
        try {
            console.log('Testing backend connection to port:', apiPort);
            const response = await fetch(`http://127.0.0.1:${apiPort}/graphql/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({query: '{ awake }'})
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('Backend connection test successful:', result);
                return true;
            } else {
                console.error('Backend connection test failed:', response.status, response.statusText);
                return false;
            }
        } catch (error) {
            console.error('Backend connection test error:', error);
            return false;
        }
    }, [apiPort]);

    // Small helper to keep Firestore docs <1MB by stripping large blobs
    const sanitizeId3 = (raw: any) => {
        if (!raw || typeof raw !== 'object') return raw;
        const clone: any = { ...raw };
        // common large keys from parsers
        delete clone.picture; 
        delete clone.pictures;
        delete clone.image;
        delete clone.images;
        delete clone.cover;
        delete clone.coverArt;
        delete clone.apic; // ID3 APIC frames
        return clone;
    };

    const handleFileUpload = useCallback(async (file: File) => {
        console.log('Starting file upload:', file.name, 'to port:', apiPort);
        
        // Check for duplicates before starting analysis
        const fileName = file.name.toLowerCase().trim();
        const fileSize = file.size;
        
        // Debug: Log single file upload check
        console.log('Single file upload check:', { fileName, fileSize });
        
        // Check if file is already in the queue
        const isInQueue = analysisQueue.some(queueItem => {
            const queueFileName = queueItem.file.name.toLowerCase().trim();
            return queueFileName === fileName && queueItem.file.size === fileSize;
        });
        
        // Check if file is already analyzed (in songs list)
        const isAlreadyAnalyzed = songs.some(song => {
            const songFileName = song.filename?.toLowerCase().trim();
            const sameName = songFileName === fileName;
            const sameSize = song.file_size === fileSize;
            const hasCompleteData = song.camelot_key && song.bpm && song.energy_level && song.duration;
            const isProcessed = song.status === 'completed' || song.analysis_date;
            
            return sameName && sameSize && (hasCompleteData || isProcessed);
        });
        
        // Debug: Log single file check result
        if (isInQueue || isAlreadyAnalyzed) {
            console.log(`Single file check: isInQueue=${isInQueue}, isAlreadyAnalyzed=${isAlreadyAnalyzed}`);
        }
        
        if (isInQueue) {
            alert(`File "${file.name}" is already in the analysis queue.`);
            return;
        }
        
        if (isAlreadyAnalyzed) {
            alert(`File "${file.name}" has already been analyzed.`);
            return;
        }
        
        setIsAnalyzing(true);
        
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
            try {
                // Test backend connection first
                const isConnected = await testBackendConnection();
                if (!isConnected) {
                    if (retryCount < maxRetries) {
                        console.log(`Backend connection failed, retrying in 2 seconds... (${retryCount + 1}/${maxRetries + 1})`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        retryCount++;
                        continue;
                    } else {
                        alert(`Backend server is not responding on port ${apiPort}.\n\nPlease ensure the Python backend is running by:\n1. Opening a terminal\n2. Running: ./start_backend.sh\n\nOr restart it manually with:\ncd python && python3 api.py --apiport 5002 --signingkey devkey`);
                        setIsAnalyzing(false);
                        return;
                    }
                }
                
                const formData = new FormData();
                formData.append('file', file);
                formData.append('signingkey', apiSigningKey);

                const uploadUrl = `http://127.0.0.1:${apiPort}/upload-analyze`;
                console.log('Upload URL:', uploadUrl);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout for large files
                
                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    body: formData,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                console.log('Response status:', response.status, 'statusText:', response.statusText);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const result = await response.json();
                console.log('Analysis result:', result);
                
                if (result.status === 'success' || result.status === 'existing_metadata') {
                    // Calculate estimated bitrate from file size and duration
                    let estimatedBitrate = result.bitrate;
                    if (!estimatedBitrate && result.file_size && result.duration) {
                        estimatedBitrate = Math.round((result.file_size * 8) / (result.duration * 1000));
                    }
                    if (!estimatedBitrate) {
                        estimatedBitrate = 320; // Default to high quality
                    }
                    
                    const newSong: Song = {
                        id: result.db_id ? result.db_id.toString() : Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        filename: result.filename,
                        file_path: result.file_path,
                        // Ensure UI components like PlaylistManager show correct metadata
                        title: (result.id3 && result.id3.title) || (result.metadata && result.metadata.title) || (result.tags && result.tags.title) || result.filename,
                        artist: (result.id3 && result.id3.artist) || (result.metadata && result.metadata.artist) || (result.tags && result.tags.artist) || 'Unknown Artist',
                        key: result.key,
                        scale: result.scale,
                        key_name: result.key_name,
                        camelot_key: result.camelot_key,
                        bpm: result.bpm,
                        energy_level: result.energy_level,
                        duration: result.duration,
                        file_size: result.file_size,
                        bitrate: estimatedBitrate,
                        status: 'analyzed',
                        analysis_date: new Date().toISOString(),
                        cue_points: result.cue_points || [],
                        track_id: result.track_id, // Ensure track_id is included
                        id3: sanitizeId3(result.id3 || result.metadata || result.tags)
                    };
                    
                    setSongs(prevSongs => {
                        // Check if song already exists
                        const exists = prevSongs.some(song => 
                            song.filename === newSong.filename && song.file_size === newSong.file_size
                        );
                        
                        if (exists) {
                            console.log(`Song ${newSong.filename} already exists in library, skipping add`);
                            return prevSongs;
                        }
                        
                        console.log(`Adding song to library: ${newSong.filename}`);
                        return [...prevSongs, newSong];
                    });
                    setSelectedSong(newSong);
                    goToLibraryAndRefresh();
                    console.log('Song added successfully:', newSong.filename);

                    // Firestore sync (offline-first; will upload when online)
                    try {
                        if (user?.uid && newSong.track_id) {
                            console.log('Syncing to Firestore:', { uid: user.uid, track_id: newSong.track_id });
                            // Save to user's tracks collection
                            await upsertUserTrack(user.uid, {
                                ...newSong,
                                id3: sanitizeId3(newSong.id3 || {})
                            } as any);
                            
                            // Also save to global analysis_songs collection
                            await saveToAnalysisSongs(user.uid, {
                                ...newSong,
                                id3: sanitizeId3(newSong.id3 || {})
                            } as any);
                            
                            console.log('Firestore sync successful');
                        } else if (user?.uid && !newSong.track_id) {
                            console.warn('Skipping Firestore sync - track_id is undefined for song:', newSong.filename);
                        } else {
                            console.warn('User not authenticated, skipping Firestore sync');
                        }
                    } catch (syncErr) {
                        console.error('Firestore track sync failed (will retry when online):', syncErr);
                    }
                    break; // Success, exit retry loop
                } else {
                    const errorMsg = `Analysis failed: ${result.error || result.error_message || 'Unknown error'}`;
                    console.error(errorMsg);
                    alert(errorMsg);
                    break; // Analysis error, don't retry
                }
            } catch (error) {
                console.error('Upload/analysis error details:', {
                    error: error,
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    apiPort: apiPort,
                    fileName: file.name,
                    retryCount: retryCount
                });
                
                if (retryCount < maxRetries && error instanceof Error && 
                    (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.name === 'AbortError' || error.message.includes('aborted'))) {
                    console.log(`Network error, retrying in 2 seconds... (${retryCount + 1}/${maxRetries + 1})`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    retryCount++;
                    continue;
                }
                
                let errorMessage = 'Upload failed';
                if (error instanceof Error) {
                    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                        errorMessage = `Cannot connect to backend server on port ${apiPort}.\n\nThe Python backend may have stopped. Please restart it using:\n./start_backend.sh`;
                    } else if (error.message.includes('timeout') || error.message.includes('AbortError') || error.message.includes('aborted')) {
                        errorMessage = `Upload timed out or was aborted. The file may be large or the backend is busy.\n\nWe now wait up to 120s per upload. Try again or ensure the backend is running.`;
                    } else {
                        errorMessage = `Upload failed: ${error.message}`;
                    }
                }
                alert(errorMessage);
                break; // Exit retry loop on non-network errors
            }
        }
        
        setIsAnalyzing(false);
    }, [apiSigningKey, apiPort, testBackendConnection, analysisQueue, songs]);

    // Analysis Queue Functions
    const addFilesToQueue = useCallback((files: File[]) => {
        // Debug: Log queue state
        console.log('Adding files to queue:', files.map(f => ({ name: f.name, size: f.size })));
        
        // Filter out duplicates
        const filteredFiles = files.filter(file => {
            const fileName = file.name.toLowerCase().trim();
            const fileSize = file.size;
            
            // Check if file is already in the queue (any status)
            const isInQueue = analysisQueue.some(queueItem => {
                const queueFileName = queueItem.file.name.toLowerCase().trim();
                return queueFileName === fileName && queueItem.file.size === fileSize;
            });
            
            // Check if file is already analyzed (in songs list)
            const isAlreadyAnalyzed = songs.some(song => {
                const songFileName = song.filename?.toLowerCase().trim();
                const sameName = songFileName === fileName;
                const sameSize = song.file_size === fileSize;
                const hasCompleteData = song.camelot_key && song.bpm && song.energy_level && song.duration;
                const isProcessed = song.status === 'completed' || song.analysis_date;
                
                return sameName && sameSize && (hasCompleteData || isProcessed);
            });
            
            // Debug: Log duplicate check result
            if (isInQueue || isAlreadyAnalyzed) {
                console.log(`File ${fileName}: isInQueue=${isInQueue}, isAlreadyAnalyzed=${isAlreadyAnalyzed}`);
            }
            
            return !isInQueue && !isAlreadyAnalyzed;
        });
        
        if (filteredFiles.length === 0) {
            // All files are duplicates
            const duplicateCount = files.length;
            alert(`All ${duplicateCount} file(s) are already in the queue or have been analyzed.`);
            return;
        }
        
        if (filteredFiles.length < files.length) {
            // Some files are duplicates
            const duplicateCount = files.length - filteredFiles.length;
            const addedCount = filteredFiles.length;
            alert(`${addedCount} file(s) added to queue. ${duplicateCount} file(s) skipped (already in queue or analyzed).`);
        }
        
        const newQueueItems: QueuedFile[] = filteredFiles.map(file => ({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            file,
            status: 'pending'
        }));
        
        setAnalysisQueue(prev => [...prev, ...newQueueItems]);
        
        // Start processing if not already running
        if (!queueProcessingRef.current) {
            processQueue();
        }
    }, [analysisQueue, songs]);

    const handleFolderUpload = useCallback(async (files: FileList) => {
        console.log('Folder upload - Total files:', files.length);
        
        const musicFiles = Array.from(files).filter(file => 
            file.type.startsWith('audio/') || 
            /\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(file.name)
        );

        console.log('Folder upload - Music files found:', musicFiles.length);
        console.log('Music files:', musicFiles.map(f => ({ name: f.name, type: f.type, size: f.size })));

        if (musicFiles.length === 0) {
            alert('No valid audio files found in the selected folder.');
            return;
        }

        // Process each file individually like single track upload
        for (const file of musicFiles) {
            try {
                console.log('Processing folder file:', file.name);
                await handleFileUpload(file);
                // Add a small delay between files to prevent overwhelming the backend
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error('Error processing folder file:', file.name, error);
                // Continue with next file even if one fails
            }
        }
    }, [handleFileUpload]);

    const processQueue = useCallback(async () => {
        if (queueProcessingRef.current || isQueuePaused) {
            return;
        }

        queueProcessingRef.current = true;
        setIsProcessingQueue(true);

        const processNextItem = async () => {
            // Get current queue state
            setAnalysisQueue(currentQueue => {
                const pendingItems = currentQueue.filter(item => item.status === 'pending');
                console.log('Queue processing - Total items:', currentQueue.length, 'Pending items:', pendingItems.length);
                
                if (pendingItems.length === 0) {
                    console.log('No pending items, stopping queue processing');
                    queueProcessingRef.current = false;
                    setIsProcessingQueue(false);
                    return currentQueue;
                }

                const currentItem = pendingItems[0];
                
                // Enhanced duplicate check using multiple criteria
                const fileName = currentItem.file.name.toLowerCase().trim();
                const fileSize = currentItem.file.size;
                
                // Check for duplicates using multiple criteria
                const isAlreadyAnalyzed = songs.some(song => {
                    const songFileName = song.filename?.toLowerCase().trim();
                    const sameName = songFileName === fileName;
                    const sameSize = song.file_size === fileSize;
                    
                    // Also check if song has complete analysis data
                    const hasCompleteData = song.camelot_key && song.bpm && song.energy_level && song.duration;
                    
                    return sameName && sameSize && hasCompleteData;
                });
                
                // Additional check: look for songs with same name and size that are already processed
                const isInProcessing = songs.some(song => {
                    const songFileName = song.filename?.toLowerCase().trim();
                    const sameName = songFileName === fileName;
                    const sameSize = song.file_size === fileSize;
                    const isProcessed = song.status === 'completed' || song.analysis_date;
                    
                    return sameName && sameSize && isProcessed;
                });
                
                if (isAlreadyAnalyzed || isInProcessing) {
                    console.log(`Skipping ${fileName} - already analyzed or processed`);
                    // Remove from queue and process next
                    setTimeout(processNextItem, 100);
                    return currentQueue.filter(item => item.id !== currentItem.id);
                }
                
                console.log(`Processing queue item: ${fileName}`);
                
                // Update status to analyzing
                const updatedQueue = currentQueue.map(item => 
                    item.id === currentItem.id 
                        ? { ...item, status: 'analyzing' as const, startTime: new Date() }
                        : item
                );
                
                // Process the item asynchronously
                processQueueItem(currentItem).then(() => {
                    // Process next item after a delay
                    setTimeout(processNextItem, 500);
                }).catch(() => {
                    // Process next item even if this one failed
                    setTimeout(processNextItem, 500);
                });
                
                return updatedQueue;
            });
        };

        // Start processing
        processNextItem();
    }, [isQueuePaused, apiSigningKey, apiPort, testBackendConnection, user, sanitizeId3, songs]);

    const processQueueItem = useCallback(async (currentItem: QueuedFile) => {
        try {
            // Test backend connection first
            const isConnected = await testBackendConnection();
            if (!isConnected) {
                throw new Error('Backend server is not responding');
            }

            const formData = new FormData();
            formData.append('file', currentItem.file);
            formData.append('signingkey', apiSigningKey);

            const uploadUrl = `http://127.0.0.1:${apiPort}/upload-analyze`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);

            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Queue item analysis result:', result);

            if (result.status === 'success' || result.status === 'existing_metadata') {
                // Calculate estimated bitrate
                let estimatedBitrate = result.bitrate;
                if (!estimatedBitrate && result.file_size && result.duration) {
                    estimatedBitrate = Math.round((result.file_size * 8) / (result.duration * 1000));
                }
                if (!estimatedBitrate) {
                    estimatedBitrate = 320;
                }

                const newSong: Song = {
                    id: result.db_id ? result.db_id.toString() : Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    filename: result.filename,
                    file_path: result.file_path,
                    key: result.key,
                    scale: result.scale,
                    key_name: result.key_name,
                    camelot_key: result.camelot_key,
                    bpm: result.bpm,
                    energy_level: result.energy_level,
                    duration: result.duration,
                    file_size: result.file_size,
                    bitrate: estimatedBitrate,
                    status: 'analyzed',
                    analysis_date: new Date().toISOString(),
                    cue_points: result.cue_points || [],
                    track_id: result.track_id,
                    id3: sanitizeId3(result.id3 || result.metadata || result.tags)
                };

                // Add to songs list (with duplicate check)
                setSongs(prevSongs => {
                    // Check if song already exists
                    const exists = prevSongs.some(song => 
                        song.filename === newSong.filename && song.file_size === newSong.file_size
                    );
                    
                    if (exists) {
                        console.log(`Song ${newSong.filename} already exists in library, skipping add`);
                        return prevSongs;
                    }
                    
                    console.log(`Adding song to library: ${newSong.filename}`);
                    return [...prevSongs, newSong];
                });

                // Auto-add to matching query playlists
                setTimeout(() => {
                    addSongToMatchingQueryPlaylists(newSong);
                }, 100);

                // Update queue item as completed
                setAnalysisQueue(prev => prev.map(item => 
                    item.id === currentItem.id 
                        ? { 
                            ...item, 
                            status: 'completed' as const, 
                            result: newSong,
                            endTime: new Date()
                        }
                        : item
                ));

                // Firestore sync
                try {
                    if (user?.uid) {
                        await upsertUserTrack(user.uid, {
                            ...newSong,
                            id3: sanitizeId3(newSong.id3 || {})
                        } as any);
                        
                        await saveToAnalysisSongs(user.uid, {
                            ...newSong,
                            id3: sanitizeId3(newSong.id3 || {})
                        } as any);
                    }
                } catch (syncErr) {
                    console.error('Firestore track sync failed:', syncErr);
                }

            } else {
                const errorMessage = result.error || result.error_message || 'Analysis failed';
                console.error('Analysis failed for queue item:', {
                    filename: currentItem.file.name,
                    error: errorMessage,
                    result: result
                });
                throw new Error(errorMessage);
            }

        } catch (error) {
            console.error('Queue item processing error:', error);
            
            // Update queue item as error
            setAnalysisQueue(prev => prev.map(item => 
                item.id === currentItem.id 
                    ? { 
                        ...item, 
                        status: 'error' as const, 
                        error: error instanceof Error ? error.message : String(error),
                        endTime: new Date()
                    }
                    : item
            ));
            
            // Continue processing the next item after a short delay
            setTimeout(() => {
                if (!queueProcessingRef.current) {
                    processQueue();
                }
            }, 1000);
        }
    }, [apiSigningKey, apiPort, testBackendConnection, user, sanitizeId3]);

    const handleQueueCancel = useCallback((fileId: string) => {
        setAnalysisQueue(prev => prev.filter(item => item.id !== fileId));
    }, []);

    const handleQueueClearCompleted = useCallback(() => {
        setAnalysisQueue(prev => prev.filter(item => item.status !== 'completed'));
    }, []);

    const handleQueueClearAll = useCallback(() => {
        setAnalysisQueue([]);
        queueProcessingRef.current = false;
        setIsProcessingQueue(false);
    }, []);

    const handleQueuePause = useCallback(() => {
        setIsQueuePaused(true);
    }, []);

    const handleQueueResume = useCallback(() => {
        setIsQueuePaused(false);
        if (!queueProcessingRef.current) {
            processQueue();
        }
    }, [processQueue]);

    // Process queue when paused state changes
    useEffect(() => {
        if (!isQueuePaused && !queueProcessingRef.current && analysisQueue.some(item => item.status === 'pending')) {
            processQueue();
        }
    }, [isQueuePaused, analysisQueue, processQueue]);

    const handleSongSelect = useCallback((song: Song) => {
        setSelectedSong(song);
    }, []);

    const handleDeleteSong = useCallback(async (songId: string) => {
        try {
            // Find the song to get its file path
            const songToDelete = songs.find(song => song.id === songId);
            if (!songToDelete) {
                console.error('Song not found for deletion:', songId);
                return;
            }

            // Delete from backend database first
            if (databaseService) {
                try {
                    // Try to delete by ID first, fallback to file path
                    await databaseService.deleteSong(songId);
                    console.log('Song deleted from database:', songId);
                } catch (error) {
                    console.error('Failed to delete song from database:', error);
                    // If deletion fails, don't remove from local state
                    return;
                }
            }

            // Remove from local state only after successful database deletion
            setSongs(prevSongs => prevSongs.filter(song => song.id !== songId));
            
            // Clear selection if the deleted song was selected
            if (selectedSong && selectedSong.id === songId) {
                setSelectedSong(null);
            }

            // Clear currently playing if the deleted song was playing
            if (currentlyPlaying && currentlyPlaying.id === songId) {
                setCurrentlyPlaying(null);
            }

            console.log('🗑️ Song removed from local state:', songId);
            
        } catch (error) {
            console.error('❌ Error in handleDeleteSong:', error);
            // Show user-friendly error message
            alert(`Failed to delete song: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }, [songs, selectedSong, currentlyPlaying, databaseService]);

    const getCompatibleSongs = useCallback((targetKey: string) => {
        return songs.filter(song => {
            if (!song.camelot_key || !targetKey) return false;
            
            // Simple compatibility check - this could be enhanced
            const targetNum = parseInt(targetKey.slice(0, -1));
            const targetLetter = targetKey.slice(-1);
            const songNum = parseInt(song.camelot_key.slice(0, -1));
            const songLetter = song.camelot_key.slice(-1);
            
            // Same key, adjacent keys, or relative major/minor
            return (
                song.camelot_key === targetKey || // Same key
                (songLetter === targetLetter && Math.abs(songNum - targetNum) <= 1) || // Adjacent
                (songNum === targetNum && songLetter !== targetLetter) // Relative
            );
        });
    }, [songs]);

    // Load playlists from database
    const loadPlaylistsFromDatabase = useCallback(async () => {
        if (!databaseService) return;
        
        try {
            console.log('🔄 Loading playlists from database...');
            const dbPlaylists = await databaseService.getPlaylists();
            
            // Transform database playlists to match our interface
            // Filter out any playlist songs that do not exist in the current songs list
            const currentSongIds = new Set(songs.map(s => s.id));
            const transformedPlaylists: Playlist[] = dbPlaylists.map((dbPlaylist: any) => ({
                id: dbPlaylist.id.toString(),
                name: dbPlaylist.name,
                description: dbPlaylist.description,
                color: dbPlaylist.color,
                isQueryBased: dbPlaylist.is_query_based || false,
                queryCriteria: dbPlaylist.query_criteria,
                createdAt: new Date(dbPlaylist.created_at),
                songs: dbPlaylist.songs ? dbPlaylist.songs
                    .filter((song: any) => currentSongIds.has(song.id.toString()))
                    .map((song: any) => ({
                    id: song.id.toString(),
                    filename: song.filename,
                    file_path: song.file_path,
                    key: song.key_signature,
                    scale: song.scale,
                    key_name: song.key_name,
                    camelot_key: song.camelot_key,
                    bpm: song.bpm,
                    energy_level: song.energy_level,
                    duration: song.duration,
                    file_size: song.file_size,
                    bitrate: song.bitrate || 320,
                    status: song.status || 'found',
                    analysis_date: song.analysis_date,
                    cue_points: song.cue_points || [],
                    track_id: song.track_id
                })) : []
            }));
            
            setPlaylists(transformedPlaylists);
            console.log(`✅ Loaded ${transformedPlaylists.length} playlists from database`);
        } catch (error) {
            console.error('❌ Failed to load playlists from database:', error);
        }
    }, [databaseService]);

    // Load playlists when database service is available
    useEffect(() => {
        if (databaseService && isLibraryLoaded) {
            loadPlaylistsFromDatabase();
        }
    }, [databaseService, isLibraryLoaded, loadPlaylistsFromDatabase]);

    // Playlist management functions
    const handlePlaylistCreate = useCallback(async (playlist: { 
        name: string; 
        songs: Song[]; 
        description?: string; 
        color?: string;
        isQueryBased?: boolean;
        queryCriteria?: any;
    }) => {
        try {
            if (databaseService) {
                // Create playlist in database
                const dbPlaylist = await databaseService.createPlaylist({
                    name: playlist.name,
                    description: playlist.description,
                    color: playlist.color,
                    is_query_based: playlist.isQueryBased || false,
                    query_criteria: playlist.queryCriteria,
                    songs: playlist.songs.map(song => ({ id: parseInt(song.id) }))
                });
                
                // Transform to our interface
                const newPlaylist: Playlist = {
                    id: dbPlaylist.id.toString(),
                    name: dbPlaylist.name,
                    description: dbPlaylist.description,
                    color: dbPlaylist.color,
                    isQueryBased: dbPlaylist.is_query_based || false,
                    queryCriteria: dbPlaylist.query_criteria,
                    createdAt: new Date(dbPlaylist.created_at),
                    songs: playlist.songs.map(song => ({
                        ...song,
                        // Ensure file_path is available
                        file_path: song.file_path || songs.find(s => s.id === song.id)?.file_path
                    }))
                };
                
                setPlaylists(prev => [...prev, newPlaylist]);
                console.log('✅ Playlist created in database:', newPlaylist.name);
            } else {
                            // Fallback to local state only
            const newPlaylist: Playlist = {
                ...playlist,
                id: Date.now().toString(),
                createdAt: new Date(),
                songs: playlist.songs.map(song => ({
                    ...song,
                    // Ensure file_path is available
                    file_path: song.file_path || songs.find(s => s.id === song.id)?.file_path
                }))
            };
                setPlaylists(prev => [...prev, newPlaylist]);
            }
        } catch (error) {
            console.error('❌ Failed to create playlist:', error);
            // Fallback to local state
            const newPlaylist: Playlist = {
                ...playlist,
                id: Date.now().toString(),
                createdAt: new Date(),
                songs: playlist.songs.map(song => ({
                    ...song,
                    // Ensure file_path is available
                    file_path: song.file_path || songs.find(s => s.id === song.id)?.file_path
                }))
            };
            setPlaylists(prev => [...prev, newPlaylist]);
        }
    }, [databaseService]);

    const handlePlaylistUpdate = useCallback(async (playlistId: string, updates: { name?: string; songs?: Song[]; description?: string; color?: string }) => {
        try {
            if (databaseService) {
                await databaseService.updatePlaylist(playlistId, updates);
            }
            
            setPlaylists(prev => prev.map(playlist => 
                playlist.id === playlistId ? { ...playlist, ...updates } : playlist
            ));
        } catch (error) {
            console.error('❌ Failed to update playlist:', error);
            // Still update local state
            setPlaylists(prev => prev.map(playlist => 
                playlist.id === playlistId ? { ...playlist, ...updates } : playlist
            ));
        }
    }, [databaseService]);

    const handlePlaylistDelete = useCallback(async (playlistId: string) => {
        try {
            if (databaseService) {
                await databaseService.deletePlaylist(playlistId);
            }
            
            setPlaylists(prev => prev.filter(playlist => playlist.id !== playlistId));
            if (selectedPlaylist && selectedPlaylist.id === playlistId) {
                setSelectedPlaylist(null);
            }
        } catch (error) {
            console.error('❌ Failed to delete playlist:', error);
            // Still update local state
            setPlaylists(prev => prev.filter(playlist => playlist.id !== playlistId));
            if (selectedPlaylist && selectedPlaylist.id === playlistId) {
                setSelectedPlaylist(null);
            }
        }
    }, [selectedPlaylist, databaseService]);

    const handleAddToPlaylist = useCallback(async (playlistId: string, songsToAdd: Song[]) => {
        try {
            // Validate and deduplicate songs to add
            const uniqueSongsToAdd = getUniqueSongs(songsToAdd);
            
            if (uniqueSongsToAdd.length !== songsToAdd.length) {
                console.warn(`🔍 Removed ${songsToAdd.length - uniqueSongsToAdd.length} duplicate songs before adding to playlist`);
            }
            
            if (databaseService) {
                // Add songs to database
                for (const song of uniqueSongsToAdd) {
                    await databaseService.addSongToPlaylist(playlistId, song.id);
                }
            }
            
            setPlaylists(prev => prev.map(playlist => {
                if (playlist.id === playlistId) {
                    const existingSongIds = new Set(playlist.songs.map(s => s.id));
                    const newSongs = uniqueSongsToAdd.filter(s => !existingSongIds.has(s.id));
                    
                    if (newSongs.length === 0) {
                        console.log(`🎵 All songs already exist in playlist "${playlist.name}"`);
                        return playlist;
                    }
                    
                    console.log(`🎵 Adding ${newSongs.length} new songs to playlist "${playlist.name}"`);
                    
                    // Validate the final playlist to ensure no duplicates
                    const updatedPlaylist = {
                        ...playlist,
                        songs: [...playlist.songs, ...newSongs]
                    };
                    
                    return validatePlaylistSongs(updatedPlaylist);
                }
                return playlist;
            }));
        } catch (error) {
            console.error('❌ Failed to add songs to playlist:', error);
            // Still update local state with validation
            setPlaylists(prev => prev.map(playlist => {
                if (playlist.id === playlistId) {
                    const uniqueSongsToAdd = getUniqueSongs(songsToAdd);
                    const existingSongIds = new Set(playlist.songs.map(s => s.id));
                    const newSongs = uniqueSongsToAdd.filter(s => !existingSongIds.has(s.id));
                    
                    const updatedPlaylist = {
                        ...playlist,
                        songs: [...playlist.songs, ...newSongs]
                    };
                    
                    return validatePlaylistSongs(updatedPlaylist);
                }
                return playlist;
            }));
        }
    }, [databaseService]);

    // Check all songs against all query playlists (for app startup)
    const checkAllSongsAgainstQueryPlaylists = useCallback(async () => {
        try {
            console.log('🔍 Checking all songs against query playlists...');
            const queryPlaylists = playlists.filter(p => p.isQueryBased && p.queryCriteria);
            
            if (queryPlaylists.length === 0) {
                console.log('No query playlists found');
                return;
            }

            // Validate all existing playlists first
            const validatedPlaylists = queryPlaylists.map(validatePlaylistSongs);
            const duplicateCounts = queryPlaylists.map((playlist, index) => {
                const originalCount = playlist.songs.length;
                const validatedCount = validatedPlaylists[index].songs.length;
                return originalCount - validatedCount;
            });

            const totalDuplicatesRemoved = duplicateCounts.reduce((sum, count) => sum + count, 0);
            if (totalDuplicatesRemoved > 0) {
                console.warn(`🔍 Removed ${totalDuplicatesRemoved} duplicate songs from existing query playlists`);
                // Update playlists with validated versions
                setPlaylists(prev => prev.map(playlist => {
                    const validated = validatedPlaylists.find(vp => vp.id === playlist.id);
                    return validated || playlist;
                }));
            }

            let totalAdded = 0;
            const uniqueSongs = getUniqueSongs(songs);
            
            console.log(`📊 Processing ${uniqueSongs.length} unique songs against ${queryPlaylists.length} query playlists`);
            
            for (const song of uniqueSongs) {
                const matchingPlaylists = getMatchingQueryPlaylists(song, queryPlaylists);
                
                for (const playlist of matchingPlaylists) {
                    if (!isSongInPlaylist(song, playlist)) {
                        console.log(`🎵 Adding "${song.filename}" to query playlist "${playlist.name}"`);
                        await handleAddToPlaylist(playlist.id, [song]);
                        totalAdded++;
                    }
                }
            }
            
            if (totalAdded > 0) {
                console.log(`✅ Auto-added ${totalAdded} songs to query playlists`);
            } else {
                console.log('No new songs to add to query playlists');
            }
        } catch (error) {
            console.error('❌ Failed to check songs against query playlists:', error);
        }
    }, [songs, playlists, handleAddToPlaylist]);

    // Check all songs against query playlists after both songs and playlists are loaded
    useEffect(() => {
        if (songs.length > 0 && playlists.length > 0 && isLibraryLoaded) {
            // Add a small delay to ensure all playlists are fully loaded
            const timer = setTimeout(() => {
                checkAllSongsAgainstQueryPlaylists();
            }, 1000);
            
            return () => clearTimeout(timer);
        }
    }, [songs.length, playlists.length, isLibraryLoaded, checkAllSongsAgainstQueryPlaylists]);

    const handleRemoveFromPlaylist = useCallback(async (playlistId: string, songIds: string[]) => {
        try {
            if (databaseService) {
                // Remove songs from database
                for (const songId of songIds) {
                    await databaseService.removeSongFromPlaylist(playlistId, songId);
                }
            }
            
            setPlaylists(prev => prev.map(playlist => {
                if (playlist.id === playlistId) {
                    return {
                        ...playlist,
                        songs: playlist.songs.filter(song => !songIds.includes(song.id))
                    };
                }
                return playlist;
            }));
        } catch (error) {
            console.error('❌ Failed to remove songs from playlist:', error);
            // Still update local state
            setPlaylists(prev => prev.map(playlist => {
                if (playlist.id === playlistId) {
                    return {
                        ...playlist,
                        songs: playlist.songs.filter(song => !songIds.includes(song.id))
                    };
                }
                return playlist;
            }));
        }
    }, [databaseService]);

    // Auto-add songs to matching query playlists
    const addSongToMatchingQueryPlaylists = useCallback(async (song: Song) => {
        try {
            const matchingPlaylists = getMatchingQueryPlaylists(song, playlists);
            
            for (const playlist of matchingPlaylists) {
                // Check if song is already in the playlist
                if (!isSongInPlaylist(song, playlist)) {
                    console.log(`🎵 Auto-adding "${song.filename}" to query playlist "${playlist.name}"`);
                    await handleAddToPlaylist(playlist.id, [song]);
                }
            }
        } catch (error) {
            console.error('❌ Failed to auto-add song to query playlists:', error);
        }
    }, [playlists, handleAddToPlaylist]);

    // Clean up all playlists to remove duplicates
    const cleanupAllPlaylists = useCallback(() => {
        console.log('🧹 Cleaning up all playlists to remove duplicates...');
        
        setPlaylists(prev => {
            const cleanedPlaylists = prev.map(playlist => {
                const cleaned = validatePlaylistSongs(playlist);
                if (cleaned.songs.length !== playlist.songs.length) {
                    console.log(`🧹 Cleaned playlist "${playlist.name}": ${playlist.songs.length} → ${cleaned.songs.length} songs`);
                }
                return cleaned;
            });
            
            const totalDuplicatesRemoved = prev.reduce((sum, playlist) => {
                const cleaned = validatePlaylistSongs(playlist);
                return sum + (playlist.songs.length - cleaned.songs.length);
            }, 0);
            
            if (totalDuplicatesRemoved > 0) {
                console.log(`✅ Cleanup complete: Removed ${totalDuplicatesRemoved} duplicate songs from all playlists`);
            } else {
                console.log('✅ No duplicates found in any playlists');
            }
            
            return cleanedPlaylists;
        });
    }, []);

    // Audio player functions
    const handleSongPlay = useCallback((song: Song) => {
        setCurrentlyPlaying(song);
        setSelectedSong(song);
    }, []);

    const handleVolumeChange = useCallback((newVolume: number) => {
        setVolume(newVolume);
    }, []);

    // Auto Mix API Functions
    const getNextTrackRecommendation = useCallback(async (currentSong: Song, playlist: Song[], transitionType: string = 'random') => {
        try {
            const response = await fetch(`http://127.0.0.1:${apiPort}/automix/next-track`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Signing-Key': apiSigningKey
                },
                body: JSON.stringify({
                    current_song: currentSong,
                    playlist: playlist,
                    transition_type: transitionType
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Failed to get next track recommendation:', error);
            throw error;
        }
    }, [apiPort, apiSigningKey]);

    const analyzePlaylistForAutoMix = useCallback(async (playlist: Song[]) => {
        try {
            const response = await fetch(`http://127.0.0.1:${apiPort}/automix/analyze-playlist`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Signing-Key': apiSigningKey
                },
                body: JSON.stringify({
                    playlist: playlist
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Failed to analyze playlist:', error);
            throw error;
        }
    }, [apiPort, apiSigningKey]);

    const getAutoMixStatus = useCallback(async () => {
        try {
            const response = await fetch(`http://127.0.0.1:${apiPort}/automix/ai-status?signingkey=${encodeURIComponent(apiSigningKey)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Failed to get Auto Mix status:', error);
            throw error;
        }
    }, [apiPort, apiSigningKey]);

    // Auto Mix Handlers
    const handleAutoMixToggle = useCallback(async (enabled: boolean) => {
        console.log('🎵 App: handleAutoMixToggle called with:', enabled);
        console.log('🎵 App: Current state:', {
            isAutoMixEnabled,
            songsCount: songs.length,
            selectedPlaylist: selectedPlaylist?.name || 'None',
            selectedPlaylistSongs: selectedPlaylist?.songs?.length || 0
        });
        
        setIsAutoMixEnabled(enabled);
        setAutoMixError(null);
        
        if (enabled) {
            // When enabling Auto Mix, set up the playlist
            const currentPlaylist = selectedPlaylist ? selectedPlaylist.songs : songs;
            console.log('🎵 App: Setting Auto Mix playlist with', currentPlaylist.length, 'songs');
            setAutoMixPlaylist(currentPlaylist);
            
            // Analyze the playlist for compatibility
            try {
                const analysis = await analyzePlaylistForAutoMix(currentPlaylist);
                console.log('🎵 App: Auto Mix playlist analysis:', analysis);
            } catch (error) {
                console.warn('❌ App: Failed to analyze playlist for Auto Mix:', error);
            }
        } else {
            // When disabling Auto Mix, clear the playlist
            console.log('🎵 App: Disabling Auto Mix, clearing playlist');
            setAutoMixPlaylist([]);
        }
    }, [selectedPlaylist, songs, analyzePlaylistForAutoMix, isAutoMixEnabled]);

    const handleAutoMixNext = useCallback(async () => {
        console.log('🎵 ===== APP AUTO MIX NEXT =====');
        console.log('🎵 App: handleAutoMixNext called');
        console.log('🎵 App: currentlyPlaying:', currentlyPlaying?.filename);
        console.log('🎵 App: autoMixPlaylist length:', autoMixPlaylist.length);
        console.log('🎵 App: songs length:', songs.length);
        
        if (!currentlyPlaying) {
            console.warn('🎵 App: No current song for Auto Mix');
            return;
        }

        // Ensure we have a playlist - use autoMixPlaylist if available, otherwise fall back to songs
        const availablePlaylist = autoMixPlaylist.length > 0 ? autoMixPlaylist : songs;
        
        if (availablePlaylist.length === 0) {
            console.warn('🎵 App: No songs available for Auto Mix');
            return;
        }

        console.log('🎵 App: Getting next track from', availablePlaylist.length, 'songs');

        setIsAutoMixLoading(true);
        setAutoMixError(null);

        try {
            console.log('🎵 App: Calling getNextTrackRecommendation...');
            // Get next track recommendation
            const recommendation = await getNextTrackRecommendation(
                currentlyPlaying,
                availablePlaylist,
                'random' // You can make this configurable
            );
            
            console.log('🎵 App: Got recommendation:', recommendation);

            if (recommendation.status === 'success' && recommendation.recommended_track) {
                const recommendedSong = recommendation.recommended_track;
                console.log('🎵 App: Recommendation successful, recommended song:', recommendedSong);
                
                // Find the recommended song in our songs array
                const foundSong = songs.find(song => song.id === recommendedSong.id);
                console.log('🎵 App: Found song in library:', !!foundSong, foundSong?.filename);
                
                if (foundSong) {
                    // Play the recommended song
                    console.log('🎵 App: Setting currentlyPlaying to:', foundSong.filename);
                    setCurrentlyPlaying(foundSong);
                    setSelectedSong(foundSong);
                    // Trigger auto-play for seamless transition
                    setAutoPlay(true);
                    console.log('🎵 App: Auto Mix: Playing recommended track:', foundSong.filename);
                } else {
                    console.error('🎵 App: Recommended track not found in library:', recommendedSong);
                    throw new Error('Recommended track not found in library');
                }
            } else {
                console.error('🎵 App: Recommendation failed:', recommendation);
                throw new Error(recommendation.message || 'No suitable track found');
            }
        } catch (error) {
            console.error('🎵 App: Auto Mix next track failed:', error);
            setAutoMixError(error instanceof Error ? error.message : 'Failed to get next track');
        } finally {
            setIsAutoMixLoading(false);
            console.log('🎵 ===== END APP AUTO MIX NEXT =====');
        }
    }, [currentlyPlaying, autoMixPlaylist, songs, getNextTrackRecommendation]);

    // Update Auto Mix playlist when selected playlist changes
    useEffect(() => {
        if (isAutoMixEnabled) {
            const currentPlaylist = selectedPlaylist ? selectedPlaylist.songs : songs;
            console.log('🎵 App: Updating Auto Mix playlist with', currentPlaylist.length, 'songs');
            setAutoMixPlaylist(currentPlaylist);
        }
    }, [selectedPlaylist, songs, isAutoMixEnabled]);

    // Auto-update Auto Mix playlist when songs are loaded
    useEffect(() => {
        if (isAutoMixEnabled && songs.length > 0) {
            const currentPlaylist = selectedPlaylist ? selectedPlaylist.songs : songs;
            setAutoMixPlaylist(currentPlaylist);
        }
    }, [songs, selectedPlaylist, isAutoMixEnabled]);

    const handleNextSong = useCallback(() => {
        const currentSongs = selectedPlaylist ? selectedPlaylist.songs : songs;
        const currentIndex = currentSongs.findIndex(song => song.id === (currentlyPlaying ? currentlyPlaying.id : null));
        if (currentIndex < currentSongs.length - 1) {
            handleSongPlay(currentSongs[currentIndex + 1]);
        }
    }, [currentlyPlaying, selectedPlaylist, songs, handleSongPlay]);

    const handlePreviousSong = useCallback(() => {
        const currentSongs = selectedPlaylist ? selectedPlaylist.songs : songs;
        const currentIndex = currentSongs.findIndex(song => song.id === (currentlyPlaying ? currentlyPlaying.id : null));
        if (currentIndex > 0) {
            handleSongPlay(currentSongs[currentIndex - 1]);
        }
    }, [currentlyPlaying, selectedPlaylist, songs, handleSongPlay]);

    // Handle cover art extraction status change
    const handleCoverArtExtractionStatusChange = useCallback((isComplete: boolean) => {
        setIsCoverArtExtractionComplete(isComplete);
    }, []);

    // Get current song list based on selected playlist
    const currentSongs = useMemo(() => {
        return selectedPlaylist ? selectedPlaylist.songs : songs;
    }, [selectedPlaylist, songs]);

    // Load download settings from localStorage and database
    useEffect(() => {
        const loadDownloadPath = async () => {
            setIsLoadingSettings(true);
            
            try {
                // First try to load from localStorage for immediate display
                const savedDownloadPath = localStorage.getItem('youtube_download_path');
                if (savedDownloadPath) {
                    setDownloadPath(savedDownloadPath);
                    setIsDownloadPathSet(true);
                }
                
                // Then try to load from database (this will override localStorage if different)
                if (databaseService) {
                    try {
                        const dbDownloadPath = await databaseService.getDownloadPath();
                        if (dbDownloadPath) {
                            setDownloadPath(dbDownloadPath);
                            setIsDownloadPathSet(true);
                            // Update localStorage to match database
                            localStorage.setItem('youtube_download_path', dbDownloadPath);
                        }
                    } catch (error) {
                        console.warn('Failed to load download path from database:', error);
                        // Keep localStorage value if database fails
                    }
                }
            } finally {
                setIsLoadingSettings(false);
            }
        };
        
        loadDownloadPath();
    }, [databaseService]);

    // AI Agent related function - commented out for this version
    // Load Gemini API key on component mount
    // useEffect(() => {
    //     const loadGeminiApiKey = async () => {
    //         setIsLoadingGeminiSettings(true);
    //         
    //         try {
    //             // First try to load from localStorage for immediate display
    //             const savedApiKey = localStorage.getItem('gemini_api_key');
    //             if (savedApiKey) {
    //                 setGeminiApiKey(savedApiKey);
    //                 setIsGeminiApiKeySet(true);
    //             }
    //             
    //             // Then try to load from database (this will override localStorage if different)
    //             if (databaseService) {
    //                 try {
    //                     const dbApiKey = await databaseService.getGeminiApiKey();
    //                     if (dbApiKey) {
    //                         setGeminiApiKey(dbApiKey);
    //                         setIsGeminiApiKeySet(true);
    //                         // Update localStorage to match database
    //                         localStorage.setItem('gemini_api_key', dbApiKey);
    //                     }
    //                 } catch (error) {
    //                     console.warn('Failed to load Gemini API key from database:', error);
    //                     // Keep localStorage value if database fails
    //                 }
    //             }
    //         } finally {
    //             setIsLoadingGeminiSettings(false);
    //         }
    //     };
    //     
    //     loadGeminiApiKey();
    // }, [databaseService]);

    // Handle download path selection
    const handleDownloadPathSelect = useCallback(async () => {
        if (isElectronMode) {
            try {
                const { ipcRenderer } = (window as any).require('electron');
                
                // Use IPC to communicate with main process for file dialog
                const result = await new Promise((resolve) => {
                    ipcRenderer.send('show-folder-dialog');
                    ipcRenderer.once('folder-dialog-response', (event: any, selectedPath: string | null) => {
                        resolve(selectedPath);
                    });
                });
                
                if (result) {
                    const selectedPath = result as string;
                    setDownloadPath(selectedPath);
                    setIsDownloadPathSet(true);
                    localStorage.setItem('youtube_download_path', selectedPath);
                    
                    // Also save to backend settings
                    if (databaseService) {
                        try {
                            await databaseService.saveDownloadPath(selectedPath);
                            setShowSaveSuccess(true);
                            setTimeout(() => setShowSaveSuccess(false), 3000);
                        } catch (error) {
                            console.warn('Failed to save download path to backend:', error);
                        }
                    }
                }
            } catch (error) {
                console.error('Error selecting download path:', error);
                // Fallback for web or if dialog fails
                const path = prompt('Enter download path:');
                if (path) {
                    setDownloadPath(path);
                    setIsDownloadPathSet(true);
                    localStorage.setItem('youtube_download_path', path);
                    
                    // Also save to backend settings
                    if (databaseService) {
                        try {
                            await databaseService.saveDownloadPath(path);
                            setShowSaveSuccess(true);
                            setTimeout(() => setShowSaveSuccess(false), 3000);
                        } catch (error) {
                            console.warn('Failed to save download path to backend:', error);
                        }
                    }
                }
            }
        } else {
            // Web mode - use text input
            const path = prompt('Enter download path:');
            if (path) {
                setDownloadPath(path);
                setIsDownloadPathSet(true);
                localStorage.setItem('youtube_download_path', path);
                
                // Also save to backend settings
                if (databaseService) {
                    try {
                        await databaseService.saveDownloadPath(path);
                    } catch (error) {
                        console.warn('Failed to save download path to backend:', error);
                    }
                }
            }
        }
    }, [isElectronMode, databaseService]);

    // Clear download path
    const handleClearDownloadPath = useCallback(async () => {
        setDownloadPath('');
        setIsDownloadPathSet(false);
        localStorage.removeItem('youtube_download_path');
        
        if (databaseService) {
            try {
                await databaseService.clearDownloadPath();
                setShowSaveSuccess(true);
                setTimeout(() => setShowSaveSuccess(false), 3000);
            } catch (error) {
                console.warn('Failed to clear download path from database:', error);
            }
        }
    }, [databaseService]);

    // Handle Gemini API key save
    // AI Agent related function - commented out for this version
    // const handleSaveGeminiApiKey = useCallback(async () => {
    //     if (!geminiApiKey.trim()) {
    //         alert('Please enter a valid Gemini API key');
    //         return;
    //     }

    //     setIsLoadingGeminiSettings(true);
    //     try {
    //         // Save to localStorage for immediate access
    //         localStorage.setItem('gemini_api_key', geminiApiKey.trim());
    //         setIsGeminiApiKeySet(true);
    //         
    //         // Also save to backend settings
    //         if (databaseService) {
    //             try {
    //                 await databaseService.saveGeminiApiKey(geminiApiKey.trim());
    //                 setShowGeminiSaveSuccess(true);
    //                 setTimeout(() => setShowGeminiSaveSuccess(false), 3000);
    //             } catch (error) {
    //                 console.warn('Failed to save Gemini API key to backend:', error);
    //             }
    //         }
    //     } catch (error) {
    //         console.error('Error saving Gemini API key:', error);
    //         alert('Failed to save Gemini API key. Please try again.');
    //     } finally {
    //         setIsLoadingGeminiSettings(false);
    //     }
    // }, [geminiApiKey, databaseService]);

    // Clear Gemini API key
    // AI Agent related function - commented out for this version
    // const handleClearGeminiApiKey = useCallback(async () => {
    //     setGeminiApiKey('');
    //     setIsGeminiApiKeySet(false);
    //     localStorage.removeItem('gemini_api_key');
    //     
    //     if (databaseService) {
    //         try {
    //             await databaseService.clearGeminiApiKey();
    //             setShowGeminiSaveSuccess(true);
    //             setTimeout(() => setShowGeminiSaveSuccess(false), 3000);
    //         } catch (error) {
    //             console.warn('Failed to clear Gemini API key from database:', error);
    //         }
    //     }
    // }, [databaseService]);

    // Handle YouTube download completion
    const handleYouTubeDownloadComplete = useCallback(async (downloadedSong: any) => {
        console.log('🎵 YouTube download completed:', downloadedSong);
        console.log('🎵 Current songs count before adding:', songs.length);
        
        try {
            // Transform the downloaded song to match our Song interface
            const newSong: Song = {
                id: downloadedSong.db_id ? downloadedSong.db_id.toString() : (downloadedSong.id || Date.now().toString() + Math.random().toString(36).substr(2, 9)),
                filename: downloadedSong.filename,
                file_path: downloadedSong.file_path,
                title: downloadedSong.title || downloadedSong.filename?.replace(/\.[^/.]+$/, '') || 'Unknown Title',
                artist: downloadedSong.artist || 'Unknown Artist',
                key: downloadedSong.key,
                scale: downloadedSong.scale,
                key_name: downloadedSong.key_name,
                camelot_key: downloadedSong.camelot_key,
                bpm: downloadedSong.bpm,
                energy_level: downloadedSong.energy_level,
                duration: downloadedSong.duration,
                file_size: downloadedSong.file_size,
                bitrate: downloadedSong.bitrate || 320, // YouTube downloads are 320kbps
                status: 'analyzed',
                analysis_date: new Date().toISOString(),
                cue_points: downloadedSong.cue_points || [],
                track_id: downloadedSong.track_id, // Ensure track_id is included
                id3: sanitizeId3(downloadedSong.id3 || downloadedSong.metadata || downloadedSong.tags)
            };
            
            console.log('🎵 Adding song to library:', {
                title: newSong.title,
                artist: newSong.artist,
                bpm: newSong.bpm,
                camelot_key: newSong.camelot_key,
                energy_level: newSong.energy_level,
                status: newSong.status
            });
            
            // Add to songs list
            setSongs(prevSongs => {
                console.log('🎵 setSongs called with prevSongs.length:', prevSongs.length);
                // Check if song already exists to avoid duplicates
                const existingSong = prevSongs.find(s => s.track_id === newSong.track_id || s.filename === newSong.filename);
                if (existingSong) {
                    console.log('🎵 Song already exists in library, updating...');
                    const updatedSongs = prevSongs.map(s => s.id === existingSong.id ? newSong : s);
                    console.log('🎵 Updated songs count:', updatedSongs.length);
                    return updatedSongs;
                }
                const newSongs = [...prevSongs, newSong];
                console.log('🎵 Added new song, total count now:', newSongs.length);
                return newSongs;
            });

            // Auto-add to matching query playlists
            setTimeout(() => {
                addSongToMatchingQueryPlaylists(newSong);
            }, 100);
            
            // Background processing - no UI interruptions
            // Just refresh the playlist list without switching views
            setListRefreshKey(prev => prev + 1);
            console.log('✅ Song added to library successfully in background!');
            
            // Refresh the library to ensure the new song appears
            if (databaseService) {
                try {
                    // Refresh songs from database
                    const allSongs = await databaseService.getLibrary();
                    
                    // Preserve local cover art updates that might not be in database yet
                    setSongs(prevSongs => {
                        const updatedSongs = allSongs.map(dbSong => {
                            const localSong = prevSongs.find(prev => prev.id === dbSong.id);

                            // Robust normalization to avoid Unknown Artist after restart
                            const isMeaningless = (val: any) => {
                                if (!val) return true;
                                const s = String(val).trim().toLowerCase();
                                return s === 'unknown' || s === 'unknown artist' || s === 'n/a' || s === 'null' || s === 'undefined';
                            };
                            const parseFromFilename = (filename?: string) => {
                                if (!filename) return { artist: undefined as any, title: undefined as any };
                                const base = filename.replace(/\.[^/.]+$/, '');
                                if (base.includes(' - ')) {
                                    const [artistPart, ...rest] = base.split(' - ');
                                    return { artist: artistPart, title: rest.join(' - ') };
                                }
                                return { artist: undefined as any, title: base };
                            };
                            const parsed = parseFromFilename(dbSong.filename);
                            const normalizedTitle = !isMeaningless(dbSong.title) ? dbSong.title : ((dbSong.id3 && !isMeaningless(dbSong.id3.title) && dbSong.id3.title) || (localSong && !isMeaningless(localSong.title) && localSong.title) || parsed.title || (dbSong.filename ? dbSong.filename.replace(/\.[^/.]+$/, '') : 'Unknown Title'));
                            const normalizedArtist = !isMeaningless(dbSong.artist) ? dbSong.artist : ((dbSong.id3 && !isMeaningless(dbSong.id3.artist) && dbSong.id3.artist) || (localSong && !isMeaningless(localSong.artist) && localSong.artist) || parsed.artist || 'Unknown Artist');

                            let merged = { ...dbSong, title: normalizedTitle, artist: normalizedArtist } as any;

                            // If local song has cover art but database doesn't, keep the local version
                            if (localSong && localSong.cover_art && (!dbSong.cover_art || dbSong.cover_art.trim() === '')) {
                                console.log('🖼️ Preserving local cover art for:', dbSong.filename);
                                merged = {
                                    ...merged,
                                    cover_art: localSong.cover_art,
                                    cover_art_extracted: localSong.cover_art_extracted
                                };
                            }

                            // Persist normalized metadata back to DB in background if changed
                            if ((dbSong.title !== normalizedTitle) || (dbSong.artist !== normalizedArtist)) {
                                (async () => {
                                    try {
                                        await fetch(`http://127.0.0.1:${apiPort}/library/update-metadata`, {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json', 'X-Signing-Key': apiSigningKey },
                                            body: JSON.stringify({ 
                                                song_id: dbSong.id, 
                                                filename: dbSong.filename, 
                                                file_path: dbSong.file_path, 
                                                metadata: { title: normalizedTitle, artist: normalizedArtist }
                                            })
                                        });
                                    } catch (e) {
                                        console.warn('Failed to persist normalized metadata:', e);
                                    }
                                })();
                            }

                            return merged;
                        });
                        return updatedSongs;
                    });
                    console.log('🔄 Library refreshed after download completion');
                } catch (error) {
                    console.warn('⚠️ Failed to refresh library after download:', error);
                }
            }
            
            // Firestore sync for YouTube downloads
            (async () => {
                try {
                    if (user?.uid && newSong.track_id) {
                        // Save to user's tracks collection
                        await upsertUserTrack(user.uid, {
                            ...newSong,
                        } as any);
                        
                        // Also save to global analysis_songs collection
                        await saveToAnalysisSongs(user.uid, {
                            ...newSong,
                        } as any);
                    } else if (user?.uid && !newSong.track_id) {
                        console.warn('Skipping Firestore sync for YouTube download - track_id is undefined for song:', newSong.filename);
                    }
                } catch (syncErr) {
                    console.warn('Firestore track sync failed (YouTube) - will retry when online:', syncErr);
                }
            })();
            
        } catch (error) {
            console.error('❌ Error handling download completion:', error);
        }
    }, [setSongs, addSongToMatchingQueryPlaylists, goToLibraryAndRefresh, setSelectedSong, databaseService, user?.uid, upsertUserTrack, saveToAnalysisSongs]);

    // Handle song updates from metadata editor
    const handleSongUpdate = async (updatedSong: Song) => {
        try {
            // Update the songs array with the new data
            setSongs(prevSongs => 
                prevSongs.map(song => 
                    song.id === updatedSong.id ? updatedSong : song
                )
            );
            
            // Update selected song if it's the one being edited
            if (selectedSong && selectedSong.id === updatedSong.id) {
                setSelectedSong(updatedSong);
            }
            
            // Update currently playing if it's the one being edited
            if (currentlyPlaying && currentlyPlaying.id === updatedSong.id) {
                setCurrentlyPlaying(updatedSong);
            }
            
            // Sync updated metadata to Firestore
            if (user?.uid && updatedSong.track_id) {
                try {
                    // Update in user's tracks collection
                    await upsertUserTrack(user.uid, {
                        ...updatedSong,
                        id3: sanitizeId3(updatedSong.id3 || {})
                    } as any);
                    
                    // Also update in global analysis_songs collection
                    await saveToAnalysisSongs(user.uid, {
                        ...updatedSong,
                        id3: sanitizeId3(updatedSong.id3 || {})
                    } as any);
                    
                    console.log('Metadata synced to Firestore successfully');
                } catch (syncErr) {
                    console.warn('Firestore metadata sync failed - will retry when online:', syncErr);
                }
            } else if (user?.uid && !updatedSong.track_id) {
                console.warn('Skipping Firestore sync for song update - track_id is undefined for song:', updatedSong.filename);
            }
            
            console.log('Song updated successfully:', updatedSong.filename);
            
            // Auto-add to matching query playlists
            await addSongToMatchingQueryPlaylists(updatedSong);
        } catch (error) {
            console.error('Failed to update song:', error);
        }
    };

    console.log('App render - apiPort:', apiPort, 'currentView:', currentView);

    return (
        <AuthGate>
        <div className="App">
            <header className="App-header">
                <div className="header-content">
                    <div className="brand">
                        <div className="logo">
                            <LogoComponent />
                        </div>
                    </div>
                    {currentView !== 'youtube' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                            {/* Volume Display - Show when track is loaded */}
                            {currentlyPlaying && (
                                <div className="volume-display" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 12px',
                                    background: 'var(--surface-bg)',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    fontSize: '14px',
                                    color: 'var(--text-secondary)'
                                }}>
                                    <Volume2 size={16} />
                                    <span>{Math.round(volume * 100)}%</span>
                                </div>
                            )}
                            
                            <div className="search-box-header search-box-centered">
                                <input 
                                    type="text" 
                                    placeholder="Search Music online and download to your library..." 
                                    onClick={() => setCurrentView('youtube')}
                                    readOnly
                                    style={{ cursor: 'pointer' }}
                                />
                            </div>
                            {/* AI Agent button - commented out for this version */}
                            {/* <button
                                onClick={() => setCurrentView('ai-agent')}
                                style={{
                                    padding: '6px',
                                    background: 'var(--surface-bg)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                    width: '32px',
                                    height: '32px'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'var(--card-bg)';
                                    e.currentTarget.style.borderColor = 'var(--brand-blue)';
                                    e.currentTarget.style.color = 'var(--brand-blue)';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'var(--surface-bg)';
                                    e.currentTarget.style.borderColor = 'var(--border-color)';
                                    e.currentTarget.style.color = 'var(--text-secondary)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                                title="AI Agent - Create Smart Playlists"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
                                    <path d="M2 17L12 22L22 17"/>
                                    <path d="M2 12L12 17L22 12"/>
                                    <circle cx="12" cy="12" r="1" fill="currentColor"/>
                                </svg>
                            </button> */}
                        </div>
                    )}
                    
                    {currentView === 'youtube' && (
                        <nav className="nav-tabs">
                            <button 
                                onClick={() => goToLibraryAndRefresh()}
                            >
                                My collection
                            </button>

                            {/* AI Agent button - commented out for this version */}
                            {/* <button 
                                onClick={() => setCurrentView('ai-agent')}
                            >
                                AI Agent
                            </button> */}

                            <button 
                                onClick={() => setCurrentView('settings')}
                            >
                                Settings
                            </button>
                        </nav>
                    )}
                </div>
            </header>

            <div className="app-body">
                {/* Left Column - Split into Camelot Wheel (top) and Playlists (bottom) */}
                <aside className="sidebar">
                    {/* Top Left - Camelot Wheel Section */}
                    <div className="camelot-section">
                        <CamelotWheel 
                            songs={songs}
                            selectedSong={selectedSong}
                            onSongSelect={(song: Song) => {
                                setSelectedSong(song);
                            }}
                        />
                    </div>
                    
                    {/* Bottom Left - Playlist Section */}
                    <div className="playlist-section">
                        <PlaylistManager
                            key={`pm-${listRefreshKey}`}
                            playlists={playlists}
                            songs={songs}
                            selectedPlaylist={selectedPlaylist}
                            onPlaylistSelect={setSelectedPlaylist}
                            onPlaylistCreate={handlePlaylistCreate}
                            onPlaylistUpdate={handlePlaylistUpdate}
                            onPlaylistDelete={handlePlaylistDelete}
                            onAddToPlaylist={handleAddToPlaylist}
                            onRemoveFromPlaylist={handleRemoveFromPlaylist}
                            onFileUpload={handleFileUpload}
                            onMultiFileUpload={addFilesToQueue}
                            onFolderUpload={handleFolderUpload}
                            isAnalyzing={isAnalyzing || isProcessingQueue}
                            downloadPath={downloadPath}
                            onCleanupPlaylists={cleanupAllPlaylists}
                        />
                    </div>
                </aside>

                {/* Right Side - Main Content Area */}
                <main className="main-content">
                    {currentView === 'library' && (
                        <>
                            {/* Fixed Audio Player */}
                            <div className="player-section">
                                <AudioPlayer
                                    song={currentlyPlaying}
                                    onNext={handleNextSong}
                                    onPrevious={handlePreviousSong}
                                    apiPort={apiPort}
                                    apiSigningKey={apiSigningKey}
                                    volume={volume}
                                    onVolumeChange={handleVolumeChange}
                                    isLibraryLoaded={isLibraryLoaded}
                                    isCoverArtExtractionComplete={isCoverArtExtractionComplete}
                                    isAutoMixEnabled={isAutoMixEnabled}
                                    onAutoMixToggle={handleAutoMixToggle}
                                    onAutoMixNext={handleAutoMixNext}
                                    playlist={autoMixPlaylist}
                                    autoPlay={autoPlay}
                                    onAutoPlayComplete={() => setAutoPlay(false)}
                                />
                            </div>

                            {/* Scrollable Track Table */}
                            <div className="table-section">
                                <TrackTable
                                    key={`tt-${listRefreshKey}`}
                                    songs={currentSongs}
                                    selectedSong={selectedSong}
                                    onSongSelect={setSelectedSong}
                                    onSongPlay={handleSongPlay}
                                    onDeleteSong={handleDeleteSong}
                                    currentlyPlaying={currentlyPlaying}
                                    getCompatibleSongs={getCompatibleSongs}
                                    showCompatibleOnly={showCompatibleOnly}
                                    onSongUpdate={handleSongUpdate}
                                    apiPort={apiPort}
                                    apiSigningKey={apiSigningKey}
                                    selectedPlaylist={selectedPlaylist}
                                    onPlaylistDelete={handlePlaylistDelete}
                                    onUSBExport={(playlist) => {
                                        setPlaylistToExport(playlist);
                                        setShowUSBExport(true);
                                    }}
                                    onExportPlaylist={(playlist) => {
                                        // Export playlist as M3U file
                                        const m3uContent = [
                                            '#EXTM3U',
                                            ...playlist.songs.map((song: Song) => 
                                                `#EXTINF:${Math.floor(song.duration || 0)},${song.title || song.filename}\n${song.file_path || song.filename}`
                                            )
                                        ].join('\n');

                                        const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `${playlist.name}.m3u`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(url);
                                    }}
                                    onCoverArtExtractionStatusChange={handleCoverArtExtractionStatusChange}
                                />
                            </div>
                        </>
                    )}

                    {currentView === 'youtube' && (
                        <div className="youtube-view" style={{ height: '100%', overflow: 'auto' }}>
                            {!isDownloadPathSet && (
                                <div style={{
                                    padding: 'var(--space-lg)',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: '8px',
                                    margin: 'var(--space-lg)'
                                }}>
                                    <h3 style={{ color: 'rgb(239, 68, 68)', margin: '0 0 8px 0' }}>⚠️ Setup Required</h3>
                                    <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
                                        Please configure a download path in Settings before using YouTube Music downloads.
                                    </p>
                                    <button 
                                        onClick={() => setCurrentView('settings')}
                                        style={{
                                            padding: '8px 16px',
                                            background: 'var(--accent-color)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            fontWeight: '500'
                                        }}
                                    >
                                        Go to Settings
                                    </button>
                                </div>
                            )}
                            
                            <YouTubeMusic
                                apiPort={apiPort}
                                apiSigningKey={apiSigningKey}
                                downloadPath={downloadPath}
                                isDownloadPathSet={isDownloadPathSet}
                                onDownloadComplete={handleYouTubeDownloadComplete}
                                downloadManagerRef={downloadManagerRef}
                            />
                        </div>
                    )}

                    {/* AI Agent view - commented out for this version */}
                    {/* {currentView === 'ai-agent' && (
                        <div className="ai-agent-view" style={{ height: '100%', overflow: 'auto' }}>
                            {!isDownloadPathSet && (
                                <div style={{
                                    padding: 'var(--space-lg)',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: '8px',
                                    margin: 'var(--space-lg)'
                                }}>
                                    <h3 style={{ color: 'rgb(239, 68, 68)', margin: '0 0 8px 0' }}>⚠️ Setup Required</h3>
                                    <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
                                        Please configure a download path and Gemini API key in Settings before using AI Agent.
                                    </p>
                                    <button 
                                        onClick={() => setCurrentView('settings')}
                                        style={{
                                            padding: '8px 16px',
                                            background: 'var(--accent-color)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Go to Settings
                                    </button>
                                </div>
                            )}
                            
                            {!isGeminiApiKeySet && (
                                <div style={{
                                    padding: 'var(--space-lg)',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: '8px',
                                    margin: 'var(--space-lg)'
                                }}>
                                    <h3 style={{ color: 'rgb(239, 68, 68)', margin: '0 0 8px 0' }}>⚠️ Gemini API Key Required</h3>
                                    <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
                                        Please configure your Gemini API key in Settings to use AI Agent features.
                                    </p>
                                    <button 
                                        onClick={() => setCurrentView('settings')}
                                        style={{
                                            padding: '8px 16px',
                                            background: 'var(--accent-color)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Go to Settings
                                    </button>
                                </div>
                            )}
                            
                            {isDownloadPathSet && isGeminiApiKeySet && (
                                <AIAgent
                                    databaseService={databaseService}
                                    downloadPath={downloadPath}
                                    isDownloadPathSet={isDownloadPathSet}
                                    onPlaylistCreated={(playlist) => {
                                        console.log('AI Agent created playlist:', playlist);
                                        // Refresh playlists
                                        if (databaseService) {
                                            loadPlaylistsFromDatabase();
                                        }
                                    }}
                                />
                            )}
                        </div>
                    )} */}

                    {currentView === 'upload' && (
                        <div className="upload-view" style={{ height: '100%', overflow: 'auto', padding: 'var(--space-xl)' }}>
                            <FileUpload 
                                onFileUpload={handleFileUpload}
                                onMultiFileUpload={addFilesToQueue}
                                onFolderUpload={handleFolderUpload}
                                isAnalyzing={isAnalyzing || isProcessingQueue}
                            />
                            
                            <AnalysisQueue
                                queue={analysisQueue}
                                isProcessing={isProcessingQueue}
                                onCancel={handleQueueCancel}
                                onClearCompleted={handleQueueClearCompleted}
                                onClearAll={handleQueueClearAll}
                                onPause={handleQueuePause}
                                onResume={handleQueueResume}
                                isPaused={isQueuePaused}
                            />
                        </div>
                    )}

                    {currentView === 'wheel' && (
                        <div className="wheel-view" style={{ height: '100%', overflow: 'auto', padding: 'var(--space-xl)' }}>
                            <div className="wheel-container" style={{ display: 'flex', gap: 'var(--space-xl)', height: '100%' }}>
                                <div style={{ flex: '0 0 400px' }}>
                                    <CamelotWheel 
                                        songs={songs}
                                        selectedSong={selectedSong}
                                        onSongSelect={(song: Song) => {
                                            setSelectedSong(song);
                                        }}
                                    />
                                </div>
                                {selectedSong && (
                                    <div className="selected-song-info" style={{ flex: 1, overflow: 'auto' }}>
                                        <AnalysisResults 
                                            song={selectedSong} 
                                            compatibleSongs={getCompatibleSongs(selectedSong.camelot_key || '')}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {currentView === 'settings' && (
                        <div className="settings-view" style={{ height: '100%', overflow: 'auto', padding: 'var(--space-xl)' }}>
                            <div className="settings-container">
                                <div className="settings-header">
                                    <svg className="settings-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.2573 9.77251 19.9887C9.5799 19.7201 9.31074 19.5166 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.742 9.96512 4.01062 9.77251C4.27925 9.5799 4.48278 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    <h2 style={{ color: 'var(--text-primary)', margin: '0 0 0 12px' }}>Settings & Configuration</h2>
                                </div>
                                
                                {/* YouTube Music Download Settings */}
                                <div className="settings-section" style={{ marginBottom: 'var(--space-xl)' }}>
                                    <div style={{ background: 'var(--card-bg)', padding: 'var(--space-lg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <div className="section-header">
                                            <svg className="section-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M9 18V5L21 3V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 0 12px' }}>Music Downloads & Collection</h3>
                                        </div>
                                        
                                        <div style={{ marginBottom: '16px' }}>
                                            <p style={{ color: 'var(--text-secondary)', margin: '8px 0', fontSize: '14px' }}>
                                                Configure where music downloads will be saved. Downloads will be in 320kbps MP3 format.
                                            </p>
                                        </div>
                                        
                                        <div style={{ marginBottom: '16px' }}>
                                            <label style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '8px' }}>
                                                Download / Collection Path:
                                            </label>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <input 
                                                    type="text" 
                                                    value={downloadPath}
                                                    readOnly
                                                    placeholder="No download path selected"
                                                    style={{
                                                        flex: 1,
                                                        padding: '8px 12px',
                                                        background: 'var(--surface-bg)',
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '4px',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '14px'
                                                    }}
                                                />
                                                <button 
                                                    onClick={handleDownloadPathSelect}
                                                    style={{
                                                        padding: '8px 16px',
                                                        background: 'var(--accent-color)',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '14px',
                                                        fontWeight: '500'
                                                    }}
                                                >
                                                    {downloadPath ? 'Change' : 'Select'}
                                                </button>
                                                {downloadPath && (
                                                    <button 
                                                        onClick={handleClearDownloadPath}
                                                        style={{
                                                            padding: '8px 12px',
                                                            background: 'var(--error-color)',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            fontSize: '14px'
                                                        }}
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="status-indicator" style={{ 
                                            background: isLoadingSettings ? 'rgba(255, 193, 7, 0.1)' : (isDownloadPathSet ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'), 
                                            border: `1px solid ${isLoadingSettings ? 'rgba(255, 193, 7, 0.3)' : (isDownloadPathSet ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)')}`, 
                                            marginBottom: '16px'
                                        }}>
                                            <div className="status-content">
                                                {isLoadingSettings ? (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M21 12A9 9 0 1 1 3 12A9 9 0 0 1 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                        <path d="M12 3A9 9 0 0 1 20.4 6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                ) : isDownloadPathSet ? (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                ) : (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                        <path d="M15 9L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                        <path d="M9 9L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                )}
                                                <p style={{ 
                                                    color: isLoadingSettings ? 'rgb(255, 193, 7)' : (isDownloadPathSet ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'), 
                                                    margin: 0, 
                                                    fontSize: '14px',
                                                    fontWeight: '500'
                                                }}>
                                                    {isLoadingSettings ? 'Loading settings...' : (isDownloadPathSet ? 'Download path configured' : 'Download path required for YouTube Music downloads')}
                                                </p>
                                            </div>
                                        </div>

                                        {showSaveSuccess && (
                                            <div style={{ 
                                                padding: '12px', 
                                                background: 'rgba(34, 197, 94, 0.1)', 
                                                border: '1px solid rgba(34, 197, 94, 0.3)', 
                                                borderRadius: '4px'
                                            }}>
                                                <p style={{ 
                                                    color: 'rgb(34, 197, 94)', 
                                                    margin: 0, 
                                                    fontSize: '14px',
                                                    fontWeight: '500'
                                                }}>
                                                     Settings saved successfully!
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Database Information */}
                                <div className="settings-section" style={{ marginBottom: 'var(--space-xl)' }}>
                                    <div style={{ background: 'var(--card-bg)', padding: 'var(--space-lg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <div className="section-header">
                                            <svg className="section-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <ellipse cx="12" cy="5" rx="9" ry="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                <path d="M3 5V19C3 20.1046 6.13401 21 10 21C13.866 21 17 20.1046 17 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                <path d="M3 12C3 13.1046 6.13401 14 10 14C13.866 14 17 13.1046 17 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 0 12px' }}>Database & Storage</h3>
                                        </div>
                                        
                                        <div style={{ marginBottom: '16px' }}>
                                            <p style={{ color: 'var(--text-secondary)', margin: '8px 0', fontSize: '14px' }}>
                                                Database connection status and storage information.
                                            </p>
                                        </div>
                                        
                                        <div className="status-indicator" style={{ 
                                            background: databaseService ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                                            border: `1px solid ${databaseService ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                            marginBottom: '16px'
                                        }}>
                                            <div className="status-content">
                                                {databaseService ? (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                ) : (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                        <path d="M15 9L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                        <path d="M9 9L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                )}
                                                <p style={{ 
                                                    color: databaseService ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)', 
                                                    margin: 0, 
                                                    fontSize: '14px',
                                                    fontWeight: '500'
                                                }}>
                                                    {databaseService ? 'Database connected' : 'Database not connected'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="status-indicator" style={{ 
                                            background: isLoadingSettings ? 'rgba(255, 193, 7, 0.1)' : 'rgba(34, 197, 94, 0.1)', 
                                            border: `1px solid ${isLoadingSettings ? 'rgba(255, 193, 7, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                                            marginBottom: '16px'
                                        }}>
                                            <div className="status-content">
                                                {isLoadingSettings ? (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M21 12A9 9 0 1 1 3 12A9 9 0 0 1 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                        <path d="M12 3A9 9 0 0 1 20.4 6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                ) : (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                )}
                                                <p style={{ 
                                                    color: isLoadingSettings ? 'rgb(255, 193, 7)' : 'rgb(34, 197, 94)', 
                                                    margin: 0, 
                                                    fontSize: '14px',
                                                    fontWeight: '500'
                                                }}>
                                                    {isLoadingSettings ? 'Loading settings...' : 'Settings loaded'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="status-indicator" style={{ 
                                            background: isLibraryLoaded ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 193, 7, 0.1)', 
                                            border: `1px solid ${isLibraryLoaded ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 193, 7, 0.3)'}`
                                        }}>
                                            <div className="status-content">
                                                {isLibraryLoaded ? (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                ) : (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M21 12A9 9 0 1 1 3 12A9 9 0 0 1 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                        <path d="M12 3A9 9 0 0 1 20.4 6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                )}
                                                <p style={{ 
                                                    color: isLibraryLoaded ? 'rgb(34, 197, 94)' : 'rgb(255, 193, 7)', 
                                                    margin: 0, 
                                                    fontSize: '14px',
                                                    fontWeight: '500'
                                                }}>
                                                    {isLibraryLoaded ? `Library loaded (${songs.length} tracks)` : 'Loading library...'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* AI Agent related settings - commented out for this version */}
                                {/* Gemini API Settings */}
                                {/* <div className="settings-section" style={{ marginBottom: 'var(--space-xl)' }}>
                                    <div style={{ background: 'var(--card-bg)', padding: 'var(--space-lg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <div className="section-header">
                                            <svg className="section-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 0 12px' }}>AI Integration - Gemini API</h3>
                                        </div>
                                        
                                        <div style={{ marginBottom: '16px' }}>
                                            <p style={{ color: 'var(--text-secondary)', margin: '8px 0', fontSize: '14px' }}>
                                                Configure your Google Gemini API key for AI-powered music analysis and recommendations.
                                            </p>
                                        </div>
                                        
                                        <div style={{ marginBottom: '16px' }}>
                                            <label style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '8px' }}>
                                                Gemini API Key:
                                            </label>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <input 
                                                    type="password" 
                                                    value={geminiApiKey}
                                                    onChange={(e) => setGeminiApiKey(e.target.value)}
                                                    placeholder="Enter your Gemini API key"
                                                    style={{
                                                        flex: 1,
                                                        padding: '8px 12px',
                                                        background: 'var(--surface-bg)',
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '4px',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '14px'
                                                    }}
                                                />
                                                <button 
                                                    onClick={handleSaveGeminiApiKey}
                                                    disabled={isLoadingGeminiSettings}
                                                    style={{
                                                        padding: '8px 16px',
                                                        background: isLoadingGeminiSettings ? 'var(--text-secondary)' : 'var(--accent-color)',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: isLoadingGeminiSettings ? 'not-allowed' : 'pointer',
                                                        fontSize: '14px',
                                                        fontWeight: '500'
                                                    }}
                                                >
                                                    {isLoadingGeminiSettings ? 'Saving...' : 'Save'}
                                                </button>
                                                {geminiApiKey && (
                                                    <button 
                                                        onClick={handleClearGeminiApiKey}
                                                        style={{
                                                            padding: '8px 12px',
                                                            background: 'var(--error-color)',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            fontSize: '14px'
                                                        }}
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="status-indicator" style={{ 
                                            background: isLoadingGeminiSettings ? 'rgba(255, 193, 7, 0.1)' : (isGeminiApiKeySet ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'), 
                                            border: `1px solid ${isLoadingGeminiSettings ? 'rgba(255, 193, 7, 0.3)' : (isGeminiApiKeySet ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)')}`, 
                                            marginBottom: '16px'
                                        }}>
                                            <div className="status-content">
                                                {isLoadingGeminiSettings ? (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M21 12A9 9 0 1 1 3 12A9 9 0 0 1 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                        <path d="M12 3A9 9 0 0 1 20.4 6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                ) : isGeminiApiKeySet ? (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                ) : (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                        <path d="M15 9L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                        <path d="M9 9L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                )}
                                                <p style={{ 
                                                    color: isLoadingGeminiSettings ? 'rgb(255, 193, 7)' : (isGeminiApiKeySet ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'), 
                                                    margin: 0, 
                                                    fontSize: '14px',
                                                    fontWeight: '500'
                                                }}>
                                                    {isLoadingGeminiSettings ? 'Loading settings...' : (isGeminiApiKeySet ? 'Gemini API key configured' : 'Gemini API key required for AI features')}
                                                </p>
                                            </div>
                                        </div>

                                        {showGeminiSaveSuccess && (
                                            <div style={{ 
                                                padding: '12px', 
                                                background: 'rgba(34, 197, 94, 0.1)', 
                                                border: '1px solid rgba(34, 197, 94, 0.3)', 
                                                borderRadius: '4px'
                                            }}>
                                                <p style={{ 
                                                    color: 'rgb(34, 197, 94)', 
                                                    margin: 0, 
                                                    fontSize: '14px',
                                                    fontWeight: '500'
                                                }}>
                                                    Gemini API key saved successfully!
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div> */}

                                {/* Application Information */}
                                <div className="settings-section">
                                    <div style={{ background: 'var(--card-bg)', padding: 'var(--space-lg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <div className="section-header">
                                            <svg className="section-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                <path d="M12 16V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                <path d="M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 0 12px' }}>Application Info</h3>
                                        </div>
                                        
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                                            <p style={{ margin: '8px 0' }}>
                                                <strong>Version:</strong> 1.0.0
                                            </p>
                                            <p style={{ margin: '8px 0' }}>
                                                <strong>Mode:</strong> {isElectronMode ? 'Desktop App' : 'Web Browser'}
                                            </p>
                                            <p style={{ margin: '8px 0' }}>
                                                <strong>API Port:</strong> {apiPort}
                                            </p>
                                            <p style={{ margin: '8px 0' }}>
                                                <strong>Database Service:</strong> {databaseService ? 'Active' : 'Inactive'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
            
            {/* USB Export Modal */}
            {showUSBExport && (
                <USBExport
                    playlist={playlistToExport}
                    onClose={() => {
                        setShowUSBExport(false);
                        setPlaylistToExport(null);
                    }}
                />
            )}
        </div>
        </AuthGate>
    );
};

export default App;