import React, { useState, useMemo, useEffect } from 'react';
import { Song } from '../App';
import MetadataEditor from './MetadataEditor';

interface TrackTableProps {
  songs: Song[];
  selectedSong: Song | null;
  onSongSelect: (song: Song) => void;
  onSongPlay: (song: Song) => void;
  onDeleteSong: (songId: string) => Promise<void>; // Updated to async
  currentlyPlaying?: Song | null;
  getCompatibleSongs: (targetKey: string) => Song[];
  showCompatibleOnly?: boolean;
  onSongUpdate?: (song: Song) => void; // New prop for updating songs
  apiPort: number;
  apiSigningKey: string;
  // New props for playlist actions
  selectedPlaylist?: any | null;
  onPlaylistDelete?: (playlistId: string) => void;
  onUSBExport?: (playlist: any) => void;
  onExportPlaylist?: (playlist: any) => void;
}

type SortField = 'filename' | 'camelot_key' | 'bpm' | 'energy_level' | 'duration' | 'tempo' | 'genre' | 'bitrate_display';
type SortDirection = 'asc' | 'desc';

// Enhanced song interface that includes all the computed fields
interface EnhancedSong extends Song {
  tempo: string;
  genre: string;
  sharp: string;
  bitrate_display: number;
  comment: string;
}

