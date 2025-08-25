import React, { useState, useMemo } from 'react';
import { Song } from '../App';

interface MusicLibraryProps {
    songs: Song[];
    selectedSong: Song | null;
    onSongSelect: (song: Song) => void;
    onDeleteSong: (songId: string) => void;
    getCompatibleSongs: (targetKey: string) => Song[];
}

type SortField = 'filename' | 'camelot_key' | 'bpm' | 'energy_level' | 'duration';
type SortDirection = 'asc' | 'desc';

const MusicLibrary: React.FC<MusicLibraryProps> = ({ 
    songs, 
    selectedSong, 
    onSongSelect, 
    onDeleteSong,
    getCompatibleSongs 
}) => {
    const [sortField, setSortField] = useState<SortField>('filename');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [filterKey, setFilterKey] = useState<string>('');
    const [filterEnergy, setFilterEnergy] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState<string>('');
    
    const sortedAndFilteredSongs = useMemo(() => {
        let filtered = songs;
        
        // Apply search filter
        if (searchTerm) {
            filtered = filtered.filter(song => 
                song.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (song.key_name && song.key_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (song.camelot_key && song.camelot_key.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }
        
        // Apply key filter
        if (filterKey) {
            if (filterKey === 'compatible' && selectedSong && selectedSong.camelot_key) {
                const compatible = getCompatibleSongs(selectedSong.camelot_key);
                filtered = filtered.filter(song => 
                    compatible.some(comp => comp.id === song.id)
                );
            } else {
                filtered = filtered.filter(song => song.camelot_key === filterKey);
            }
        }
        
        // Apply energy filter
        if (filterEnergy) {
            const energyNum = parseInt(filterEnergy);
            filtered = filtered.filter(song => song.energy_level === energyNum);
        }
        
        // Sort
        return filtered.sort((a, b) => {
            let aValue: any = a[sortField];
            let bValue: any = b[sortField];
            
            // Handle undefined values
            if (aValue === undefined) aValue = '';
            if (bValue === undefined) bValue = '';
            
            // Convert to numbers if numeric fields
            if (sortField === 'bpm' || sortField === 'energy_level' || sortField === 'duration') {
                aValue = Number(aValue) || 0;
                bValue = Number(bValue) || 0;
            }
            
            if (sortDirection === 'asc') {
                return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            } else {
                return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
            }
        });
    }, [songs, sortField, sortDirection, filterKey, filterEnergy, searchTerm, selectedSong, getCompatibleSongs]);
    
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };
    
    const formatDuration = (seconds?: number) => {
        if (!seconds) return '--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    const formatFileSize = (bytes?: number) => {
        if (!bytes) return '--';
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)} MB`;
    };
    
    const getEnergyColor = (level?: number) => {
        if (!level) return '#666';
        const colors = {
            1: '#000080', 2: '#0000FF', 3: '#0080FF', 4: '#00FFFF', 5: '#00FF80',
            6: '#00FF00', 7: '#80FF00', 8: '#FFFF00', 9: '#FF8000', 10: '#FF0000'
        };
        return colors[level as keyof typeof colors] || '#666';
    };
    
    // Get unique keys for filter dropdown
    const uniqueKeys = useMemo(() => {
        const keys = songs
            .map(song => song.camelot_key)
            .filter((key, index, arr) => key && arr.indexOf(key) === index)
            .sort();
        return keys;
    }, [songs]);
    
    return (
        <div className="music-library">
            <div className="library-header">
                <h2>Music Library</h2>
                <div className="library-stats">
                    <span>{songs.length} songs</span>
                    {selectedSong && (
                        <span>• {getCompatibleSongs(selectedSong.camelot_key || '').length} compatible with selected</span>
                    )}
                </div>
            </div>
            
            <div className="library-controls">
                <div className="search-box">
                    <input 
                        type="text"
                        placeholder="Search songs, keys..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="filters">
                    <select 
                        value={filterKey}
                        onChange={(e) => setFilterKey(e.target.value)}
                    >
                        <option value="">All Keys</option>
                        {selectedSong && selectedSong.camelot_key && (
                            <option value="compatible">Compatible with {selectedSong.camelot_key}</option>
                        )}
                        {uniqueKeys.map(key => (
                            <option key={key} value={key}>{key}</option>
                        ))}
                    </select>
                    
                    <select 
                        value={filterEnergy}
                        onChange={(e) => setFilterEnergy(e.target.value)}
                    >
                        <option value="">All Energy Levels</option>
                        {[1,2,3,4,5,6,7,8,9,10].map(level => (
                            <option key={level} value={level}>Energy {level}</option>
                        ))}
                    </select>
                </div>
            </div>
            
            {sortedAndFilteredSongs.length === 0 ? (
                <div className="empty-library">
                    {songs.length === 0 ? (
                        <div>
                            <h3>No songs in your library yet</h3>
                            <p>Upload some music files to get started!</p>
                        </div>
                    ) : (
                        <div>
                            <h3>No songs match your filters</h3>
                            <p>Try adjusting your search or filter criteria.</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="songs-table">
                    <div className="table-header">
                        <div className="header-cell" onClick={() => handleSort('filename')}>
                            Filename {sortField === 'filename' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                        <div className="header-cell" onClick={() => handleSort('camelot_key')}>
                            Key {sortField === 'camelot_key' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                        <div className="header-cell" onClick={() => handleSort('bpm')}>
                            BPM {sortField === 'bpm' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                        <div className="header-cell" onClick={() => handleSort('energy_level')}>
                            Energy {sortField === 'energy_level' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                        <div className="header-cell" onClick={() => handleSort('duration')}>
                            Duration {sortField === 'duration' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                        <div className="header-cell">Actions</div>
                    </div>
                    
                    <div className="table-body">
                        {sortedAndFilteredSongs.map(song => (
                            <div 
                                key={song.id}
                                className={`song-row ${selectedSong && selectedSong.id === song.id ? 'selected' : ''}`}
                                onClick={() => onSongSelect(song)}
                            >
                                <div className="cell filename">
                                    <div className="filename-main">{song.filename}</div>
                                    <div className="filename-sub">{formatFileSize(song.file_size)}</div>
                                </div>
                                <div className="cell key">
                                    <div className="camelot-key">{song.camelot_key || '--'}</div>
                                    <div className="musical-key">{song.key_name || '--'}</div>
                                </div>
                                <div className="cell bpm">
                                    {song.bpm ? Math.round(song.bpm) : '--'}
                                </div>
                                <div className="cell energy">
                                    <div 
                                        className="energy-indicator"
                                        style={{ backgroundColor: getEnergyColor(song.energy_level) }}
                                    >
                                        {song.energy_level || '--'}
                                    </div>
                                </div>
                                <div className="cell duration">
                                    {formatDuration(song.duration)}
                                </div>
                                <div className="cell actions">
                                    <button 
                                        className="delete-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteSong(song.id);
                                        }}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MusicLibrary;