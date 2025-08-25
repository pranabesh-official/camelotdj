import React from 'react';
import { Song } from '../App';

interface AnalysisResultsProps {
    song: Song;
    compatibleSongs: Song[];
}

const AnalysisResults: React.FC<AnalysisResultsProps> = ({ song, compatibleSongs }) => {
    const formatDuration = (seconds?: number) => {
        if (!seconds) return 'Unknown';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    const formatFileSize = (bytes?: number) => {
        if (!bytes) return 'Unknown';
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)} MB`;
    };
    
    const getEnergyDescription = (level?: number) => {
        if (!level) return 'Unknown';
        const descriptions = {
            1: 'Very Low - Ambient/Chill',
            2: 'Low - Downtempo', 
            3: 'Low-Medium - Relaxed',
            4: 'Medium-Low - Moderate',
            5: 'Medium - Balanced',
            6: 'Medium-High - Energetic',
            7: 'High - Uplifting',
            8: 'High - Driving',
            9: 'Very High - Peak Time',
            10: 'Maximum - Festival Anthem'
        };
        return descriptions[level as keyof typeof descriptions] || 'Unknown';
    };
    
    const getEnergyColor = (level?: number) => {
        if (!level) return '#666';
        const colors = {
            1: '#000080', 2: '#0000FF', 3: '#0080FF', 4: '#00FFFF', 5: '#00FF80',
            6: '#00FF00', 7: '#80FF00', 8: '#FFFF00', 9: '#FF8000', 10: '#FF0000'
        };
        return colors[level as keyof typeof colors] || '#666';
    };
    
    const getBPMCategory = (bpm?: number) => {
        if (!bpm) return 'Unknown';
        if (bpm < 90) return 'Slow (< 90 BPM)';
        if (bpm < 110) return 'Medium (90-110 BPM)';
        if (bpm < 130) return 'Upbeat (110-130 BPM)';
        if (bpm < 150) return 'Fast (130-150 BPM)';
        return 'Very Fast (> 150 BPM)';
    };
    
    const getCompatibleKeyDescriptions = (targetKey: string) => {
        if (!targetKey) return [];
        
        const targetNum = parseInt(targetKey.slice(0, -1));
        const targetLetter = targetKey.slice(-1);
        
        const descriptions = [];
        
        // Adjacent keys
        const prevNum = targetNum === 1 ? 12 : targetNum - 1;
        const nextNum = targetNum === 12 ? 1 : targetNum + 1;
        descriptions.push(`${prevNum}${targetLetter} (Down one semitone)`);
        descriptions.push(`${nextNum}${targetLetter} (Up one semitone)`);
        
        // Relative major/minor
        const relativeLetter = targetLetter === 'A' ? 'B' : 'A';
        const relativeType = targetLetter === 'A' ? 'Relative Major' : 'Relative Minor';
        descriptions.push(`${targetNum}${relativeLetter} (${relativeType})`);
        
        return descriptions;
    };
    
    return (
        <div className="analysis-results">
            <div className="results-header">
                <h3>Analysis Results</h3>
                <div className="song-title">{song.filename}</div>
            </div>
            
            <div className="results-content">
                {/* Key Information */}
                <div className="result-section">
                    <h4>🎼 Musical Key</h4>
                    <div className="key-info">
                        <div className="camelot-display">
                            <span className="camelot-key">{song.camelot_key || 'Unknown'}</span>
                            <span className="musical-key">{song.key_name || 'Unknown'}</span>
                        </div>
                        {song.camelot_key && (
                            <div className="key-explanation">
                                <small>
                                    Camelot notation for easy harmonic mixing.
                                    {song.scale === 'minor' ? ' Minor keys (A) are on the inner wheel.' : ' Major keys (B) are on the outer wheel.'}
                                </small>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* BPM Information */}
                <div className="result-section">
                    <h4>🥁 Tempo (BPM)</h4>
                    <div className="bpm-info">
                        <div className="bpm-display">
                            <span className="bpm-value">{song.bpm ? Math.round(song.bpm) : 'Unknown'}</span>
                            <span className="bpm-unit">BPM</span>
                        </div>
                        <div className="bpm-category">
                            {getBPMCategory(song.bpm)}
                        </div>
                    </div>
                </div>
                
                {/* Energy Information */}
                <div className="result-section">
                    <h4>⚡ Energy Level</h4>
                    <div className="energy-info">
                        <div className="energy-display">
                            <div 
                                className="energy-indicator large"
                                style={{ backgroundColor: getEnergyColor(song.energy_level) }}
                            >
                                {song.energy_level || '?'}
                            </div>
                            <span className="energy-scale">/10</span>
                        </div>
                        <div className="energy-description">
                            {getEnergyDescription(song.energy_level)}
                        </div>
                        <div className="energy-bar">
                            <div 
                                className="energy-fill"
                                style={{ 
                                    width: `${(song.energy_level || 0) * 10}%`,
                                    backgroundColor: getEnergyColor(song.energy_level)
                                }}
                            ></div>
                        </div>
                    </div>
                </div>
                
                {/* File Information */}
                <div className="result-section">
                    <h4>📁 File Info</h4>
                    <div className="file-info">
                        <div className="info-row">
                            <span className="info-label">Duration:</span>
                            <span className="info-value">{formatDuration(song.duration)}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">File Size:</span>
                            <span className="info-value">{formatFileSize(song.file_size)}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Format:</span>
                            <span className="info-value">{song.filename.split('.').pop() ? song.filename.split('.').pop()!.toUpperCase() : 'Unknown'}</span>
                        </div>
                    </div>
                </div>
                
                {/* Compatible Keys */}
                {song.camelot_key && (
                    <div className="result-section">
                        <h4>🔄 Harmonic Mixing</h4>
                        <div className="compatible-keys">
                            <div className="mixing-tips">
                                <h5>Compatible Keys:</h5>
                                <ul>
                                    {getCompatibleKeyDescriptions(song.camelot_key).map((desc, index) => (
                                        <li key={index}>{desc}</li>
                                    ))}
                                </ul>
                            </div>
                            
                            {compatibleSongs.length > 0 && (
                                <div className="compatible-songs">
                                    <h5>Your Compatible Songs ({compatibleSongs.length}):</h5>
                                    <div className="compatible-list">
                                        {compatibleSongs.slice(0, 5).map(compatibleSong => (
                                            <div key={compatibleSong.id} className="compatible-song">
                                                <span className="song-name">{compatibleSong.filename}</span>
                                                <span className="song-key">{compatibleSong.camelot_key}</span>
                                            </div>
                                        ))}
                                        {compatibleSongs.length > 5 && (
                                            <div className="more-songs">
                                                +{compatibleSongs.length - 5} more...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                
                {/* Analysis Timestamp */}
                {song.analysis_date && (
                    <div className="result-section analysis-date">
                        <small>
                            Analyzed: {new Date(song.analysis_date).toLocaleString()}
                        </small>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AnalysisResults;