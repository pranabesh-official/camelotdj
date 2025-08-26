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
}

type SortField = 'filename' | 'camelot_key' | 'bpm' | 'energy_level' | 'duration' | 'tempo' | 'genre';
type SortDirection = 'asc' | 'desc';

const TrackTable: React.FC<TrackTableProps> = ({
  songs,
  selectedSong,
  onSongSelect,
  onSongPlay,
  onDeleteSong,
  currentlyPlaying,
  getCompatibleSongs,
  showCompatibleOnly = false
}) => {
  const [sortField, setSortField] = useState<SortField>('filename');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterKey, setFilterKey] = useState<string>('');
  const [filterEnergy, setFilterEnergy] = useState<string>('');
  const [filterTempo, setFilterTempo] = useState<string>('');
  const [filterGenre, setFilterGenre] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Enhanced song interface for display
  const enhancedSongs = useMemo(() => {
    return songs.map(song => ({
      ...song,
      tempo: song.bpm ? (song.bpm < 100 ? 'Slow' : song.bpm < 130 ? 'Medium' : 'Fast') : 'Unknown',
      genre: song.energy_level && song.bpm ? 
        (song.energy_level > 7 ? 'Tech House' :
         song.energy_level > 5 ? 'House' :
         song.bpm && song.bpm > 140 ? 'Techno' :
         'Minimal / Deep Tech') : 'Unknown',
      sharp: song.key && song.key.includes('#') ? '#' : song.key && song.key.includes('m') ? 'm' : '',
      cue_points_count: Array.isArray(song.cue_points) ? song.cue_points.length : 0,
      comment: `${song.camelot_key} - Energy ${song.energy_level}`
    }));
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
  }, [enhancedSongs, sortField, sortDirection, filterKey, filterEnergy, filterTempo, filterGenre, searchTerm, showCompatibleOnly, selectedSong, getCompatibleSongs]);

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
              <option value="">Energy</option>
              {[1,2,3,4,5,6,7,8,9,10].map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>

            <select value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)}>
              <option value=""> Genres</option>
              {uniqueGenres.map(genre => (
                <option key={genre} value={genre}>{genre}</option>
              ))}
            </select>
            
            <button className="reset-btn" onClick={() => {
              setFilterKey('');
              setFilterTempo('');
              setFilterEnergy('');
              setFilterGenre('');
              setSearchTerm('');
            }}>Reset</button>
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
              <th>Cue Points</th>
              <th>Comment</th>
              <th>Rating</th>
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
                    🎵
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
                  {song.bpm ? Math.round(song.bpm) : '--'}
                </td>
                <td className="standard-cell">
                  {song.bpm && song.bpm > 120 ? 'Fm' : 'F#m'}
                </td>
                <td className="energy-cell">
                  {song.energy_level && (
                    <span 
                      className="energy-indicator"
                      style={{ backgroundColor: getEnergyColor(song.energy_level) }}
                    >
                      {song.energy_level}
                    </span>
                  )}
                </td>
                <td className="cue-points-cell">
                  <span className="cue-count">{song.cue_points_count || 8}</span>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {sortedAndFilteredSongs.length === 0 && (
        <div className="empty-state">
          <p>No tracks found matching your criteria</p>
        </div>
      )}
    </div>
  );
};

export default TrackTable;