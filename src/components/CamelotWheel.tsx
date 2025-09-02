import React, { useMemo } from 'react';
import { Song } from '../App';

interface CamelotWheelProps {
    songs: Song[];
    selectedSong: Song | null;
    onSongSelect: (song: Song) => void;
}

const CamelotWheel: React.FC<CamelotWheelProps> = ({ songs, selectedSong, onSongSelect }) => {
    // Camelot wheel positions (arranged in circle)
    const wheelPositions = useMemo(() => {
        const positions: { [key: string]: { x: number; y: number; angle: number } } = {};
        const centerX = 150;
        const centerY = 150;
        const outerRadius = 110; // Major keys (B)
        const innerRadius = 75; // Minor keys (A)
        
        // Generate positions for keys 1-12
        for (let i = 1; i <= 12; i++) {
            const angle = (i - 1) * 30 - 90; // Start from top, 30 degrees per position
            const radians = (angle * Math.PI) / 180;
            
            // Minor key (A) - inner circle
            positions[`${i}A`] = {
                x: centerX + innerRadius * Math.cos(radians),
                y: centerY + innerRadius * Math.sin(radians),
                angle
            };
            
            // Major key (B) - outer circle
            positions[`${i}B`] = {
                x: centerX + outerRadius * Math.cos(radians),
                y: centerY + outerRadius * Math.sin(radians),
                angle
            };
        }
        
        return positions;
    }, []);
    
    // Group songs by Camelot key
    const songsByKey = useMemo(() => {
        const grouped: { [key: string]: Song[] } = {};
        songs.forEach(song => {
            if (song.camelot_key) {
                if (!grouped[song.camelot_key]) {
                    grouped[song.camelot_key] = [];
                }
                grouped[song.camelot_key].push(song);
            }
        });
        return grouped;
    }, [songs]);
    
    // Get compatible keys for the selected song
    const getCompatibleKeys = (targetKey: string): string[] => {
        if (!targetKey) return [];
        
        const targetNum = parseInt(targetKey.slice(0, -1));
        const targetLetter = targetKey.slice(-1);
        
        const compatible = [targetKey]; // Same key
        
        // Adjacent keys
        const prevNum = targetNum === 1 ? 12 : targetNum - 1;
        const nextNum = targetNum === 12 ? 1 : targetNum + 1;
        compatible.push(`${prevNum}${targetLetter}`);
        compatible.push(`${nextNum}${targetLetter}`);
        
        // Relative major/minor
        const relativeLetter = targetLetter === 'A' ? 'B' : 'A';
        compatible.push(`${targetNum}${relativeLetter}`);
        
        return compatible;
    };
    
    const compatibleKeys = selectedSong && selectedSong.camelot_key ? getCompatibleKeys(selectedSong.camelot_key) : [];
    
    const getKeyColor = (key: string): string => {
        if (!selectedSong || !selectedSong.camelot_key) {
            return songsByKey[key] ? '#4CAF50' : '#E0E0E0';
        }
        
        if (key === selectedSong.camelot_key) {
            return '#FF5722'; // Selected key - orange
        }
        
        if (compatibleKeys.includes(key)) {
            return '#2196F3'; // Compatible keys - blue
        }
        
        return songsByKey[key] ? '#9E9E9E' : '#E0E0E0'; // Other keys with songs - gray
    };
    
    const handleKeyClick = (key: string) => {
        const songsInKey = songsByKey[key];
        if (songsInKey && songsInKey.length > 0) {
            // If multiple songs, select the first one or show a selection
            onSongSelect(songsInKey[0]);
        }
    };
    
    return (
        <div className="camelot-wheel-container">
           
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px', textAlign: 'center' }}>
                Harmonic Mixing Guide
            </p>
            
            <div className="wheel-svg-container">
                <svg width="200" height="200" viewBox="0 0 200 200">
                    {/* Background circles */}
                    <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />
                    <circle cx="100" cy="100" r="65" fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />
                    <circle cx="100" cy="100" r="40" fill="none" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" />
                    
                    {/* Radial lines for visual appeal */}
                    {Array.from({ length: 12 }, (_, i) => {
                        const angle = (i * 30 - 90) * Math.PI / 180;
                        const x1 = 100 + 35 * Math.cos(angle);
                        const y1 = 100 + 35 * Math.sin(angle);
                        const x2 = 100 + 95 * Math.cos(angle);
                        const y2 = 100 + 95 * Math.sin(angle);
                        
                        return (
                            <line 
                                key={i}
                                x1={x1} y1={y1} x2={x2} y2={y2}
                                stroke="rgba(255, 255, 255, 0.08)" 
                                strokeWidth="1"
                            />
                        );
                    })}
                    
                    {/* Key positions with color coding */}
                    {Object.entries(wheelPositions).map(([key, position]) => {
                        const isMinor = key.endsWith('A');
                        const hasSongs = songsByKey[key] && songsByKey[key].length > 0;
                        const songCount = songsByKey[key] && songsByKey[key].length || 0;
                        const keyNumber = parseInt(key.slice(0, -1));
                        
                        const keyColors = {
                            '1A': 'var(--camelot-1a)', '1B': 'var(--camelot-1b)',
                            '2A': 'var(--camelot-2a)', '2B': 'var(--camelot-2b)',
                            '3A': 'var(--camelot-3a)', '3B': 'var(--camelot-3b)',
                            '4A': 'var(--camelot-4a)', '4B': 'var(--camelot-4b)',
                            '5A': 'var(--camelot-5a)', '5B': 'var(--camelot-5b)',
                            '6A': 'var(--camelot-6a)', '6B': 'var(--camelot-6b)',
                            '7A': 'var(--camelot-7a)', '7B': 'var(--camelot-7b)',
                            '8A': 'var(--camelot-8a)', '8B': 'var(--camelot-8b)',
                            '9A': 'var(--camelot-9a)', '9B': 'var(--camelot-9b)',
                            '10A': 'var(--camelot-10a)', '10B': 'var(--camelot-10b)',
                            '11A': 'var(--camelot-11a)', '11B': 'var(--camelot-11b)',
                            '12A': 'var(--camelot-12a)', '12B': 'var(--camelot-12b)'
                        };
                        
                        // Determine key color based on selection and compatibility
                        let keyFillColor;
                        let keyStrokeColor = 'rgba(0, 0, 0, 0.2)';
                        let keyStrokeWidth = 1;
                        let keyOpacity = 1;
                        
                        if (selectedSong && selectedSong.camelot_key) {
                            if (key === selectedSong.camelot_key) {
                                // Selected key - bright highlight
                                keyFillColor = '#FF5722'; // Bright orange
                                keyStrokeColor = '#ffffff';
                                keyStrokeWidth = 3;
                            } else if (compatibleKeys.includes(key)) {
                                // Compatible keys - blue highlight
                                keyFillColor = '#2196F3'; // Bright blue
                                keyStrokeColor = '#ffffff';
                                keyStrokeWidth = 2;
                            } else if (hasSongs) {
                                // Other keys with songs - dimmed
                                keyFillColor = keyColors[key as keyof typeof keyColors] || '#666';
                                keyOpacity = 0.4;
                            } else {
                                // Empty keys - very dimmed
                                keyFillColor = 'rgba(255, 255, 255, 0.05)';
                                keyOpacity = 0.3;
                            }
                        } else {
                            // No selection - show normal colors
                            keyFillColor = hasSongs ? (keyColors[key as keyof typeof keyColors] || '#666') : 'rgba(255, 255, 255, 0.1)';
                        }
                        
                        const adjustedPosition = {
                            x: 100 + (isMinor ? 52 : 77) * Math.cos((keyNumber - 1) * 30 * Math.PI / 180 - Math.PI / 2),
                            y: 100 + (isMinor ? 52 : 77) * Math.sin((keyNumber - 1) * 30 * Math.PI / 180 - Math.PI / 2)
                        };
                        
                        return (
                            <g key={key}>
                                {/* Key circle */}
                                <circle
                                    cx={adjustedPosition.x}
                                    cy={adjustedPosition.y}
                                    r={isMinor ? 12 : 15}
                                    fill={keyFillColor}
                                    stroke={keyStrokeColor}
                                    strokeWidth={keyStrokeWidth}
                                    opacity={keyOpacity}
                                    className={hasSongs ? 'key-clickable' : 'key-empty'}
                                    onClick={() => handleKeyClick(key)}
                                    style={{ 
                                        cursor: hasSongs ? 'pointer' : 'default',
                                        filter: selectedSong && selectedSong.camelot_key === key ? 'brightness(1.1) drop-shadow(0 0 8px rgba(255, 87, 34, 0.8))' : 
                                               selectedSong && compatibleKeys.includes(key) ? 'brightness(1.1) drop-shadow(0 0 6px rgba(33, 150, 243, 0.6))' : 'none',
                                        transition: 'all 0.3s ease'
                                    }}
                                />
                                
                                {/* Key label */}
                                <text
                                    x={adjustedPosition.x}
                                    y={adjustedPosition.y + 3}
                                    textAnchor="middle"
                                    fontSize={isMinor ? "9" : "10"}
                                    fontWeight="600"
                                    fill={selectedSong && selectedSong.camelot_key === key ? "white" : 
                                         selectedSong && compatibleKeys.includes(key) ? "white" :
                                         hasSongs ? "white" : "rgba(255, 255, 255, 0.4)"}
                                    pointerEvents="none"
                                    style={{ 
                                        textShadow: selectedSong && (selectedSong.camelot_key === key || compatibleKeys.includes(key)) ? '0 1px 3px rgba(0, 0, 0, 0.9)' : '0 1px 2px rgba(0, 0, 0, 0.8)',
                                        transition: 'all 0.3s ease'
                                    }}
                                >
                                    {key}
                                </text>
                                
                                {/* Song count indicator */}
                                {songCount > 1 && (
                                    <circle
                                        cx={adjustedPosition.x + (isMinor ? 8 : 10)}
                                        cy={adjustedPosition.y - (isMinor ? 8 : 10)}
                                        r="5"
                                        fill="var(--accent-yellow)"
                                        stroke="white"
                                        strokeWidth="1"
                                    />
                                )}
                                {songCount > 1 && (
                                    <text
                                        x={adjustedPosition.x + (isMinor ? 8 : 10)}
                                        y={adjustedPosition.y - (isMinor ? 8 : 10) + 2}
                                        textAnchor="middle"
                                        fontSize="7"
                                        fontWeight="bold"
                                        fill="black"
                                        pointerEvents="none"
                                    >
                                        {songCount > 9 ? '9+' : songCount}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>
            
          
            
            {/* Instructions when no track is selected */}
            {!selectedSong && (
                <div className="wheel-info" style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                    <p>Select a track to see harmonic mixing recommendations</p>
                </div>
            )}
        </div>
    );
};

export default CamelotWheel;