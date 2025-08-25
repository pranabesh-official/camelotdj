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
        const centerX = 200;
        const centerY = 200;
        const outerRadius = 150; // Major keys (B)
        const innerRadius = 100; // Minor keys (A)
        
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
            <div className="wheel-header">
                <h2>Camelot Wheel</h2>
                <p>Visualize harmonic relationships between your songs</p>
                {selectedSong && (
                    <div className="selected-info">
                        <strong>Selected:</strong> {selectedSong.filename} ({selectedSong.camelot_key})
                        <br />
                        <span className="compatible-info">
                            Blue keys are harmonically compatible
                        </span>
                    </div>
                )}
            </div>
            
            <div className="wheel-svg-container">
                <svg width="400" height="400" viewBox="0 0 400 400">
                    {/* Background circles */}
                    <circle cx="200" cy="200" r="160" fill="none" stroke="#E0E0E0" strokeWidth="2" />
                    <circle cx="200" cy="200" r="110" fill="none" stroke="#E0E0E0" strokeWidth="2" />
                    
                    {/* Radial lines */}
                    {Array.from({ length: 12 }, (_, i) => {
                        const angle = (i * 30 - 90) * Math.PI / 180;
                        const x1 = 200 + 60 * Math.cos(angle);
                        const y1 = 200 + 60 * Math.sin(angle);
                        const x2 = 200 + 170 * Math.cos(angle);
                        const y2 = 200 + 170 * Math.sin(angle);
                        
                        return (
                            <line 
                                key={i}
                                x1={x1} y1={y1} x2={x2} y2={y2}
                                stroke="#E0E0E0" 
                                strokeWidth="1"
                            />
                        );
                    })}
                    
                    {/* Key positions */}
                    {Object.entries(wheelPositions).map(([key, position]) => {
                        const isMinor = key.endsWith('A');
                        const hasSongs = songsByKey[key] && songsByKey[key].length > 0;
                        const songCount = songsByKey[key] && songsByKey[key].length || 0;
                        
                        return (
                            <g key={key}>
                                {/* Key circle */}
                                <circle
                                    cx={position.x}
                                    cy={position.y}
                                    r={isMinor ? 20 : 25}
                                    fill={getKeyColor(key)}
                                    stroke={selectedSong && selectedSong.camelot_key === key ? '#000' : '#666'}
                                    strokeWidth={selectedSong && selectedSong.camelot_key === key ? 3 : 1}
                                    className={hasSongs ? 'key-clickable' : 'key-empty'}
                                    onClick={() => handleKeyClick(key)}
                                    style={{ cursor: hasSongs ? 'pointer' : 'default' }}
                                />
                                
                                {/* Key label */}
                                <text
                                    x={position.x}
                                    y={position.y + 5}
                                    textAnchor="middle"
                                    fontSize={isMinor ? "12" : "14"}
                                    fontWeight="bold"
                                    fill={selectedSong && selectedSong.camelot_key === key ? "white" : "white"}
                                    pointerEvents="none"
                                >
                                    {key}
                                </text>
                                
                                {/* Song count indicator */}
                                {songCount > 1 && (
                                    <text
                                        x={position.x + (isMinor ? 15 : 18)}
                                        y={position.y - (isMinor ? 15 : 18)}
                                        textAnchor="middle"
                                        fontSize="10"
                                        fontWeight="bold"
                                        fill="#FF5722"
                                        pointerEvents="none"
                                    >
                                        {songCount}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                    
                    {/* Center labels */}
                    <text x="200" y="190" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#666">
                        Camelot Wheel
                    </text>
                    <text x="200" y="210" textAnchor="middle" fontSize="12" fill="#999">
                        Harmonic Mixing
                    </text>
                </svg>
            </div>
            
            <div className="wheel-legend">
                <div className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: '#E0E0E0' }}></div>
                    <span>Empty keys</span>
                </div>
                <div className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: '#4CAF50' }}></div>
                    <span>Keys with songs</span>
                </div>
                {selectedSong && (
                    <>
                        <div className="legend-item">
                            <div className="legend-color" style={{ backgroundColor: '#FF5722' }}></div>
                            <span>Selected song key</span>
                        </div>
                        <div className="legend-item">
                            <div className="legend-color" style={{ backgroundColor: '#2196F3' }}></div>
                            <span>Compatible keys</span>
                        </div>
                    </>
                )}
            </div>
            
            <div className="wheel-instructions">
                <h3>How to Use:</h3>
                <ul>
                    <li>Click on colored circles to select songs in that key</li>
                    <li>Adjacent numbers (e.g., 8A → 7A or 9A) mix well</li>
                    <li>Same number, different letter (e.g., 8A → 8B) are relative major/minor</li>
                    <li>Numbers with multiple songs show a count indicator</li>
                </ul>
            </div>
        </div>
    );
};

export default CamelotWheel;