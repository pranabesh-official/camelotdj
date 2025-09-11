import React, { useState, useCallback, useEffect, useRef } from 'react';
import { DatabaseService } from '../services/DatabaseService';

interface AIAgentProps {
    databaseService: DatabaseService | null;
    downloadPath: string;
    isDownloadPathSet: boolean;
    onPlaylistCreated?: (playlist: any) => void;
}

interface AITask {
    task_id: string;
    status: string;
    progress: number;
    description: string;
    created_at: string;
    updated_at: string;
    result?: any;
    error?: string;
    data?: any;
}

const AIAgent: React.FC<AIAgentProps> = ({
    databaseService,
    downloadPath,
    isDownloadPathSet,
    onPlaylistCreated
}) => {
    const [isCreating, setIsCreating] = useState(false);
    const [userRequest, setUserRequest] = useState('');
    const [genre, setGenre] = useState('electronic');
    const [bpmMin, setBpmMin] = useState(120);
    const [bpmMax, setBpmMax] = useState(130);
    const [targetCount, setTargetCount] = useState(10);
    const [currentTask, setCurrentTask] = useState<AITask | null>(null);
    const [activeSessions, setActiveSessions] = useState<AITask[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Load active sessions on component mount
    useEffect(() => {
        loadActiveSessions();
    }, []);

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
            }
        };
    }, []);

    const loadActiveSessions = useCallback(async () => {
        if (!databaseService) return;
        
        try {
            const sessions = await databaseService.getActiveAISessions();
            setActiveSessions(sessions || []);
        } catch (error) {
            console.error('Error loading active sessions:', error);
            setActiveSessions([]);
        }
    }, [databaseService]);

    const startProgressTracking = useCallback((taskId: string) => {
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
        }
        
        progressIntervalRef.current = setInterval(async () => {
            if (!databaseService) return;
            
            try {
                const progress = await databaseService.getAITaskStatus(taskId);
                if (progress && !progress.error) {
                    setCurrentTask(progress);
                    
                    // Check if task is completed
                    if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'cancelled') {
                        if (progressIntervalRef.current) {
                            clearInterval(progressIntervalRef.current);
                            progressIntervalRef.current = null;
                        }
                        
                        setIsCreating(false);
                        
                        // Reload active sessions
                        loadActiveSessions();
                        
                        // Notify parent if playlist was created
                        if (progress.status === 'completed' && progress.result && onPlaylistCreated) {
                            onPlaylistCreated(progress.result);
                        }
                    }
                } else if (progress && progress.error) {
                    console.error('Task error:', progress.error);
                    setError(progress.error);
                    setIsCreating(false);
                    if (progressIntervalRef.current) {
                        clearInterval(progressIntervalRef.current);
                        progressIntervalRef.current = null;
                    }
                }
            } catch (error) {
                console.error('Error tracking progress:', error);
                setError('Failed to track task progress');
                setIsCreating(false);
                if (progressIntervalRef.current) {
                    clearInterval(progressIntervalRef.current);
                    progressIntervalRef.current = null;
                }
            }
        }, 2000); // Check every 2 seconds
    }, [databaseService, loadActiveSessions, onPlaylistCreated]);

    const handleCreatePlaylist = useCallback(async () => {
        if (!databaseService || !isDownloadPathSet) {
            setError('Please set a download path in Settings first.');
            return;
        }

        if (!userRequest.trim()) {
            setError('Please enter a playlist request.');
            return;
        }

        // Validate BPM range
        if (bpmMin >= bpmMax) {
            setError('BPM Min must be less than BPM Max.');
            return;
        }

        // Validate target count
        if (targetCount < 1 || targetCount > 50) {
            setError('Target count must be between 1 and 50.');
            return;
        }

        setIsCreating(true);
        setError(null);

        try {
            const result = await databaseService.createAIPlaylist({
                user_request: userRequest.trim(),
                genre: genre,
                bpm_min: bpmMin,
                bpm_max: bpmMax,
                target_count: targetCount,
                download_path: downloadPath
            });

            if (result && result.status === 'success' && result.task_id) {
                setCurrentTask({
                    task_id: result.task_id,
                    status: 'in_progress',
                    progress: 0,
                    description: `Creating ${genre} playlist: ${userRequest}`,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

                // Start progress tracking
                startProgressTracking(result.task_id);
            } else {
                throw new Error(result?.error || 'Failed to start AI playlist creation');
            }
        } catch (error: any) {
            console.error('Error creating AI playlist:', error);
            setError(error.message || 'Failed to create AI playlist');
            setIsCreating(false);
        }
    }, [databaseService, isDownloadPathSet, userRequest, genre, bpmMin, bpmMax, targetCount, downloadPath, startProgressTracking]);

    const handlePauseTask = useCallback(async (taskId: string) => {
        if (!databaseService) return;
        
        try {
            await databaseService.pauseAITask(taskId);
            loadActiveSessions();
        } catch (error: any) {
            console.error('Error pausing task:', error);
            setError(error.message || 'Failed to pause task');
        }
    }, [databaseService, loadActiveSessions]);

    const handleResumeTask = useCallback(async (taskId: string) => {
        if (!databaseService) return;
        
        try {
            await databaseService.resumeAITask(taskId);
            loadActiveSessions();
        } catch (error: any) {
            console.error('Error resuming task:', error);
            setError(error.message || 'Failed to resume task');
        }
    }, [databaseService, loadActiveSessions]);

    const handleCancelTask = useCallback(async (taskId: string) => {
        if (!databaseService) return;
        
        try {
            await databaseService.cancelAITask(taskId);
            loadActiveSessions();
            
            if (currentTask && currentTask.task_id === taskId) {
                setCurrentTask(null);
                setIsCreating(false);
            }
        } catch (error: any) {
            console.error('Error cancelling task:', error);
            setError(error.message || 'Failed to cancel task');
        }
    }, [databaseService, loadActiveSessions, currentTask]);

    const getStatusColor = (status: string | undefined) => {
        if (!status) return '#6b7280';
        switch (status) {
            case 'completed': return '#10b981';
            case 'in_progress': return '#3b82f6';
            case 'paused': return '#f59e0b';
            case 'failed': return '#ef4444';
            case 'cancelled': return '#6b7280';
            default: return '#6b7280';
        }
    };

    const getStatusIcon = (status: string | undefined) => {
        if (!status) {
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10"/>
                </svg>
            );
        }
        switch (status) {
            case 'completed':
                return (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                );
            case 'in_progress':
                return (
                    <div className="animate-spin">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                    </div>
                );
            case 'paused':
                return (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                );
            case 'failed':
                return (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                );
            default:
                return (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="12" r="10"/>
                    </svg>
                );
        }
    };

    return (
        <div className="ai-agent-container" style={{ padding: 'var(--space-lg)' }}>
            <div style={{ marginBottom: 'var(--space-xl)' }}>
                <h2 style={{ 
                    color: 'var(--text-primary)', 
                    marginBottom: 'var(--space-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)'
                }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    AI Playlist Agent
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>
                    Create intelligent playlists with AI-powered song selection, harmonic mixing, and automatic validation.
                </p>
            </div>

            {/* Main Creation Form */}
            <div style={{ 
                background: 'var(--card-bg)', 
                padding: 'var(--space-lg)', 
                borderRadius: '12px', 
                border: '1px solid var(--border-color)',
                marginBottom: 'var(--space-xl)'
            }}>
                <h3 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-lg)' }}>
                    Create AI Playlist
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    {/* User Request */}
                    <div>
                        <label style={{ 
                            display: 'block', 
                            color: 'var(--text-primary)', 
                            marginBottom: 'var(--space-xs)',
                            fontWeight: '500'
                        }}>
                            Playlist Request *
                        </label>
                        <textarea
                            value={userRequest}
                            onChange={(e) => setUserRequest(e.target.value)}
                            placeholder="e.g., Create a hip-hop remix tracks trading playlist songs bpm"
                            style={{
                                width: '100%',
                                minHeight: '80px',
                                padding: 'var(--space-sm)',
                                fontSize: '14px',
                                background: 'var(--surface-bg)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                color: 'var(--text-primary)',
                                resize: 'vertical'
                            }}
                            disabled={isCreating}
                        />
                    </div>

                    {/* Genre Selection */}
                    <div>
                        <label style={{ 
                            display: 'block', 
                            color: 'var(--text-primary)', 
                            marginBottom: 'var(--space-xs)',
                            fontWeight: '500'
                        }}>
                            Genre
                        </label>
                        <select
                            value={genre}
                            onChange={(e) => setGenre(e.target.value)}
                            style={{
                                width: '100%',
                                padding: 'var(--space-sm)',
                                fontSize: '14px',
                                background: 'var(--surface-bg)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                color: 'var(--text-primary)'
                            }}
                            disabled={isCreating}
                        >
                            <option value="electronic">Electronic</option>
                            <option value="hip-hop">Hip-Hop</option>
                            <option value="house">House</option>
                            <option value="techno">Techno</option>
                            <option value="trance">Trance</option>
                            <option value="dubstep">Dubstep</option>
                            <option value="drum-and-bass">Drum & Bass</option>
                            <option value="progressive">Progressive</option>
                            <option value="ambient">Ambient</option>
                            <option value="pop">Pop</option>
                            <option value="rock">Rock</option>
                            <option value="jazz">Jazz</option>
                        </select>
                    </div>

                    {/* Advanced Options Toggle */}
                    <div>
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--brand-blue)',
                                cursor: 'pointer',
                                fontSize: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-xs)'
                            }}
                        >
                            <svg 
                                width="16" 
                                height="16" 
                                viewBox="0 0 24 24" 
                                fill="currentColor"
                                style={{ 
                                    transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s ease'
                                }}
                            >
                                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                            </svg>
                            Advanced Options
                        </button>
                    </div>

                    {/* Advanced Options */}
                    {showAdvanced && (
                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: '1fr 1fr 1fr', 
                            gap: 'var(--space-md)',
                            padding: 'var(--space-md)',
                            background: 'var(--surface-bg)',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)'
                        }}>
                            <div>
                                <label style={{ 
                                    display: 'block', 
                                    color: 'var(--text-primary)', 
                                    marginBottom: 'var(--space-xs)',
                                    fontWeight: '500',
                                    fontSize: '12px'
                                }}>
                                    BPM Min
                                </label>
                                <input
                                    type="number"
                                    value={bpmMin}
                                    onChange={(e) => setBpmMin(parseInt(e.target.value) || 120)}
                                    min="60"
                                    max="200"
                                    style={{
                                        width: '100%',
                                        padding: 'var(--space-xs)',
                                        fontSize: '14px',
                                        background: 'var(--card-bg)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '6px',
                                        color: 'var(--text-primary)'
                                    }}
                                    disabled={isCreating}
                                />
                            </div>
                            <div>
                                <label style={{ 
                                    display: 'block', 
                                    color: 'var(--text-primary)', 
                                    marginBottom: 'var(--space-xs)',
                                    fontWeight: '500',
                                    fontSize: '12px'
                                }}>
                                    BPM Max
                                </label>
                                <input
                                    type="number"
                                    value={bpmMax}
                                    onChange={(e) => setBpmMax(parseInt(e.target.value) || 130)}
                                    min="60"
                                    max="200"
                                    style={{
                                        width: '100%',
                                        padding: 'var(--space-xs)',
                                        fontSize: '14px',
                                        background: 'var(--card-bg)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '6px',
                                        color: 'var(--text-primary)'
                                    }}
                                    disabled={isCreating}
                                />
                            </div>
                            <div>
                                <label style={{ 
                                    display: 'block', 
                                    color: 'var(--text-primary)', 
                                    marginBottom: 'var(--space-xs)',
                                    fontWeight: '500',
                                    fontSize: '12px'
                                }}>
                                    Song Count
                                </label>
                                <input
                                    type="number"
                                    value={targetCount}
                                    onChange={(e) => setTargetCount(parseInt(e.target.value) || 10)}
                                    min="1"
                                    max="50"
                                    style={{
                                        width: '100%',
                                        padding: 'var(--space-xs)',
                                        fontSize: '14px',
                                        background: 'var(--card-bg)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '6px',
                                        color: 'var(--text-primary)'
                                    }}
                                    disabled={isCreating}
                                />
                            </div>
                        </div>
                    )}

                    {/* Error Display */}
                    {error && (
                        <div style={{
                            padding: 'var(--space-sm)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '8px',
                            color: 'rgb(239, 68, 68)',
                            fontSize: '14px'
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Create Button */}
                    <button
                        onClick={handleCreatePlaylist}
                        disabled={isCreating || !isDownloadPathSet || !userRequest.trim()}
                        style={{
                            padding: 'var(--space-md) var(--space-lg)',
                            fontSize: '16px',
                            fontWeight: '600',
                            background: isCreating || !isDownloadPathSet || !userRequest.trim()
                                ? 'var(--surface-bg)'
                                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: isCreating || !isDownloadPathSet || !userRequest.trim()
                                ? 'var(--text-disabled)'
                                : 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: isCreating || !isDownloadPathSet || !userRequest.trim()
                                ? 'not-allowed'
                                : 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 'var(--space-sm)',
                            minHeight: '48px'
                        }}
                    >
                        {isCreating ? (
                            <>
                                <div className="animate-spin">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                    </svg>
                                </div>
                                Creating Playlist...
                            </>
                        ) : (
                            <>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                Create AI Playlist
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Current Task Progress */}
            {currentTask && (
                <div style={{ 
                    background: 'var(--card-bg)', 
                    padding: 'var(--space-lg)', 
                    borderRadius: '12px', 
                    border: '1px solid var(--border-color)',
                    marginBottom: 'var(--space-xl)'
                }}>
                    <h3 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-md)' }}>
                        Current Task
                    </h3>
                    
                    <div style={{ marginBottom: 'var(--space-md)' }}>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 'var(--space-sm)',
                            marginBottom: 'var(--space-xs)'
                        }}>
                            {getStatusIcon(currentTask.status)}
                            <span style={{ 
                                color: getStatusColor(currentTask.status),
                                fontWeight: '500',
                                textTransform: 'capitalize'
                            }}>
                                {currentTask.status?.replace('_', ' ') || 'Unknown'}
                            </span>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                            {currentTask.description || 'No description available'}
                        </p>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginBottom: 'var(--space-md)' }}>
                        <div style={{
                            width: '100%',
                            height: '8px',
                            background: 'var(--surface-bg)',
                            borderRadius: '4px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${currentTask.progress}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #10b981, #059669)',
                                transition: 'width 0.3s ease'
                            }} />
                        </div>
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            marginTop: 'var(--space-xs)',
                            fontSize: '12px',
                            color: 'var(--text-secondary)'
                        }}>
                            <span>Progress</span>
                            <span>{currentTask.progress}%</span>
                        </div>
                    </div>

                    {/* Task Controls */}
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        {currentTask.status === 'in_progress' && (
                            <button
                                onClick={() => handlePauseTask(currentTask.task_id)}
                                style={{
                                    padding: 'var(--space-xs) var(--space-sm)',
                                    fontSize: '12px',
                                    background: 'var(--surface-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                Pause
                            </button>
                        )}
                        {currentTask.status === 'paused' && (
                            <button
                                onClick={() => handleResumeTask(currentTask.task_id)}
                                style={{
                                    padding: 'var(--space-xs) var(--space-sm)',
                                    fontSize: '12px',
                                    background: 'var(--brand-blue)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                Resume
                            </button>
                        )}
                        {(currentTask.status === 'in_progress' || currentTask.status === 'paused') && (
                            <button
                                onClick={() => handleCancelTask(currentTask.task_id)}
                                style={{
                                    padding: 'var(--space-xs) var(--space-sm)',
                                    fontSize: '12px',
                                    background: 'var(--surface-bg)',
                                    color: 'var(--error-color)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Active Sessions */}
            {activeSessions.length > 0 && (
                <div style={{ 
                    background: 'var(--card-bg)', 
                    padding: 'var(--space-lg)', 
                    borderRadius: '12px', 
                    border: '1px solid var(--border-color)'
                }}>
                    <h3 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-md)' }}>
                        Active Sessions ({activeSessions.length})
                    </h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                        {activeSessions.map((session) => (
                            <div key={session.task_id} style={{
                                padding: 'var(--space-sm)',
                                background: 'var(--surface-bg)',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: 'var(--space-xs)',
                                        marginBottom: 'var(--space-xs)'
                                    }}>
                                        {getStatusIcon(session.status)}
                                        <span style={{ 
                                            color: getStatusColor(session.status),
                                            fontWeight: '500',
                                            fontSize: '14px',
                                            textTransform: 'capitalize'
                                        }}>
                                            {session.status?.replace('_', ' ') || 'Unknown'}
                                        </span>
                                    </div>
                                    <p style={{ 
                                        color: 'var(--text-secondary)', 
                                        fontSize: '12px',
                                        margin: 0
                                    }}>
                                        {session.description || 'No description available'}
                                    </p>
                                </div>
                                
                                <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                                    {session.status === 'in_progress' && (
                                        <button
                                            onClick={() => handlePauseTask(session.task_id)}
                                            style={{
                                                padding: '4px 8px',
                                                fontSize: '11px',
                                                background: 'var(--surface-bg)',
                                                color: 'var(--text-primary)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Pause
                                        </button>
                                    )}
                                    {session.status === 'paused' && (
                                        <button
                                            onClick={() => handleResumeTask(session.task_id)}
                                            style={{
                                                padding: '4px 8px',
                                                fontSize: '11px',
                                                background: 'var(--brand-blue)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Resume
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleCancelTask(session.task_id)}
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '11px',
                                            background: 'var(--surface-bg)',
                                            color: 'var(--error-color)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* CSS for animations */}
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </div>
    );
};

export default AIAgent;
