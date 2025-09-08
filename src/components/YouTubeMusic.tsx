import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import DownloadManager from './DownloadManager';

interface YouTubeTrack {
    id: string;
    title: string;
    artist: string;
    album?: string;
    duration?: string;
    thumbnail: string;
    url: string;
}

interface AudioState {
    isPlaying: boolean;
    isLoading: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    isMuted: boolean;
    playbackRate: number;
    error: string | null;
}

interface DownloadState {
    isDownloading: boolean;
    progress: number;
    stage: string;
    message: string;
    canCancel: boolean;
    isCancelled: boolean;
    isCompleted: boolean;
    error: string | null;
}

interface YouTubeMusicProps {
    apiPort: number;
    apiSigningKey: string;
    downloadPath: string;
    isDownloadPathSet: boolean;
    onDownloadComplete?: (song: any) => void;
    downloadManagerRef?: React.RefObject<any>;
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
    onDownloadComplete,
    downloadManagerRef
}) => {
    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<YouTubeTrack[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    
    // Table sorting and filtering state
    const [sortField, setSortField] = useState<'title' | 'artist' | 'album' | 'duration'>('title');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [searchTerm, setSearchTerm] = useState<string>('');
    
    // Sorting function
    const handleSort = (field: 'title' | 'artist' | 'album' | 'duration') => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };
    
    // Filter and sort search results
    const filteredAndSortedResults = useMemo(() => {
        let filtered = searchResults;
        
        // Apply search filter
        if (searchTerm) {
            filtered = filtered.filter(track => 
                track.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                track.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (track.album && track.album.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }
        
        // Apply sorting
        return filtered.sort((a, b) => {
            let aValue: any = a[sortField];
            let bValue: any = b[sortField];
            
            if (aValue === undefined) aValue = '';
            if (bValue === undefined) bValue = '';
            
            // Handle duration sorting (convert to seconds)
            if (sortField === 'duration') {
                const parseDuration = (duration: string) => {
                    if (!duration) return 0;
                    const parts = duration.split(':').map(Number);
                    return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
                };
                aValue = parseDuration(aValue);
                bValue = parseDuration(bValue);
            }
            
            if (sortDirection === 'asc') {
                return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            } else {
                return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
            }
        });
    }, [searchResults, searchTerm, sortField, sortDirection]);
    
    // Music Icon component for cover art placeholder
    const MusicIcon = () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
    );
    
    const [autocompleteError, setAutocompleteError] = useState<string | null>(null);
    
    // Audio state - centralized and robust
    const [audioState, setAudioState] = useState<AudioState>({
        isPlaying: false,
        isLoading: false,
        currentTime: 0,
        duration: 0,
        volume: 0.7,
        isMuted: false,
        playbackRate: 1.0,
        error: null
    });
    
    // Download state - simplified (handled by DownloadManager)
    const [downloadedTracks, setDownloadedTracks] = useState<Set<string>>(new Set());
    
    // UI state
    const [error, setError] = useState<string | null>(null);
    const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
    const [isProgressBarExpanded, setIsProgressBarExpanded] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    
    // Refs
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);
    const progressUpdateRef = useRef<NodeJS.Timeout | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const isStoppingRef = useRef<boolean>(false);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const touchStartY = useRef<number>(0);
    const touchStartTime = useRef<number>(0);
    const isSwipeGesture = useRef<boolean>(false);
    
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
                
                // Download progress is now handled by DownloadManager
                // Keep this for any other WebSocket events if needed
                
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

    // Enhanced audio management functions
    const createAudioElement = useCallback(() => {
        const audio = new Audio();
        audio.volume = audioState.volume;
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';
        
        // Enhanced event handlers
        audio.onloadstart = () => {
            console.log('🎵 Audio loading started...');
            setAudioState(prev => ({ ...prev, isLoading: true, error: null }));
        };
        
        audio.oncanplay = () => {
            console.log('🎵 Audio can play');
            setAudioState(prev => ({ 
                ...prev, 
                isLoading: false, 
                duration: audio.duration || 0,
                error: null 
            }));
        };
        
        audio.onplay = () => {
            console.log('🎵 Audio started playing');
            setAudioState(prev => ({ ...prev, isPlaying: true, isLoading: false }));
        };
        
        audio.onpause = () => {
            console.log('🎵 Audio paused');
            setAudioState(prev => ({ ...prev, isPlaying: false }));
        };
        
        audio.onended = () => {
            console.log('🎵 Audio ended');
            setAudioState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
            setCurrentlyPlayingId(null);
        };
        
        audio.onerror = (error) => {
            console.error('❌ Audio error:', error);
            if (!isStoppingRef.current) {
                setAudioState(prev => ({ 
                    ...prev, 
                    error: 'Failed to load audio. Please try again.',
                    isLoading: false,
                    isPlaying: false
                }));
                setCurrentlyPlayingId(null);
            }
        };
        
        audio.ontimeupdate = () => {
            // Only update if not dragging to prevent conflicts
            if (!isDragging) {
                setAudioState(prev => ({ 
                    ...prev, 
                    currentTime: audio.currentTime 
                }));
            }
        };
        
        audio.onvolumechange = () => {
            setAudioState(prev => ({ 
                ...prev, 
                volume: audio.volume,
                isMuted: audio.muted
            }));
        };
        
        audio.onstalled = () => {
            console.log('⚠️ Audio stream stalled');
        };
        
        audio.onwaiting = () => {
            console.log('⏳ Audio buffering...');
            setAudioState(prev => ({ ...prev, isLoading: true }));
        };
        
        audio.oncanplaythrough = () => {
            setAudioState(prev => ({ ...prev, isLoading: false }));
        };
        
        return audio;
    }, [audioState.volume, isDragging]);

    const stopAudio = useCallback(() => {
        isStoppingRef.current = true;
        
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
        
        if (progressUpdateRef.current) {
            clearInterval(progressUpdateRef.current);
            progressUpdateRef.current = null;
        }
        
        setAudioState(prev => ({
            ...prev,
            isPlaying: false,
            isLoading: false,
            currentTime: 0,
            error: null
        }));
        setCurrentlyPlayingId(null);
        
        console.log('⏹️ Audio stopped');
        
        setTimeout(() => {
            isStoppingRef.current = false;
        }, 100);
    }, []);

    const togglePlayPause = useCallback(async (track: YouTubeTrack) => {
        // If already playing this track, pause it
        if (currentlyPlayingId === track.id && audioState.isPlaying) {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            return;
        }

        // If playing a different track, stop it first
        if (currentlyPlayingId && currentlyPlayingId !== track.id) {
            stopAudio();
        }

        // If paused, resume
        if (currentlyPlayingId === track.id && !audioState.isPlaying) {
            if (audioRef.current) {
                try {
                    await audioRef.current.play();
                } catch (error) {
                    console.error('❌ Failed to resume audio:', error);
                    setAudioState(prev => ({ 
                        ...prev, 
                        error: 'Failed to resume playback. Please try again.' 
                    }));
                }
            }
            return;
        }

        // Start new track
        console.log(`🎵 Starting playback for: ${track.title} by ${track.artist}`);
        setAudioState(prev => ({ ...prev, isLoading: true, error: null }));
        setCurrentlyPlayingId(track.id);
        
        const audio = createAudioElement();
        audioRef.current = audio;
        
        try {
            const streamUrl = `http://127.0.0.1:${apiPort}/youtube/stream/${track.id}?signingkey=${apiSigningKey}`;
            console.log('🔗 Stream URL:', streamUrl);
            audio.src = streamUrl;
            
            await audio.play();
            
            // Auto-stop after 30 seconds (configurable)
            autoStopTimerRef.current = setTimeout(() => {
                if (currentlyPlayingId === track.id) {
                    stopAudio();
                    console.log(`⏰ Auto-stopped: ${track.title}`);
                }
            }, 30000);
            
        } catch (error) {
            console.error('❌ Failed to start audio:', error);
            setAudioState(prev => ({ 
                ...prev, 
                error: 'Failed to start playback. Please try again.',
                isLoading: false
            }));
            setCurrentlyPlayingId(null);
        }
    }, [currentlyPlayingId, audioState.isPlaying, apiPort, apiSigningKey, createAudioElement, stopAudio]);

    const setVolume = useCallback((volume: number) => {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        setAudioState(prev => ({ ...prev, volume: clampedVolume }));
        
        if (audioRef.current) {
            audioRef.current.volume = clampedVolume;
        }
    }, []);

    const toggleMute = useCallback(() => {
        setAudioState(prev => ({ ...prev, isMuted: !prev.isMuted }));
        
        if (audioRef.current) {
            audioRef.current.muted = !audioRef.current.muted;
        }
    }, []);

    const seekTo = useCallback((time: number) => {
        if (audioRef.current && audioState.duration > 0) {
            const clampedTime = Math.max(0, Math.min(audioState.duration, time));
            
            // Store current playback state
            const wasPlaying = audioState.isPlaying;
            
            // Pause briefly to ensure clean seek
            if (wasPlaying) {
                audioRef.current.pause();
            }
            
            // Seek to the new time
            audioRef.current.currentTime = clampedTime;
            
            // Update state immediately for visual feedback
            setAudioState(prev => ({ ...prev, currentTime: clampedTime }));
            
            // Resume playback if it was playing
            if (wasPlaying) {
                // Use a small timeout to ensure the seek has processed
                setTimeout(() => {
                    if (audioRef.current) {
                        audioRef.current.play().catch(error => {
                            console.error('Failed to resume playback after seek:', error);
                        });
                    }
                }, 50);
            }
        }
    }, [audioState.duration, audioState.isPlaying]);

    // Touch handling for swipe gestures
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
        touchStartTime.current = Date.now();
        isSwipeGesture.current = false;
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!currentlyPlayingId) return;
        
        const currentY = e.touches[0].clientY;
        const deltaY = touchStartY.current - currentY;
        const deltaTime = Date.now() - touchStartTime.current;
        
        // Detect upward swipe gesture
        if (deltaY > 30 && deltaTime < 300) {
            isSwipeGesture.current = true;
            if (!isProgressBarExpanded) {
                setIsProgressBarExpanded(true);
            }
        }
    }, [currentlyPlayingId, isProgressBarExpanded]);

    const handleTouchEnd = useCallback(() => {
        // Reset swipe detection after a short delay
        setTimeout(() => {
            isSwipeGesture.current = false;
        }, 100);
    }, []);

    // Progress bar dragging functionality
    const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
        if (!progressBarRef.current || !audioState.duration) return;
        
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        
        const rect = progressBarRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const clickProgress = Math.max(0, Math.min(1, x / rect.width));
        const newTime = clickProgress * audioState.duration;
        
        // Direct seek without affecting playback state
        if (audioRef.current) {
            audioRef.current.currentTime = newTime;
            setAudioState(prev => ({ ...prev, currentTime: newTime }));
        }
    }, [audioState.duration]);

    const handleProgressMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !progressBarRef.current || !audioState.duration) return;
        
        e.preventDefault();
        e.stopPropagation();
        const rect = progressBarRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const clickProgress = Math.max(0, Math.min(1, x / rect.width));
        const newTime = clickProgress * audioState.duration;
        
        // Direct seek without affecting playback state
        if (audioRef.current) {
            audioRef.current.currentTime = newTime;
            setAudioState(prev => ({ ...prev, currentTime: newTime }));
        }
    }, [isDragging, audioState.duration]);

    const handleProgressMouseUp = useCallback((e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    // Touch handling for progress bar
    const handleProgressTouchStart = useCallback((e: React.TouchEvent) => {
        if (!progressBarRef.current || !audioState.duration) return;
        
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        
        const rect = progressBarRef.current.getBoundingClientRect();
        const x = e.touches[0].clientX - rect.left;
        const clickProgress = Math.max(0, Math.min(1, x / rect.width));
        const newTime = clickProgress * audioState.duration;
        
        // Direct seek without affecting playback state
        if (audioRef.current) {
            audioRef.current.currentTime = newTime;
            setAudioState(prev => ({ ...prev, currentTime: newTime }));
        }
    }, [audioState.duration]);

    const handleProgressTouchMove = useCallback((e: TouchEvent) => {
        if (!isDragging || !progressBarRef.current || !audioState.duration) return;
        
        e.preventDefault();
        e.stopPropagation();
        const rect = progressBarRef.current.getBoundingClientRect();
        const x = e.touches[0].clientX - rect.left;
        const clickProgress = Math.max(0, Math.min(1, x / rect.width));
        const newTime = clickProgress * audioState.duration;
        
        // Direct seek without affecting playback state
        if (audioRef.current) {
            audioRef.current.currentTime = newTime;
            setAudioState(prev => ({ ...prev, currentTime: newTime }));
        }
    }, [isDragging, audioState.duration]);

    const handleProgressTouchEnd = useCallback((e: TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    // Add global mouse event listeners for dragging
    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleProgressMouseMove);
            document.addEventListener('mouseup', handleProgressMouseUp);
            document.addEventListener('touchmove', handleProgressTouchMove, { passive: false });
            document.addEventListener('touchend', handleProgressTouchEnd);
        }

        return () => {
            document.removeEventListener('mousemove', handleProgressMouseMove);
            document.removeEventListener('mouseup', handleProgressMouseUp);
            document.removeEventListener('touchmove', handleProgressTouchMove);
            document.removeEventListener('touchend', handleProgressTouchEnd);
        };
    }, [isDragging, handleProgressMouseMove, handleProgressMouseUp, handleProgressTouchMove, handleProgressTouchEnd]);

    // Download management - delegate to DownloadManager
    const startDownload = useCallback((track: YouTubeTrack) => {
        if (downloadManagerRef?.current?.addDownload) {
            downloadManagerRef.current.addDownload(track);
        }
    }, [downloadManagerRef]);

    const showNotification = useCallback((title: string, message: string, type: 'success' | 'error' | 'warning' = 'success') => {
        const colors = {
            success: { bg: '#10b981', border: '#059669' },
            error: { bg: '#ef4444', border: '#dc2626' },
            warning: { bg: '#f59e0b', border: '#d97706' }
        };
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, ${colors[type].bg}, ${colors[type].border});
            color: white;
            padding: 16px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
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
                    ${type === 'success' ? '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' : 
                      type === 'error' ? '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>' :
                      '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>'}
                </svg>
                <strong>${title}</strong>
            </div>
            <div style="font-size: 12px; opacity: 0.9;">
                ${message}
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }, []);
    
    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return; // Don't interfere with input fields
            }
            
            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    if (currentlyPlayingId) {
                        const currentTrack = searchResults.find(track => track.id === currentlyPlayingId);
                        if (currentTrack) {
                            togglePlayPause(currentTrack);
                        }
                    }
                    break;
                case 'Escape':
                    if (currentlyPlayingId) {
                        stopAudio();
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setVolume(Math.min(1, audioState.volume + 0.1));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    setVolume(Math.max(0, audioState.volume - 0.1));
                    break;
                case 'm':
                case 'M':
                    e.preventDefault();
                    toggleMute();
                    break;
            }
        };
        
        document.addEventListener('keydown', handleKeyPress);
        return () => document.removeEventListener('keydown', handleKeyPress);
    }, [currentlyPlayingId, searchResults, togglePlayPause, stopAudio, audioState.volume, setVolume, toggleMute]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopAudio();
        };
    }, [stopAudio]);

    // Format time helper
    const formatTime = useCallback((time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, []);

    // Memoized track actions component (download only)
    const TrackActions = useMemo(() => ({ track }: { track: YouTubeTrack }) => {
        const isDownloaded = downloadedTracks.has(track.id);
        
        return (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                {isDownloaded ? (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: '#10b981',
                        fontSize: '11px',
                        fontWeight: '500',
                        padding: '4px 8px',
                        background: 'rgba(16, 185, 129, 0.1)',
                        borderRadius: '4px',
                        border: '1px solid rgba(16, 185, 129, 0.3)'
                    }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                        Downloaded
                    </div>
                ) : (
                    <button
                        onClick={() => startDownload(track)}
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
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                        </svg>
                        Download
                    </button>
                )}
            </div>
        );
    }, [downloadedTracks, startDownload, isDownloadPathSet]);

    return (
        <div className="youtube-music-container" style={{ padding: 'var(--space-lg)' }}>
            {/* Global Audio Controls with Swipe Functionality */}
            {currentlyPlayingId && (
                <div 
                    style={{
                        position: 'fixed',
                        bottom: '20px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'linear-gradient(135deg, #1f2937, #111827)',
                        borderRadius: '12px',
                        padding: '16px 24px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        zIndex: 1000,
                        minWidth: '300px',
                        maxWidth: '500px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        transition: 'all 0.3s ease',
                        cursor: 'grab'
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    {/* Swipe Indicator */}
                    <div style={{
                        width: '40px',
                        height: '4px',
                        background: 'rgba(255, 255, 255, 0.3)',
                        borderRadius: '2px',
                        margin: '0 auto',
                        transition: 'opacity 0.3s ease',
                        opacity: isProgressBarExpanded ? 0 : 1
                    }} />

                    {/* Main Controls Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {/* Track Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                color: 'white',
                                fontSize: '14px',
                                fontWeight: '600',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>
                                {searchResults.find(track => track.id === currentlyPlayingId)?.title || 'Unknown Track'}
                            </div>
                            <div style={{
                                color: 'rgba(255, 255, 255, 0.7)',
                                fontSize: '12px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>
                                {searchResults.find(track => track.id === currentlyPlayingId)?.artist || 'Unknown Artist'}
                            </div>
                        </div>

                        {/* Compact Progress Bar (when not expanded) */}
                        {!isProgressBarExpanded && (
                            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '11px', minWidth: '35px' }}>
                                    {formatTime(audioState.currentTime)}
                                </span>
                                <div style={{
                                    flex: 1,
                                    height: '4px',
                                    background: 'rgba(255, 255, 255, 0.2)',
                                    borderRadius: '2px',
                                    cursor: 'pointer',
                                    position: 'relative'
                                }} onClick={(e) => {
                                    if (isDragging) return; // Prevent click during drag
                                    
                                    e.preventDefault();
                                    e.stopPropagation();
                                    
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const x = e.clientX - rect.left;
                                    const clickProgress = Math.max(0, Math.min(1, x / rect.width));
                                    const newTime = clickProgress * audioState.duration;
                                    
                                    // Use the robust seekTo function for clicks
                                    seekTo(newTime);
                                }}>
                                    <div style={{
                                        width: `${audioState.duration > 0 ? (audioState.currentTime / audioState.duration) * 100 : 0}%`,
                                        height: '100%',
                                        background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                                        borderRadius: '2px',
                                        transition: isDragging ? 'none' : 'width 0.1s ease'
                                    }} />
                                </div>
                                <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '11px', minWidth: '35px' }}>
                                    {formatTime(audioState.duration)}
                                </span>
                            </div>
                        )}

                        {/* Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* Play/Pause Button */}
                            <button
                                onClick={() => {
                                    const currentTrack = searchResults.find(track => track.id === currentlyPlayingId);
                                    if (currentTrack) {
                                        togglePlayPause(currentTrack);
                                    }
                                }}
                                disabled={audioState.isLoading}
                                style={{
                                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                    border: 'none',
                                    color: 'white',
                                    cursor: audioState.isLoading ? 'not-allowed' : 'pointer',
                                    padding: '10px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                    minWidth: '40px',
                                    minHeight: '40px',
                                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
                                    opacity: audioState.isLoading ? 0.7 : 1
                                }}
                                onMouseEnter={(e) => {
                                    if (!audioState.isLoading) {
                                        e.currentTarget.style.transform = 'scale(1.05)';
                                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.6)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!audioState.isLoading) {
                                        e.currentTarget.style.transform = 'scale(1)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                                    }
                                }}
                            >
                                {audioState.isLoading ? (
                                    <div style={{
                                        width: '16px',
                                        height: '16px',
                                        border: '2px solid rgba(255,255,255,0.3)',
                                        borderTop: '2px solid white',
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite'
                                    }} />
                                ) : audioState.isPlaying ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <rect x="6" y="4" width="4" height="16" rx="1"/>
                                        <rect x="14" y="4" width="4" height="16" rx="1"/>
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <polygon points="5,3 19,12 5,21"/>
                                    </svg>
                                )}
                            </button>

                            {/* Volume Control */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button
                                    onClick={toggleMute}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'white',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        {audioState.isMuted ? (
                                            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                                        ) : (
                                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                                        )}
                                    </svg>
                                </button>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={audioState.volume}
                                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                                    style={{
                                        width: '60px',
                                        height: '4px',
                                        background: 'rgba(255, 255, 255, 0.2)',
                                        outline: 'none',
                                        borderRadius: '2px',
                                        cursor: 'pointer'
                                    }}
                                />
                            </div>

                            {/* Stop Button */}
                            <button
                                onClick={stopAudio}
                                style={{
                                    background: 'rgba(239, 68, 68, 0.8)',
                                    border: 'none',
                                    color: 'white',
                                    cursor: 'pointer',
                                    padding: '8px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(239, 68, 68, 1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)';
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Expanded Progress Bar (revealed on swipe up) */}
                    {isProgressBarExpanded && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            animation: 'slideUp 0.3s ease-out'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                color: 'rgba(255, 255, 255, 0.8)',
                                fontSize: '12px'
                            }}>
                                <span>{formatTime(audioState.currentTime)}</span>
                                <span>{formatTime(audioState.duration)}</span>
                            </div>
                            
                            {/* Enhanced Draggable Progress Bar */}
                            <div
                                ref={progressBarRef}
                                style={{
                                    width: '100%',
                                    height: '8px',
                                    background: 'rgba(255, 255, 255, 0.2)',
                                    borderRadius: '4px',
                                    cursor: isDragging ? 'grabbing' : 'grab',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                                onMouseDown={handleProgressMouseDown}
                                onTouchStart={handleProgressTouchStart}
                            >
                                {/* Progress Fill */}
                                <div style={{
                                    width: `${audioState.duration > 0 ? (audioState.currentTime / audioState.duration) * 100 : 0}%`,
                                    height: '100%',
                                    background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                                    borderRadius: '4px',
                                    transition: isDragging ? 'none' : 'width 0.1s ease',
                                    position: 'relative'
                                }}>
                                    {/* Draggable Handle */}
                                    <div style={{
                                        position: 'absolute',
                                        right: '-6px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        width: '12px',
                                        height: '12px',
                                        background: 'white',
                                        borderRadius: '50%',
                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                                        cursor: isDragging ? 'grabbing' : 'grab',
                                        transition: isDragging ? 'none' : 'all 0.2s ease',
                                        opacity: isDragging ? 1 : 0.8
                                    }} />
                                </div>
                                
                                {/* Hover Effect Overlay */}
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    opacity: 0,
                                    transition: 'opacity 0.2s ease',
                                    pointerEvents: 'none'
                                }} 
                                className="progress-hover-overlay"
                                />
                            </div>
                            
                            {/* Close Button */}
                            <button
                                onClick={() => setIsProgressBarExpanded(false)}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    color: 'white',
                                    cursor: 'pointer',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    alignSelf: 'center',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                }}
                            >
                                Close
                            </button>
                        </div>
                    )}
                </div>
            )}

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
                                aria-label="Search YouTube Music"
                                aria-describedby="search-help"
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
                            <div id="search-help" style={{ 
                                fontSize: '12px', 
                                color: 'var(--text-tertiary)', 
                                marginTop: '4px',
                                display: 'none' 
                            }}>
                                Press Enter to search, Escape to close suggestions
                            </div>
                            
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
                                display: 'none', // Hide search button since real-time search handles everything
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
                        
                        {/* Enhanced CSS animations and table styles */}
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
                            
                            @keyframes slideInRight {
                                from { transform: translateX(100%); opacity: 0; }
                                to { transform: translateX(0); opacity: 1; }
                            }
                            
                            @keyframes fadeIn {
                                from { opacity: 0; transform: translateY(10px); }
                                to { opacity: 1; transform: translateY(0); }
                            }
                            
                            @keyframes bounce {
                                0%, 20%, 53%, 80%, 100% { transform: translate3d(0,0,0); }
                                40%, 43% { transform: translate3d(0, -8px, 0); }
                                70% { transform: translate3d(0, -4px, 0); }
                                90% { transform: translate3d(0, -2px, 0); }
                            }
                            
                            @keyframes glow {
                                0%, 100% { box-shadow: 0 0 5px rgba(59, 130, 246, 0.5); }
                                50% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.8); }
                            }
                            
                            @keyframes slideUp {
                                from { 
                                    opacity: 0; 
                                    transform: translateY(20px); 
                                }
                                to { 
                                    opacity: 1; 
                                    transform: translateY(0); 
                                }
                            }
                            
                            /* Table wrapper styles */
                            .table-wrapper {
                                width: 100%;
                                overflow-x: auto;
                                border: 1px solid var(--border-color);
                                border-radius: 8px;
                                background: var(--surface-bg);
                            }
                            
                            /* YouTube tracks table styles - matching TrackTable */
                            .youtube-tracks-table {
                                width: 100%;
                                border-collapse: collapse;
                                background: var(--card-bg);
                                border-radius: var(--radius-lg);
                                overflow: hidden;
                            }
                            
                            .youtube-tracks-table thead {
                                background: var(--elevated-bg);
                                border-bottom: 2px solid var(--divider-color);
                            }
                            
                            .youtube-tracks-table th {
                                padding: var(--space-md);
                                text-align: left;
                                font-weight: 600;
                                font-size: 12px;
                                color: var(--text-secondary);
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                                border-right: 1px solid var(--divider-color);
                            }
                            
                            .youtube-tracks-table th.sortable {
                                cursor: pointer;
                                user-select: none;
                                transition: color 0.2s ease;
                            }
                            
                            .youtube-tracks-table th.sortable:hover {
                                color: var(--text-primary);
                            }
                            
                            .youtube-tracks-table th:last-child {
                                border-right: none;
                            }
                            
                            .youtube-tracks-table td {
                                padding: var(--space-md);
                                border-bottom: 1px solid var(--divider-color);
                                border-right: 1px solid var(--divider-color);
                                vertical-align: middle;
                                color: var(--text-primary);
                                font-size: 13px;
                            }
                            
                            .youtube-tracks-table td:last-child {
                                border-right: none;
                            }
                            
                            .youtube-track-row {
                                transition: all 0.2s ease;
                            }
                            
                            .youtube-track-row:hover {
                                background: var(--hover-bg) !important;
                            }
                            
                            .youtube-track-row.playing {
                                background: rgba(74, 144, 226, 0.1) !important;
                            }
                            
                            .sort-indicator {
                                margin-left: 4px;
                                font-size: 10px;
                                opacity: 0.7;
                            }
                            
                            .cover-art-cell {
                                width: 50px;
                            }
                            
                            .cover-art-placeholder {
                                width: 40px;
                                height: 40px;
                                background: var(--elevated-bg);
                                border-radius: var(--radius-sm);
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: var(--text-muted);
                                font-size: 16px;
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
                                    border-radius: 6px;
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
                                
                                .actions-cell {
                                    min-width: 100px !important;
                                }
                                
                                /* Global audio controls mobile */
                                .youtube-music-container > div[style*="position: fixed"] {
                                    bottom: 10px !important;
                                    left: 10px !important;
                                    right: 10px !important;
                                    transform: none !important;
                                    min-width: auto !important;
                                    max-width: none !important;
                                    padding: 12px 16px !important;
                                    flex-direction: column !important;
                                    gap: 12px !important;
                                }
                                
                                .youtube-music-container > div[style*="position: fixed"] > div:first-child {
                                    text-align: center !important;
                                }
                                
                                .youtube-music-container > div[style*="position: fixed"] > div:nth-child(2) {
                                    order: 3 !important;
                                }
                                
                                .youtube-music-container > div[style*="position: fixed"] > div:last-child {
                                    order: 2 !important;
                                    justify-content: center !important;
                                }
                                
                                /* Expanded progress bar mobile */
                                .youtube-music-container > div[style*="position: fixed"] > div[style*="animation: slideUp"] {
                                    margin-top: 8px !important;
                                }
                                
                                .youtube-music-container > div[style*="position: fixed"] > div[style*="animation: slideUp"] > div[style*="height: 8px"] {
                                    height: 12px !important;
                                }
                                
                                .youtube-music-container > div[style*="position: fixed"] > div[style*="animation: slideUp"] > div[style*="width: 12px"] {
                                    width: 16px !important;
                                    height: 16px !important;
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
                            
                            /* Progress bar hover effects */
                            .progress-hover-overlay:hover {
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
                    <div className="table-controls">
                        <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>
                            Search Results ({filteredAndSortedResults.length}{searchTerm ? ` of ${searchResults.length}` : ''})
                        </h3>
                        <div className="search-and-filters">
                            <div className="search-box">
                                <input
                                    type="text"
                                    placeholder="Filter results..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                )}

                <div className="table-wrapper">
                    <table 
                        className="songs-table youtube-tracks-table"
                        role="table"
                        aria-label="YouTube Music search results"
                    >
                        <thead>
                            <tr role="row">
                                <th className="cover-art-header">Cover Art</th>
                                <th className="sortable" onClick={() => handleSort('title')}>
                                    Title
                                    {sortField === 'title' && (
                                        <span className={`sort-indicator ${sortDirection}`}>
                                            {sortDirection === 'asc' ? '↑' : '↓'}
                                        </span>
                                    )}
                                </th>
                                <th className="sortable" onClick={() => handleSort('artist')}>
                                    Artist
                                    {sortField === 'artist' && (
                                        <span className={`sort-indicator ${sortDirection}`}>
                                            {sortDirection === 'asc' ? '↑' : '↓'}
                                        </span>
                                    )}
                                </th>
                                <th className="sortable" onClick={() => handleSort('album')}>
                                    Album
                                    {sortField === 'album' && (
                                        <span className={`sort-indicator ${sortDirection}`}>
                                            {sortDirection === 'asc' ? '↑' : '↓'}
                                        </span>
                                    )}
                                </th>
                                <th className="sortable" onClick={() => handleSort('duration')}>
                                    Duration
                                    {sortField === 'duration' && (
                                        <span className={`sort-indicator ${sortDirection}`}>
                                            {sortDirection === 'asc' ? '↑' : '↓'}
                                        </span>
                                    )}
                                </th>
                                <th className="actions-header">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAndSortedResults.map((track) => {
                                const isCurrentlyPlaying = currentlyPlayingId === track.id;
                                const isDownloaded = downloadedTracks.has(track.id);

                                return (
                                    <tr
                                        key={track.id}
                                        className={`youtube-track-row ${isCurrentlyPlaying ? 'playing' : ''}`}
                                        role="row"
                                        tabIndex={0}
                                        aria-label={`Track: ${track.title} by ${track.artist}`}
                                        style={{
                                            cursor: 'pointer'
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                togglePlayPause(track);
                                            }
                                        }}
                                    >
                                        {/* Cover Art with Enhanced Play/Pause */}
                                        <td className="cover-art-cell" role="gridcell" aria-label="Track cover art">
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
                                                onClick={() => togglePlayPause(track)}
                                            >
                                                {track.thumbnail ? (
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
                                                            // Fallback to placeholder when image fails to load
                                                            e.currentTarget.style.display = 'none';
                                                            const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                                                            if (placeholder) {
                                                                placeholder.style.display = 'flex';
                                                            }
                                                        }}
                                                    />
                                                ) : null}
                                                
                                                {/* Cover Art Placeholder */}
                                                <div
                                                    className="cover-art-placeholder"
                                                    style={{
                                                        display: track.thumbnail ? 'none' : 'flex',
                                                        width: '100%',
                                                        height: '100%',
                                                        background: 'var(--elevated-bg)',
                                                        borderRadius: '4px',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: 'var(--text-muted)',
                                                        fontSize: '16px'
                                                    }}
                                                >
                                                    <MusicIcon />
                                                </div>
                                                
                                                {/* Enhanced Play/Pause/Loading Button Overlay */}
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: '50%',
                                                        left: '50%',
                                                        transform: 'translate(-50%, -50%)',
                                                        width: '24px',
                                                        height: '24px',
                                                        background: isCurrentlyPlaying 
                                                            ? 'rgba(59, 130, 246, 0.9)' 
                                                            : 'rgba(0, 0, 0, 0.8)',
                                                        borderRadius: '50%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        opacity: (isCurrentlyPlaying || audioState.isLoading) ? 1 : 0,
                                                        transition: 'all 0.2s ease',
                                                        pointerEvents: 'none',
                                                        border: '2px solid rgba(255, 255, 255, 0.3)',
                                                        boxShadow: isCurrentlyPlaying 
                                                            ? '0 0 12px rgba(59, 130, 246, 0.6)' 
                                                            : 'none'
                                                    }}
                                                >
                                                    {audioState.isLoading && isCurrentlyPlaying ? (
                                                        // Loading spinner
                                                        <div style={{
                                                            width: '12px',
                                                            height: '12px',
                                                            border: '2px solid rgba(255, 255, 255, 0.3)',
                                                            borderTop: '2px solid white',
                                                            borderRadius: '50%',
                                                            animation: 'spin 1s linear infinite'
                                                        }} />
                                                    ) : isCurrentlyPlaying ? (
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

                                        {/* Title with Progress Bar for Currently Playing */}
                                        <td className="title-cell" role="gridcell" aria-label="Track title">
                                            <div className="title-content">
                                                <span className="title-text" style={{
                                                    color: 'var(--text-primary)',
                                                    fontSize: '14px',
                                                    fontWeight: '500',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    maxWidth: '200px',
                                                    marginBottom: isCurrentlyPlaying ? '4px' : '0'
                                                }}>
                                                    {track.title}
                                                </span>
                                                {isCurrentlyPlaying && (
                                                    <span className="playing-indicator" style={{
                                                        marginLeft: '8px',
                                                        color: 'var(--brand-blue)',
                                                        fontSize: '12px'
                                                    }}>♪</span>
                                                )}
                                            </div>
                                            {isCurrentlyPlaying && audioState.duration > 0 && (
                                                <div style={{
                                                    width: '100%',
                                                    height: '3px',
                                                    background: 'rgba(59, 130, 246, 0.2)',
                                                    borderRadius: '2px',
                                                    overflow: 'hidden',
                                                    marginTop: '4px'
                                                }}>
                                                    <div style={{
                                                        width: `${(audioState.currentTime / audioState.duration) * 100}%`,
                                                        height: '100%',
                                                        background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                                                        transition: 'width 0.1s ease'
                                                    }} />
                                                </div>
                                            )}
                                        </td>

                                        {/* Artist */}
                                        <td className="artist-cell" role="gridcell" aria-label="Artist name">
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
                                        <td className="album-cell" role="gridcell" aria-label="Album name">
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
                                        <td className="duration-cell" role="gridcell" aria-label="Track duration">
                                            <div style={{
                                                color: 'var(--text-secondary)',
                                                fontSize: '12px',
                                                fontFamily: 'monospace'
                                            }}>
                                                {track.duration || '—'}
                                            </div>
                                        </td>

                                        {/* Download Actions */}
                                        <td className="actions-cell" role="gridcell" aria-label="Download actions">
                                            <TrackActions track={track} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {filteredAndSortedResults.length === 0 && !isSearching && searchQuery && (
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

            {/* Download Manager */}
            <DownloadManager
                ref={downloadManagerRef}
                apiPort={apiPort}
                apiSigningKey={apiSigningKey}
                downloadPath={downloadPath}
                isDownloadPathSet={isDownloadPathSet}
                onDownloadComplete={onDownloadComplete}
                maxConcurrentDownloads={3}
            />
        </div>
    );
};

export default YouTubeMusic;