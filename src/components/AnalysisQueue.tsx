import React from 'react';
import { Song } from '../App';

// Professional SVG icons
const PendingIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12,6 12,12 16,14"/>
  </svg>
);

const AnalyzingIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="analyzing-icon">
    <path d="M21 12a9 9 0 11-6.219-8.56"/>
  </svg>
);

const CompletedIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20,6 9,17 4,12"/>
  </svg>
);

const ErrorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  </svg>
);

const CancelIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export interface QueuedFile {
    id: string;
    file: File;
    status: 'pending' | 'analyzing' | 'completed' | 'error';
    progress?: number;
    result?: Song;
    error?: string;
    startTime?: Date;
    endTime?: Date;
}

interface AnalysisQueueProps {
    queue: QueuedFile[];
    isProcessing: boolean;
    onCancel: (fileId: string) => void;
    onClearCompleted: () => void;
    onClearAll: () => void;
    onPause: () => void;
    onResume: () => void;
    isPaused: boolean;
    duplicateInfo?: string;
}

const AnalysisQueue: React.FC<AnalysisQueueProps> = ({
    queue,
    isProcessing,
    onCancel,
    onClearCompleted,
    onClearAll,
    onPause,
    onResume,
    isPaused,
    duplicateInfo
}) => {
    const pendingCount = queue.filter(item => item.status === 'pending').length;
    const analyzingCount = queue.filter(item => item.status === 'analyzing').length;
    const completedCount = queue.filter(item => item.status === 'completed').length;
    const errorCount = queue.filter(item => item.status === 'error').length;

    const formatFileSize = (bytes: number) => {
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)} MB`;
    };

    const getStatusIcon = (status: QueuedFile['status']) => {
        switch (status) {
            case 'pending': return <PendingIcon />;
            case 'analyzing': return <AnalyzingIcon />;
            case 'completed': return <CompletedIcon />;
            case 'error': return <ErrorIcon />;
            default: return <PendingIcon />;
        }
    };

    const getStatusColor = (status: QueuedFile['status']) => {
        switch (status) {
            case 'pending': return '#666';
            case 'analyzing': return '#007bff';
            case 'completed': return '#28a745';
            case 'error': return '#dc3545';
            default: return '#666';
        }
    };

    if (queue.length === 0) {
        return null;
    }

    return (
        <div className="analysis-queue">
            <div className="queue-header">
                <h3>Analysis Queue</h3>
                <div className="queue-stats">
                    <span className="stat pending">
                        <PendingIcon />
                        {pendingCount}
                    </span>
                    <span className="stat analyzing">
                        <AnalyzingIcon />
                        {analyzingCount}
                    </span>
                    <span className="stat completed">
                        <CompletedIcon />
                        {completedCount}
                    </span>
                    {errorCount > 0 && (
                        <span className="stat error">
                            <ErrorIcon />
                            {errorCount}
                        </span>
                    )}
                </div>
            </div>

            {duplicateInfo && (
                <div className="duplicate-info">
                    <small>{duplicateInfo}</small>
                </div>
            )}

            <div className="queue-controls">
                {isProcessing && (
                    <button 
                        onClick={isPaused ? onResume : onPause}
                        className={`control-btn ${isPaused ? 'resume' : 'pause'}`}
                    >
                        {isPaused ? '▶️ Resume' : '⏸️ Pause'}
                    </button>
                )}
                {completedCount > 0 && (
                    <button onClick={onClearCompleted} className="control-btn clear-completed">
                        🗑️ Clear Completed
                    </button>
                )}
                <button onClick={onClearAll} className="control-btn clear-all">
                    🗑️ Clear All
                </button>
            </div>

            <div className="queue-list">
                {queue.map((item) => (
                    <div key={item.id} className={`queue-item ${item.status}`}>
                        <div className="item-header">
                            <div className="item-info">
                                <span className="status-icon" style={{ color: getStatusColor(item.status) }}>
                                    {getStatusIcon(item.status)}
                                </span>
                                <span className="filename">{item.file.name}</span>
                                <span className="file-size">({formatFileSize(item.file.size)})</span>
                            </div>
                            {item.status === 'pending' && (
                                <button 
                                    onClick={() => onCancel(item.id)}
                                    className="cancel-btn"
                                    title="Remove from queue"
                                >
                                    <CancelIcon />
                                </button>
                            )}
                        </div>

                        {item.status === 'analyzing' && (
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${item.progress || 0}%` }}></div>
                            </div>
                        )}

                        {item.status === 'error' && item.error && (
                            <div className="error-message">
                                <small>Error: {item.error}</small>
                            </div>
                        )}

                        {item.status === 'completed' && item.result && (
                            <div className="result-summary">
                                <small>
                                    Key: {item.result.camelot_key || 'Unknown'} | 
                                    BPM: {item.result.bpm ? Math.round(item.result.bpm) : 'Unknown'} | 
                                    Energy: {item.result.energy_level || 'Unknown'}/10
                                </small>
                            </div>
                        )}

                        {item.startTime && (
                            <div className="timing-info">
                                <small>
                                    Started: {item.startTime.toLocaleTimeString()}
                                    {item.endTime && ` | Duration: ${Math.round((item.endTime.getTime() - item.startTime.getTime()) / 1000)}s`}
                                </small>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AnalysisQueue;
