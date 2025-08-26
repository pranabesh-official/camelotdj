import React, { useState, useCallback, useEffect, useRef } from 'react';

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
    type: 'recent' | 'popular';
}

// Popular search suggestions (moved outside component to avoid dependency warning)
const POPULAR_SUGGESTIONS = [
    'trending music 2024',
    'hip hop beats',
    'electronic dance music',
    'acoustic covers',
    'jazz instrumentals',
    'lo-fi chill beats',
    'rock classics',
    'pop hits 2024'
];

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
    const [error, setError] = useState<string | null>(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
    const [isStreaming, setIsStreaming] = useState<string | null>(null);
    const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const searchInputRef = useRef<HTMLInputElement>(null);
    
    // Load recent searches from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('youtube_recent_searches');
        if (saved) {
            try {
                setRecentSearches(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to load recent searches:', e);
            }
        }
    }, []);
    
    // Update suggestions based on input
    useEffect(() => {
        if (searchQuery.trim()) {
            const filteredRecent = recentSearches
                .filter(search => search.toLowerCase().includes(searchQuery.toLowerCase()))
                .slice(0, 3)
                .map(text => ({ text, type: 'recent' as const }));
            
            const filteredPopular = POPULAR_SUGGESTIONS
                .filter(search => search.toLowerCase().includes(searchQuery.toLowerCase()))
                .slice(0, 4)
                .map(text => ({ text, type: 'popular' as const }));
            
            setSuggestions([...filteredRecent, ...filteredPopular]);
        } else {
            // Show recent searches and popular suggestions when empty
            const recentSuggestions = recentSearches
                .slice(0, 3)
                .map(text => ({ text, type: 'recent' as const }));
            const popularList = POPULAR_SUGGESTIONS
                .slice(0, 5)
                .map(text => ({ text, type: 'popular' as const }));
            setSuggestions([...recentSuggestions, ...popularList]);
        }
    }, [searchQuery, recentSearches]);
    
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

    // Download track with improved error handling
    const handleDownload = useCallback(async (track: YouTubeTrack) => {
        if (!isDownloadPathSet) {
            alert('Please set a download path in Settings first.');
            return;
        }

        setIsDownloading(track.id);
        setDownloadProgress(prev => ({ ...prev, [track.id]: 0 }));
        setError(null);

        let retryCount = 0;
        const maxRetries = 2;
        
        // Convert YouTube Music URL to regular YouTube URL with better validation
        const convertToYouTubeUrl = (url: string, videoId: string) => {
            // Always use the video ID to create a clean YouTube URL
            if (videoId && videoId.trim()) {
                return `https://www.youtube.com/watch?v=${videoId.trim()}`;
            }
            // Fallback: if URL is already a youtube.com URL, use it
            if (url && url.includes('youtube.com/watch')) {
                return url;
            }
            // Last resort: convert music.youtube.com to youtube.com
            if (url && url.includes('music.youtube.com')) {
                return url.replace('music.youtube.com', 'youtube.com');
            }
            return url;
        };
        
        const attemptDownload = async (): Promise<any> => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout
            
            try {
                setDownloadProgress(prev => ({ ...prev, [track.id]: 10 }));
                
                // Convert URL to proper YouTube format and validate
                const downloadUrl = convertToYouTubeUrl(track.url, track.id);
                
                // Validate the URL format
                if (!downloadUrl || (!downloadUrl.includes('youtube.com/watch?v=') && !downloadUrl.includes('youtu.be/'))) {
                    throw new Error('Invalid YouTube URL format. Unable to generate proper download URL.');
                }
                
                console.log('Attempting download:', {
                    title: track.title,
                    artist: track.artist,
                    videoId: track.id,
                    originalUrl: track.url,
                    downloadUrl: downloadUrl,
                    downloadPath: downloadPath
                });
                
                // Clean and validate the data before sending
                const cleanTitle = (track.title?.trim() || 'Unknown Title').replace(/[<>:"/\\|?*]/g, '_');
                const cleanArtist = (track.artist?.trim() || 'Unknown Artist').replace(/[<>:"/\\|?*]/g, '_');
                
                const requestBody = {
                    url: downloadUrl,
                    title: cleanTitle,
                    artist: cleanArtist,
                    download_path: downloadPath,
                    signingkey: apiSigningKey
                };
                
                console.log('Sending download request:', requestBody);
                
                const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/download`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Signing-Key': apiSigningKey
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                setDownloadProgress(prev => ({ ...prev, [track.id]: 90 }));
                
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
                    
                    console.error('Download failed with status:', response.status, 'Error:', errorMessage);
                    throw new Error(errorMessage);
                }
                
                const result = await response.json();
                
                if (result.status === 'success') {
                    setDownloadProgress(prev => ({ ...prev, [track.id]: 100 }));
                    
                    // Notify parent component about successful download
                    if (onDownloadComplete && result.song) {
                        onDownloadComplete(result.song);
                    }
                    
                    // Clear download state after 3 seconds
                    setTimeout(() => {
                        setDownloadProgress(prev => {
                            const newProgress = { ...prev };
                            delete newProgress[track.id];
                            return newProgress;
                        });
                    }, 3000);
                    
                    // Show success message without emoji to avoid issues
                    alert(`Downloaded: ${track.title} by ${track.artist}`);
                    return result;
                } else {
                    throw new Error(result.error || 'Download failed - no success status');
                }
            } catch (error: any) {
                clearTimeout(timeoutId);
                
                if (error.name === 'AbortError') {
                    throw new Error('Download timeout. The file might be too large or connection is slow.');
                }
                
                // Log detailed error for debugging
                console.error('Download attempt failed:', {
                    error: error.message,
                    track: track.title,
                    attempt: retryCount + 1
                });
                
                throw error;
            }
        };
        
        try {
            await attemptDownload();
        } catch (error: any) {
            console.error('Download error:', error);
            
            if (retryCount < maxRetries) {
                retryCount++;
                console.log(`Retrying download (attempt ${retryCount}/${maxRetries + 1})...`);
                setDownloadProgress(prev => ({ ...prev, [track.id]: 5 }));
                
                try {
                    // Wait longer between retries
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    await attemptDownload();
                } catch (retryError: any) {
                    console.error('Retry failed:', retryError);
                    const finalError = `Download failed after ${maxRetries + 1} attempts: ${retryError.message}`;
                    setError(finalError);
                    
                    // Clear download progress on final failure
                    setDownloadProgress(prev => {
                        const newProgress = { ...prev };
                        delete newProgress[track.id];
                        return newProgress;
                    });
                }
            } else {
                const finalError = `Download failed: ${error.message}`;
                setError(finalError);
                
                // Clear download progress on failure
                setDownloadProgress(prev => {
                    const newProgress = { ...prev };
                    delete newProgress[track.id];
                    return newProgress;
                });
            }
        } finally {
            setIsDownloading(null);
        }
    }, [apiPort, apiSigningKey, downloadPath, isDownloadPathSet, onDownloadComplete]);

    // Stream preview track
    const handleStreamPreview = useCallback(async (track: YouTubeTrack) => {
        try {
            // Stop any current streaming
            if (audioElement) {
                audioElement.pause();
                audioElement.src = '';
            }
            
            setIsStreaming(track.id);
            setError(null);
            
            const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/stream/${track.id}`, {
                method: 'GET',
                headers: {
                    'X-Signing-Key': apiSigningKey
                }
            });
            
            if (!response.ok) {
                throw new Error(`Streaming failed: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.status === 'success' && result.stream_url) {
                // Create audio element for streaming
                const audio = new Audio(result.stream_url);
                audio.crossOrigin = 'anonymous';
                
                audio.addEventListener('canplay', () => {
                    audio.play().catch(console.error);
                });
                
                audio.addEventListener('ended', () => {
                    setIsStreaming(null);
                });
                
                audio.addEventListener('error', () => {
                    setError('Streaming playback failed');
                    setIsStreaming(null);
                });
                
                setAudioElement(audio);
            } else {
                throw new Error(result.error || 'Failed to get stream URL');
            }
            
        } catch (error: any) {
            console.error('Streaming error:', error);
            setError(`Streaming failed: ${error.message}`);
            setIsStreaming(null);
        }
    }, [apiPort, apiSigningKey, audioElement]);
    
    // Stop streaming
    const handleStopStream = useCallback(() => {
        if (audioElement) {
            audioElement.pause();
            audioElement.src = '';
        }
        setIsStreaming(null);
    }, [audioElement]);
    
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
                                    maxHeight: '300px',
                                    overflowY: 'auto',
                                    zIndex: 1000,
                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                                }}>
                                    {suggestions.map((suggestion, index) => (
                                        <div
                                            key={`${suggestion.type}-${index}`}
                                            onClick={() => handleSuggestionSelect(suggestion.text)}
                                            style={{
                                                padding: '12px 16px',
                                                cursor: 'pointer',
                                                borderBottom: index < suggestions.length - 1 ? '1px solid var(--border-color)' : 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'var(--card-bg)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'var(--surface-bg)';
                                            }}
                                        >
                                            <span style={{ 
                                                fontSize: '14px',
                                                color: suggestion.type === 'recent' ? 'var(--accent-color)' : 'var(--text-secondary)'
                                            }}>
                                                {suggestion.type === 'recent' ? '🕒' : '🔥'}
                                            </span>
                                            <span style={{
                                                color: 'var(--text-primary)',
                                                fontSize: '14px'
                                            }}>
                                                {suggestion.text}
                                            </span>
                                            {suggestion.type === 'recent' && (
                                                <span style={{
                                                    marginLeft: 'auto',
                                                    fontSize: '12px',
                                                    color: 'var(--text-tertiary)'
                                                }}>
                                                    Recent
                                                </span>
                                            )}
                                        </div>
                                    ))}
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
                                    {isCurrentlyDownloading ? (
                                        <div style={{ width: '100%' }}>
                                            
                                            <div style={{
                                                color: 'var(--text-secondary)',
                                                fontSize: '12px'
                                            }}>
                                                Downloading...
                                            </div>
                                        </div>
                                    ) : progress === 100 ? (
                                        <div style={{
                                            color: 'var(--success-color)',
                                            fontSize: '14px',
                                            fontWeight: '500'
                                        }}>
                                            Downloaded
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {/* Stream Button */}
                                           
                                            
                                            {/* Download Button */}
                                            <button
                                                onClick={() => handleDownload(track)}
                                                disabled={!isDownloadPathSet}
                                                style={{
                                                    padding: '6px 12px',
                                                    fontSize: '12px',
                                                    fontWeight: '500',
                                                    background: isDownloadPathSet ? 'var(--accent-color)' : 'var(--surface-bg)',
                                                    color: isDownloadPathSet ? 'white' : 'var(--text-disabled)',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: isDownloadPathSet ? 'pointer' : 'not-allowed',
                                                    width: '100%'
                                                }}
                                            >
                                               Download
                                            </button>
                                        </div>
                                    )}
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