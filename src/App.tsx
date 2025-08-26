import React, { useState, useCallback, useMemo } from 'react';
import './App.css';
import FileUpload from './components/FileUpload';
import CamelotWheel from './components/CamelotWheel';
import AnalysisResults from './components/AnalysisResults';
import AudioPlayer from './components/AudioPlayer';
import PlaylistManager, { Playlist } from './components/PlaylistManager';
import TrackTable from './components/TrackTable';

export interface Song {
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
    status?: string;
    analysis_date?: string;
    cue_points?: number[];
}

const App: React.FC = () => {
    console.log('App component rendering...');
    const [songs, setSongs] = useState<Song[]>([]);
    const [selectedSong, setSelectedSong] = useState<Song | null>(null);
    const [currentlyPlaying, setCurrentlyPlaying] = useState<Song | null>(null);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
    const [apiPort, setApiPort] = useState(5002); // Default fallback
    const [apiSigningKey, setApiSigningKey] = useState("devkey"); // Default fallback
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [currentView, setCurrentView] = useState<'library' | 'upload' | 'wheel'>('library');
    const [isElectronMode, setIsElectronMode] = useState(false);
    const [showCompatibleOnly, setShowCompatibleOnly] = useState(false);

    // Check if running in Electron and get API details
    React.useEffect(() => {
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
                        console.log('Received API details from Electron:', apiInfo);
                        setApiPort(apiInfo.port);
                        setApiSigningKey(apiInfo.signingKey);
                    } catch (error) {
                        console.error('Error parsing API details:', error);
                    }
                });
                
                // Listen for API details error
                ipcRenderer.on('apiDetailsError', (event: any, error: string) => {
                    console.error('Error getting API details:', error);
                    // Keep using default values in case of error
                });
                
                // Cleanup listeners
                return () => {
                    ipcRenderer.removeAllListeners('apiDetails');
                    ipcRenderer.removeAllListeners('apiDetailsError');
                };
            } catch (error) {
                console.error('Error setting up Electron IPC:', error);
            }
        }
    }, []);

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

        // Check backend health every 30 seconds
        const healthCheckInterval = setInterval(checkBackendHealth, 30000);
        
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

    const handleFileUpload = useCallback(async (file: File) => {
        console.log('Starting file upload:', file.name, 'to port:', apiPort);
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
                const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
                
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
                
                if (result.status === 'success') {
                    const newSong: Song = {
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
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
                        status: 'analyzed',
                        analysis_date: new Date().toISOString(),
                        cue_points: result.cue_points || []
                    };
                    
                    setSongs(prevSongs => [...prevSongs, newSong]);
                    setSelectedSong(newSong);
                    setCurrentView('library');
                    console.log('Song added successfully:', newSong.filename);
                    break; // Success, exit retry loop
                } else {
                    const errorMsg = `Analysis failed: ${result.error || 'Unknown error'}`;
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
                    (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
                    console.log(`Network error, retrying in 2 seconds... (${retryCount + 1}/${maxRetries + 1})`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    retryCount++;
                    continue;
                }
                
                let errorMessage = 'Upload failed';
                if (error instanceof Error) {
                    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                        errorMessage = `Cannot connect to backend server on port ${apiPort}.\n\nThe Python backend may have stopped. Please restart it using:\n./start_backend.sh`;
                    } else if (error.message.includes('timeout') || error.message.includes('AbortError')) {
                        errorMessage = `Upload timed out. The file may be too large or the backend is overloaded.\n\nTry uploading a smaller file or restart the backend.`;
                    } else {
                        errorMessage = `Upload failed: ${error.message}`;
                    }
                }
                alert(errorMessage);
                break; // Exit retry loop on non-network errors
            }
        }
        
        setIsAnalyzing(false);
    }, [apiSigningKey, apiPort, testBackendConnection]);

    const handleFolderUpload = useCallback(async (files: FileList) => {
        const musicFiles = Array.from(files).filter(file => 
            file.type.startsWith('audio/') || 
            /\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(file.name)
        );

        if (musicFiles.length === 0) {
            alert('No valid audio files found in the selected folder.');
            return;
        }

        setIsAnalyzing(true);
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < musicFiles.length; i++) {
            const file = musicFiles[i];
            
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('signingkey', apiSigningKey);

                const response = await fetch(`http://127.0.0.1:${apiPort}/upload-analyze`, {
                    method: 'POST',
                    body: formData,
                });

                const result = await response.json();
                
                if (result.status === 'success') {
                    const newSong: Song = {
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9) + i,
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
                        status: 'analyzed',
                        analysis_date: new Date().toISOString()
                    };
                    
                    setSongs(prevSongs => [...prevSongs, newSong]);
                    successCount++;
                } else {
                    console.error(`Analysis failed for ${file.name}:`, result.error);
                    errorCount++;
                }
            } catch (error) {
                console.error(`Upload/analysis error for ${file.name}:`, error);
                errorCount++;
            }
        }

        setIsAnalyzing(false);
        setCurrentView('library');
        
        if (successCount > 0) {
            alert(`Successfully processed ${successCount} files. ${errorCount > 0 ? `${errorCount} files failed.` : ''}`);
        } else {
            alert('No files were successfully processed.');
        }
    }, [apiSigningKey, apiPort]);

    const handleSongSelect = useCallback((song: Song) => {
        setSelectedSong(song);
    }, []);

    const handleDeleteSong = useCallback((songId: string) => {
        setSongs(prevSongs => prevSongs.filter(song => song.id !== songId));
        if (selectedSong && selectedSong.id === songId) {
            setSelectedSong(null);
        }
    }, [selectedSong]);

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

    // Playlist management functions
    const handlePlaylistCreate = useCallback((playlist: { name: string; songs: Song[]; description?: string; color?: string }) => {
        const newPlaylist: Playlist = {
            ...playlist,
            id: Date.now().toString(),
            createdAt: new Date()
        };
        setPlaylists(prev => [...prev, newPlaylist]);
    }, []);

    const handlePlaylistUpdate = useCallback((playlistId: string, updates: { name?: string; songs?: Song[]; description?: string; color?: string }) => {
        setPlaylists(prev => prev.map(playlist => 
            playlist.id === playlistId ? { ...playlist, ...updates } : playlist
        ));
    }, []);

    const handlePlaylistDelete = useCallback((playlistId: string) => {
        setPlaylists(prev => prev.filter(playlist => playlist.id !== playlistId));
        if (selectedPlaylist && selectedPlaylist.id === playlistId) {
            setSelectedPlaylist(null);
        }
    }, [selectedPlaylist]);

    const handleAddToPlaylist = useCallback((playlistId: string, songsToAdd: Song[]) => {
        setPlaylists(prev => prev.map(playlist => {
            if (playlist.id === playlistId) {
                const existingSongIds = playlist.songs.map(s => s.id);
                const newSongs = songsToAdd.filter(s => !existingSongIds.includes(s.id));
                return {
                    ...playlist,
                    songs: [...playlist.songs, ...newSongs]
                };
            }
            return playlist;
        }));
    }, []);

    const handleRemoveFromPlaylist = useCallback((playlistId: string, songIds: string[]) => {
        setPlaylists(prev => prev.map(playlist => {
            if (playlist.id === playlistId) {
                return {
                    ...playlist,
                    songs: playlist.songs.filter(song => !songIds.includes(song.id))
                };
            }
            return playlist;
        }));
    }, []);

    // Audio player functions
    const handleSongPlay = useCallback((song: Song) => {
        setCurrentlyPlaying(song);
        setSelectedSong(song);
    }, []);

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

    // Get current song list based on selected playlist
    const currentSongs = useMemo(() => {
        return selectedPlaylist ? selectedPlaylist.songs : songs;
    }, [selectedPlaylist, songs]);

    console.log('App render - apiPort:', apiPort, 'currentView:', currentView);

    return (
        <div className="App">
            <header className="App-header">
                <div className="header-content">
                    <div className="brand">
                        <div className="logo">MIXED IN KEY</div>
                    </div>
                    <nav className="nav-tabs">
                        <button 
                            className={currentView === 'library' ? 'active' : ''}
                            onClick={() => setCurrentView('library')}
                        >
                            My collection
                        </button>
                        <button>⚙️  Settings</button>
                    </nav>
                    <div className="search-box-header">
                        <input type="text" placeholder="Search" />
                    </div>
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
                            onFolderUpload={handleFolderUpload}
                            isAnalyzing={isAnalyzing}
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
                                />
                            </div>

                            {/* Scrollable Track Table */}
                            <div className="table-section">
                                <TrackTable
                                    songs={currentSongs}
                                    selectedSong={selectedSong}
                                    onSongSelect={setSelectedSong}
                                    onSongPlay={handleSongPlay}
                                    onDeleteSong={handleDeleteSong}
                                    currentlyPlaying={currentlyPlaying}
                                    getCompatibleSongs={getCompatibleSongs}
                                    showCompatibleOnly={showCompatibleOnly}
                                />
                            </div>
                        </>
                    )}

                    {currentView === 'upload' && (
                        <div className="upload-view" style={{ height: '100%', overflow: 'auto', padding: 'var(--space-xl)' }}>
                            <FileUpload 
                                onFileUpload={handleFileUpload}
                                onFolderUpload={handleFolderUpload}
                                isAnalyzing={isAnalyzing}
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
                </main>
            </div>
        </div>
    );
};

export default App;