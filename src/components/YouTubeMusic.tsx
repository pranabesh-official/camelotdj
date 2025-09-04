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
    const [cancellableDownloads, setCancellableDownloads] = useState<Set<string>>(new Set());
    const [cancelledDownloads, setCancelledDownloads] = useState<Set<string>>(new Set());
    const [previewingId, setPreviewingId] = useState<string | null>(null);
    const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isStoppingRef = useRef<boolean>(false);
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
                            
                            // Clear cancellable downloads state
                            setCancellableDownloads(prev => {
                                const newSet = new Set(prev);
                                // Find track ID from download ID
                                const trackId = Object.keys(realTimeProgress).find(id => id === data.download_id)?.split('_')[0];
                                if (trackId) {
                                    newSet.delete(trackId);
                                }
                                return newSet;
                            });
                            
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
                        
                        // Handle cancellation
                        if (data.stage === 'cancelled') {
                            console.log('🚫 Download cancelled for:', data.download_id);
                            setIsDownloading(null);
                            
                            // Clear cancellable downloads state
                            setCancellableDownloads(prev => {
                                const newSet = new Set(prev);
                                // Find track ID from download ID
                                const trackId = Object.keys(realTimeProgress).find(id => id === data.download_id)?.split('_')[0];
                                if (trackId) {
                                    newSet.delete(trackId);
                                }
                                return newSet;
                            });
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
        setCancellableDownloads(prev => new Set([...prev, track.id]));
        setCancelledDownloads(prev => {
            const newSet = new Set(prev);
            newSet.delete(track.id);
            return newSet;
        });
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
                signingkey: apiSigningKey,
                quality: '320kbps', // Ensure minimum 320kbps quality
                format: 'mp3',
                embed_metadata: true,
                embed_artwork: true
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
                
                // Clear cancellable downloads state
                setCancellableDownloads(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(track.id);
                    return newSet;
                });
                
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
                
                // Show enhanced success message with quality info
                const features = result.enhanced_features || {};
                let successMsg = `🎵 Successfully Downloaded!\n\n`;
                successMsg += `📀 ${track.title}\n`;
                successMsg += `🎤 ${track.artist}\n\n`;
                successMsg += `✨ Quality: 320kbps MP3\n`;
                if (features.artwork_embedded) {
                    successMsg += `🖼️ Album artwork embedded\n`;
                }
                if (features.metadata_embedded) {
                    successMsg += `📝 Metadata embedded\n`;
                }
                successMsg += `\n📁 Added to your music collection\n`;
                successMsg += `🔍 Ready for analysis and mixing!`;
                
                // Show success notification instead of alert
                const notification = document.createElement('div');
                notification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                    padding: 16px 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
                    z-index: 10000;
                    max-width: 300px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 14px;
                    line-height: 1.4;
                    animation: slideInRight 0.3s ease-out;
                `;
                notification.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                        <strong>Download Complete!</strong>
                    </div>
                    <div style="font-size: 12px; opacity: 0.9;">
                        ${track.title} by ${track.artist}<br>
                        Quality: 320kbps • Added to Collection
                    </div>
                `;
                
                // Add animation styles
                const style = document.createElement('style');
                style.textContent = `
                    @keyframes slideInRight {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
                document.body.appendChild(notification);
                
                // Auto-remove notification after 5 seconds
                setTimeout(() => {
                    notification.style.animation = 'slideInRight 0.3s ease-out reverse';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                        if (style.parentNode) {
                            style.parentNode.removeChild(style);
                        }
                    }, 300);
                }, 5000);
                
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

    // Cancel download function
    const handleCancelDownload = useCallback(async (trackId: string) => {
        console.log('🚫 Cancelling download for track:', trackId);
        
        // Find the download ID for this track
        const downloadId = Object.keys(realTimeProgress).find(id => id.startsWith(trackId));
        
        if (downloadId) {
            try {
                // Send cancel request to backend
                const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/cancel-download`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Signing-Key': apiSigningKey
                    },
                    body: JSON.stringify({
                        download_id: downloadId,
                        signingkey: apiSigningKey
                    })
                });
                
                if (response.ok) {
                    console.log('✅ Download cancellation request sent');
                } else {
                    console.warn('⚠️ Failed to send cancellation request');
                }
            } catch (error) {
                console.error('❌ Error sending cancellation request:', error);
            }
        }
        
        // Update local state
        setCancelledDownloads(prev => new Set([...prev, trackId]));
        setCancellableDownloads(prev => {
            const newSet = new Set(prev);
            newSet.delete(trackId);
            return newSet;
        });
        setIsDownloading(null);
        
        // Clear progress
        setDownloadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[downloadId || trackId];
            return newProgress;
        });
        setRealTimeProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[downloadId || trackId];
            return newProgress;
        });
        
        // Show cancellation notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: white;
            padding: 16px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
            z-index: 10000;
            max-width: 300px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.4;
            animation: slideInRight 0.3s ease-out;
        `;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <strong>Download Cancelled</strong>
            </div>
            <div style="font-size: 12px; opacity: 0.9;">
                Download has been cancelled successfully
            </div>
        `;
        
        // Add animation styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(notification);
        
        // Auto-remove notification after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                if (style.parentNode) {
                    style.parentNode.removeChild(style);
                }
            }, 300);
        }, 3000);
        
    }, [apiPort, apiSigningKey, realTimeProgress]);

    
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

    // Stop current audio preview
    const stopPreview = useCallback(() => {
        isStoppingRef.current = true; // Set flag to prevent error messages
        
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.src = '';
            audioRef.current = null;
        }
        
        if (autoStopTimerRef.current) {
            clearTimeout(autoStopTimerRef.current);
            autoStopTimerRef.current = null;
        }
        
        setPreviewingId(null);
        setLoadingPreviewId(null);
        console.log('⏹️ Preview stopped');
        
        // Reset the stopping flag after a short delay
        setTimeout(() => {
            isStoppingRef.current = false;
        }, 100);
    }, []);

    // Handle preview functionality
    const handlePreview = useCallback((track: YouTubeTrack) => {
        // If already playing this track, stop it
        if (previewingId === track.id) {
            stopPreview();
            return;
        }

        // If playing a different track, stop it first
        if (previewingId && previewingId !== track.id) {
            stopPreview();
        }

        console.log(`🎵 Starting preview for: ${track.title} by ${track.artist}`);
        setLoadingPreviewId(track.id);
        setError(null); // Clear any previous errors
        isStoppingRef.current = false; // Reset stopping flag
        
        // Create audio element for preview
        const audio = new Audio();
        audio.volume = 0.7; // Set volume to 70%
        audio.preload = 'auto';
        audioRef.current = audio;
        
        // Set up audio event handlers
        audio.onloadstart = () => {
            console.log('🎵 Audio loading started...');
        };
        
        audio.oncanplay = () => {
            console.log('🎵 Audio can play, starting...');
            setLoadingPreviewId(null);
            setPreviewingId(track.id);
            audio.play().catch(error => {
                console.error('❌ Failed to play audio:', error);
                setPreviewingId(null);
                setLoadingPreviewId(null);
                setError('Failed to play preview. Please try again.');
            });
        };
        
        audio.onerror = (error) => {
            console.error('❌ Audio error:', error);
            
            // Don't show error if we're intentionally stopping the preview
            if (isStoppingRef.current) {
                console.log('🔇 Ignoring error during intentional stop');
                return;
            }
            
            setPreviewingId(null);
            setLoadingPreviewId(null);
            setError('Failed to load preview. Please try again.');
        };
        
        audio.onended = () => {
            console.log('⏹️ Preview ended');
            if (!isStoppingRef.current) {
                setPreviewingId(null);
                setLoadingPreviewId(null);
                audioRef.current = null;
            }
        };
        
        audio.onabort = () => {
            console.log('⏹️ Preview aborted');
            if (!isStoppingRef.current) {
                setPreviewingId(null);
                setLoadingPreviewId(null);
                audioRef.current = null;
            }
        };
        
        audio.onstalled = () => {
            console.log('⚠️ Audio stream stalled');
        };
        
        audio.onwaiting = () => {
            console.log('⏳ Audio buffering...');
        };
        
        // Set audio source to backend streaming endpoint
        const streamUrl = `http://127.0.0.1:${apiPort}/youtube/stream/${track.id}?signingkey=${apiSigningKey}`;
        console.log('🔗 Stream URL:', streamUrl);
        audio.src = streamUrl;
        
        // Auto-stop preview after 30 seconds
        autoStopTimerRef.current = setTimeout(() => {
            if (previewingId === track.id) {
                stopPreview();
                console.log(`⏰ Preview auto-stopped for: ${track.title}`);
            }
        }, 30000);
        
    }, [previewingId, apiPort, apiSigningKey, stopPreview]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopPreview();
        };
    }, [stopPreview]);

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
                                padding: '12px 16px',
                                fontSize: '14px',
                                fontWeight: '500',
                                background: isSearching 
                                    ? 'var(--surface-bg)' 
                                    : !searchQuery.trim()
                                        ? 'var(--surface-bg)'
                                        : 'var(--brand-blue)',
                                color: isSearching || !searchQuery.trim() ? 'var(--text-disabled)' : 'white',
                                border: isSearching 
                                    ? '1px solid var(--brand-blue)' 
                                    : !searchQuery.trim()
                                        ? '1px solid var(--border-color)'
                                        : '1px solid var(--brand-blue)',
                                borderRadius: '8px',
                                cursor: isSearching ? 'not-allowed' : !searchQuery.trim() ? 'default' : 'pointer',
                                minWidth: '100px',
                                height: '48px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                transition: 'all 0.2s ease',
                                boxShadow: 'none',
                                transform: 'translateY(0)',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                            onMouseEnter={(e) => {
                                if (!isSearching && searchQuery.trim()) {
                                    e.currentTarget.style.background = 'var(--brand-blue-light)';
                                    e.currentTarget.style.borderColor = 'var(--brand-blue-light)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isSearching && searchQuery.trim()) {
                                    e.currentTarget.style.background = 'var(--brand-blue)';
                                    e.currentTarget.style.borderColor = 'var(--brand-blue)';
                                }
                            }}
                            onMouseDown={(e) => {
                                if (!isSearching && searchQuery.trim()) {
                                    e.currentTarget.style.background = 'var(--brand-blue-dark)';
                                }
                            }}
                            onMouseUp={(e) => {
                                if (!isSearching && searchQuery.trim()) {
                                    e.currentTarget.style.background = 'var(--brand-blue-light)';
                                }
                            }}
                        >
                            {/* Search Icon */}
                            {!isSearching && (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                                    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            )}
                            
                            {/* Loading animation backdrop */}
                            {isSearching && (
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'linear-gradient(90deg, transparent, rgba(74, 144, 226, 0.3), transparent)',
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
                        
                        {/* Add CSS animations and table styles */}
                        <style>{`
                            @keyframes shimmer {
                                0% { transform: translateX(-100%); }
                                100% { transform: translateX(100%); }
                            }
                            
                            @keyframes pulse {
                                0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
                                50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.05); }
                            }
                            
                            @keyframes spin {
                                0% { transform: rotate(0deg); }
                                100% { transform: rotate(360deg); }
                            }
                            
                            /* Table wrapper styles */
                            .table-wrapper {
                                width: 100%;
                                overflow-x: auto;
                                border: 1px solid var(--border-color);
                                border-radius: 8px;
                                background: var(--surface-bg);
                            }
                            
                            /* YouTube tracks table styles */
                            .youtube-tracks-table {
                                width: 100%;
                                border-collapse: collapse;
                                background: var(--surface-bg);
                            }
                            
                            .youtube-tracks-table thead {
                                background: var(--card-bg);
                                border-bottom: 2px solid var(--border-color);
                            }
                            
                            .youtube-tracks-table th {
                                padding: 12px 8px;
                                text-align: left;
                                font-weight: 600;
                                font-size: 12px;
                                color: var(--text-secondary);
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                                border-right: 1px solid var(--border-color);
                            }
                            
                            .youtube-tracks-table th:last-child {
                                border-right: none;
                            }
                            
                            .youtube-tracks-table td {
                                padding: 12px 8px;
                                border-bottom: 1px solid var(--border-color);
                                border-right: 1px solid var(--border-color);
                                vertical-align: middle;
                            }
                            
                            .youtube-tracks-table td:last-child {
                                border-right: none;
                            }
                            
                            .youtube-track-row {
                                transition: all 0.2s ease;
                            }
                            
                            .youtube-track-row:hover {
                                background: var(--card-bg) !important;
                            }
                            
                            .youtube-track-row:last-child td {
                                border-bottom: none;
                            }
                            
                            /* Column widths */
                            .thumbnail-header, .thumbnail-cell {
                                width: 80px;
                                text-align: center;
                            }
                            
                            .title-header, .title-cell {
                                width: 25%;
                                min-width: 200px;
                            }
                            
                            .artist-header, .artist-cell {
                                width: 20%;
                                min-width: 150px;
                            }
                            
                            .album-header, .album-cell {
                                width: 20%;
                                min-width: 150px;
                            }
                            
                            .duration-header, .duration-cell {
                                width: 80px;
                                text-align: center;
                            }
                            
                            .actions-header, .actions-cell {
                                width: 150px;
                                text-align: center;
                            }
                            
                            /* Mobile responsive styles */
                            @media (max-width: 768px) {
                                .table-wrapper {
                                    font-size: 12px;
                                }
                                
                                .youtube-tracks-table th,
                                .youtube-tracks-table td {
                                    padding: 8px 4px;
                                }
                                
                                .album-header, .album-cell {
                                    display: none;
                                }
                                
                                .duration-header, .duration-cell {
                                    display: none;
                                }
                                
                                .thumbnail-cell img {
                                    width: 40px !important;
                                    height: 40px !important;
                                }
                                
                                .title-cell div {
                                    max-width: 150px !important;
                                }
                                
                                .artist-cell div {
                                    max-width: 120px !important;
                                }
                            }
                            
                            @media (max-width: 480px) {
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
                                
                                .table-wrapper {
                                    border-radius: 4px;
                                }
                                
                                .youtube-tracks-table th,
                                .youtube-tracks-table td {
                                    padding: 6px 2px;
                                    font-size: 11px;
                                }
                                
                                .thumbnail-cell img {
                                    width: 30px !important;
                                    height: 30px !important;
                                }
                                
                                .title-cell div {
                                    max-width: 100px !important;
                                }
                                
                                .artist-cell div {
                                    max-width: 80px !important;
                                }
                                
                                .actions-cell button {
                                    padding: 2px 4px !important;
                                    font-size: 10px !important;
                                }
                            }
                            
                            @media (max-width: 360px) {
                                .youtube-music-container {
                                    padding: 8px !important;
                                }
                                
                                .youtube-tracks-table th,
                                .youtube-tracks-table td {
                                    padding: 4px 1px;
                                    font-size: 10px;
                                }
                            }
                            
                            /* Thumbnail hover effects */
                            .thumbnail-hover-overlay:hover {
                                opacity: 1 !important;
                            }
                            
                            /* Enhanced progress animations */
                            @keyframes progressPulse {
                                0%, 100% { opacity: 1; }
                                50% { opacity: 0.7; }
                            }
                            
                            .progress-bar-animated {
                                animation: progressPulse 2s infinite;
                            }
                            
                            /* Download completion animation */
                            @keyframes downloadComplete {
                                0% { transform: scale(1); }
                                50% { transform: scale(1.1); }
                                100% { transform: scale(1); }
                            }
                            
                            .download-complete {
                                animation: downloadComplete 0.6s ease-in-out;
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
                        marginBottom: 'var(--space-md)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                        {error}
                        <button
                            onClick={() => setError(null)}
                            style={{
                                marginLeft: 'auto',
                                background: 'none',
                                border: 'none',
                                color: 'inherit',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'none';
                            }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                        </button>
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

                <div className="table-wrapper">
                    <table className="youtube-tracks-table">
                        <thead>
                            <tr>
                                <th className="thumbnail-header">Thumbnail</th>
                                <th className="title-header">Title</th>
                                <th className="artist-header">Artist</th>
                                <th className="album-header">Album</th>
                                <th className="duration-header">Duration</th>
                                <th className="actions-header">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {searchResults.map((track) => {
                                const isCurrentlyDownloading = isDownloading === track.id;
                                const progress = downloadProgress[track.id] || 0;

                                return (
                                    <tr
                                        key={track.id}
                                        className="youtube-track-row"
                                        style={{
                                            transition: 'all 0.2s ease',
                                            cursor: 'pointer'
                                        }}
                                                                                 onMouseEnter={(e) => {
                                             e.currentTarget.style.backgroundColor = 'var(--card-bg)';
                                             e.currentTarget.style.borderColor = 'var(--brand-blue)';
                                         }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                            e.currentTarget.style.borderColor = 'transparent';
                                        }}
                                    >
                                        {/* Thumbnail with Hover Preview */}
                                        <td className="thumbnail-cell">
                                            <div
                                                style={{
                                                    position: 'relative',
                                                    width: '50px',
                                                    height: '50px',
                                                    borderRadius: '4px',
                                                    overflow: 'hidden',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.transform = 'scale(1.05)';
                                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = 'scale(1)';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                }}
                                                onClick={() => handlePreview(track)}
                                            >
                                                <img
                                                    src={track.thumbnail}
                                                    alt={`${track.title} by ${track.artist}`}
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover',
                                                        transition: 'filter 0.2s ease'
                                                    }}
                                                    onError={(e) => {
                                                        // Fallback for broken images
                                                        e.currentTarget.style.display = 'none';
                                                    }}
                                                />
                                                
                                                {/* Play/Pause/Loading Button Overlay */}
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: '50%',
                                                        left: '50%',
                                                        transform: 'translate(-50%, -50%)',
                                                        width: '24px',
                                                        height: '24px',
                                                        background: 'rgba(0, 0, 0, 0.8)',
                                                        borderRadius: '50%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        opacity: (previewingId === track.id || loadingPreviewId === track.id) ? 1 : 0,
                                                        transition: 'opacity 0.2s ease',
                                                        pointerEvents: 'none',
                                                        border: '2px solid rgba(255, 255, 255, 0.3)'
                                                    }}
                                                >
                                                    {loadingPreviewId === track.id ? (
                                                        // Loading spinner
                                                        <div style={{
                                                            width: '12px',
                                                            height: '12px',
                                                            border: '2px solid rgba(255, 255, 255, 0.3)',
                                                            borderTop: '2px solid white',
                                                            borderRadius: '50%',
                                                            animation: 'spin 1s linear infinite'
                                                        }} />
                                                    ) : previewingId === track.id ? (
                                                        // Pause icon when playing
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                                                            <rect x="6" y="4" width="4" height="16" rx="1"/>
                                                            <rect x="14" y="4" width="4" height="16" rx="1"/>
                                                        </svg>
                                                    ) : (
                                                        // Play icon when not playing
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                                                            <polygon points="5,3 19,12 5,21"/>
                                                        </svg>
                                                    )}
                                                </div>
                                                
                                                {/* Hover overlay for better visibility */}
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: 0,
                                                        left: 0,
                                                        right: 0,
                                                        bottom: 0,
                                                        background: 'rgba(0, 0, 0, 0.2)',
                                                        opacity: 0,
                                                        transition: 'opacity 0.2s ease',
                                                        pointerEvents: 'none'
                                                    }}
                                                    className="thumbnail-hover-overlay"
                                                />
                                            </div>
                                        </td>

                                        {/* Title */}
                                        <td className="title-cell">
                                            <div style={{
                                                color: 'var(--text-primary)',
                                                fontSize: '14px',
                                                fontWeight: '500',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                maxWidth: '200px'
                                            }}>
                                                {track.title}
                                            </div>
                                        </td>

                                        {/* Artist */}
                                        <td className="artist-cell">
                                            <div style={{
                                                color: 'var(--text-secondary)',
                                                fontSize: '14px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                maxWidth: '150px'
                                            }}>
                                                {track.artist}
                                            </div>
                                        </td>

                                        {/* Album */}
                                        <td className="album-cell">
                                            <div style={{
                                                color: 'var(--text-tertiary)',
                                                fontSize: '12px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                maxWidth: '150px'
                                            }}>
                                                {track.album || '—'}
                                            </div>
                                        </td>

                                        {/* Duration */}
                                        <td className="duration-cell">
                                            <div style={{
                                                color: 'var(--text-secondary)',
                                                fontSize: '12px',
                                                fontFamily: 'monospace'
                                            }}>
                                                {track.duration || '—'}
                                            </div>
                                        </td>

                                        {/* Actions */}
                                        <td className="actions-cell">
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                                                        const canCancel = cancellableDownloads.has(track.id) && !cancelledDownloads.has(track.id);
                                                        const isCancelled = cancelledDownloads.has(track.id);
                                                        
                                                        if (isCancelled) {
                                                            return (
                                                                <div style={{ 
                                                                    display: 'flex', 
                                                                    flexDirection: 'column', 
                                                                    alignItems: 'center', 
                                                                    gap: '4px',
                                                                    color: '#f59e0b',
                                                                    fontSize: '11px',
                                                                    fontWeight: '500',
                                                                    padding: '4px 8px',
                                                                    background: 'rgba(245, 158, 11, 0.1)',
                                                                    borderRadius: '4px',
                                                                    border: '1px solid rgba(245, 158, 11, 0.3)'
                                                                }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                                                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                                                        </svg>
                                                                        Cancelled
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        
                                                        return (
                                                            <div style={{ minWidth: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                                                {/* Compact loading with spinner */}
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <div style={{
                                                                        width: '14px',
                                                                        height: '14px',
                                                                        border: '2px solid rgba(255,255,255,0.3)',
                                                                        borderTop: '2px solid var(--brand-blue)',
                                                                        borderRadius: '50%',
                                                                        animation: 'spin 1s linear infinite'
                                                                    }} />
                                                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                                        {progressData?.message || 'Preparing download...'}
                                                                    </div>
                                                                </div>
                                                                
                                                                {/* Cancel Button */}
                                                                {canCancel && (
                                                                    <button
                                                                        onClick={() => handleCancelDownload(track.id)}
                                                                        style={{
                                                                            padding: '2px 8px',
                                                                            fontSize: '10px',
                                                                            fontWeight: '600',
                                                                            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                                                            color: 'white',
                                                                            border: 'none',
                                                                            borderRadius: '4px',
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.2s ease',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px',
                                                                        }}
                                                                        onMouseEnter={(e) => {
                                                                            e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
                                                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                                                        }}
                                                                        onMouseLeave={(e) => {
                                                                            e.currentTarget.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
                                                                            e.currentTarget.style.transform = 'translateY(0)';
                                                                        }}
                                                                    >
                                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                                                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                                                        </svg>
                                                                        Cancel
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    } else if (isDownloaded || progressPercent === 100) {
                                                        return (
                                                            <div 
                                                                className="download-complete"
                                                                style={{
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    color: '#10b981',
                                                                    fontSize: '11px',
                                                                    fontWeight: '500',
                                                                    padding: '4px 8px',
                                                                    background: 'rgba(16, 185, 129, 0.1)',
                                                                    borderRadius: '4px',
                                                                    border: '1px solid rgba(16, 185, 129, 0.3)'
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                                                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                                                    </svg>
                                                                    Downloaded
                                                                </div>
                                                                <div style={{
                                                                    fontSize: '9px',
                                                                    opacity: 0.8,
                                                                    textAlign: 'center'
                                                                }}>
                                                                    Added to Collection
                                                                </div>
                                                            </div>
                                                        );
                                                    } else {
                                                        return (
                                                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                                {/* Download Button */}
                                                                <button
                                                                    onClick={() => handleDownload(track)}
                                                                    disabled={!isDownloadPathSet}
                                                                    style={{
                                                                        padding: '6px 12px',
                                                                        fontSize: '11px',
                                                                        fontWeight: '600',
                                                                        background: isDownloadPathSet 
                                                                            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                                                                            : 'var(--surface-bg)',
                                                                        color: isDownloadPathSet ? 'white' : 'var(--text-disabled)',
                                                                        border: 'none',
                                                                        borderRadius: '6px',
                                                                        cursor: isDownloadPathSet ? 'pointer' : 'not-allowed',
                                                                        transition: 'all 0.2s ease',
                                                                        boxShadow: isDownloadPathSet 
                                                                            ? '0 2px 4px rgba(16, 185, 129, 0.3)' 
                                                                            : 'none',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px',
                                                                        minWidth: '120px',
                                                                        justifyContent: 'center',
                                                                        position: 'relative',
                                                                        overflow: 'hidden'
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        if (isDownloadPathSet) {
                                                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                                                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.4)';
                                                                            e.currentTarget.style.background = 'linear-gradient(135deg, #059669 0%, #047857 100%)';
                                                                        }
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        if (isDownloadPathSet) {
                                                                            e.currentTarget.style.transform = 'translateY(0)';
                                                                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(16, 185, 129, 0.3)';
                                                                            e.currentTarget.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                                                                        }
                                                                    }}
                                                                    onMouseDown={(e) => {
                                                                        if (isDownloadPathSet) {
                                                                            e.currentTarget.style.transform = 'translateY(0)';
                                                                            e.currentTarget.style.boxShadow = '0 1px 2px rgba(16, 185, 129, 0.3)';
                                                                        }
                                                                    }}
                                                                    onMouseUp={(e) => {
                                                                        if (isDownloadPathSet) {
                                                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                                                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.4)';
                                                                        }
                                                                    }}
                                                                >
                                                                    {/* Download icon */}
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                                                                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                                                                    </svg>
                                                                    <span>Download in 320kbps</span>
                                                                </button>
                                                            </div>
                                                        );
                                                    }
                                                })()}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
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