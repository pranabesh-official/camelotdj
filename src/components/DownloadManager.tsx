import React, { forwardRef, useImperativeHandle, useState, useCallback, useEffect } from 'react';

interface YouTubeTrack {
    id: string;
    title: string;
    artist: string;
    album?: string;
    duration?: string;
    thumbnail: string;
    url: string;
}

interface DownloadItem {
    id: string;
    track: YouTubeTrack;
    status: 'pending' | 'downloading' | 'completed' | 'error';
    progress: number;
    error?: string;
}

interface DownloadManagerProps {
    apiPort: number;
    apiSigningKey: string;
    downloadPath: string;
    isDownloadPathSet: boolean;
    onDownloadComplete?: (downloadedSong: any) => void;
    maxConcurrentDownloads?: number;
}

export interface DownloadManagerRef {
    addDownload: (track: YouTubeTrack) => void;
    removeDownload: (trackId: string) => void;
    clearCompleted: () => void;
    getDownloads: () => DownloadItem[];
}

const DownloadManager = forwardRef<DownloadManagerRef, DownloadManagerProps>(({
    apiPort,
    apiSigningKey,
    downloadPath,
    isDownloadPathSet,
    onDownloadComplete,
    maxConcurrentDownloads = 3
}, ref) => {
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);
    const [activeDownloads, setActiveDownloads] = useState<Set<string>>(new Set());

    useImperativeHandle(ref, () => ({
        addDownload: (track: YouTubeTrack) => {
            // Check if already downloading or completed
            const existingDownload = downloads.find(d => d.track.id === track.id);
            if (existingDownload && (existingDownload.status === 'downloading' || existingDownload.status === 'completed')) {
                return;
            }

            const newDownload: DownloadItem = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                track,
                status: 'pending',
                progress: 0
            };

            setDownloads(prev => [...prev, newDownload]);
        },
        removeDownload: (trackId: string) => {
            setDownloads(prev => prev.filter(d => d.track.id !== trackId));
        },
        clearCompleted: () => {
            setDownloads(prev => prev.filter(d => d.status !== 'completed'));
        },
        getDownloads: () => downloads
    }));

    const processDownloads = useCallback(async () => {
        const pendingDownloads = downloads.filter(d => d.status === 'pending');
        const currentActive = activeDownloads.size;
        const availableSlots = maxConcurrentDownloads - currentActive;

        if (availableSlots <= 0 || pendingDownloads.length === 0) {
            return;
        }

        const downloadsToStart = pendingDownloads.slice(0, availableSlots);
        
        for (const download of downloadsToStart) {
            setActiveDownloads(prev => new Set([...prev, download.track.id]));
            
            setDownloads(prev => prev.map(d => 
                d.id === download.id 
                    ? { ...d, status: 'downloading' as const }
                    : d
            ));

            try {
                const response = await fetch(`http://127.0.0.1:${apiPort}/youtube/download`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Signing-Key': apiSigningKey
                    },
                    body: JSON.stringify({
                        url: download.track.url,
                        download_path: downloadPath,
                        title: download.track.title,
                        artist: download.track.artist
                    })
                });

                if (!response.ok) {
                    throw new Error(`Download failed: ${response.statusText}`);
                }

                const result = await response.json();
                
                if (result.status === 'success') {
                    setDownloads(prev => prev.map(d => 
                        d.id === download.id 
                            ? { ...d, status: 'completed' as const, progress: 100 }
                            : d
                    ));

                    // Notify parent component
                    if (onDownloadComplete) {
                        onDownloadComplete(result);
                    }
                } else {
                    throw new Error(result.error || 'Download failed');
                }
            } catch (error) {
                console.error('Download error:', error);
                setDownloads(prev => prev.map(d => 
                    d.id === download.id 
                        ? { 
                            ...d, 
                            status: 'error' as const, 
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }
                        : d
                ));
            } finally {
                setActiveDownloads(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(download.track.id);
                    return newSet;
                });
            }
        }
    }, [downloads, activeDownloads, maxConcurrentDownloads, apiPort, apiSigningKey, downloadPath, onDownloadComplete]);

    // Process downloads when state changes
    useEffect(() => {
        processDownloads();
    }, [processDownloads]);

    // Don't render anything - this is a background component
    return null;
});

DownloadManager.displayName = 'DownloadManager';

export default DownloadManager;
