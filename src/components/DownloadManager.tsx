import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
    Download, 
    X, 
    Square, 
    RotateCcw, 
    CheckCircle, 
    XCircle, 
    Clock, 
    AlertCircle,
    Trash2,
    Music,
    Settings
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
    status: 'queued' | 'downloading' | 'converting' | 'metadata' | 'analyzing' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    stage: string;
    message: string;
    fileSize: number;
    downloadedSize: number;
    startTime: number;
    endTime?: number;
    error?: string;
    retryCount: number;
    canCancel: boolean;
    canRetry: boolean;
    quality?: string;
    format?: string;
}

interface DownloadStats {
    totalDownloads: number;
    completedDownloads: number;
    failedDownloads: number;
    cancelledDownloads: number;
    activeDownloads: number;
    queuedDownloads: number;
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
    const [showSettings, setShowSettings] = useState(false);
    const [stats, setStats] = useState<DownloadStats>({
        totalDownloads: 0,
        completedDownloads: 0,
        failedDownloads: 0,
        cancelledDownloads: 0,
        activeDownloads: 0,
        queuedDownloads: 0
    });
    
    // Refs
    const socketRef = useRef<Socket | null>(null);
    const isMountedRef = useRef(true);
    
    // Enhanced WebSocket connection with queue sync
    useEffect(() => {
        if (!isMountedRef.current) return;
        
        const socket = io(`http://127.0.0.1:${apiPort}`, {
            transports: ['polling', 'websocket'],
            timeout: 10000,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 2000
        });
        
        socket.on('connect', () => {
            console.log('✅ DownloadManager WebSocket connected');
            // Sync with backend queue on connection
            syncWithBackendQueue();
        });
        
        socket.on('download_progress', (data) => {
            if (isMountedRef.current && data.download_id) {
                handleDownloadProgress(data);
            }
        });
        
        socket.on('download_complete', (data) => {
            if (isMountedRef.current && data.download_id) {
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
        // Push completed song to parent for All Music and virtual Downloads
        try {
            if (onDownloadComplete && data.song) {
                console.log('🎵 DownloadManager calling onDownloadComplete with song:', data.song);
                onDownloadComplete(data.song);
            } else {
                console.log('🎵 DownloadManager - no callback or song:', { hasCallback: !!onDownloadComplete, hasSong: !!data.song });
            }
        } catch (error) {
            console.error('🎵 Error in onDownloadComplete:', error);
        }
            }
        });
        
        socket.on('download_error', (data) => {
            if (isMountedRef.current && data.download_id) {
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
        });
        
        socketRef.current = socket;
        
        return () => {
            if (socketRef.current) {
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [apiPort]);
    
    // Sync with backend queue
    const syncWithBackendQueue = useCallback(async () => {
        try {
            const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/queue/status?signingkey=${apiSigningKey}`, {
                method: 'GET',
                headers: {
                    'X-Signing-Key': apiSigningKey
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.status === 'success' && result.downloads) {
                    // Update local state with backend queue state
                    setDownloads(prev => {
                        const newMap = new Map(prev);
                        result.downloads.forEach((backendDownload: any) => {
                            const localDownload = newMap.get(backendDownload.id);
                            if (localDownload) {
                                // Update local download with backend state
                                const updated = {
                                    ...localDownload,
                                    status: backendDownload.status,
                                    progress: backendDownload.progress,
                                    stage: backendDownload.stage,
                                    message: backendDownload.message,
                                    error: backendDownload.error,
                                    canCancel: backendDownload.can_cancel,
                                    canRetry: backendDownload.can_retry,
                                    retryCount: backendDownload.retry_count
                                };
                                newMap.set(backendDownload.id, updated);
                            }
                        });
                        return newMap;
                    });
                }
            }
        } catch (error) {
            console.error('Failed to sync with backend queue:', error);
        }
    }, [apiPort, apiSigningKey]);
    
    // Simplified progress handler
    const handleDownloadProgress = useCallback((data: any) => {
        if (!data.download_id) return;
        
        setDownloads(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(data.download_id);
            if (!current) return newMap;
            
            let progress = data.progress || 0;
            if (data.downloaded_bytes && data.total_bytes && data.total_bytes > 0) {
                progress = (data.downloaded_bytes / data.total_bytes) * 100;
            }
            
            const updated: DownloadTask = {
                ...current,
                progress: Math.min(progress, 100),
                stage: data.stage || current.stage,
                message: data.message || current.message,
                fileSize: data.total_bytes || current.fileSize,
                downloadedSize: data.downloaded_bytes || current.downloadedSize,
                status: getStatusFromStage(data.stage),
                canCancel: data.stage !== 'completed' && data.stage !== 'error',
                canRetry: data.stage === 'error',
                quality: data.quality || current.quality,
                format: data.format || current.format
            };
            
            if (data.stage === 'complete') {
                updated.endTime = Date.now();
                updated.status = 'completed';
                updated.progress = 100;
            } else if (data.stage === 'error') {
                updated.endTime = Date.now();
                updated.status = 'failed';
                updated.error = data.message;
            }
            
            newMap.set(data.download_id, updated);
            return newMap;
        });

        // If backend sends final song payload on the progress 'complete' frame, propagate up
        try {
            if (data.stage === 'complete' && onDownloadComplete && data.song) {
                console.log('🎵 DownloadManager progress complete - calling onDownloadComplete with song:', data.song);
                onDownloadComplete(data.song);
            } else if (data.stage === 'complete') {
                console.log('🎵 DownloadManager progress complete - no callback or song:', { hasCallback: !!onDownloadComplete, hasSong: !!data.song });
            }
        } catch (error) {
            console.error('🎵 Error in progress complete onDownloadComplete:', error);
        }
    }, [onDownloadComplete]);
    
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);
    
    // Periodic sync with backend queue
    useEffect(() => {
        const syncInterval = setInterval(() => {
            if (isMountedRef.current) {
                syncWithBackendQueue();
            }
        }, 5000); // Sync every 5 seconds
        
        return () => clearInterval(syncInterval);
    }, [syncWithBackendQueue]);
    
    // Get status from stage
    const getStatusFromStage = (stage: string): DownloadTask['status'] => {
        switch (stage) {
            case 'initializing':
            case 'starting':
            case 'extracting':
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
            default:
                return 'queued';
        }
    };
    
    // Add download to queue
    const addDownload = useCallback((track: any) => {
        if (!track || !track.id || !track.url) {
            showNotification('Invalid Track', 'Track information is missing or invalid.', 'error');
            return;
        }
        
        // Use default download path if none is set
        const safeProcessEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};
        const homeDir = (safeProcessEnv as any).HOME || (safeProcessEnv as any).USERPROFILE || '';
        const effectiveDownloadPath = downloadPath || `${homeDir}/Downloads/CAMELOTDJ`;
        
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
            fileSize: 0,
            downloadedSize: 0,
            startTime: Date.now(),
            retryCount: 0,
            canCancel: true,
            canRetry: false,
            quality: track.quality || 'Unknown',
            format: track.format || 'mp3'
        };
        
        setDownloads(prev => {
            const newMap = new Map(prev);
            newMap.set(downloadId, newDownload);
            
            // Process queue after adding new download
            const activeDownloads = Array.from(newMap.values()).filter(d => 
                d.status === 'downloading' || d.status === 'converting' || d.status === 'metadata' || d.status === 'analyzing'
            );
            
            if (activeDownloads.length < maxConcurrentDownloads) {
                const queuedDownloads = Array.from(newMap.values()).filter(d => d.status === 'queued');
                const toStart = queuedDownloads.slice(0, maxConcurrentDownloads - activeDownloads.length);
                
                toStart.forEach(download => {
                    startDownload(download);
                });
            }
            
            return newMap;
        });
        
        // Background processing - no notification needed
        console.log(`✅ ${track.title} added to download queue`);
    }, [downloadPath, maxConcurrentDownloads, downloads]);
    
    // Expose methods to parent component
    React.useImperativeHandle(ref, () => ({
        addDownload: addDownload
    }), [addDownload]);
    
    
    // Enhanced download function using queue system
    const startDownload = useCallback(async (download: DownloadTask) => {
        try {
            if (!download.url || !download.downloadPath) {
                throw new Error('Missing required download parameters');
            }
            
            // Update status to queued
            setDownloads(prev => {
                const newMap = new Map(prev);
                const updated = { 
                    ...download, 
                    status: 'queued' as const, 
                    stage: 'queued', 
                    message: 'Added to download queue...'
                };
                newMap.set(download.id, updated);
                return newMap;
            });
            
            // Join WebSocket room
            if (socketRef.current && socketRef.current.connected) {
                socketRef.current.emit('join_download', { download_id: download.id });
            }
            
            // Clean filename
            const cleanTitle = (download.title?.trim() || 'Unknown Title')
                .replace(/[<>:"/\\|?*]/g, '_')
                .replace(/\s+/g, ' ')
                .substring(0, 100);
            const cleanArtist = (download.artist?.trim() || 'Unknown Artist')
                .replace(/[<>:"/\\|?*]/g, '_')
                .replace(/\s+/g, ' ')
                .substring(0, 100);
            
            const requestBody = {
                url: download.url,
                title: cleanTitle,
                artist: cleanArtist,
                album: download.album,
                download_path: download.downloadPath,
                download_id: download.id,
                signingkey: apiSigningKey,
                priority: 'normal', // Can be enhanced to support priority selection
                quality: '320kbps',
                format: 'mp3'
            };
            
            const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/download-queued`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Signing-Key': apiSigningKey
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server Error: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            
            if (result.status === 'queued') {
                setDownloads(prev => {
                    const newMap = new Map(prev);
                    const updated = { 
                        ...download, 
                        status: 'queued' as const, 
                        stage: 'queued',
                        message: `Queued (position ${result.queue_stats?.queued || 0})`,
                        progress: 0
                    };
                    newMap.set(download.id, updated);
                    return newMap;
                });
                
                console.log(`✅ ${download.title} queued successfully`);
            } else {
                throw new Error(result.error || 'Failed to queue download');
            }
            
        } catch (error: any) {
            console.error('Download queue error:', error);
            
            setDownloads(prev => {
                const newMap = new Map(prev);
                const updated = { 
                    ...download, 
                    status: 'failed' as const, 
                    stage: 'error',
                    message: error.message,
                    error: error.message,
                    endTime: Date.now()
                };
                newMap.set(download.id, updated);
                return newMap;
            });
            
            showNotification('Download Failed', `${download.title}: ${error.message}`, 'error');
        }
    }, [apiPort, apiSigningKey, onDownloadComplete]);
    
    
    // Cancel download using queue system
    const cancelDownload = useCallback(async (downloadId: string) => {
        try {
            const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/queue/cancel`, {
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
                setDownloads(prev => {
                    const newMap = new Map(prev);
                    const download = newMap.get(downloadId);
                    if (download) {
                        const updated = { 
                            ...download, 
                            status: 'cancelled' as const, 
                            message: 'Cancelled',
                            endTime: Date.now(),
                            canCancel: false,
                            canRetry: true
                        };
                        newMap.set(downloadId, updated);
                    }
                    return newMap;
                });
                
                showNotification('Download Cancelled', 'Download has been cancelled', 'warning');
            } else {
                throw new Error('Failed to cancel download');
            }
        } catch (error: any) {
            console.error('Cancel download error:', error);
            showNotification('Cancel Failed', `Failed to cancel download: ${error.message}`, 'error');
        }
    }, [apiPort, apiSigningKey]);
    
    // Retry download using queue system
    const retryDownload = useCallback(async (downloadId: string) => {
        try {
            const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/queue/retry`, {
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
                            startTime: Date.now(),
                            canCancel: true,
                            canRetry: false
                        };
                        newMap.set(downloadId, updated);
                    }
                    return newMap;
                });
                
                console.log('✅ Download retry initiated');
            } else {
                throw new Error('Failed to retry download');
            }
        } catch (error: any) {
            console.error('Retry download error:', error);
            showNotification('Retry Failed', `Failed to retry download: ${error.message}`, 'error');
        }
    }, [apiPort, apiSigningKey]);
    