const TrackTable: React.FC<TrackTableProps> = ({
  songs,
  selectedSong,
  onSongSelect,
  onSongPlay,
  onDeleteSong,
  currentlyPlaying,
  getCompatibleSongs,
  showCompatibleOnly = false,
  onSongUpdate,
  apiPort,
  apiSigningKey,
  selectedPlaylist,
  onPlaylistDelete,
  onUSBExport,
  onExportPlaylist
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
  const [deletingSongs, setDeletingSongs] = useState<Set<string>>(new Set());
  const [duplicateFilter, setDuplicateFilter] = useState<'all' | 'duplicates' | 'unique'>('all');
  
  // Metadata editor state
  const [metadataEditorOpen, setMetadataEditorOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [extractingCoverArt, setExtractingCoverArt] = useState<Set<string>>(new Set());
  const [coverArtErrors, setCoverArtErrors] = useState<Map<string, string>>(new Map());
  const [coverArtSuccess, setCoverArtSuccess] = useState<Set<string>>(new Set());

  // Auto-extract cover art for songs that don't have it
  useEffect(() => {
    const autoExtractCoverArt = async () => {
      // Track songs we've already processed to prevent duplicates
      const processed = new Set<string>();
      
      for (const song of songs) {
        if (song.file_path && !song.cover_art && !extractingCoverArt.has(song.id) && !processed.has(song.id)) {
          // Only extract for a few songs at a time to avoid overwhelming the API
          if (extractingCoverArt.size < 3) {
            processed.add(song.id);
            await extractCoverArt(song);
            // Add a small delay between extractions
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            // If we've hit the limit, stop processing more songs
            break;
          }
        }
      }
    };

    // Only auto-extract if we have songs
    if (songs.length > 0) {
      autoExtractCoverArt();
    }
  }, [songs]); // Removed extractingCoverArt from dependencies to prevent loop

  // Enhanced song interface for display
  const enhancedSongs = useMemo((): EnhancedSong[] => {
    return songs.map(song => {
      // Safety check: ensure song object has required properties
      if (!song || typeof song !== 'object') {
        console.warn('Invalid song object:', song);
        return {
          id: 'invalid',
          filename: 'Invalid Song',
          title: 'Invalid Song',
          artist: 'Unknown Artist',
          bitrate: 0,
          duration: 0,
          file_size: 0,
          bpm: 0,
          key: '',
          camelot_key: '',
          energy_level: 0,
          tempo: 'Unknown',
          genre: 'Unknown',
          sharp: '',
          bitrate_display: 0,
          comment: 'Invalid song data',
          cover_art: undefined
        } as EnhancedSong;
      }
      
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
        // Ensure we have proper artist and title from the song object first
        artist: song.artist || (song.filename && song.filename.includes(' - ') ? song.filename.split(' - ')[0] : 'Unknown Artist'),
        title: song.title || (song.filename && song.filename.includes(' - ') ? 
          song.filename.split(' - ')[1]?.replace(/\.[^/.]+$/, '') || song.filename.replace(/\.[^/.]+$/, '') : 
          song.filename ? song.filename.replace(/\.[^/.]+$/, '') : 'Unknown Title'),
        tempo: song.bpm ? (song.bpm < 100 ? 'Slow' : song.bpm < 130 ? 'Medium' : 'Fast') : 'Unknown',
        genre: song.energy_level && song.bpm ? 
          (song.energy_level > 7 ? 'Tech House' :
           song.energy_level > 5 ? 'House' :
           song.bpm && song.bpm > 140 ? 'Techno' :
           'Minimal / Deep Tech') : 'Unknown',
        sharp: song.key && typeof song.key === 'string' && song.key.includes('#') ? '#' : song.key && typeof song.key === 'string' && song.key.includes('m') ? 'm' : '',
        bitrate_display: displayBitrate,
        comment: `${song.camelot_key || 'Unknown'} - Energy ${song.energy_level || 'Unknown'}`,
        // Preserve cover_art field
        cover_art: song.cover_art
      } as EnhancedSong;
    });
  }, [songs]);

  // Duplicate grouping helpers
  const duplicateKeyFor = (song: EnhancedSong) => {
    if (!song || typeof song !== 'object') return 'invalid';
    // Prefer strong identifiers if present
    if ((song as any).file_hash) return `hash:${(song as any).file_hash}`;
    if (song.track_id) return `tid:${song.track_id}`;
    // Fallback heuristic: normalized title + rounded duration + file_size
    const base = (song.filename || '').toLowerCase().replace(/\.[^/.]+$/, '').trim();
    const dur = song.duration ? Math.round(song.duration) : 0;
    const size = song.file_size || 0;
    return `h:${base}|d:${dur}|s:${size}`;
  };

  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, EnhancedSong[]>();
    enhancedSongs.forEach(s => {
      const key = duplicateKeyFor(s);
      const arr = groups.get(key) || [];
      arr.push(s);
      groups.set(key, arr);
    });
    return groups;
  }, [enhancedSongs]);

  const songIdToGroupSize = useMemo(() => {
    const map = new Map<string, number>();
    duplicateGroups.forEach(arr => {
      const size = arr.length;
      arr.forEach(s => map.set(s.id, size));
    });
    return map;
  }, [duplicateGroups]);

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
        (song.artist && song.artist.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (song.title && song.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (song.filename && song.filename.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (song.key && song.key.toLowerCase().includes(searchTerm.toLowerCase())) ||
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
      filtered = filtered.filter(song => {
        const songTempo = song.bpm ? (song.bpm < 100 ? 'Slow' : song.bpm < 130 ? 'Medium' : 'Fast') : 'Unknown';
        return songTempo === filterTempo;
      });
    }
    if (filterGenre) {
      filtered = filtered.filter(song => song.genre === filterGenre);
    }

    // Apply duplicate filter
    if (duplicateFilter !== 'all') {
      filtered = filtered.filter(s => {
        const groupSize = songIdToGroupSize.get(s.id) || 1;
        return duplicateFilter === 'duplicates' ? groupSize > 1 : groupSize === 1;
      });
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
  }, [enhancedSongs, sortField, sortDirection, filterKey, filterEnergy, filterTempo, filterGenre, searchTerm, showCompatibleOnly, selectedSong, getCompatibleSongs, duplicateFilter, songIdToGroupSize]);

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

  const saveEdit = async (song: Song) => {
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
    
    // Update local state via parent component
    onSongUpdate(updatedSong);
    
    // Also update backend API
    try {
      await fetch(`http://127.0.0.1:${apiPort}/library/update-metadata`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Signing-Key': apiSigningKey },
        body: JSON.stringify({ 
          song_id: song.id, 
          filename: song.filename, 
          file_path: song.file_path, 
          metadata: { [field]: newValue } 
        })
      });
    } catch (err) {
      console.error(`Failed to persist ${field} update to backend:`, err);
    }
    
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

  // Handle double-click to play track instead of opening metadata editor
  const handleRowDoubleClick = (song: Song) => {
    onSongPlay(song);
  };

  // Extract cover art from MP3 file with enhanced error handling and UX
  const extractCoverArt = async (song: Song) => {
    // Enhanced validation to prevent duplicate processing
    if (!song.file_path || song.cover_art || extractingCoverArt.has(song.id)) {
      console.log(`🚫 Skipping cover art extraction for ${song.filename} - already has cover art or is being processed`);
      return;
    }

    // Clear any previous errors for this song
    setCoverArtErrors(prev => {
      const newMap = new Map(prev);
      newMap.delete(song.id);
      return newMap;
    });

    console.log(`🖼️ Extracting cover art for: ${song.filename}`);
    setExtractingCoverArt(prev => new Set([...prev, song.id]));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(`http://127.0.0.1:${apiPort}/library/extract-cover-art`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'X-Signing-Key': apiSigningKey 
        },
        body: JSON.stringify({ file_path: song.file_path }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        console.log(`Cover art extraction response for ${song.filename}:`, data);
        
        if (data.status === 'success' && data.cover_art) {
          console.log(`✅ Successfully extracted cover art for: ${song.filename}`);
          
          // Update the song with cover art
          const updatedSong = { ...song, cover_art: data.cover_art };
          if (onSongUpdate) {
            onSongUpdate(updatedSong);
          }
          
          // Show success state briefly
          setCoverArtSuccess(prev => new Set([...prev, song.id]));
          setTimeout(() => {
            setCoverArtSuccess(prev => {
              const newSet = new Set(prev);
              newSet.delete(song.id);
              return newSet;
            });
          }, 2000);
          
        } else if (data.status === 'no_cover_art') {
          console.log(`⚠️ No cover art found in: ${song.filename}`);
          setCoverArtErrors(prev => new Map([...prev, [song.id, 'No cover art found in file']]));
          
        } else if (data.status === 'no_tags') {
          console.log(`⚠️ No ID3 tags found in: ${song.filename}`);
          setCoverArtErrors(prev => new Map([...prev, [song.id, 'No ID3 tags found']]));
          
        } else {
          console.error(`❌ Cover art extraction failed for: ${song.filename}`, data);
          setCoverArtErrors(prev => new Map([...prev, [song.id, data.error || 'Extraction failed']]));
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`❌ HTTP error extracting cover art for: ${song.filename}`, response.status, errorData);
        setCoverArtErrors(prev => new Map([...prev, [song.id, `Server error: ${response.status}`]]));
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error(`⏰ Timeout extracting cover art for: ${song.filename}`);
        setCoverArtErrors(prev => new Map([...prev, [song.id, 'Request timeout']]));
      } else {
        console.error(`❌ Failed to extract cover art for: ${song.filename}`, error);
        setCoverArtErrors(prev => new Map([...prev, [song.id, 'Network error']]));
      }
    } finally {
      setExtractingCoverArt(prev => {
        const newSet = new Set(prev);
        newSet.delete(song.id);
        return newSet;
      });
    }
  };

  // Handle metadata editor save
  const handleMetadataSave = async (updatedSong: Song, renameFile: boolean) => {
    if (onSongUpdate) {
      // onSongUpdate will handle both local state update and Firestore sync
      await onSongUpdate(updatedSong);
    }
    
    // Update the songs array with the new data
    const updatedSongs = songs.map(s => 
      s.id === updatedSong.id ? updatedSong : s
    );
    
    // Note: The parent component (App.tsx) now handles both local state update
    // and Firestore database synchronization via the onSongUpdate function
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

  // Professional playlist action icons
  const USBExportIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 2C5.9 2 5 2.9 5 4v2h2V4h10v2h2V4c0-1.1-.9-2-2-2H7zm-2 4v12c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V6H5zm2 2h10v8H7V8zm2 2v4h6v-4H9z"/>
      <path d="M9 10h6v2H9v-2z"/>
      <path d="M8 1h8v1H8V1z"/>
    </svg>
  );

  const M3UExportIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
      <path d="M14 2v6h6"/>
      <path d="M16 13H8"/>
      <path d="M16 17H8"/>
      <path d="M10 9H8"/>
    </svg>
  );

  const DeletePlaylistIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
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
    return Array.from(new Set(enhancedSongs.map(song => {
      return song.bpm ? (song.bpm < 100 ? 'Slow' : song.bpm < 130 ? 'Medium' : 'Fast') : 'Unknown';
    }).filter(Boolean))).sort();
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

            <select value={duplicateFilter} onChange={(e) => setDuplicateFilter(e.target.value as any)}>
              <option value="all">All</option>
              <option value="duplicates">Duplicates only</option>
              <option value="unique">Unique only</option>
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
                setDuplicateFilter('all');
              }}
              title="Clear all filters and reset sorting"
              disabled={!searchTerm && !filterKey && !filterTempo && !filterEnergy && !filterGenre && duplicateFilter === 'all'}
            >
              <ResetIcon />
              Reset All
            </button>

            
            {/* Playlist Actions - only show when a playlist is selected */}
            {selectedPlaylist && (
              <>
                {onUSBExport && (
                  <button 
                    className="playlist-action-btn usb-export-btn"
                    onClick={() => onUSBExport(selectedPlaylist)}
                    title="Export playlist to USB"
                  >
                    <USBExportIcon />
                  </button>
                )}
                
                {onExportPlaylist && (
                  <button 
                    className="playlist-action-btn export-btn"
                    onClick={() => onExportPlaylist(selectedPlaylist)}
                    title="Export playlist as M3U file"
                  >
                    <M3UExportIcon />
                  </button>
                )}
                
                {onPlaylistDelete && (
                  <button 
                    className="playlist-action-btn delete-btn"
                    onClick={() => {
                      if (window.confirm(`Delete playlist "${selectedPlaylist.name}"?`)) {
                        onPlaylistDelete(selectedPlaylist.id);
                      }
                    }}
                    title="Delete playlist"
                  >
                    <DeletePlaylistIcon />
                  </button>
                )}
              </>
            )}
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
                onDoubleClick={() => handleRowDoubleClick(song)}
                title="Double-click to edit metadata"
              >
                <td className="cover-art-cell">
                  {song.cover_art ? (
                    <div className="cover-art-container">
                      <img
                        src={`data:image/jpeg;base64,${song.cover_art}`}
                        alt={`${song.title || song.filename} cover art`}
                        className="cover-art-image"
                        style={{
                          width: '40px',
                          height: '40px',
                          objectFit: 'cover',
                          borderRadius: '6px',
                          border: '1px solid rgba(59, 130, 246, 0.2)',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                          transition: 'all 0.3s ease'
                        }}
                        onError={(e) => {
                          // Fallback to placeholder when image fails to load
                          e.currentTarget.style.display = 'none';
                          const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                          if (placeholder) {
                            placeholder.style.display = 'flex';
                          }
                        }}
                      />
                      {/* Success indicator overlay */}
                      {coverArtSuccess.has(song.id) && (
                        <div className="cover-art-success-overlay">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="cover-art-placeholder" style={{ 
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '40px',
                      height: '40px',
                      background: coverArtErrors.has(song.id) ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface-bg)',
                      border: coverArtErrors.has(song.id) ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border-color)',
                      borderRadius: '4px',
                      transition: 'all 0.2s ease'
                    }}>
                      {extractingCoverArt.has(song.id) ? (
                        <div className="cover-art-loading-container">
                          <div className="cover-art-loading-spinner">
                            <div className="spinner-ring"></div>
                            <div className="spinner-ring"></div>
                            <div className="spinner-ring"></div>
                          </div>
                          <div className="cover-art-loading-text">
                            <span className="loading-dots">
                              <span>E</span>
                              <span>x</span>
                              <span>t</span>
                              <span>r</span>
                              <span>a</span>
                              <span>c</span>
                              <span>t</span>
                              <span>i</span>
                              <span>n</span>
                              <span>g</span>
                              <span>.</span>
                              <span>.</span>
                              <span>.</span>
                            </span>
                          </div>
                        </div>
                      ) : coverArtErrors.has(song.id) ? (
                        <div className="cover-art-error-container">
                          <div className="cover-art-error-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                            </svg>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCoverArtErrors(prev => {
                                const newMap = new Map(prev);
                                newMap.delete(song.id);
                                return newMap;
                              });
                              extractCoverArt(song);
                            }}
                            className="cover-art-retry-btn"
                            title={`Error: ${coverArtErrors.get(song.id)}. Click to retry.`}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'column',
                          gap: '2px'
                        }}>
                          <MusicIcon />
                          {song.file_path && (
                            <button
                              className="extract-cover-art-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                extractCoverArt(song);
                              }}
                              title="Extract cover art from MP3 file"
                              style={{
                                position: 'absolute',
                                top: '-2px',
                                right: '-2px',
                                width: '18px',
                                height: '18px',
                                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                                border: 'none',
                                borderRadius: '50%',
                                color: 'white',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.3s ease',
                                boxShadow: '0 2px 8px rgba(59, 130, 246, 0.4)',
                                overflow: 'hidden'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.15)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.6)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.4)';
                              }}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                              </svg>
                              {/* Hover effect overlay */}
                              <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'rgba(255, 255, 255, 0.2)',
                                opacity: 0,
                                transition: 'opacity 0.2s ease',
                                pointerEvents: 'none'
                              }} className="btn-hover-overlay" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="artist-cell">
                  {song.artist || (song.filename && song.filename.includes(' - ') ? song.filename.split(' - ')[0] : 'Unknown Artist')}
                </td>
                <td className="title-cell">
                  <div className="title-content">
                    <span className="title-text">
                      {song.title || (song.filename && song.filename.includes(' - ') ? 
                        song.filename.split(' - ')[1]?.replace(/\.[^/.]+$/, '') || song.filename.replace(/\.[^/.]+$/, '') : 
                        song.filename ? song.filename.replace(/\.[^/.]+$/, '') : 'Unknown Title')
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
                    {[1, 2, 3, 4, 5].map(star => {
                      const current = (song as any).rating || 0;
                      const filled = star <= current;
                      return (
                        <span
                          key={star}
                          className="star"
                          style={{ cursor: 'pointer', color: filled ? '#FFD700' : undefined }}
                          onClick={async (e) => {
                            e.stopPropagation();
                            // Create updated song with new rating
                            const optimistic = { ...song, rating: star } as any;
                            
                            // Update local state via parent component (which now also updates Firestore)
                            onSongUpdate && onSongUpdate(optimistic);
                            
                            // Also update backend API
                            try {
                              await fetch(`http://127.0.0.1:${apiPort}/library/update-metadata`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', 'X-Signing-Key': apiSigningKey },
                                body: JSON.stringify({ song_id: song.id, filename: song.filename, file_path: (song as any).file_path, rating: star, metadata: {} })
                              });
                            } catch (err) {
                              console.error('Failed to persist rating', err);
                            }
                          }}
                          title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                        >
                          ★
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="actions-cell">
                  <div className="action-buttons">
                    {((songIdToGroupSize.get(song.id) || 1) > 1) && (
                      <span
                        className="dup-badge"
                        title={`${(songIdToGroupSize.get(song.id) || 1)} items in this duplicate group`}
                        style={{
                          background: '#ffe08a',
                          color: '#7a5e00',
                          borderRadius: 4,
                          padding: '2px 6px',
                          fontSize: 12,
                          marginRight: 8
                        }}
                      >
                        Dup ×{songIdToGroupSize.get(song.id)}
                      </span>
                    )}
                    {false && (
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
                    )}
                    {false && (
                    <button 
                      className="action-btn edit-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSong(song);
                        setMetadataEditorOpen(true);
                      }}
                      title="Edit metadata"
                    >
                      <EditIcon />
                    </button>
                    )}
                    {((songIdToGroupSize.get(song.id) || 1) > 1) && (
                      <button
                        className="action-btn"
                        onClick={async (e) => {
                          e.stopPropagation();
                          // Delete all other songs in the same duplicate group, keep this one
                          const key = duplicateKeyFor(song as EnhancedSong);
                          const group = duplicateGroups.get(key) || [];
                          const others = group.filter(s => s.id !== song.id);
                          if (others.length === 0) return;
                          const confirmMessage = `Keep "${song.filename}" and delete ${others.length} other duplicate(s)?\n\nThis removes them from library and playlists. Cannot be undone.`;
                          if (!window.confirm(confirmMessage)) return;
                          for (const other of others) {
                            try {
                              setDeletingSongs(prev => new Set([...prev, other.id]));
                              await onDeleteSong(other.id);
                            } catch (err) {
                              console.error('Failed deleting duplicate', err);
                            } finally {
                              setDeletingSongs(prev => {
                                const ns = new Set(prev);
                                ns.delete(other.id);
                                return ns;
                              });
                            }
                          }
                        }}
                        title="Keep this track, delete other duplicates"
                      >
                        Keep · remove dups
                      </button>
                    )}
                    <button 
                      className="action-btn delete-btn"
                      disabled={deletingSongs.has(song.id)}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const confirmMessage = `Are you sure you want to permanently delete "${song.filename}"?\n\nThis will:\n• Remove it from the library\n• Remove it from all playlists\n• Cannot be undone`;
                        if (window.confirm(confirmMessage)) {
                          setDeletingSongs(prev => new Set([...prev, song.id]));
                          try {
                            await onDeleteSong(song.id);
                          } catch (error) {
                            console.error('Delete failed:', error);
                            // Error is already handled in the parent component
                          } finally {
                            setDeletingSongs(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(song.id);
                              return newSet;
                            });
                          }
                        }
                      }}
                      title="Permanently delete track from library"
                      style={{
                        opacity: deletingSongs.has(song.id) ? 0.6 : 1,
                        cursor: deletingSongs.has(song.id) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {deletingSongs.has(song.id) ? (
                        <span style={{ fontSize: '12px' }}>...</span>
                      ) : (
                        <DeleteIcon />
                      )}
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

      {/* Metadata Editor Modal */}
      <MetadataEditor
        song={editingSong}
        isOpen={metadataEditorOpen}
        onClose={() => {
          setMetadataEditorOpen(false);
          setEditingSong(null);
        }}
        onSave={handleMetadataSave}
        apiPort={apiPort}
        apiSigningKey={apiSigningKey}
      />
    </div>
  );
};

export default TrackTable;