import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
    Download, 
    X, 
    Play, 
    Pause, 
    Square, 
    RotateCcw, 
    CheckCircle, 
    XCircle, 
    Clock, 
    AlertCircle,
    Settings,
    Trash2,
    BarChart3,
    Zap,
    FileText,
    Music,
    Loader2,
    ChevronDown,
    ChevronUp,
    Maximize2,
    Minimize2
} from 'lucide-react';

interface DownloadTask {
    id: string;
    trackId: string;
    title: string;
    artist: string;
    album?: string;
    thumbnail: string;
    url: string;
    downloadPath: string;
    status: 'queued' | 'downloading' | 'converting' | 'metadata' | 'analyzing' | 'completed' | 'failed' | 'cancelled' | 'paused';
    progress: number;
    stage: string;
    message: string;
    speed: number; // bytes per second
    eta: number; // seconds remaining
    fileSize: number; // total file size in bytes
    downloadedSize: number; // downloaded bytes
    startTime: number;
    endTime?: number;
    error?: string;
    retryCount: number;
    priority: number; // higher number = higher priority
    canPause: boolean;
    canResume: boolean;
    canCancel: boolean;
    canRetry: boolean;
    // Enhanced progress tracking
    speedHistory: number[]; // Last 10 speed measurements for smoothing
    averageSpeed: number; // Smoothed average speed
    timeRemaining: number; // More accurate time remaining
    isExpanded: boolean; // For UI expansion
    quality?: string; // Audio quality
    format?: string; // File format
}

interface DownloadStats {
    totalDownloads: number;
    completedDownloads: number;
    failedDownloads: number;
    cancelledDownloads: number;
    totalSize: number;
    downloadedSize: number;
    averageSpeed: number;
    totalTime: number;
    // Enhanced stats
    activeDownloads: number;
    queuedDownloads: number;
    pausedDownloads: number;
    totalBandwidth: number; // Current total bandwidth usage
    estimatedTimeRemaining: number; // For all active downloads
}

interface DownloadManagerProps {
    apiPort: number;
    apiSigningKey: string;
    downloadPath: string;
    isDownloadPathSet: boolean;
    onDownloadComplete?: (song: any) => void;
    maxConcurrentDownloads?: number;
}

interface DownloadManagerRef {
    addDownload: (track: any) => void;
}

