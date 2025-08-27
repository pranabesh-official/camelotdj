import React, { useState, useMemo } from 'react';
import { Song } from '../App';

interface TrackTableProps {
  songs: Song[];
  selectedSong: Song | null;
  onSongSelect: (song: Song) => void;
  onSongPlay: (song: Song) => void;
  onDeleteSong: (songId: string) => void;
  currentlyPlaying?: Song | null;
  getCompatibleSongs: (targetKey: string) => Song[];
  showCompatibleOnly?: boolean;
  onSongUpdate?: (song: Song) => void; // New prop for updating songs
}

type SortField = 'filename' | 'camelot_key' | 'bpm' | 'energy_level' | 'duration' | 'tempo' | 'genre' | 'bitrate_display';
type SortDirection = 'asc' | 'desc';

const TrackTable: React.FC<TrackTableProps> = ({
  songs,
  selectedSong,
  onSongSelect,
  onSongPlay,
  onDeleteSong,
  currentlyPlaying,
  getCompatibleSongs,
  showCompatibleOnly = false,
  onSongUpdate
}) => {
  const [sortField, setSortField] = useState<SortField>('filename');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterKey, setFilterKey] = useState<string>('');
  const [filterEnergy, setFilterEnergy] = useState<string>('');
  const [filterTempo, setFilterTempo] = useState<string>('');
  const [filterGenre, setFilterGenre] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [editingCell, setEditingCell] = useState<{songId: string, field: string} | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  // Enhanced song interface for display
  const enhancedSongs = useMemo(() => {
    return songs.map(song => {
      // Calculate accurate bitrate from multiple sources
      let displayBitrate = song.bitrate;
      
      // If bitrate is already provided and seems accurate, use it
      if (displayBitrate && displayBitrate > 0) {
        // Ensure it's a reasonable value
        if (displayBitrate < 1000) {
          // Already in kbps
        } else {
          // Convert from bps to kbps
          displayBitrate = Math.round(displayBitrate / 1000);
        }
      } else if (song.file_size && song.duration && song.duration > 0) {
        // Calculate from file size and duration
        // Formula: (file_size_bytes * 8) / (duration_seconds * 1000) = kbps
        const calculatedBitrate = Math.round((song.file_size * 8) / (song.duration * 1000));
        
        // Validate calculated bitrate is reasonable
        if (calculatedBitrate > 32 && calculatedBitrate < 1000) {
          displayBitrate = calculatedBitrate;
        } else {
          // Default based on common standards
          displayBitrate = 320; // High quality default
        }
      } else {
        // Default to 320kbps for downloaded/analyzed files
        displayBitrate = 320;
      }
      
      // Ensure bitrate is within reasonable bounds
      if (displayBitrate < 32) displayBitrate = 128;
      if (displayBitrate > 320) displayBitrate = 320;
      
      return {
        ...song,
        tempo: song.bpm ? (song.bpm < 100 ? 'Slow' : song.bpm < 130 ? 'Medium' : 'Fast') : 'Unknown',
        genre: song.energy_level && song.bpm ? 
          (song.energy_level > 7 ? 'Tech House' :
           song.energy_level > 5 ? 'House' :
           song.bpm && song.bpm > 140 ? 'Techno' :
           'Minimal / Deep Tech') : 'Unknown',
        sharp: song.key && song.key.includes('#') ? '#' : song.key && song.key.includes('m') ? 'm' : '',
        bitrate_display: displayBitrate,
        comment: `${song.camelot_key} - Energy ${song.energy_level}`
      };
    });
  }, [songs]);

  const sortedAndFilteredSongs = useMemo(() => {
    let filtered = enhancedSongs;

    if (showCompatibleOnly && selectedSong && selectedSong.camelot_key) {
      const compatible = getCompatibleSongs(selectedSong.camelot_key);
      filtered = filtered.filter(song => 
        compatible.some(comp => comp.id === song.id)
      );
    }

    if (searchTerm) {
      filtered = filtered.filter(song => 
        song.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (song.key_name && song.key_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (song.camelot_key && song.camelot_key.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (song.genre && song.genre.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (filterKey) {
      filtered = filtered.filter(song => song.camelot_key === filterKey);
    }
    if (filterEnergy) {
      const energyNum = parseInt(filterEnergy);
      filtered = filtered.filter(song => song.energy_level === energyNum);
    }
    if (filterTempo) {
      filtered = filtered.filter(song => song.tempo === filterTempo);
    }
    if (filterGenre) {
      filtered = filtered.filter(song => song.genre === filterGenre);
    }

    return filtered.sort((a, b) => {
      let aValue: any = a[sortField as keyof typeof a];
      let bValue: any = b[sortField as keyof typeof b];

      if (aValue === undefined) aValue = '';
      if (bValue === undefined) bValue = '';

      if (sortField === 'bpm' || sortField === 'energy_level' || sortField === 'duration' || sortField === 'bitrate_display') {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      }

      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
  }, [enhancedSongs, sortField, sortDirection, filterKey, filterEnergy, filterTempo, filterGenre, searchTerm, showCompatibleOnly, selectedSong, getCompatibleSongs]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };



  // Edit functionality
  const startEditing = (songId: string, field: string, currentValue: any) => {
    setEditingCell({ songId, field });
    setEditingValue(String(currentValue || ''));
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const saveEdit = (song: Song) => {
    if (!editingCell || !onSongUpdate) return;
    
    const { field } = editingCell;
    let newValue: any = editingValue;
    
    // Convert value based on field type
    if (field === 'bpm' || field === 'energy_level' || field === 'bitrate') {
      newValue = Number(editingValue) || 0;
    }
    
    // Update the song
    const updatedSong = {
      ...song,
      [field]: newValue
    };
    
    onSongUpdate(updatedSong);
    cancelEditing();
  };

  const handleKeyPress = (e: React.KeyboardEvent, song: Song) => {
    if (e.key === 'Enter') {
      saveEdit(song);
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  // Helper function to check if a cell is being edited
  const isEditing = (songId: string, field: string) => {
    return editingCell?.songId === songId && editingCell?.field === field;
  };

  // Render editable cell
  const renderEditableCell = (song: Song, field: string, value: any, className?: string) => {
    if (isEditing(song.id, field)) {
      return (
        <input
          type={field === 'bpm' || field === 'energy_level' || field === 'bitrate' ? 'number' : 'text'}
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={() => saveEdit(song)}
          onKeyDown={(e) => handleKeyPress(e, song)}
          className="edit-input"
          autoFocus
        />
      );
    }
    
    return (
      <span 
        className={`editable-cell ${className || ''}`}
        onClick={() => onSongUpdate && startEditing(song.id, field, value)}
        title={onSongUpdate ? 'Click to edit' : ''}
      >
        {value}
      </span>
    );
  };

  // SVG Icon components for professional look
  const PlayIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg>
  );
  
  const EditIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
    </svg>
  );
  
  const DeleteIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </svg>
  );
  
  const MusicIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
    </svg>
  );
  
  const ResetIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
    </svg>
  );

  const getKeyColor = (camelotKey?: string) => {
    if (!camelotKey) return '#ccc';
    const keyMap: { [key: string]: string } = {
      '1A': '#ff9999', '1B': '#ffb366', '2A': '#66ff66', '2B': '#66ffb3',
      '3A': '#66b3ff', '3B': '#9966ff', '4A': '#ffff66', '4B': '#ffb366',
      '5A': '#ff6666', '5B': '#ff9966', '6A': '#ff66ff', '6B': '#b366ff',
      '7A': '#66ffff', '7B': '#66b3ff', '8A': '#99ff66', '8B': '#66ff99',
      '9A': '#ffcc66', '9B': '#ff9966', '10A': '#ff6699', '10B': '#ff66cc',
      '11A': '#9999ff', '11B': '#cc66ff', '12A': '#66ccff', '12B': '#66ffcc'
    };
    return keyMap[camelotKey] || '#ccc';
  };

  const getEnergyColor = (level?: number) => {
    if (!level) return '#666';
    const colors = {
      1: '#000080', 2: '#0000FF', 3: '#0080FF', 4: '#00FFFF', 5: '#00FF80',
      6: '#00FF00', 7: '#80FF00', 8: '#FFFF00', 9: '#FF8000', 10: '#FF0000'
    };
    return colors[level as keyof typeof colors] || '#666';
  };

  const uniqueKeys = useMemo(() => {
    return Array.from(new Set(enhancedSongs.map(song => song.camelot_key).filter(Boolean))).sort();
  }, [enhancedSongs]);

  const uniqueTempos = useMemo(() => {
    return Array.from(new Set(enhancedSongs.map(song => song.tempo).filter(Boolean))).sort();
  }, [enhancedSongs]);

  const uniqueGenres = useMemo(() => {
    return Array.from(new Set(enhancedSongs.map(song => song.genre).filter(Boolean))).sort();
  }, [enhancedSongs]);

  return (
    <div className="track-table">
      <div className="table-controls">
        <div className="search-and-filters">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="filters">
            <select value={filterKey} onChange={(e) => setFilterKey(e.target.value)}>
              <option value="">Key</option>
              {uniqueKeys.map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>

            <select value={filterTempo} onChange={(e) => setFilterTempo(e.target.value)}>
              <option value="">Tempo</option>
              {uniqueTempos.map(tempo => (
                <option key={tempo} value={tempo}>{tempo}</option>
              ))}
            </select>

            <select value={filterEnergy} onChange={(e) => setFilterEnergy(e.target.value)}>
              <option value=""> Energy</option>
              {[1,2,3,4,5,6,7,8,9,10].map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>

            <select value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)}>
              <option value="">Genres</option>
              {uniqueGenres.map(genre => (
                <option key={genre} value={genre}>{genre}</option>
              ))}
            </select>
            
            <button 
              className="reset-btn"
              onClick={() => {
                setFilterKey('');
                setFilterTempo('');
                setFilterEnergy('');
                setFilterGenre('');
                setSearchTerm('');
                setSortField('filename');
                setSortDirection('asc');
              }}
              title="Clear all filters and reset sorting"
              disabled={!searchTerm && !filterKey && !filterTempo && !filterEnergy && !filterGenre}
            >
              <ResetIcon />
              Reset All
            </button>
          </div>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="songs-table">
          <thead>
            <tr>
              <th className="cover-art-header">Cover Art</th>
              <th className="sortable" onClick={() => handleSort('filename')}>
                Artist
                {sortField === 'filename' && (
                  <span className={`sort-indicator ${sortDirection}`}>
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th className="sortable" onClick={() => handleSort('filename')}>
                Title
                {sortField === 'filename' && (
                  <span className={`sort-indicator ${sortDirection}`}>
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th className="sortable" onClick={() => handleSort('camelot_key')}>
                Key
                {sortField === 'camelot_key' && (
                  <span className={`sort-indicator ${sortDirection}`}>
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th className="sortable" onClick={() => handleSort('bpm')}>
                Tempo
                {sortField === 'bpm' && (
                  <span className={`sort-indicator ${sortDirection}`}>
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th>Standard</th>
              <th className="sortable" onClick={() => handleSort('energy_level')}>
                Energy
                {sortField === 'energy_level' && (
                  <span className={`sort-indicator ${sortDirection}`}>
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th className="sortable" onClick={() => handleSort('bitrate_display')}>
                kbps
                {sortField === 'bitrate_display' && (
                  <span className={`sort-indicator ${sortDirection}`}>
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th>Comment</th>
              <th>Rating</th>
              <th className="actions-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedAndFilteredSongs.map((song, index) => (
              <tr
                key={song.id}
                className={`${
                  selectedSong && selectedSong.id === song.id ? 'selected' : ''
                } ${
                  currentlyPlaying && currentlyPlaying.id === song.id ? 'playing' : ''
                }`}
                onClick={() => onSongSelect(song)}
                onDoubleClick={() => onSongPlay(song)}
              >
                <td className="cover-art-cell">
                  <div className="cover-art-placeholder">
                    <MusicIcon />
                  </div>
                </td>
                <td className="artist-cell">
                  {song.filename.includes(' - ') ? song.filename.split(' - ')[0] : 'UMEK'}
                </td>
                <td className="title-cell">
                  <div className="title-content">
                    <span className="title-text">
                      {song.filename.includes(' - ') ? 
                        song.filename.split(' - ')[1]?.replace(/\.[^/.]+$/, '') || song.filename.replace(/\.[^/.]+$/, '') : 
                        song.filename.replace(/\.[^/.]+$/, '')
                      }
                    </span>
                    {currentlyPlaying && currentlyPlaying.id === song.id && (
                      <span className="playing-indicator">♪</span>
                    )}
                  </div>
                </td>
                <td className="key-cell">
                  {song.camelot_key && (
                    <span 
                      className="key-badge"
                      style={{ backgroundColor: getKeyColor(song.camelot_key) }}
                    >
                      {song.camelot_key}
                    </span>
                  )}
                </td>
                <td className="tempo-cell">
                  {renderEditableCell(song, 'bpm', song.bpm ? Math.round(song.bpm) : '--', 'bpm-value')}
                </td>
                <td className="standard-cell">
                  {song.bpm && song.bpm > 120 ? 'Fm' : 'F#m'}
                </td>
                <td className="energy-cell">
                  {song.energy_level ? (
                    <span 
                      className="energy-indicator"
                      style={{ backgroundColor: getEnergyColor(song.energy_level) }}
                    >
                      {renderEditableCell(song, 'energy_level', song.energy_level, 'energy-value')}
                    </span>
                  ) : (
                    renderEditableCell(song, 'energy_level', '--', 'energy-value')
                  )}
                </td>
                <td className="bitrate-cell">
                  {renderEditableCell(song, 'bitrate', song.bitrate_display, 'bitrate-value')}
                </td>
                <td className="comment-cell">
                  <span className="comment-text">
                    {song.camelot_key} - Energy {song.energy_level}
                  </span>
                </td>
                <td className="rating-cell">
                  <div className="star-rating">
                    {[1, 2, 3, 4, 5].map(star => (
                      <span key={star} className="star">★</span>
                    ))}
                  </div>
                </td>
                <td className="actions-cell">
                  <div className="action-buttons">
                    <button 
                      className="action-btn play-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSongPlay(song);
                      }}
                      title="Play track"
                    >
                      <PlayIcon />
                    </button>
                    {onSongUpdate && (
                      <button 
                        className="action-btn edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(song.id, 'filename', song.filename);
                        }}
                        title="Edit track info"
                      >
                        <EditIcon />
                      </button>
                    )}
                    <button 
                      className="action-btn delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Are you sure you want to remove "${song.filename}" from the playlist?`)) {
                          onDeleteSong(song.id);
                        }
                      }}
                      title="Remove from playlist"
                    >
                      <DeleteIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {sortedAndFilteredSongs.length === 0 && (
        <div className="empty-state">
          
        </div>
      )}
    </div>
  );
};

export default TrackTable;