    // Clear completed downloads using queue system
    const clearCompleted = useCallback(async () => {
        try {
            const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/queue/clear`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Signing-Key': apiSigningKey
                },
                body: JSON.stringify({
                    type: 'completed',
                    signingkey: apiSigningKey
                })
            });
            
            if (response.ok) {
                setDownloads(prev => {
                    const newMap = new Map(prev);
                    Array.from(newMap.entries()).forEach(([id, download]) => {
                        if (download.status === 'completed' || download.status === 'cancelled') {
                            newMap.delete(id);
                        }
                    });
                    return newMap;
                });
                showNotification('Cleared', 'Completed downloads cleared', 'success');
            } else {
                throw new Error('Failed to clear completed downloads');
            }
        } catch (error: any) {
            console.error('Clear completed error:', error);
            showNotification('Clear Failed', `Failed to clear completed downloads: ${error.message}`, 'error');
        }
    }, [apiPort, apiSigningKey]);
    
    // Clear failed downloads using queue system
    const clearFailed = useCallback(async () => {
        try {
            const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/queue/clear`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Signing-Key': apiSigningKey
                },
                body: JSON.stringify({
                    type: 'failed',
                    signingkey: apiSigningKey
                })
            });
            
            if (response.ok) {
                setDownloads(prev => {
                    const newMap = new Map(prev);
                    Array.from(newMap.entries()).forEach(([id, download]) => {
                        if (download.status === 'failed') {
                            newMap.delete(id);
                        }
                    });
                    return newMap;
                });
                showNotification('Cleared', 'Failed downloads cleared', 'success');
            } else {
                throw new Error('Failed to clear failed downloads');
            }
        } catch (error: any) {
            console.error('Clear failed error:', error);
            showNotification('Clear Failed', `Failed to clear failed downloads: ${error.message}`, 'error');
        }
    }, [apiPort, apiSigningKey]);
    
    // Update max concurrent downloads
    const updateMaxConcurrentDownloads = useCallback(async (newMax: number) => {
        try {
            const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/queue/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Signing-Key': apiSigningKey
                },
                body: JSON.stringify({
                    max_concurrent_downloads: newMax,
                    signingkey: apiSigningKey
                })
            });
            
            if (response.ok) {
                console.log(`✅ Max concurrent downloads set to ${newMax}`);
            } else {
                throw new Error('Failed to update settings');
            }
        } catch (error: any) {
            console.error('Update settings error:', error);
            showNotification('Update Failed', `Failed to update settings: ${error.message}`, 'error');
        }
    }, [apiPort, apiSigningKey]);
    
    // Update stats
    useEffect(() => {
        const downloadList = Array.from(downloads.values());
        const activeDownloads = downloadList.filter(d => 
            d.status === 'downloading' || d.status === 'converting' || d.status === 'metadata' || d.status === 'analyzing'
        );
        const queuedDownloads = downloadList.filter(d => d.status === 'queued');
        
        const newStats: DownloadStats = {
            totalDownloads: downloadList.length,
            completedDownloads: downloadList.filter(d => d.status === 'completed').length,
            failedDownloads: downloadList.filter(d => d.status === 'failed').length,
            cancelledDownloads: downloadList.filter(d => d.status === 'cancelled').length,
            activeDownloads: activeDownloads.length,
            queuedDownloads: queuedDownloads.length
        };
        setStats(newStats);
    }, [downloads]);
    
    // Format file size
    const formatFileSize = useCallback((bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }, []);
    
    // Clear all completed downloads using queue system
    const clearAllCompleted = useCallback(async () => {
        try {
            const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/queue/clear`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Signing-Key': apiSigningKey
                },
                body: JSON.stringify({
                    type: 'completed',
                    signingkey: apiSigningKey
                })
            });
            
            if (response.ok) {
                setDownloads(prev => {
                    const newMap = new Map(prev);
                    Array.from(newMap.entries()).forEach(([id, download]) => {
                        if (download.status === 'completed' || download.status === 'cancelled') {
                            newMap.delete(id);
                        }
                    });
                    return newMap;
                });
                showNotification('Cleared', 'All completed downloads cleared', 'success');
            } else {
                throw new Error('Failed to clear completed downloads');
            }
        } catch (error: any) {
            console.error('Clear all completed error:', error);
            showNotification('Clear Failed', `Failed to clear completed downloads: ${error.message}`, 'error');
        }
    }, [apiPort, apiSigningKey]);
    
    // Get filtered downloads based on active tab
    const filteredDownloads = useMemo(() => {
        const downloadList = Array.from(downloads.values());
        switch (activeTab) {
            case 'active':
                return downloadList.filter(d => 
                    d.status === 'queued' || d.status === 'downloading' || d.status === 'converting' || 
                    d.status === 'metadata' || d.status === 'analyzing'
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
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b'
        };
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type]};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            z-index: 10000;
            max-width: 300px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
        `;
        
        notification.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
            <div style="font-size: 12px; opacity: 0.9;">${message}</div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }, []);
    
    return (
        <div className="download-manager">
            {/* Download Manager Toggle Button */}
            <button
                onClick={() => setShowManager(!showManager)}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    background: '#1f2937',
                    color: '#f9fafb',
                    border: '1px solid #374151',
                    borderRadius: '50%',
                    width: '60px',
                    height: '60px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    zIndex: 1000,
                    transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#374151';
                    e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#1f2937';
                    e.currentTarget.style.transform = 'scale(1)';
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
                        fontWeight: 'bold',
                        border: '2px solid #1f2937'
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
                    width: '400px',
                    maxHeight: '600px',
                    background: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                    zIndex: 1001,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid #374151',
                        background: '#111827',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Download size={20} color="#60a5fa" />
                            <h3 style={{ margin: 0, color: '#f9fafb', fontSize: '16px', fontWeight: '600' }}>
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
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#9ca3af',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'color 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.color = '#f9fafb';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.color = '#9ca3af';
                                }}
                                title="Settings"
                            >
                                <Settings size={16} />
                            </button>
                            <button
                                onClick={() => setShowManager(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#9ca3af',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'color 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.color = '#f9fafb';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.color = '#9ca3af';
                                }}
                                title="Close"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                    
                    {/* Simple Stats Bar */}
                    <div style={{
                        padding: '12px 20px',
                        background: '#111827',
                        borderBottom: '1px solid #374151',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '12px',
                        color: '#9ca3af'
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
                            <Clock size={14} color="#9ca3af" />
                            <span>{stats.queuedDownloads} queued</span>
                        </div>
                    </div>
                    
                    {/* Tabs */}
                    <div style={{
                        display: 'flex',
                        borderBottom: '1px solid #374151',
                        background: '#1f2937'
                    }}>
                        {([
                            { key: 'active', label: 'Active', icon: Download, count: filteredDownloads.length },
                            { key: 'completed', label: 'Completed', icon: CheckCircle, count: Array.from(downloads.values()).filter(d => d.status === 'completed').length },
                            { key: 'failed', label: 'Failed', icon: XCircle, count: Array.from(downloads.values()).filter(d => d.status === 'failed' || d.status === 'cancelled').length }
                        ] as const).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key as any)}
                                style={{
                                    flex: 1,
                                    padding: '12px 16px',
                                    background: activeTab === tab.key ? '#3b82f6' : 'transparent',
                                    color: activeTab === tab.key ? 'white' : '#9ca3af',
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
                                onMouseEnter={(e) => {
                                    if (activeTab !== tab.key) {
                                        e.currentTarget.style.background = '#374151';
                                        e.currentTarget.style.color = '#f9fafb';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (activeTab !== tab.key) {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = '#9ca3af';
                                    }
                                }}
                            >
                                <tab.icon size={16} />
                                <span>{tab.label}</span>
                                <span style={{
                                    background: activeTab === tab.key ? 'rgba(255,255,255,0.2)' : '#374151',
                                    color: activeTab === tab.key ? 'white' : '#9ca3af',
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
                    
                    {/* Bulk Actions */}
                    {filteredDownloads.length > 0 && (
                        <div style={{
                            padding: '12px 20px',
                            borderBottom: '1px solid #374151',
                            background: '#111827',
                            display: 'flex',
                            gap: '8px',
                            justifyContent: 'flex-end'
                        }}>
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
                                        gap: '4px',
                                        transition: 'background 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#9ca3af';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = '#6b7280';
                                    }}
                                >
                                    <Trash2 size={12} />
                                    Clear All
                                </button>
                            )}
                        </div>
                    )}

                    {/* Download List */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '8px',
                        background: '#1f2937'
                    }}>
                        {filteredDownloads.length === 0 ? (
                            <div style={{
                                padding: '40px 20px',
                                textAlign: 'center',
                                color: '#9ca3af',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <Music size={32} color="#6b7280" />
                                <div>No {activeTab} downloads</div>
                                {activeTab === 'active' && (
                                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                        Add tracks from YouTube Music to start downloading
                                    </div>
                                )}
                            </div>
                        ) : (
                            filteredDownloads.map(download => (
                                <SimpleDownloadItem
                                    key={download.id}
                                    download={download}
                                    onCancel={cancelDownload}
                                    onRetry={retryDownload}
                                    formatFileSize={formatFileSize}
                                />
                            ))
                        )}
                    </div>
                    
                    {/* Footer */}
                    <div style={{
                        padding: '12px 20px',
                        borderTop: '1px solid #374151',
                        background: '#111827',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div style={{
                            fontSize: '12px',
                            color: '#9ca3af'
                        }}>
                            Total: {stats.totalDownloads} downloads
                        </div>
                        {activeTab === 'failed' && (
                            <button
                                onClick={clearFailed}
                                style={{
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    background: '#374151',
                                    color: '#f9fafb',
                                    border: '1px solid #4b5563',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#4b5563';
                                    e.currentTarget.style.borderColor = '#6b7280';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = '#374151';
                                    e.currentTarget.style.borderColor = '#4b5563';
                                }}
                            >
                                <Trash2 size={12} />
                                Clear Failed
                            </button>
                        )}
                    </div>
                </div>
            )}
            
            {/* Settings Modal */}
            {showSettings && (
                <div style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '400px',
                    background: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                    zIndex: 1002,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    {/* Settings Header */}
                    <div style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid #374151',
                        background: '#111827',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Settings size={20} color="#60a5fa" />
                            <h3 style={{ margin: 0, color: '#f9fafb', fontSize: '16px', fontWeight: '600' }}>
                                Download Settings
                            </h3>
                        </div>
                        <button
                            onClick={() => setShowSettings(false)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#9ca3af',
                                cursor: 'pointer',
                                padding: '6px',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#f9fafb';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = '#9ca3af';
                            }}
                            title="Close"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    
                    {/* Settings Content */}
                    <div style={{
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        <div>
                            <label style={{
                                display: 'block',
                                color: '#f9fafb',
                                fontSize: '14px',
                                fontWeight: '500',
                                marginBottom: '8px'
                            }}>
                                Max Concurrent Downloads
                            </label>
                            <select
                                value={maxConcurrentDownloads}
                                onChange={(e) => {
                                    const newMax = parseInt(e.target.value);
                                    updateMaxConcurrentDownloads(newMax);
                                }}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    background: '#374151',
                                    border: '1px solid #4b5563',
                                    borderRadius: '6px',
                                    color: '#f9fafb',
                                    fontSize: '14px'
                                }}
                            >
                                <option value={1}>1</option>
                                <option value={2}>2</option>
                                <option value={3}>3</option>
                                <option value={4}>4</option>
                                <option value={5}>5</option>
                            </select>
                            <div style={{
                                fontSize: '12px',
                                color: '#9ca3af',
                                marginTop: '4px'
                            }}>
                                Higher values may impact system performance
                            </div>
                        </div>
                        
                        <div style={{
                            padding: '12px',
                            background: '#111827',
                            borderRadius: '6px',
                            border: '1px solid #374151'
                        }}>
                            <div style={{
                                fontSize: '12px',
                                color: '#9ca3af',
                                marginBottom: '8px'
                            }}>
                                Queue Statistics
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '8px',
                                fontSize: '12px'
                            }}>
                                <div style={{ color: '#9ca3af' }}>Active: {stats.activeDownloads}</div>
                                <div style={{ color: '#9ca3af' }}>Queued: {stats.queuedDownloads}</div>
                                <div style={{ color: '#10b981' }}>Completed: {stats.completedDownloads}</div>
                                <div style={{ color: '#ef4444' }}>Failed: {stats.failedDownloads}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

DownloadManager.displayName = 'DownloadManager';

// Simple Download Item Component
interface SimpleDownloadItemProps {
    download: DownloadTask;
    onCancel: (id: string) => void;
    onRetry: (id: string) => void;
    formatFileSize: (bytes: number) => string;
}

const SimpleDownloadItem: React.FC<SimpleDownloadItemProps> = ({
    download,
    onCancel,
    onRetry,
    formatFileSize
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
            case 'converting': return <Music size={16} color="#8b5cf6" />;
            case 'metadata': return <Music size={16} color="#f59e0b" />;
            case 'analyzing': return <Music size={16} color="#06b6d4" />;
            case 'queued': return <Clock size={16} color="#6b7280" />;
            default: return <AlertCircle size={16} color="#6b7280" />;
        }
    };
    
    return (
        <div style={{
            padding: '12px',
            marginBottom: '8px',
            background: '#374151',
            border: '1px solid #4b5563',
            borderRadius: '8px'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '8px'
            }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '6px',
                    background: '#1f2937',
                    border: '1px solid #4b5563',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9ca3af'
                }}>
                    <Music size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        color: '#f9fafb',
                        fontSize: '14px',
                        fontWeight: '600',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginBottom: '2px'
                    }}>
                        {download.title}
                    </div>
                    <div style={{
                        color: '#9ca3af',
                        fontSize: '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}>
                        {download.artist}
                    </div>
                </div>
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
            </div>
            
            {/* Progress Bar */}
            {download.status !== 'completed' && download.status !== 'cancelled' && (
                <div style={{
                    width: '100%',
                    marginBottom: '8px'
                }}>
                    <div style={{
                        width: '100%',
                        height: '6px',
                        background: '#1f2937',
                        borderRadius: '3px',
                        overflow: 'hidden',
                        marginBottom: '4px'
                    }}>
                        <div style={{
                            width: `${Math.min(download.progress, 100)}%`,
                            height: '100%',
                            background: getStatusColor(download.status),
                            transition: 'width 0.2s ease-out'
                        }} />
                    </div>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: '#9ca3af'
                    }}>
                        <span>{download.message}</span>
                        <span>{download.progress.toFixed(1)}%</span>
                    </div>
                </div>
            )}
            
            {/* Error Message */}
            {download.error && (
                <div style={{
                    fontSize: '12px',
                    color: '#fca5a5',
                    marginBottom: '8px',
                    padding: '6px 8px',
                    background: '#7f1d1d',
                    borderRadius: '4px',
                    border: '1px solid #991b1b'
                }}>
                    {download.error}
                </div>
            )}
            
            {/* Action Buttons */}
            <div style={{
                display: 'flex',
                gap: '6px',
                justifyContent: 'flex-end'
            }}>
                {download.canCancel && (
                    <button
                        onClick={() => onCancel(download.id)}
                        style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            background: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#ef4444';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#dc2626';
                        }}
                    >
                        <Square size={12} />
                        Cancel
                    </button>
                )}
                {download.canRetry && (
                    <button
                        onClick={() => onRetry(download.id)}
                        style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            background: '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#3b82f6';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#2563eb';
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