const DownloadManager = React.forwardRef<DownloadManagerRef, DownloadManagerProps>(({
    apiPort,
    apiSigningKey,
    downloadPath,
    isDownloadPathSet,
    onDownloadComplete,
    maxConcurrentDownloads = 3
}, ref) => {
    // State management
    const [downloads, setDownloads] = useState<Map<string, DownloadTask>>(new Map());
    const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'failed'>('active');
    const [showManager, setShowManager] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [autoStart, setAutoStart] = useState(true);
    const [showSpeedGraph, setShowSpeedGraph] = useState(false);
    const [stats, setStats] = useState<DownloadStats>({
        totalDownloads: 0,
        completedDownloads: 0,
        failedDownloads: 0,
        cancelledDownloads: 0,
        totalSize: 0,
        downloadedSize: 0,
        averageSpeed: 0,
        totalTime: 0,
        activeDownloads: 0,
        queuedDownloads: 0,
        pausedDownloads: 0,
        totalBandwidth: 0,
        estimatedTimeRemaining: 0
    });
    
    // Refs
    const socketRef = useRef<Socket | null>(null);
    const speedCalculationRef = useRef<Map<string, { lastTime: number; lastSize: number }>>(new Map());
    const retryTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
    
    // Robust WebSocket connection with simplified logic and better error handling
    useEffect(() => {
        let reconnectTimeout: NodeJS.Timeout;
        let connectionAttempts = 0;
        let isConnecting = false;
        let isConnected = false;
        const maxConnectionAttempts = 10;
        const baseReconnectDelay = 2000;
        const maxReconnectDelay = 30000;
        
        const initializeWebSocket = () => {
            if (isConnecting || !isMountedRef.current) return;
            
            try {
                isConnecting = true;
                connectionAttempts++;
                
                // Clean up existing connection
                if (socketRef.current) {
                    socketRef.current.removeAllListeners();
                    socketRef.current.disconnect();
                    socketRef.current = null;
                }
                
                console.log(`🔌 Initializing DownloadManager WebSocket... (attempt ${connectionAttempts}/${maxConnectionAttempts})`);
                
                const socket = io(`http://127.0.0.1:${apiPort}`, {
                    transports: ['polling', 'websocket'], // Try polling first, then websocket
                    timeout: 20000,
                    autoConnect: true,
                    reconnection: true,
                    reconnectionAttempts: maxConnectionAttempts,
                    reconnectionDelay: Math.min(baseReconnectDelay * Math.pow(1.5, connectionAttempts - 1), maxReconnectDelay),
                    reconnectionDelayMax: maxReconnectDelay,
                    forceNew: true,
                    upgrade: true,
                    rememberUpgrade: true, // Remember successful transport
                    // Optimized connection options
                    pingTimeout: 30000,
                    pingInterval: 15000,
                    // Better error handling
                    rejectUnauthorized: false,
                    // Connection state management
                    multiplex: false,
                    // Additional options for better compatibility
                    withCredentials: false,
                    extraHeaders: {
                        'User-Agent': 'CAMELOTDJ/1.0.0'
                    }
                });
                
                // Connection success handler
                socket.on('connect', () => {
                    console.log('✅ DownloadManager WebSocket connected successfully', {
                        transport: socket.io.engine?.transport?.name || 'unknown',
                        id: socket.id
                    });
                    connectionAttempts = 0;
                    isConnecting = false;
                    isConnected = true;
                    
                    // Join all active downloads
                    const activeDownloads = Array.from(downloads.values()).filter(d => 
                        d.status === 'downloading' || d.status === 'converting' || d.status === 'metadata' || d.status === 'analyzing'
                    );
                    
                    activeDownloads.forEach(download => {
                        socket.emit('join_download', { download_id: download.id });
                    });
                });
                
                // Transport change handler
                socket.io.engine?.on('upgrade', () => {
                    console.log('🔄 WebSocket transport upgraded to:', socket.io.engine?.transport?.name);
                });
                
                socket.io.engine?.on('upgradeError', (error) => {
                    console.warn('⚠️ WebSocket upgrade failed, staying with polling:', error);
                });
                
                // Connection error handler
                socket.on('connect_error', (error) => {
                    console.error('❌ WebSocket connection error:', {
                        message: error.message || error,
                        type: error.type,
                        description: error.description,
                        context: error.context,
                        transport: socket.io.engine?.transport?.name || 'unknown'
                    });
                    isConnecting = false;
                    isConnected = false;
                    
                    if (connectionAttempts < maxConnectionAttempts && isMountedRef.current) {
                        const delay = Math.min(baseReconnectDelay * Math.pow(1.3, connectionAttempts - 1), maxReconnectDelay);
                        console.log(`🔄 Retrying WebSocket connection in ${delay/1000} seconds... (attempt ${connectionAttempts}/${maxConnectionAttempts})`);
                        reconnectTimeout = setTimeout(initializeWebSocket, delay);
                    } else {
                        console.warn('⚠️ Max WebSocket connection attempts reached. Will retry periodically.');
                        // Set up a periodic retry every 30 seconds
                        reconnectTimeout = setTimeout(() => {
                            if (isMountedRef.current) {
                                console.log('🔄 Periodic WebSocket retry attempt...');
                                connectionAttempts = 0; // Reset attempts for periodic retry
                                initializeWebSocket();
                            }
                        }, 30000);
                    }
                });
                
                // WebSocket error handler for frame issues
                socket.io.engine?.on('error', (error) => {
                    console.error('❌ WebSocket engine error:', error);
                    // Try to reconnect on frame errors
                    if (error.message && error.message.includes('Invalid frame header')) {
                        console.log('🔄 Invalid frame header detected, reconnecting...');
                        setTimeout(() => {
                            if (isMountedRef.current) {
                                initializeWebSocket();
                            }
                        }, 2000);
                    }
                });
                
                // Disconnection handler
                socket.on('disconnect', (reason) => {
                    console.log('❌ DownloadManager WebSocket disconnected:', reason);
                    isConnecting = false;
                    isConnected = false;
                    
                    // Only attempt reconnection for unexpected disconnections
                    if (reason === 'io server disconnect' || reason === 'io client disconnect') {
                        if (isMountedRef.current) {
                            setTimeout(initializeWebSocket, 2000);
                        }
                    }
                });
                
                // Reconnection handlers
                socket.on('reconnect', (attemptNumber) => {
                    console.log(`🔄 WebSocket reconnected after ${attemptNumber} attempts`);
                    connectionAttempts = 0;
                    isConnecting = false;
                    isConnected = true;
                });
                
                socket.on('reconnect_attempt', (attemptNumber) => {
                    console.log(`🔄 WebSocket reconnection attempt ${attemptNumber}/${maxConnectionAttempts}`);
                });
                
                socket.on('reconnect_error', (error) => {
                    console.error('❌ WebSocket reconnection error:', error);
                });
                
                socket.on('reconnect_failed', () => {
                    console.error('❌ WebSocket reconnection failed after all attempts');
                    isConnecting = false;
                    isConnected = false;
                });
                
                // Download progress handler
                socket.on('download_progress', (data) => {
                    if (isMountedRef.current) {
                        // Only log progress updates for significant changes to reduce console spam
                        if (data.stage === 'complete' || data.stage === 'error' || 
                            (data.progress && data.progress % 25 === 0)) {
                            console.log('📥 Download progress update:', data);
                        }
                        handleDownloadProgress(data);
                    }
                });
                
                // Download complete handler (for chunked completion data)
                socket.on('download_complete', (data) => {
                    if (isMountedRef.current) {
                        console.log('🎉 Download completion data:', data);
                        // Handle additional completion data if needed
                        if (data.download_id) {
                            setDownloads(prev => {
                                const newMap = new Map(prev);
                                const download = newMap.get(data.download_id);
                                if (download) {
                                    const updated = { 
                                        ...download, 
                                        fileSize: data.file_size || download.fileSize,
                                        quality: data.quality || download.quality,
                                        format: data.format || download.format
                                    };
                                    newMap.set(data.download_id, updated);
                                }
                                return newMap;
                            });
                        }
                    }
                });
                
                // Download error handler
                socket.on('download_error', (data) => {
                    if (isMountedRef.current) {
                        console.error('❌ Download error:', data);
                        if (data.download_id) {
                            setDownloads(prev => {
                                const newMap = new Map(prev);
                                const download = newMap.get(data.download_id);
                                if (download) {
                                    const updated = { 
                                        ...download, 
                                        status: 'failed' as const, 
                                        stage: 'error',
                                        message: data.error || 'Download failed',
                                        error: data.error,
                                        endTime: Date.now()
                                    };
                                    newMap.set(data.download_id, updated);
                                }
                                return newMap;
                            });
                        }
                    }
                });
                
                // Connection state monitoring (reduced logging)
                socket.on('ping', () => {
                    // Only log ping/pong in debug mode to reduce console spam
                    if (process.env.NODE_ENV === 'development' && Math.random() < 0.05) {
                        console.log('🏓 WebSocket ping received');
                    }
                });
                
                socket.on('pong', () => {
                    // Only log ping/pong in debug mode to reduce console spam
                    if (process.env.NODE_ENV === 'development' && Math.random() < 0.05) {
                        console.log('🏓 WebSocket pong received');
                    }
                });
                
                socketRef.current = socket;
                
            } catch (error) {
                console.error('❌ Failed to initialize DownloadManager WebSocket:', error);
                isConnecting = false;
                isConnected = false;
                
                if (connectionAttempts < maxConnectionAttempts && isMountedRef.current) {
                    const delay = Math.min(baseReconnectDelay * Math.pow(1.5, connectionAttempts - 1), maxReconnectDelay);
                    reconnectTimeout = setTimeout(initializeWebSocket, delay);
                }
            }
        };
        
        // Start WebSocket connection immediately without health check dependency
        // The WebSocket connection itself will handle retries and error recovery
        console.log('🚀 Starting WebSocket connection...');
        initializeWebSocket();
        
        return () => {
            isConnecting = false;
            isConnected = false;
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
            if (socketRef.current) {
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [apiPort, apiSigningKey, downloads]);
    
    // Handle download progress updates with enhanced real-time processing
    const handleDownloadProgress = useCallback((data: any) => {
        if (!data.download_id) {
            console.warn('⚠️ Received progress update without download_id:', data);
            return;
        }
        
        const downloadId = data.download_id;
        console.log('📥 Processing progress update:', {
            downloadId,
            stage: data.stage,
            progress: data.progress,
            message: data.message,
            downloaded_bytes: data.downloaded_bytes,
            total_bytes: data.total_bytes,
            speed: data.speed,
            quality: data.quality,
            format: data.format,
            timestamp: data.timestamp
        });
        
        setDownloads(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(downloadId);
            if (!current) {
                console.warn('⚠️ Received progress for unknown download:', downloadId);
                return newMap;
            }
            
            // Calculate speed and ETA with enhanced smoothing
            const now = Date.now();
            const speedData = speedCalculationRef.current.get(downloadId) || { lastTime: now, lastSize: 0 };
            const timeDiff = (now - speedData.lastTime) / 1000; // seconds
            const sizeDiff = (data.downloaded_bytes || 0) - speedData.lastSize;
            const instantSpeed = timeDiff > 0 ? sizeDiff / timeDiff : 0;
            
            // Update speed calculation data
            speedCalculationRef.current.set(downloadId, {
                lastTime: now,
                lastSize: data.downloaded_bytes || 0
            });
            
            // Enhanced speed calculation with smoothing
            const newSpeedHistory = [...(current.speedHistory || []), instantSpeed].slice(-10);
            const averageSpeed = newSpeedHistory.length > 0 ? 
                newSpeedHistory.reduce((sum, s) => sum + s, 0) / newSpeedHistory.length : 0;
            
            // Calculate more accurate ETA
            const remainingBytes = (data.total_bytes || 0) - (data.downloaded_bytes || 0);
            const timeRemaining = averageSpeed > 0 ? remainingBytes / averageSpeed : 0;
            
            // Enhanced progress calculation - use backend progress if available
            let progress = data.progress || data.percentage || 0;
            if (data.downloaded_bytes && data.total_bytes && data.total_bytes > 0) {
                const calculatedProgress = (data.downloaded_bytes / data.total_bytes) * 100;
                // Use the higher of the two progress values for better accuracy
                progress = Math.max(progress, calculatedProgress);
            }
            
            const updated: DownloadTask = {
                ...current,
                progress: Math.min(progress, 100), // Cap at 100%
                stage: data.stage || current.stage,
                message: data.message || current.message,
                speed: instantSpeed,
                averageSpeed: averageSpeed,
                eta: timeRemaining,
                timeRemaining: timeRemaining,
                fileSize: data.total_bytes || current.fileSize,
                downloadedSize: data.downloaded_bytes || current.downloadedSize,
                status: getStatusFromStage(data.stage),
                canPause: data.stage === 'downloading',
                canResume: data.stage === 'paused',
                canCancel: data.stage !== 'completed' && data.stage !== 'error',
                canRetry: data.stage === 'error',
                speedHistory: newSpeedHistory,
                quality: data.quality || current.quality || '320kbps',
                format: data.format || current.format || 'mp3'
            };
            
            // Update end time if completed
            if (data.stage === 'complete') {
                updated.endTime = now;
                updated.status = 'completed';
                updated.progress = 100;
            } else if (data.stage === 'error') {
                updated.endTime = now;
                updated.status = 'failed';
                updated.error = data.message;
            }
            
            console.log('📊 Updated download progress:', {
                id: downloadId,
                progress: updated.progress,
                stage: updated.stage,
                speed: updated.averageSpeed,
                eta: updated.timeRemaining,
                quality: updated.quality,
                format: updated.format
            });
            
            newMap.set(downloadId, updated);
            return newMap;
        });
    }, [onDownloadComplete]);
    
    // Handle download completion callback
    const completedDownloadsRef = useRef<Set<string>>(new Set());
    const isMountedRef = useRef(true);
    
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);
    
    // Note: Download completion is now handled directly in startDownload function
    // when the backend returns the full analysis data. This useEffect is kept
    // for potential future use but is currently disabled to avoid duplicate callbacks.
    // 
    // useEffect(() => {
    //     if (!isMountedRef.current) return;
    //     
    //     const completedDownloads = Array.from(downloads.values()).filter(d => 
    //         d.status === 'completed' && !completedDownloadsRef.current.has(d.id)
    //     );
    //     
    //     completedDownloads.forEach(download => {
    //         if (onDownloadComplete && isMountedRef.current) {
    //             onDownloadComplete({
    //                 id: download.id,
    //                 title: download.title,
    //                 artist: download.artist,
    //                 quality: download.quality,
    //                 format: download.format,
    //                 fileSize: download.fileSize
    //             });
    //             completedDownloadsRef.current.add(download.id);
    //         }
    //     });
    // }, [downloads, onDownloadComplete]);
    
    // Get status from stage
    const getStatusFromStage = (stage: string): DownloadTask['status'] => {
        switch (stage) {
            case 'initializing':
            case 'starting':
            case 'extracting':
                return 'downloading';
            case 'downloading':
                return 'downloading';
            case 'converting':
            case 'processing':
                return 'converting';
            case 'metadata':
                return 'metadata';
            case 'analyzing':
                return 'analyzing';
            case 'complete':
                return 'completed';
            case 'error':
                return 'failed';
            case 'cancelled':
                return 'cancelled';
            case 'paused':
                return 'paused';
            default:
                return 'queued';
        }
    };
    
    // Add download to queue
    const addDownload = useCallback((track: any) => {
        // Validate input
        if (!track || !track.id || !track.url) {
            showNotification('Invalid Track', 'Track information is missing or invalid.', 'error');
            return;
        }
        
        // Use default download path if none is set
        const safeProcessEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};
        const homeDir = (safeProcessEnv as any).HOME || (safeProcessEnv as any).USERPROFILE || '';
        const effectiveDownloadPath = downloadPath || `${homeDir}/Downloads/CAMELOTDJ`;
        console.log('📁 Using download path:', effectiveDownloadPath);
        
        // Check if track is already downloading
        const existingDownload = Array.from(downloads.values()).find(d => 
            d.trackId === track.id && (d.status === 'queued' || d.status === 'downloading' || d.status === 'converting' || d.status === 'metadata' || d.status === 'analyzing')
        );
        
        if (existingDownload) {
            showNotification('Already Downloading', `${track.title} is already in the download queue.`, 'warning');
            return;
        }
        
        const downloadId = `${track.id}_${Date.now()}`;
        const newDownload: DownloadTask = {
            id: downloadId,
            trackId: track.id,
            title: track.title || 'Unknown Title',
            artist: track.artist || 'Unknown Artist',
            album: track.album,
            thumbnail: track.thumbnail || '',
            url: track.url,
            downloadPath: effectiveDownloadPath,
            status: 'queued',
            progress: 0,
            stage: 'queued',
            message: 'Added to download queue',
            speed: 0,
            eta: 0,
            fileSize: 0,
            downloadedSize: 0,
            startTime: Date.now(),
            retryCount: 0,
            priority: 1,
            canPause: false,
            canResume: false,
            canCancel: true,
            canRetry: false,
            speedHistory: [],
            averageSpeed: 0,
            timeRemaining: 0,
            isExpanded: false,
            quality: track.quality || 'Unknown',
            format: track.format || 'mp3'
        };
        
        console.log('📥 Adding download to queue:', {
            id: downloadId,
            title: newDownload.title,
            artist: newDownload.artist,
            url: newDownload.url,
            downloadPath: newDownload.downloadPath
        });
        
        setDownloads(prev => {
            const newMap = new Map(prev);
            newMap.set(downloadId, newDownload);
            
            // Process queue after adding new download
            const activeDownloads = Array.from(newMap.values()).filter(d => 
                d.status === 'downloading' || d.status === 'converting' || d.status === 'metadata' || d.status === 'analyzing'
            );
            
            if (activeDownloads.length < maxConcurrentDownloads) {
                const queuedDownloads = Array.from(newMap.values())
                    .filter(d => d.status === 'queued')
                    .sort((a, b) => b.priority - a.priority);
                
                const toStart = queuedDownloads.slice(0, maxConcurrentDownloads - activeDownloads.length);
                
                toStart.forEach(download => {
                    startDownload(download);
                });
            }
            
            return newMap;
        });
        
        showNotification('Download Added', `${track.title} added to download queue`, 'success');
    }, [isDownloadPathSet, downloadPath, maxConcurrentDownloads, downloads]);
    
    // Expose methods to parent component
    React.useImperativeHandle(ref, () => ({
        addDownload: addDownload
    }), [addDownload]);
    
    // Process download queue - now handled in addDownload
    const processDownloadQueue = useCallback(() => {
        // This function is now handled directly in addDownload
        // Keeping it for potential future use
    }, []);
    
    // Enhanced download with robust error handling and yt-dlp best practices
    const startDownload = useCallback(async (download: DownloadTask) => {
        const maxRetries = 3;
        const retryDelay = 2000; // 2 seconds base delay
        
        const attemptDownload = async (attempt: number = 1): Promise<void> => {
            try {
                // Validate download parameters with enhanced checks
                if (!download.url || !download.downloadPath) {
                    throw new Error('Missing required download parameters');
                }
                
                // Validate URL format
                try {
                    new URL(download.url);
                } catch {
                    throw new Error('Invalid URL format');
                }
                
                // Update status with attempt info
                setDownloads(prev => {
                    const newMap = new Map(prev);
                    const updated = { 
                        ...download, 
                        status: 'downloading' as const, 
                        stage: 'initializing', 
                        message: attempt > 1 ? `Retrying download... (attempt ${attempt}/${maxRetries})` : 'Starting download...',
                        retryCount: attempt - 1
                    };
                    newMap.set(download.id, updated);
                    return newMap;
                });
                
                // Join WebSocket room with error handling
                if (socketRef.current && socketRef.current.connected) {
                    socketRef.current.emit('join_download', { download_id: download.id });
                } else {
                    console.warn('⚠️ WebSocket not connected, download will proceed without real-time updates');
                }
                
                // Enhanced filename sanitization (yt-dlp compatible)
                const cleanTitle = (download.title?.trim() || 'Unknown Title')
                    .replace(/[<>:"/\\|?*]/g, '_')
                    .replace(/\s+/g, ' ')
                    .substring(0, 100); // Limit length
                const cleanArtist = (download.artist?.trim() || 'Unknown Artist')
                    .replace(/[<>:"/\\|?*]/g, '_')
                    .replace(/\s+/g, ' ')
                    .substring(0, 100); // Limit length
                
                // Enhanced request body with yt-dlp best practices
                const requestBody = {
                    url: download.url,
                    title: cleanTitle,
                    artist: cleanArtist,
                    download_path: download.downloadPath,
                    download_id: download.id,
                    signingkey: apiSigningKey,
                    // yt-dlp best practices
                    prefer_quality: '320kbps',
                    format: 'bestaudio[ext=m4a]/bestaudio/best',
                    extract_flat: false,
                    write_metadata: true,
                    write_thumbnails: true,
                    embed_metadata: true,
                    // Enhanced error handling
                    ignore_errors: false,
                    no_warnings: false,
                    // Progress tracking
                    progress_hooks: true,
                    // Quality assurance
                    audio_quality: 'best',
                    audio_format: 'mp3',
                    audio_bitrate: 320
                };
                
                console.log('🚀 Starting enhanced download request:', {
                    url: download.url,
                    title: cleanTitle,
                    artist: cleanArtist,
                    download_path: download.downloadPath,
                    download_id: download.id,
                    attempt: attempt,
                    maxRetries: maxRetries
                });
                
                // Enhanced timeout handling with exponential backoff
                const timeoutDuration = Math.min(300000 + (attempt - 1) * 60000, 600000); // 5-10 minutes
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    console.warn(`⏰ Download timeout after ${timeoutDuration}ms (attempt ${attempt})`);
                    controller.abort();
                }, timeoutDuration);
                
                const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/download-enhanced`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Signing-Key': apiSigningKey,
                        'User-Agent': 'CAMELOTDJ/1.0.0',
                        'Accept': 'application/json',
                        'Cache-Control': 'no-cache'
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                console.log('📡 Download response status:', response.status);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('❌ Download error response:', errorText);
                    
                    let errorMessage: string;
                    let shouldRetry = false;
                    
                    try {
                        const errorJson = JSON.parse(errorText);
                        errorMessage = errorJson.error || `Server Error: ${response.status}`;
                        
                        // Determine if we should retry based on error type
                        if (response.status >= 500) {
                            shouldRetry = true; // Server errors are retryable
                        } else if (response.status === 429) {
                            shouldRetry = true; // Rate limiting is retryable
                        } else if (response.status === 408) {
                            shouldRetry = true; // Timeout is retryable
                        }
                    } catch {
                        errorMessage = `Network Error: ${response.status} - ${errorText}`;
                        shouldRetry = response.status >= 500;
                    }
                    
                    // Handle retry logic
                    if (shouldRetry && attempt < maxRetries) {
                        console.log(`🔄 Retrying download in ${retryDelay * attempt}ms (attempt ${attempt + 1}/${maxRetries})`);
                        
                        setTimeout(() => {
                            if (isMountedRef.current) {
                                attemptDownload(attempt + 1);
                            }
                        }, retryDelay * attempt);
                        return;
                    }
                    
                    throw new Error(errorMessage);
                }
                
                const result = await response.json();
                console.log('✅ Download response:', result);
                
                if (result.status === 'success') {
                    // Download completed successfully
                    setDownloads(prev => {
                        const newMap = new Map(prev);
                        const updated = { 
                            ...download, 
                            status: 'completed' as const, 
                            progress: 100, 
                            stage: 'complete',
                            message: 'Download complete!',
                            endTime: Date.now(),
                            quality: result.quality || '320kbps',
                            format: result.format || 'mp3',
                            fileSize: result.fileSize || download.fileSize
                        };
                        newMap.set(download.id, updated);
                        return newMap;
                    });
                    
                    if (onDownloadComplete && result.song) {
                        onDownloadComplete(result.song);
                    }
                    
                    showNotification('Download Complete!', `${download.title} by ${download.artist}`, 'success');
                } else {
                    throw new Error(result.error || 'Download failed');
                }
                
            } catch (error: any) {
                console.error(`❌ Download error (attempt ${attempt}):`, error);
                
                let errorMessage = error.message;
                let shouldRetry = false;
                
                if (error.name === 'AbortError') {
                    errorMessage = 'Download request was aborted due to timeout or connection issue';
                    shouldRetry = true;
                } else if (error.message.includes('Failed to fetch')) {
                    errorMessage = 'Backend connection failed. Please check if the server is running.';
                    shouldRetry = true;
                } else if (error.message.includes('NetworkError')) {
                    errorMessage = 'Network error occurred. Please check your internet connection.';
                    shouldRetry = true;
                } else if (error.message.includes('timeout')) {
                    errorMessage = 'Download timed out. The file might be too large or connection is slow.';
                    shouldRetry = true;
                }
                
                // Handle retry logic for connection issues
                if (shouldRetry && attempt < maxRetries) {
                    console.log(`🔄 Retrying download in ${retryDelay * attempt}ms (attempt ${attempt + 1}/${maxRetries})`);
                    
                    setTimeout(() => {
                        if (isMountedRef.current) {
                            attemptDownload(attempt + 1);
                        }
                    }, retryDelay * attempt);
                    return;
                }
                
                // Final failure - update status
                setDownloads(prev => {
                    const newMap = new Map(prev);
                    const updated = { 
                        ...download, 
                        status: 'failed' as const, 
                        stage: 'error',
                        message: errorMessage,
                        error: errorMessage,
                        endTime: Date.now(),
                        retryCount: attempt - 1
                    };
                    newMap.set(download.id, updated);
                    return newMap;
                });
                
                showNotification('Download Failed', `${download.title}: ${errorMessage}`, 'error');
            }
        };
        
        // Start the download attempt
        await attemptDownload(1);
    }, [apiPort, apiSigningKey, onDownloadComplete]);
    
    // Pause download
    const pauseDownload = useCallback((downloadId: string) => {
        setDownloads(prev => {
            const newMap = new Map(prev);
            const download = newMap.get(downloadId);
            if (download) {
                const updated = { ...download, status: 'paused' as const, message: 'Paused' };
                newMap.set(downloadId, updated);
            }
            return newMap;
        });
        
        // Send pause request to backend
        if (socketRef.current) {
            socketRef.current.emit('pause_download', { download_id: downloadId });
        }
    }, []);
    
    // Resume download
    const resumeDownload = useCallback((downloadId: string) => {
        setDownloads(prev => {
            const newMap = new Map(prev);
            const download = newMap.get(downloadId);
            if (download) {
                const updated = { ...download, status: 'downloading' as const, message: 'Resuming...' };
                newMap.set(downloadId, updated);
            }
            return newMap;
        });
        
        // Send resume request to backend
        if (socketRef.current) {
            socketRef.current.emit('resume_download', { download_id: downloadId });
        }
    }, []);
    
    // Cancel download
    const cancelDownload = useCallback(async (downloadId: string) => {
        setDownloads(prev => {
            const newMap = new Map(prev);
            const download = newMap.get(downloadId);
            if (download) {
                const updated = { 
                    ...download, 
                    status: 'cancelled' as const, 
                    message: 'Cancelled',
                    endTime: Date.now()
                };
                newMap.set(downloadId, updated);
            }
            return newMap;
        });
        
        // Send cancel request to backend
        try {
            await fetch(`http://127.0.0.1:${apiPort}/youtube/cancel-download`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Signing-Key': apiSigningKey
                },
                body: JSON.stringify({
                    track_id: downloadId.split('_')[0],
                    signingkey: apiSigningKey
                })
            });
        } catch (error) {
            console.warn('Failed to send cancellation request:', error);
        }
        
        showNotification('Download Cancelled', 'Download has been cancelled', 'warning');
    }, [apiPort, apiSigningKey]);
    
    // Retry download
    const retryDownload = useCallback((downloadId: string) => {
        setDownloads(prev => {
            const newMap = new Map(prev);
            const download = newMap.get(downloadId);
            if (download) {
                const updated = { 
                    ...download, 
                    status: 'queued' as const, 
                    stage: 'queued',
                    message: 'Retrying...',
                    progress: 0,
                    retryCount: download.retryCount + 1,
                    error: undefined,
                    startTime: Date.now()
                };
                newMap.set(downloadId, updated);
                
                // Start retry immediately if under concurrent limit
                const activeDownloads = Array.from(newMap.values()).filter(d => 
                    d.status === 'downloading' || d.status === 'converting' || d.status === 'metadata' || d.status === 'analyzing'
                );
                
                if (activeDownloads.length < maxConcurrentDownloads) {
                    // Start retry immediately
                    setTimeout(() => startDownload(updated), 500);
                }
            }
            return newMap;
        });
    }, [maxConcurrentDownloads, startDownload]);
    
    // Clear completed downloads
    const clearCompleted = useCallback(() => {
        setDownloads(prev => {
            const newMap = new Map(prev);
            Array.from(newMap.entries()).forEach(([id, download]) => {
                if (download.status === 'completed' || download.status === 'cancelled') {
                    newMap.delete(id);
                }
            });
            return newMap;
        });
    }, []);
    
    // Clear failed downloads
    const clearFailed = useCallback(() => {
        setDownloads(prev => {
            const newMap = new Map(prev);
            Array.from(newMap.entries()).forEach(([id, download]) => {
                if (download.status === 'failed') {
                    newMap.delete(id);
                }
            });
            return newMap;
        });
    }, []);
    
    // Update stats
    useEffect(() => {
        const downloadList = Array.from(downloads.values());
        const activeDownloads = downloadList.filter(d => 
            d.status === 'downloading' || d.status === 'converting' || d.status === 'metadata' || d.status === 'analyzing'
        );
        const queuedDownloads = downloadList.filter(d => d.status === 'queued');
        const pausedDownloads = downloadList.filter(d => d.status === 'paused');
        
        const totalBandwidth = activeDownloads.reduce((sum, d) => sum + d.averageSpeed, 0);
        const estimatedTimeRemaining = activeDownloads.length > 0 
            ? Math.max(...activeDownloads.map(d => d.timeRemaining))
            : 0;
        
        const newStats: DownloadStats = {
            totalDownloads: downloadList.length,
            completedDownloads: downloadList.filter(d => d.status === 'completed').length,
            failedDownloads: downloadList.filter(d => d.status === 'failed').length,
            cancelledDownloads: downloadList.filter(d => d.status === 'cancelled').length,
            totalSize: downloadList.reduce((sum, d) => sum + d.fileSize, 0),
            downloadedSize: downloadList.reduce((sum, d) => sum + d.downloadedSize, 0),
            averageSpeed: downloadList.filter(d => d.averageSpeed > 0).reduce((sum, d) => sum + d.averageSpeed, 0) / Math.max(1, downloadList.filter(d => d.averageSpeed > 0).length),
            totalTime: downloadList.reduce((sum, d) => sum + (d.endTime || Date.now()) - d.startTime, 0),
            activeDownloads: activeDownloads.length,
            queuedDownloads: queuedDownloads.length,
            pausedDownloads: pausedDownloads.length,
            totalBandwidth: totalBandwidth,
            estimatedTimeRemaining: estimatedTimeRemaining
        };
        setStats(newStats);
    }, [downloads]);
    
    // Process queue when downloads change
    useEffect(() => {
        processDownloadQueue();
    }, [processDownloadQueue]);
    
    // Format file size
    const formatFileSize = useCallback((bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }, []);
    
    // Format speed
    const formatSpeed = useCallback((bytesPerSecond: number) => {
        return formatFileSize(bytesPerSecond) + '/s';
    }, [formatFileSize]);
    
    // Format time
    const formatTime = useCallback((seconds: number) => {
        if (seconds === 0 || !isFinite(seconds)) return '--:--';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }, []);
    
    // Toggle download expansion
    const toggleDownloadExpansion = useCallback((downloadId: string) => {
        setDownloads(prev => {
            const newMap = new Map(prev);
            const download = newMap.get(downloadId);
            if (download) {
                const updated = { ...download, isExpanded: !download.isExpanded };
                newMap.set(downloadId, updated);
            }
            return newMap;
        });
    }, []);
    
    // Clear all completed downloads
    const clearAllCompleted = useCallback(() => {
        setDownloads(prev => {
            const newMap = new Map(prev);
            Array.from(newMap.entries()).forEach(([id, download]) => {
                if (download.status === 'completed' || download.status === 'cancelled') {
                    newMap.delete(id);
                }
            });
            return newMap;
        });
    }, []);
    
    // Pause all active downloads
    const pauseAllDownloads = useCallback(() => {
        Array.from(downloads.values()).forEach(download => {
            if (download.canPause) {
                pauseDownload(download.id);
            }
        });
    }, [downloads, pauseDownload]);
    
    // Resume all paused downloads
    const resumeAllDownloads = useCallback(() => {
        Array.from(downloads.values()).forEach(download => {
            if (download.canResume) {
                resumeDownload(download.id);
            }
        });
    }, [downloads, resumeDownload]);
    
    // Get filtered downloads based on active tab
    const filteredDownloads = useMemo(() => {
        const downloadList = Array.from(downloads.values());
        switch (activeTab) {
            case 'active':
                return downloadList.filter(d => 
                    d.status === 'queued' || d.status === 'downloading' || d.status === 'converting' || 
                    d.status === 'metadata' || d.status === 'analyzing' || d.status === 'paused'
                );
            case 'completed':
                return downloadList.filter(d => d.status === 'completed');
            case 'failed':
                return downloadList.filter(d => d.status === 'failed' || d.status === 'cancelled');
            default:
                return downloadList;
        }
    }, [downloads, activeTab]);
    
    // Show notification
    const showNotification = useCallback((title: string, message: string, type: 'success' | 'error' | 'warning' = 'success') => {
        if (!isMountedRef.current) return;
        
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
            if (notification.parentNode) {
                notification.style.animation = 'slideInRight 0.3s ease-out reverse';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 5000);
    }, []);
    
    return (
        <div className="download-manager">
            <style>
                {`
                    @keyframes shimmer {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(100%); }
                    }
                    @keyframes pulse {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.5; transform: scale(1.1); }
                    }
                    .animate-spin {
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}
            </style>
            {/* Download Manager Toggle Button */}
            <button
                onClick={() => setShowManager(!showManager)}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '60px',
                    height: '60px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    zIndex: 1000,
                    transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.6)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                }}
            >
                <Download size={24} />
                {stats.totalDownloads > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: '-5px',
                        right: '-5px',
                        background: '#ef4444',
                        color: 'white',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold'
                    }}>
                        {stats.totalDownloads}
                    </div>
                )}
            </button>
            
            {/* Download Manager Panel */}
            {showManager && (
                <div style={{
                    position: 'fixed',
                    bottom: '90px',
                    right: '20px',
                    width: isMinimized ? '300px' : '450px',
                    maxHeight: isMinimized ? '80px' : '700px',
                    background: 'var(--surface-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                    zIndex: 1001,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border-color)',
                        background: 'var(--card-bg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Download size={20} color="#3b82f6" />
                            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600' }}>
                                Download Manager
                            </h3>
                            {stats.activeDownloads > 0 && (
                                <div style={{
                                    background: '#10b981',
                                    color: 'white',
                                    borderRadius: '12px',
                                    padding: '2px 8px',
                                    fontSize: '12px',
                                    fontWeight: '500'
                                }}>
                                    {stats.activeDownloads} active
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title="Settings"
                            >
                                <Settings size={16} />
                            </button>
                            <button
                                onClick={() => setIsMinimized(!isMinimized)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title={isMinimized ? "Expand" : "Minimize"}
                            >
                                {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                            </button>
                            <button
                                onClick={() => setShowManager(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title="Close"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                    
                    {/* Enhanced Stats Bar */}
                    {!isMinimized && (
                        <div style={{
                            padding: '16px 20px',
                            background: 'var(--surface-bg)',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                        }}>
                            {/* Main Stats Row */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '12px',
                                color: 'var(--text-secondary)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CheckCircle size={14} color="#10b981" />
                                    <span>{stats.completedDownloads} completed</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <XCircle size={14} color="#ef4444" />
                                    <span>{stats.failedDownloads} failed</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Square size={14} color="#6b7280" />
                                    <span>{stats.cancelledDownloads} cancelled</span>
                                </div>
                            </div>
                            
                            {/* Bandwidth and Speed Info */}
                            {stats.activeDownloads > 0 && (
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '11px',
                                    color: 'var(--text-tertiary)',
                                    background: 'var(--card-bg)',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Zap size={12} color="#f59e0b" />
                                        <span>Bandwidth: {formatSpeed(stats.totalBandwidth)}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Clock size={12} color="#3b82f6" />
                                        <span>ETA: {formatTime(stats.estimatedTimeRemaining)}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            background: '#10b981',
                                            animation: 'pulse 2s infinite'
                                        }} />
                                        <span>Real-time</span>
                                    </div>
                                </div>
                            )}
                            
                            {/* Queue Status */}
                            {(stats.queuedDownloads > 0 || stats.pausedDownloads > 0) && (
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '11px',
                                    color: 'var(--text-tertiary)'
                                }}>
                                    {stats.queuedDownloads > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Clock size={12} color="#6b7280" />
                                            <span>{stats.queuedDownloads} queued</span>
                                        </div>
                                    )}
                                    {stats.pausedDownloads > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Pause size={12} color="#f59e0b" />
                                            <span>{stats.pausedDownloads} paused</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Enhanced Tabs */}
                    {!isMinimized && (
                        <div style={{
                            display: 'flex',
                            borderBottom: '1px solid var(--border-color)',
                            background: 'var(--card-bg)'
                        }}>
                            {([
                                { key: 'active', label: 'Active', icon: Play, count: filteredDownloads.length },
                                { key: 'completed', label: 'Completed', icon: CheckCircle, count: Array.from(downloads.values()).filter(d => d.status === 'completed').length },
                                { key: 'failed', label: 'Failed', icon: XCircle, count: Array.from(downloads.values()).filter(d => d.status === 'failed' || d.status === 'cancelled').length }
                            ] as const).map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key as any)}
                                    style={{
                                        flex: 1,
                                        padding: '12px 16px',
                                        background: activeTab === tab.key ? 'var(--brand-blue)' : 'transparent',
                                        color: activeTab === tab.key ? 'white' : 'var(--text-secondary)',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <tab.icon size={16} />
                                    <span>{tab.label}</span>
                                    <span style={{
                                        background: activeTab === tab.key ? 'rgba(255,255,255,0.2)' : 'var(--surface-bg)',
                                        color: activeTab === tab.key ? 'white' : 'var(--text-tertiary)',
                                        borderRadius: '10px',
                                        padding: '2px 6px',
                                        fontSize: '12px',
                                        fontWeight: '600'
                                    }}>
                                        {tab.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                    
                    {/* Bulk Actions */}
                    {!isMinimized && filteredDownloads.length > 0 && (
                        <div style={{
                            padding: '12px 20px',
                            borderBottom: '1px solid var(--border-color)',
                            background: 'var(--card-bg)',
                            display: 'flex',
                            gap: '8px',
                            justifyContent: 'flex-end'
                        }}>
                            {activeTab === 'active' && (
                                <>
                                    {stats.pausedDownloads > 0 && (
                                        <button
                                            onClick={resumeAllDownloads}
                                            style={{
                                                padding: '6px 12px',
                                                fontSize: '12px',
                                                background: '#10b981',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Play size={12} />
                                            Resume All
                                        </button>
                                    )}
                                    {stats.activeDownloads > 0 && (
                                        <button
                                            onClick={pauseAllDownloads}
                                            style={{
                                                padding: '6px 12px',
                                                fontSize: '12px',
                                                background: '#f59e0b',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Pause size={12} />
                                            Pause All
                                        </button>
                                    )}
                                </>
                            )}
                            {activeTab === 'completed' && (
                                <button
                                    onClick={clearAllCompleted}
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        background: '#6b7280',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Trash2 size={12} />
                                    Clear All
                                </button>
                            )}
                        </div>
                    )}

                    {/* Download List */}
                    {!isMinimized && (
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '8px'
                        }}>
                            {filteredDownloads.length === 0 ? (
                                <div style={{
                                    padding: '40px 20px',
                                    textAlign: 'center',
                                    color: 'var(--text-secondary)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}>
                                    <Music size={32} color="var(--text-tertiary)" />
                                    <div>No {activeTab} downloads</div>
                                    {activeTab === 'active' && (
                                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                            Add tracks from YouTube Music to start downloading
                                        </div>
                                    )}
                                </div>
                            ) : (
                                filteredDownloads.map(download => (
                                    <EnhancedDownloadItem
                                        key={download.id}
                                        download={download}
                                        onPause={pauseDownload}
                                        onResume={resumeDownload}
                                        onCancel={cancelDownload}
                                        onRetry={retryDownload}
                                        onToggleExpansion={toggleDownloadExpansion}
                                        formatFileSize={formatFileSize}
                                        formatSpeed={formatSpeed}
                                        formatTime={formatTime}
                                    />
                                ))
                            )}
                        </div>
                    )}
                    
                    {/* Enhanced Footer */}
                    {!isMinimized && (
                        <div style={{
                            padding: '12px 20px',
                            borderTop: '1px solid var(--border-color)',
                            background: 'var(--card-bg)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '12px',
                                color: 'var(--text-tertiary)'
                            }}>
                                <BarChart3 size={14} />
                                <span>Total: {stats.totalDownloads} | Size: {formatFileSize(stats.totalSize)}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {activeTab === 'failed' && (
                                    <button
                                        onClick={clearFailed}
                                        style={{
                                            padding: '6px 12px',
                                            fontSize: '12px',
                                            background: 'var(--surface-bg)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <Trash2 size={12} />
                                        Clear Failed
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

DownloadManager.displayName = 'DownloadManager';

// Enhanced Download Item Component
interface EnhancedDownloadItemProps {
    download: DownloadTask;
    onPause: (id: string) => void;
    onResume: (id: string) => void;
    onCancel: (id: string) => void;
    onRetry: (id: string) => void;
    onToggleExpansion: (id: string) => void;
    formatFileSize: (bytes: number) => string;
    formatSpeed: (bytes: number) => string;
    formatTime: (seconds: number) => string;
}

const EnhancedDownloadItem: React.FC<EnhancedDownloadItemProps> = ({
    download,
    onPause,
    onResume,
    onCancel,
    onRetry,
    onToggleExpansion,
    formatFileSize,
    formatSpeed,
    formatTime
}) => {
    const getStatusColor = (status: DownloadTask['status']) => {
        switch (status) {
            case 'completed': return '#10b981';
            case 'failed': return '#ef4444';
            case 'cancelled': return '#6b7280';
            case 'downloading': return '#3b82f6';
            case 'converting': return '#8b5cf6';
            case 'metadata': return '#f59e0b';
            case 'analyzing': return '#06b6d4';
            case 'paused': return '#f59e0b';
            case 'queued': return '#6b7280';
            default: return '#6b7280';
        }
    };
    
    const getStatusIcon = (status: DownloadTask['status']) => {
        switch (status) {
            case 'completed': return <CheckCircle size={16} color="#10b981" />;
            case 'failed': return <XCircle size={16} color="#ef4444" />;
            case 'cancelled': return <Square size={16} color="#6b7280" />;
            case 'downloading': return <Download size={16} color="#3b82f6" />;
            case 'converting': return <Loader2 size={16} color="#8b5cf6" className="animate-spin" />;
            case 'metadata': return <FileText size={16} color="#f59e0b" />;
            case 'analyzing': return <Music size={16} color="#06b6d4" />;
            case 'paused': return <Pause size={16} color="#f59e0b" />;
            case 'queued': return <Clock size={16} color="#6b7280" />;
            default: return <AlertCircle size={16} color="#6b7280" />;
        }
    };
    
    return (
        <div style={{
            padding: '16px',
            marginBottom: '8px',
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
        }}
        onClick={() => onToggleExpansion(download.id)}
        >
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '12px'
            }}>
                <img
                    src={download.thumbnail}
                    alt={download.title}
                    style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        objectFit: 'cover',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                    }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        color: 'var(--text-primary)',
                        fontSize: '15px',
                        fontWeight: '600',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginBottom: '2px'
                    }}>
                        {download.title}
                    </div>
                    <div style={{
                        color: 'var(--text-secondary)',
                        fontSize: '13px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginBottom: '4px'
                    }}>
                        {download.artist}
                    </div>
                    {(download.quality || download.format) && (
                        <div style={{
                            display: 'flex',
                            gap: '8px',
                            fontSize: '11px',
                            color: 'var(--text-tertiary)'
                        }}>
                            {download.quality && (
                                <span style={{
                                    background: 'var(--surface-bg)',
                                    padding: '2px 6px',
                                    borderRadius: '4px'
                                }}>
                                    {download.quality}
                                </span>
                            )}
                            {download.format && (
                                <span style={{
                                    background: 'var(--surface-bg)',
                                    padding: '2px 6px',
                                    borderRadius: '4px'
                                }}>
                                    {download.format.toUpperCase()}
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: getStatusColor(download.status),
                        fontSize: '12px',
                        fontWeight: '500'
                    }}>
                        {getStatusIcon(download.status)}
                        <span style={{ textTransform: 'capitalize' }}>{download.status}</span>
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpansion(download.id);
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {download.isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                </div>
            </div>
            
            {/* Enhanced Progress Bar with Real-time Updates */}
            {download.status !== 'completed' && download.status !== 'cancelled' && (
                <div style={{
                    width: '100%',
                    marginBottom: '12px'
                }}>
                    {/* Progress Bar Container */}
                    <div style={{
                        width: '100%',
                        height: '10px',
                        background: 'rgba(0, 0, 0, 0.1)',
                        borderRadius: '5px',
                        overflow: 'hidden',
                        position: 'relative',
                        marginBottom: '8px'
                    }}>
                        <div style={{
                            width: `${Math.min(download.progress, 100)}%`,
                            height: '100%',
                            background: `linear-gradient(90deg, ${getStatusColor(download.status)}, ${getStatusColor(download.status)}80)`,
                            transition: 'width 0.2s ease-out',
                            position: 'relative'
                        }}>
                            {/* Animated shimmer effect for active downloads */}
                            {(download.status === 'downloading' || download.status === 'converting') && (
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                                    animation: 'shimmer 1.5s infinite'
                                }} />
                            )}
                        </div>
                    </div>
                    
                    {/* Real-time Progress Info */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        marginBottom: '4px'
                    }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={10} />
                            {download.message}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {download.quality && (
                                <span style={{
                                    background: 'var(--surface-bg)',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    color: '#10b981',
                                    fontWeight: '500'
                                }}>
                                    {download.quality}
                                </span>
                            )}
                            <span style={{
                                background: 'var(--surface-bg)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: '600',
                                color: getStatusColor(download.status)
                            }}>
                                {download.progress.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                    
                    {/* Speed and ETA Display */}
                    {(download.status === 'downloading' || download.status === 'converting') && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '10px',
                            color: 'var(--text-tertiary)',
                            background: 'var(--surface-bg)',
                            padding: '4px 8px',
                            borderRadius: '4px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Zap size={10} color="#f59e0b" />
                                <span>Speed: {formatSpeed(download.averageSpeed)}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={10} color="#3b82f6" />
                                <span>ETA: {formatTime(download.timeRemaining)}</span>
                            </div>
                            {download.fileSize > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <FileText size={10} color="#6b7280" />
                                    <span>{formatFileSize(download.downloadedSize)} / {formatFileSize(download.fileSize)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            
            
            {/* Expanded Details */}
            {download.isExpanded && (
                <div style={{
                    padding: '12px',
                    background: 'var(--surface-bg)',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    border: '1px solid var(--border-color)'
                }}>
                    {/* Speed and ETA */}
                    {(download.status === 'downloading' || download.status === 'converting') && (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '12px',
                            marginBottom: '12px'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '12px',
                                color: 'var(--text-secondary)'
                            }}>
                                <Zap size={14} color="#f59e0b" />
                                <span>Speed: {formatSpeed(download.averageSpeed)}</span>
                            </div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '12px',
                                color: 'var(--text-secondary)'
                            }}>
                                <Clock size={14} color="#3b82f6" />
                                <span>ETA: {formatTime(download.timeRemaining)}</span>
                            </div>
                        </div>
                    )}
                    
                    {/* File Size Info */}
                    {download.fileSize > 0 && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            marginBottom: '12px'
                        }}>
                            <span>File Size:</span>
                            <span style={{ fontWeight: '600' }}>
                                {formatFileSize(download.downloadedSize)} / {formatFileSize(download.fileSize)}
                            </span>
                        </div>
                    )}
                    
                    {/* Download Path */}
                    <div style={{
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        marginBottom: '12px',
                        wordBreak: 'break-all'
                    }}>
                        <strong>Path:</strong> {download.downloadPath}
                    </div>
                    
                    {/* Speed History Graph (if available) */}
                    {download.speedHistory && download.speedHistory.length > 1 && (
                        <div style={{
                            marginBottom: '12px'
                        }}>
                            <div style={{
                                fontSize: '11px',
                                color: 'var(--text-tertiary)',
                                marginBottom: '4px'
                            }}>
                                Speed History:
                            </div>
                            <div style={{
                                height: '20px',
                                background: 'var(--card-bg)',
                                borderRadius: '4px',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'end',
                                gap: '1px'
                            }}>
                                {download.speedHistory.slice(-20).map((speed, index) => (
                                    <div
                                        key={index}
                                        style={{
                                            flex: 1,
                                            height: `${Math.min(100, (speed / Math.max(...download.speedHistory)) * 100)}%`,
                                            background: `linear-gradient(to top, ${getStatusColor(download.status)}, ${getStatusColor(download.status)}80)`,
                                            borderRadius: '1px'
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {/* Error Message */}
            {download.error && (
                <div style={{
                    fontSize: '12px',
                    color: '#ef4444',
                    marginBottom: '12px',
                    padding: '8px 12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '6px',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}>
                    <AlertCircle size={14} />
                    {download.error}
                </div>
            )}
            
            {/* Enhanced Action Buttons */}
            <div style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end'
            }}>
                {download.canPause && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onPause(download.id);
                        }}
                        style={{
                            padding: '6px 12px',
                            fontSize: '11px',
                            background: '#f59e0b',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: '500'
                        }}
                    >
                        <Pause size={12} />
                        Pause
                    </button>
                )}
                {download.canResume && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onResume(download.id);
                        }}
                        style={{
                            padding: '6px 12px',
                            fontSize: '11px',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: '500'
                        }}
                    >
                        <Play size={12} />
                        Resume
                    </button>
                )}
                {download.canCancel && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onCancel(download.id);
                        }}
                        style={{
                            padding: '6px 12px',
                            fontSize: '11px',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: '500'
                        }}
                    >
                        <Square size={12} />
                        Cancel
                    </button>
                )}
                {download.canRetry && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onRetry(download.id);
                        }}
                        style={{
                            padding: '6px 12px',
                            fontSize: '11px',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: '500'
                        }}
                    >
                        <RotateCcw size={12} />
                        Retry
                    </button>
                )}
            </div>
        </div>
    );
};

export default DownloadManager;
