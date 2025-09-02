import React, { useState, useCallback, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface YouTubeTrack {
    id: string;
    title: string;
    artist: string;
    album?: string;
    duration?: string;
    thumbnail: string;
    url: string;
}

interface YouTubeMusicProps {
    apiPort: number;
    apiSigningKey: string;
    downloadPath: string;
    isDownloadPathSet: boolean;
    onDownloadComplete?: (song: any) => void;
}

interface SearchSuggestion {
    text: string;
    type: 'recent' | 'popular' | 'song' | 'title' | 'artist' | 'history' | 'trending';
    title?: string;
    artist?: string;
    source?: string;
}

interface AutocompleteResponse {
    suggestions: SearchSuggestion[];
    status: string;
    query?: string;
    error?: string;
}


const YouTubeMusic: React.FC<YouTubeMusicProps> = ({
    apiPort,
    apiSigningKey,
    downloadPath,
    isDownloadPathSet,
    onDownloadComplete
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<YouTubeTrack[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isDownloading, setIsDownloading] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<{[key: string]: number}>({});
    const [realTimeProgress, setRealTimeProgress] = useState<{[key: string]: any}>({});
    const [downloadedTracks, setDownloadedTracks] = useState<Set<string>>(new Set());
    const [previewingId, setPreviewingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [autocompleteError, setAutocompleteError] = useState<string | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const socketRef = useRef<Socket | null>(null);
    
    // Load recent searches from localStorage and initialize WebSocket
    useEffect(() => {
        const saved = localStorage.getItem('youtube_recent_searches');
        if (saved) {
            try {
                setRecentSearches(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to load recent searches:', e);
            }
        }
        
        // Initialize WebSocket connection for real-time progress
        const initializeWebSocket = () => {
            try {
                console.log('🔌 Initializing WebSocket connection for download progress...');
                
                // First check if backend is accessible
                fetch(`http://127.0.0.1:${apiPort}/hello?signingkey=${apiSigningKey}`)
                    .then(response => {
                        if (response.ok) {
                            console.log('✅ Backend is accessible, initializing WebSocket...');
                            createWebSocket();
                        } else {
                            console.log('⚠️ Backend responded but not ready, retrying in 2 seconds...');
                            setTimeout(createWebSocket, 2000);
                        }
                    })
                    .catch(error => {
                        console.log('⚠️ Backend not accessible, retrying in 3 seconds...', error);
                        setTimeout(createWebSocket, 3000);
                    });
                
            } catch (error) {
                console.error('❌ Failed to check backend accessibility:', error);
                setTimeout(createWebSocket, 3000);
            }
        };

        const createWebSocket = () => {
            try {
                console.log('🔌 Creating WebSocket connection...');
                const socket = io(`http://127.0.0.1:${apiPort}`, {
                    transports: ['websocket', 'polling'],
                    timeout: 15000,
                    autoConnect: true,
                    reconnection: true,
                    reconnectionAttempts: 5,
                    reconnectionDelay: 1000
                });
                
                socket.on('connect', () => {
                    console.log('✅ WebSocket connected for real-time download progress');
                });
                
                socket.on('disconnect', () => {
                    console.log('❌ WebSocket disconnected');
                });
                
                socket.on('connect_error', (error) => {
                    console.error('❌ WebSocket connection error:', error);
                });
                
                socket.on('reconnect', (attemptNumber) => {
                    console.log(`🔄 WebSocket reconnected after ${attemptNumber} attempts`);
                });
                
                socket.on('connected', (data) => {
                    console.log('📡 WebSocket server confirmed:', data.status);
                });
                
                socket.on('test_response', (data) => {
                    console.log('🧪 Test response received:', data);
                });
                
                socket.on('download_progress', (data) => {
                    console.log('📥 Download progress update:', data);
                    
                    if (data.download_id) {
                        console.log('🔄 Updating progress for:', data.download_id, 'Stage:', data.stage, 'Progress:', data.progress);
                        
                        setRealTimeProgress(prev => {
                            const newProgress = {
                                ...prev,
                                [data.download_id]: data
                            };
                            console.log('📊 New real-time progress state:', newProgress);
                            return newProgress;
                        });
                        
                        // Update legacy progress for compatibility
                        if (data.progress !== undefined) {
                            setDownloadProgress(prev => {
                                const newProgress = {
                                    ...prev,
                                    [data.download_id]: data.progress
                                };
                                console.log('📈 New download progress state:', newProgress);
                                return newProgress;
                            });
                        }
                        
                        // Mark as downloaded when complete
                        if (data.stage === 'complete' && data.progress === 100) {
                            console.log('✅ Download complete for:', data.download_id);
                            setDownloadedTracks(prev => new Set([...prev, data.download_id]));
                            setIsDownloading(null);
                            
                            // Trigger collection refresh if callback provided
                            if (onDownloadComplete && data.filename) {
                                onDownloadComplete({
                                    filename: data.filename,
                                    file_path: data.file_path,
                                    download_id: data.download_id
                                });
                            }
                            
                            // Clear progress after delay
                            setTimeout(() => {
                                setRealTimeProgress(prev => {
                                    const newProgress = { ...prev };
                                    delete newProgress[data.download_id];
                                    return newProgress;
                                });
                                setDownloadProgress(prev => {
                                    const newProgress = { ...prev };
                                    delete newProgress[data.download_id];
                                    return newProgress;
                                });
                            }, 5000);
                        }
                        
                        // Handle errors
                        if (data.stage === 'error') {
                            console.error('❌ Download error for:', data.download_id, data.message);
                            setError(data.message || 'Download failed');
                            setIsDownloading(null);
                        }
                    } else {
                        console.warn('⚠️ Download progress update without download_id:', data);
                    }
                });
                
                socketRef.current = socket;
                
            } catch (error) {
                console.error('❌ Failed to initialize WebSocket:', error);
            }
        };
        
        // Initialize WebSocket after a short delay to ensure API is ready
        setTimeout(initializeWebSocket, 1000);
        
        // Load initial trending suggestions
        const loadTrending = async () => {
            try {
                const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/trending`, {
                    method: 'GET',
                    headers: {
                        'X-Signing-Key': apiSigningKey
                    }
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.status === 'success') {
                        setSuggestions(result.suggestions || []);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch trending suggestions:', error);
            }
        };
        
        loadTrending();
        
        // Cleanup WebSocket on unmount
        return () => {
            if (socketRef.current) {
                console.log('🔌 Disconnecting WebSocket...');
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [apiPort, apiSigningKey, onDownloadComplete]);
    
    // Fetch trending suggestions
    const fetchTrendingSuggestions = useCallback(async () => {
        try {
            const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/trending`, {
                method: 'GET',
                headers: {
                    'X-Signing-Key': apiSigningKey
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.status === 'success') {
                    setSuggestions(result.suggestions || []);
                }
            }
        } catch (error) {
            console.error('Failed to fetch trending suggestions:', error);
        }
    }, [apiPort, apiSigningKey]);
    
    // Fetch autocomplete suggestions from API
    const fetchAutocompleteSuggestions = useCallback(async (query: string) => {
        if (!query || query.length < 2) {
            fetchTrendingSuggestions();
            return;
        }
        
        setIsLoadingSuggestions(true);
        setAutocompleteError(null);
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
            
            const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/autocomplete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Signing-Key': apiSigningKey
                },
                body: JSON.stringify({
                    query: query,
                    limit: 8,
                    signingkey: apiSigningKey
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const result: AutocompleteResponse = await response.json();
                if (result.status === 'success') {
                    setSuggestions(result.suggestions || []);
                } else {
                    setAutocompleteError(result.error || 'Autocomplete failed');
                }
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                console.error('Autocomplete error:', error);
                setAutocompleteError('Failed to fetch suggestions');
            }
        } finally {
            setIsLoadingSuggestions(false);
        }
    }, [apiPort, apiSigningKey, fetchTrendingSuggestions]);
    
    // Debounced autocomplete
    const debouncedAutocomplete = useCallback((query: string) => {
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
        
        debounceTimeoutRef.current = setTimeout(() => {
            fetchAutocompleteSuggestions(query);
        }, 300); // 300ms debounce
    }, [fetchAutocompleteSuggestions]);
    
    // Update suggestions based on input with debouncing
    useEffect(() => {
        debouncedAutocomplete(searchQuery);
        
        // Cleanup timeout on unmount
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, [searchQuery, debouncedAutocomplete]);

    
    // Save search to recent searches
    const saveRecentSearch = useCallback((query: string) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery || recentSearches.includes(trimmedQuery)) return;
        
        const newRecent = [trimmedQuery, ...recentSearches.slice(0, 9)]; // Keep last 10
        setRecentSearches(newRecent);
        localStorage.setItem('youtube_recent_searches', JSON.stringify(newRecent));
    }, [recentSearches]);

    // Search YouTube Music
    const handleSearch = useCallback(async (queryOverride?: string) => {
        const query = queryOverride || searchQuery;
        if (!query.trim()) return;
        
        setIsSearching(true);
        setError(null);
        setShowSuggestions(false);
        
        // Save to recent searches
        saveRecentSearch(query);
        
        // Update search query if using override
        if (queryOverride) {
            setSearchQuery(queryOverride);
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    signingkey: apiSigningKey
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Search failed: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.status === 'success') {
                setSearchResults(result.tracks || []);
                if (result.tracks?.length === 0) {
                    setError('No results found. Try different search terms.');
                }
            } else {
                setError(result.error || 'Search failed');
            }
        } catch (error: any) {
            console.error('Search error:', error);
            if (error.name === 'AbortError') {
                setError('Search timeout. Please try again.');
            } else {
                setError('Failed to search YouTube Music. Please check your connection.');
            }
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery, apiPort, apiSigningKey, saveRecentSearch]);

    // Enhanced download track with real-time progress and automatic collection integration
    const handleDownload = useCallback(async (track: YouTubeTrack) => {
        if (!isDownloadPathSet) {
            alert('Please set a download path in Settings first.');
            return;
        }

        const downloadId = `${track.id}_${Date.now()}`;
        setIsDownloading(track.id);
        setDownloadProgress(prev => ({ ...prev, [downloadId]: 0 }));
        setRealTimeProgress(prev => ({ ...prev, [downloadId]: { stage: 'starting', progress: 0, message: 'Preparing download...' } }));
        setError(null);
        
        // Join download room for WebSocket updates
        if (socketRef.current) {
            console.log('🔌 Joining download room for:', downloadId);
            socketRef.current.emit('join_download', { download_id: downloadId });
        } else {
            console.warn('⚠️ WebSocket not available for download:', downloadId);
        }
        
        // Convert YouTube Music URL to regular YouTube URL
        const convertToYouTubeUrl = (url: string, videoId: string) => {
            if (videoId && videoId.trim()) {
                return `https://www.youtube.com/watch?v=${videoId.trim()}`;
            }
            if (url && url.includes('youtube.com/watch')) {
                return url;
            }
            if (url && url.includes('music.youtube.com')) {
                return url.replace('music.youtube.com', 'youtube.com');
            }
            return url;
        };
        
        try {
            const downloadUrl = convertToYouTubeUrl(track.url, track.id);
            
            // Validate the URL format
            if (!downloadUrl || (!downloadUrl.includes('youtube.com/watch?v=') && !downloadUrl.includes('youtu.be/'))) {
                throw new Error('Invalid YouTube URL format. Unable to generate proper download URL.');
            }
            
            console.log('📥 Starting enhanced download:', {
                title: track.title,
                artist: track.artist,
                videoId: track.id,
                downloadUrl: downloadUrl,
                downloadPath: downloadPath,
                downloadId: downloadId
            });
            
            const cleanTitle = (track.title?.trim() || 'Unknown Title').replace(/[<>:"/\\|?*]/g, '_');
            const cleanArtist = (track.artist?.trim() || 'Unknown Artist').replace(/[<>:"/\\|?*]/g, '_');
            
            const requestBody = {
                url: downloadUrl,
                title: cleanTitle,
                artist: cleanArtist,
                download_path: downloadPath,
                download_id: downloadId,
                signingkey: apiSigningKey
            };
            
            console.log('📡 Sending enhanced download request:', requestBody);
            
            // Use enhanced download endpoint
            const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/download-enhanced`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Signing-Key': apiSigningKey
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.error || `Server Error: ${response.status} ${response.statusText}`;
                } catch {
                    errorMessage = `Network Error: ${response.status} ${response.statusText}`;
                }
                
                // Add specific handling for common HTTP errors
                if (response.status === 400) {
                    errorMessage = `Bad Request: ${errorMessage}. Please check if the video URL is valid and accessible.`;
                } else if (response.status === 401) {
                    errorMessage = 'Authentication failed. Please restart the application.';
                } else if (response.status === 404) {
                    errorMessage = 'Video not found or unavailable for download.';
                } else if (response.status >= 500) {
                    errorMessage = 'Server error. Please try again later.';
                }
                
                throw new Error(errorMessage);
            }
            
            const result = await response.json();
            
            if (result.status === 'success') {
                console.log('✅ Enhanced download completed successfully:', result);
                
                // Mark track as downloaded
                setDownloadedTracks(prev => new Set([...prev, track.id]));
                
                // Update progress to 100% if not already done by WebSocket
                setDownloadProgress(prev => ({ ...prev, [downloadId]: 100 }));
                setRealTimeProgress(prev => ({
                    ...prev,
                    [downloadId]: {
                        stage: 'complete',
                        progress: 100,
                        message: 'Download complete! Added to collection.',
                        enhanced_features: result.enhanced_features
                    }
                }));
                
                // Notify parent component
                if (onDownloadComplete && result.song) {
                    onDownloadComplete(result.song);
                }
                
                // Show success message
                const features = result.enhanced_features || {};
                let successMsg = `✅ Downloaded: ${track.title} by ${track.artist}`;
                if (features.quality_guarantee) {
                    successMsg += ` (${features.quality_guarantee})`;
                }
                if (features.artwork_embedded) {
                    successMsg += ' with artwork';
                }
                if (features.collection_integration) {
                    successMsg += ' - Added to collection';
                }
                
                alert(successMsg);
                
                // Clear progress after delay
                setTimeout(() => {
                    setDownloadProgress(prev => {
                        const newProgress = { ...prev };
                        delete newProgress[downloadId];
                        return newProgress;
                    });
                    setRealTimeProgress(prev => {
                        const newProgress = { ...prev };
                        delete newProgress[downloadId];
                        return newProgress;
                    });
                }, 5000);
                
            } else {
                throw new Error(result.error || 'Download failed - no success status');
            }
            
        } catch (error: any) {
            console.error('❌ Enhanced download error:', error);
            
            const finalError = `Download failed: ${error.message}`;
            setError(finalError);
            
            // Update progress to show error
            setRealTimeProgress(prev => ({
                ...prev,
                [downloadId]: {
                    stage: 'error',
                    progress: 0,
                    message: error.message
                }
            }));
            
            // Clear download progress on failure
            setTimeout(() => {
                setDownloadProgress(prev => {
                    const newProgress = { ...prev };
                    delete newProgress[downloadId];
                    return newProgress;
                });
                setRealTimeProgress(prev => {
                    const newProgress = { ...prev };
                    delete newProgress[downloadId];
                    return newProgress;
                });
            }, 3000);
        } finally {
            setIsDownloading(null);
        }
    }, [apiPort, apiSigningKey, downloadPath, isDownloadPathSet, onDownloadComplete]);

    
    // Handle suggestion selection
    const handleSuggestionSelect = useCallback((suggestion: string) => {
        setSearchQuery(suggestion);
        setShowSuggestions(false);
        handleSearch(suggestion);
    }, [handleSearch]);
    
    // Handle input focus
    const handleInputFocus = useCallback(() => {
        setShowSuggestions(true);
    }, []);
    
    // Handle input blur with delay to allow suggestion clicks
    const handleInputBlur = useCallback(() => {
        setTimeout(() => setShowSuggestions(false), 200);
    }, []);

    // Handle Enter key press for search
    const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    }, [handleSearch]);

    // Handle preview functionality
    const handlePreview = useCallback((track: YouTubeTrack) => {
        if (previewingId === track.id) {
            // Stop preview
            setPreviewingId(null);
            console.log(`⏹️ Stopped preview for: ${track.title}`);
            return;
        }

        console.log(`🎵 Starting preview for: ${track.title} by ${track.artist}`);
        setPreviewingId(track.id);
        
        // Create audio element for preview
        const audio = new Audio();
        audio.volume = 0.7; // Set volume to 70%
        
        // Set up audio event handlers
        audio.onloadstart = () => {
            console.log('🎵 Audio loading started...');
        };
        
        audio.oncanplay = () => {
            console.log('🎵 Audio can play, starting...');
            audio.play().catch(error => {
                console.error('❌ Failed to play audio:', error);
                setPreviewingId(null);
                alert('Failed to play preview. Please try again.');
            });
        };
        
        audio.onerror = (error) => {
            console.error('❌ Audio error:', error);
            setPreviewingId(null);
            alert('Failed to load preview. Please try again.');
        };
        
        audio.onended = () => {
            console.log('⏹️ Preview ended');
            setPreviewingId(null);
        };
        
        // Set audio source to backend streaming endpoint
        audio.src = `http://127.0.0.1:${apiPort}/youtube/stream/${track.id}?signingkey=${apiSigningKey}`;
        
        // Auto-stop preview after 30 seconds
        const autoStopTimer = setTimeout(() => {
            if (previewingId === track.id) {
                audio.pause();
                audio.currentTime = 0;
                setPreviewingId(null);
                console.log(`⏰ Preview auto-stopped for: ${track.title}`);
            }
        }, 30000);
        
        // Cleanup function
        return () => {
            clearTimeout(autoStopTimer);
            audio.pause();
            audio.currentTime = 0;
        };
    }, [previewingId, apiPort, apiSigningKey]);

    return (
        <div className="youtube-music-container" style={{ padding: 'var(--space-lg)' }}>
            {/* Search Section */}
            <div className="search-section" style={{ marginBottom: 'var(--space-xl)' }}>
                <div style={{ position: 'relative', marginBottom: 'var(--space-md)' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyPress={handleKeyPress}
                                onFocus={handleInputFocus}
                                onBlur={handleInputBlur}
                                placeholder="Search for songs, artists, or albums..."
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    fontSize: '16px',
                                    background: 'var(--surface-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    color: 'var(--text-primary)',
                                    borderBottomLeftRadius: showSuggestions && suggestions.length > 0 ? '0' : '8px',
                                    borderBottomRightRadius: showSuggestions && suggestions.length > 0 ? '0' : '8px'
                                }}
                                disabled={isSearching}
                            />
                            
                            {/* Suggestions Dropdown */}
                            {showSuggestions && suggestions.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    background: 'var(--surface-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderTop: 'none',
                                    borderBottomLeftRadius: '8px',
                                    borderBottomRightRadius: '8px',
                                    maxHeight: '400px',
                                    overflowY: 'auto',
                                    zIndex: 1000,
                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                                }}>
                                    {isLoadingSuggestions && (
                                        <div style={{
                                            padding: '12px 16px',
                                            color: 'var(--text-secondary)',
                                            fontSize: '14px',
                                            textAlign: 'center'
                                        }}>
                                            Loading suggestions...
                                        </div>
                                    )}
                                    
                                    {autocompleteError && (
                                        <div style={{
                                            padding: '12px 16px',
                                            color: 'var(--error-color)',
                                            fontSize: '14px',
                                            textAlign: 'center'
                                        }}>
                                            {autocompleteError}
                                        </div>
                                    )}
                                    
                                    {!isLoadingSuggestions && !autocompleteError && suggestions.map((suggestion, index) => {
                                        const getLabel = (type: string) => {
                                            switch (type) {
                                                case 'recent':
                                                case 'history':
                                                    return 'Recent';
                                                case 'trending':
                                                case 'popular':
                                                    return 'Trending';
                                                case 'song':
                                                    return 'Song';
                                                case 'artist':
                                                    return 'Artist';
                                                case 'title':
                                                    return 'Title';
                                                default:
                                                    return '';
                                            }
                                        };
                                        
                                        return (
                                            <div
                                                key={`${suggestion.type}-${index}-${suggestion.text}`}
                                                onClick={() => handleSuggestionSelect(suggestion.text)}
                                                style={{
                                                    padding: '12px 16px',
                                                    cursor: 'pointer',
                                                    borderBottom: index < suggestions.length - 1 ? '1px solid var(--border-color)' : 'none',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '12px',
                                                    transition: 'background-color 0.2s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = 'var(--card-bg)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'var(--surface-bg)';
                                                }}
                                            >
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        color: 'var(--text-primary)',
                                                        fontSize: '14px',
                                                        fontWeight: '500',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {suggestion.text}
                                                    </div>
                                                    {suggestion.artist && suggestion.title && suggestion.type === 'song' && (
                                                        <div style={{
                                                            color: 'var(--text-tertiary)',
                                                            fontSize: '12px',
                                                            marginTop: '2px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {suggestion.title} • {suggestion.artist}
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                <span style={{
                                                    marginLeft: 'auto',
                                                    fontSize: '11px',
                                                    color: 'var(--text-tertiary)',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px',
                                                    fontWeight: '500',
                                                    flexShrink: 0
                                                }}>
                                                    {getLabel(suggestion.type)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        
                        <button
                            onClick={() => handleSearch()}
                            disabled={isSearching || !searchQuery.trim()}
                            style={{
                                padding: '12px 24px',
                                fontSize: '16px',
                                fontWeight: '600',
                                background: isSearching 
                                    ? 'linear-gradient(135deg, var(--surface-bg) 0%, rgba(139, 69, 255, 0.1) 100%)' 
                                    : !searchQuery.trim()
                                        ? 'var(--surface-bg)'
                                        : 'linear-gradient(135deg, var(--accent-color) 0%, #6366f1 100%)',
                                color: isSearching || !searchQuery.trim() ? 'var(--text-disabled)' : 'white',
                                border: isSearching 
                                    ? '1px solid var(--accent-color)' 
                                    : !searchQuery.trim()
                                        ? '1px solid var(--border-color)'
                                        : 'none',
                                borderRadius: '8px',
                                cursor: isSearching ? 'not-allowed' : !searchQuery.trim() ? 'default' : 'pointer',
                                minWidth: '120px',
                                height: '48px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: !isSearching && searchQuery.trim() 
                                    ? '0 4px 12px rgba(139, 69, 255, 0.2), 0 0 0 0 rgba(139, 69, 255, 0.4)' 
                                    : 'none',
                                transform: 'translateY(0)',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                            onMouseEnter={(e) => {
                                if (!isSearching && searchQuery.trim()) {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(139, 69, 255, 0.3), 0 0 0 2px rgba(139, 69, 255, 0.2)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isSearching && searchQuery.trim()) {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 69, 255, 0.2), 0 0 0 0 rgba(139, 69, 255, 0.4)';
                                }
                            }}
                            onMouseDown={(e) => {
                                if (!isSearching && searchQuery.trim()) {
                                    e.currentTarget.style.transform = 'translateY(1px)';
                                }
                            }}
                            onMouseUp={(e) => {
                                if (!isSearching && searchQuery.trim()) {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                }
                            }}
                        >
                            {/* Loading animation backdrop */}
                            {isSearching && (
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'linear-gradient(90deg, transparent, rgba(139, 69, 255, 0.3), transparent)',
                                    animation: 'shimmer 1.5s infinite',
                                    borderRadius: '8px'
                                }} />
                            )}
                            
                            {/* Button text */}
                            <span style={{
                                position: 'relative',
                                zIndex: 1,
                                letterSpacing: '0.5px'
                            }}>
                                {isSearching ? 'Searching...' : 'Search'}
                            </span>
                            
                            {/* Pulse effect for searching state */}
                            {isSearching && (
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    width: '100%',
                                    height: '100%',
                                    background: 'rgba(139, 69, 255, 0.1)',
                                    borderRadius: '8px',
                                    transform: 'translate(-50%, -50%)',
                                    animation: 'pulse 2s infinite',
                                    pointerEvents: 'none'
                                }} />
                            )}
                        </button>
                        
                        {/* Add CSS animations */}
                        <style>{`
                            @keyframes shimmer {
                                0% { transform: translateX(-100%); }
                                100% { transform: translateX(100%); }
                            }
                            
                            @keyframes pulse {
                                0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
                                50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.05); }
                            }
                            
                            /* Responsive grid for track cards */
                            .tracks-grid {
                                display: grid;
                                gap: 16px;
                                grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
                                width: 100%;
                            }
                            
                            /* Large screens - 3 columns */
                            @media (min-width: 1400px) {
                                .tracks-grid {
                                    grid-template-columns: repeat(3, 1fr);
                                }
                            }
                            
                            /* Medium-large screens - 2 columns */
                            @media (max-width: 1399px) and (min-width: 1024px) {
                                .tracks-grid {
                                    grid-template-columns: repeat(2, 1fr);
                                }
                            }
                            
                            /* Tablet screens */
                            @media (max-width: 1023px) and (min-width: 769px) {
                                .tracks-grid {
                                    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
                                }
                            }
                            
                            /* Small tablet and mobile */
                            @media (max-width: 768px) {
                                .tracks-grid {
                                    grid-template-columns: 1fr;
                                    gap: 12px;
                                }
                                .track-card {
                                    padding: 12px !important;
                                    gap: 12px !important;
                                }
                                .track-duration {
                                    display: none !important;
                                }
                            }
                            
                            /* Mobile phones */
                            @media (max-width: 480px) {
                                .tracks-grid {
                                    gap: 8px;
                                }
                                .track-card {
                                    flex-direction: column !important;
                                    align-items: flex-start !important;
                                    text-align: left !important;
                                    padding: 10px !important;
                                    gap: 8px !important;
                                }
                                .track-info {
                                    width: 100% !important;
                                }
                                .track-download {
                                    width: 100% !important;
                                    margin-top: 8px !important;
                                }
                                .youtube-music-container {
                                    padding: 12px !important;
                                }
                                .search-section {
                                    margin-bottom: 12px !important;
                                }
                                .search-section > div:first-child {
                                    flex-direction: column !important;
                                    gap: 8px !important;
                                }
                                .search-section input {
                                    font-size: 16px !important; /* Prevents zoom on iOS */
                                }
                                .search-section button {
                                    width: 100% !important;
                                    justify-self: stretch !important;
                                }
                            }
                            
                            @media (max-width: 360px) {
                                .tracks-grid {
                                    gap: 6px;
                                }
                                .track-card {
                                    padding: 8px !important;
                                    gap: 6px !important;
                                }
                                .youtube-music-container {
                                    padding: 8px !important;
                                }
                            }
                        `}</style>
                    </div>
                </div>

                {error && (
                    <div style={{
                        padding: 'var(--space-md)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        color: 'rgb(239, 68, 68)',
                        marginBottom: 'var(--space-md)'
                    }}>
                        ❌ {error}
                    </div>
                )}
            </div>

            {/* Search Results */}
            <div className="search-results">
                {searchResults.length > 0 && (
                    <h3 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-lg)' }}>
                        Search Results ({searchResults.length})
                    </h3>
                )}

                <div className="tracks-grid">
                    {searchResults.map((track) => {
                        const isCurrentlyDownloading = isDownloading === track.id;
                        const progress = downloadProgress[track.id] || 0;

                        return (
                            <div
                                key={track.id}
                                className="track-card"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: 'var(--space-md)',
                                    background: 'var(--card-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    gap: 'var(--space-md)',
                                    minWidth: '0', // Allow flex items to shrink
                                    width: '100%',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--accent-color)';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 69, 255, 0.15)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--border-color)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                {/* Thumbnail */}
                                <img
                                    src={track.thumbnail}
                                    alt={`${track.title} by ${track.artist}`}
                                    style={{
                                        width: '60px',
                                        height: '60px',
                                        borderRadius: '6px',
                                        objectFit: 'cover',
                                        flexShrink: 0
                                    }}
                                    onError={(e) => {
                                        // Fallback for broken images
                                        e.currentTarget.style.display = 'none';
                                    }}
                                />

                                {/* Track Info */}
                                <div className="track-info" style={{ 
                                    flex: 1, 
                                    minWidth: 0, // Allow text to truncate
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px'
                                }}>
                                    <h4 style={{
                                        color: 'var(--text-primary)',
                                        margin: '0',
                                        fontSize: '16px',
                                        fontWeight: '500',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        lineHeight: '1.2'
                                    }}>
                                        {track.title}
                                    </h4>
                                    <p style={{
                                        color: 'var(--text-secondary)',
                                        margin: '0',
                                        fontSize: '14px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        lineHeight: '1.2'
                                    }}>
                                        {track.artist}
                                    </p>
                                    {track.album && (
                                        <p style={{
                                            color: 'var(--text-tertiary)',
                                            margin: '0',
                                            fontSize: '12px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            lineHeight: '1.2'
                                        }}>
                                            {track.album}
                                        </p>
                                    )}
                                </div>

                                {/* Duration - Hide on small screens */}
                                {track.duration && (
                                    <div className="track-duration" style={{
                                        color: 'var(--text-secondary)',
                                        fontSize: '14px',
                                        fontFamily: 'monospace',
                                        flexShrink: 0
                                    }}>
                                        {track.duration}
                                    </div>
                                )}

                                {/* Download Button / Progress */}
                                <div className="track-download" style={{ width: '120px', textAlign: 'center', flexShrink: 0 }}>
                                    {(() => {
                                        const isCurrentlyDownloading = isDownloading === track.id;
                                        const isDownloaded = downloadedTracks.has(track.id);
                                        
                                        // Find any active progress for this track
                                        const activeProgress = Object.entries(realTimeProgress).find(
                                            ([id, _]) => id.startsWith(track.id)
                                        );
                                        const progressData = activeProgress ? activeProgress[1] : null;
                                        const progressPercent = progressData?.progress || downloadProgress[track.id] || 0;
                                        
                                        if (isCurrentlyDownloading || (progressData && progressData.stage !== 'complete')) {
                                            return (
                                                <div style={{ width: '100%' }}>
                                                    {/* Enhanced Progress Bar */}
                                                    <div style={{
                                                        width: '100%',
                                                        height: '6px',
                                                        backgroundColor: 'var(--surface-bg)',
                                                        borderRadius: '3px',
                                                        overflow: 'hidden',
                                                        marginBottom: '4px',
                                                        border: '1px solid var(--border-color)'
                                                    }}>
                                                        <div style={{
                                                            width: `${Math.max(progressPercent, 2)}%`,
                                                            height: '100%',
                                                            background: progressData?.stage === 'error' 
                                                                ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                                                                : progressData?.stage === 'complete'
                                                                    ? 'linear-gradient(90deg, #10b981, #059669)'
                                                                    : 'linear-gradient(90deg, var(--accent-color), #6366f1)',
                                                            transition: 'width 0.3s ease, background 0.3s ease',
                                                            borderRadius: '2px'
                                                        }} />
                                                    </div>
                                                    
                                                    {/* Progress Text */}
                                                    <div style={{
                                                        color: progressData?.stage === 'error' 
                                                            ? '#ef4444'
                                                            : progressData?.stage === 'complete'
                                                                ? '#10b981'
                                                                : 'var(--text-secondary)',
                                                        fontSize: '11px',
                                                        fontWeight: '500',
                                                        marginBottom: '2px'
                                                    }}>
                                                        {progressPercent}%
                                                    </div>
                                                    
                                                    {/* Stage Message */}
                                                    <div style={{
                                                        color: 'var(--text-tertiary)',
                                                        fontSize: '10px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        maxWidth: '100%'
                                                    }}>
                                                        {progressData?.message || 'Downloading...'}
                                                    </div>
                                                    
                                                    {/* Speed indicator for downloading stage */}
                                                    {progressData?.speed && progressData.stage === 'downloading' && (
                                                        <div style={{
                                                            color: 'var(--text-tertiary)',
                                                            fontSize: '9px',
                                                            marginTop: '1px'
                                                        }}>
                                                            {(progressData.speed / 1024 / 1024).toFixed(1)} MB/s
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        } else if (isDownloaded || progressPercent === 100) {
                                            return (
                                                <div style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '2px'
                                                }}>
                                                    <div style={{
                                                        color: '#10b981',
                                                        fontSize: '14px',
                                                        fontWeight: '600',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        ✓ Downloaded
                                                    </div>
                                                    <div style={{
                                                        fontSize: '10px',
                                                        color: 'var(--text-tertiary)'
                                                    }}>
                                                        320kbps MP3
                                                    </div>
                                                </div>
                                            );
                                        } else {
                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    {/* Preview Button */}
                                                    <button
                                                        onClick={() => handlePreview(track)}
                                                        style={{
                                                            padding: '6px 12px',
                                                            fontSize: '12px',
                                                            fontWeight: '500',
                                                            background: previewingId === track.id ? 'var(--accent-color)' : 'var(--surface-bg)',
                                                            color: previewingId === track.id ? 'white' : 'var(--text-primary)',
                                                            border: '1px solid var(--border-color)',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            width: '100%',
                                                            transition: 'all 0.2s ease'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (previewingId !== track.id) {
                                                                e.currentTarget.style.backgroundColor = 'var(--accent-color)';
                                                                e.currentTarget.style.color = 'white';
                                                                e.currentTarget.style.borderColor = 'var(--accent-color)';
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (previewingId !== track.id) {
                                                                e.currentTarget.style.backgroundColor = 'var(--surface-bg)';
                                                                e.currentTarget.style.color = 'var(--text-primary)';
                                                                e.currentTarget.style.borderColor = 'var(--border-color)';
                                                            }
                                                        }}
                                                    >
                                                        {previewingId === track.id ? 'Playing...' : 'Preview'}
                                                    </button>
                                                    
                                                    {/* Download Button */}
                                                    <button
                                                        onClick={() => handleDownload(track)}
                                                        disabled={!isDownloadPathSet}
                                                        style={{
                                                            padding: '6px 12px',
                                                            fontSize: '12px',
                                                            fontWeight: '500',
                                                            background: isDownloadPathSet 
                                                                ? 'linear-gradient(135deg, var(--accent-color) 0%, #6366f1 100%)' 
                                                                : 'var(--surface-bg)',
                                                            color: isDownloadPathSet ? 'white' : 'var(--text-disabled)',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: isDownloadPathSet ? 'pointer' : 'not-allowed',
                                                            width: '100%',
                                                            transition: 'all 0.2s ease',
                                                            boxShadow: isDownloadPathSet 
                                                                ? '0 2px 4px rgba(139, 69, 255, 0.2)' 
                                                                : 'none'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (isDownloadPathSet) {
                                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                                                e.currentTarget.style.boxShadow = '0 4px 8px rgba(139, 69, 255, 0.3)';
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (isDownloadPathSet) {
                                                                e.currentTarget.style.transform = 'translateY(0)';
                                                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(139, 69, 255, 0.2)';
                                                            }
                                                        }}
                                                    >
                                                        Download
                                                    </button>
                                                    
                                                    {/* Enhanced features indicator */}
                                                    <div style={{
                                                        fontSize: '9px',
                                                        color: 'var(--text-tertiary)',
                                                        textAlign: 'center',
                                                        lineHeight: '1.2'
                                                    }}>
                                                        320kbps + Artwork
                                                    </div>
                                                </div>
                                            );
                                        }
                                    })()}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {searchResults.length === 0 && !isSearching && searchQuery && (
                    <div style={{
                        textAlign: 'center',
                        padding: 'var(--space-xl)',
                        color: 'var(--text-secondary)'
                    }}>
                        <p>No results found for "{searchQuery}"</p>
                        <p>Try searching with different keywords</p>
                    </div>
                )}
            </div>


        </div>
    );
};

export default YouTubeMusic;