import React, { useState, useMemo, useEffect } from 'react';
import { Song } from '../App';
import MetadataEditor from './MetadataEditor';
import CoverArt from './CoverArt';

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
  // Cover art extraction status callback
  onCoverArtExtractionStatusChange?: (isComplete: boolean) => void;
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
  onExportPlaylist,
  onCoverArtExtractionStatusChange
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
  const [processedSongs, setProcessedSongs] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [debouncedExtractionComplete, setDebouncedExtractionComplete] = useState(true);

  // Cover art validation state
  const [coverArtValidation, setCoverArtValidation] = useState<Map<string, {
    isValid: boolean;
    hasData: boolean;
    isCorrupted: boolean;
    needsExtraction: boolean;
    lastValidated: number;
    displayData: string | null;
  }>>(new Map());

  // Clear processed songs when songs array changes (new songs added)
  useEffect(() => {
    setProcessedSongs(new Set());
    // Also clear cover art extraction status for songs without cover art
    setCoverArtErrors(new Map());
    setCoverArtSuccess(new Set());
    // Clear validation cache when songs change
    setCoverArtValidation(new Map());
  }, [songs.length]); // Only clear when number of songs changes

  // Ultra-permissive cover art validation - show everything that looks like an image
  const validateCoverArt = (song: Song): {
    isValid: boolean;
    hasData: boolean;
    isCorrupted: boolean;
    needsExtraction: boolean;
    lastValidated: number;
    displayData: string | null;
  } => {
    const now = Date.now();
    const cached = coverArtValidation.get(song.id);
    
    // Return cached validation if it's recent (within 5 minutes)
    if (cached && (now - cached.lastValidated) < 300000) {
      return cached;
    }

    const validation = {
      isValid: false,
      hasData: false,
      isCorrupted: false,
      needsExtraction: false,
      lastValidated: now,
      displayData: null as string | null
    };

    // Check if song has cover art data
    if (!song.cover_art || song.cover_art.trim() === '') {
      validation.needsExtraction = true;
      validation.hasData = false;
      validation.displayData = null;
    } else {
      validation.hasData = true;
      
      // Ultra-permissive approach - try to show any data that looks like an image
      let displayData = song.cover_art;
      
      try {
        // Check if it already has a data URL prefix
        const hasDataUrlPrefix = /^data:image\/(jpeg|jpg|png|gif|webp|bmp|tiff);base64,/.test(song.cover_art);
        
        if (!hasDataUrlPrefix) {
          // Try to fix by adding data URL prefix if it looks like raw base64
          if (song.cover_art.match(/^[A-Za-z0-9+/=]+$/)) {
            displayData = `data:image/jpeg;base64,${song.cover_art}`;
            validation.isValid = true;
            validation.displayData = displayData;
          } else {
            // Even if it doesn't look like base64, try to show it anyway
            displayData = song.cover_art;
            validation.isValid = true;
            validation.displayData = displayData;
          }
        } else {
          // It already has a proper data URL prefix, just use it
          validation.isValid = true;
          validation.displayData = displayData;
        }
      } catch (error) {
        // Even if there's an error, try to show the original data
        console.warn(`Cover art validation failed for ${song.filename}, showing anyway:`, error);
        validation.isValid = true;
        validation.displayData = song.cover_art;
      }
    }

    // Cache the validation result
    setCoverArtValidation(prev => new Map(prev.set(song.id, validation)));
    
    return validation;
  };

  // Get cover art display data with ultra-permissive validation
  const getCoverArtDisplayData = (song: Song) => {
    const validation = validateCoverArt(song);
    
    // Ultra-permissive: show any cover art data that exists
    const shouldShow = validation.hasData && validation.displayData !== null;
    
    return {
      ...validation,
      shouldShow: shouldShow,
      shouldExtract: validation.needsExtraction,
      displayData: validation.displayData,
      isFallback: false
    };
  };

  // Debug function to log cover art validation status for all songs
  const logCoverArtValidationStatus = () => {
    console.log('🔍 Cover art validation status for all songs:');
    enhancedSongs.forEach(song => {
      const displayData = getCoverArtDisplayData(song);
      console.log(`  ${song.filename}:`, {
        shouldShow: displayData.shouldShow,
        shouldExtract: displayData.shouldExtract,
        hasData: displayData.hasData,
        isValid: displayData.isValid,
        isCorrupted: displayData.isCorrupted,
        needsExtraction: displayData.needsExtraction
      });
    });
  };

  // Add debug logging when songs change (moved after enhancedSongs definition)

  // Auto-extract cover art for songs that need it (using validation layer)
  useEffect(() => {
    const autoExtractCoverArt = async () => {
      if (isProcessing) return; // Prevent concurrent processing
      
      // Use validation layer to determine which songs need processing
      const songsToProcess = songs.filter(song => {
        if (!song.file_path || extractingCoverArt.has(song.id) || processedSongs.has(song.id)) {
          return false;
        }
        
        const displayData = getCoverArtDisplayData(song);
        return displayData.shouldExtract;
      });
      
      if (songsToProcess.length === 0) return;
      
      console.log(`🖼️ Found ${songsToProcess.length} songs needing cover art extraction`);
      setIsProcessing(true);
      
      try {
        // Mark songs as being processed to prevent duplicate processing
        setProcessedSongs(prev => new Set([...prev, ...songsToProcess.slice(0, 3).map(s => s.id)]));
        
        for (const song of songsToProcess.slice(0, 3)) { // Limit to 3 concurrent extractions
          // Only extract if we haven't hit the concurrent limit
          if (extractingCoverArt.size < 3) {
            await extractCoverArt(song);
            // Add a small delay between extractions
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            // If we've hit the limit, stop processing more songs
            break;
          }
        }
      } finally {
        setIsProcessing(false);
      }
    };

    // Only auto-extract if we have songs and there are songs that need processing
    if (songs.length > 0) {
      autoExtractCoverArt();
    }
  }, [songs, processedSongs, isProcessing, coverArtValidation]); // Added coverArtValidation to dependencies

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

  // Add debug logging when songs change
  useEffect(() => {
    if (enhancedSongs.length > 0) {
      console.log('🎵 Songs loaded, checking cover art validation status...');
      
      // Debug: Check if any songs have cover art data at all
      const songsWithCoverArt = enhancedSongs.filter(song => song.cover_art && song.cover_art.trim() !== '');
      console.log(`📊 Found ${songsWithCoverArt.length} songs with cover art data out of ${enhancedSongs.length} total songs`);
      
      if (songsWithCoverArt.length > 0) {
        console.log('🔍 Sample cover art data:', {
          filename: songsWithCoverArt[0].filename,
          coverArtLength: songsWithCoverArt[0].cover_art?.length,
          coverArtPrefix: songsWithCoverArt[0].cover_art?.substring(0, 100),
          hasDataUrlPrefix: songsWithCoverArt[0].cover_art?.startsWith('data:image/')
        });
      }
      
      logCoverArtValidationStatus();
    }
  }, [enhancedSongs.length]); // Only log when number of songs changes

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
    // Enhanced validation using validation layer
    const displayData = getCoverArtDisplayData(song);
    
    if (!song.file_path || extractingCoverArt.has(song.id)) {
      console.log(`🚫 Skipping cover art extraction for ${song.filename} - no file path or already being processed`);
      return;
    }
    
    // Only extract if validation indicates it's needed
    if (!displayData.shouldExtract) {
      console.log(`🚫 Skipping cover art extraction for ${song.filename} - validation indicates no extraction needed`);
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
          console.log(`✅ Successfully extracted cover art for: ${song.filename}${data.from_cache ? ' (from cache)' : ''}`);
          
          // Update the song with cover art
          const updatedSong = { 
            ...song, 
            cover_art: data.cover_art,
            cover_art_extracted: true
          };
          if (onSongUpdate) {
            await onSongUpdate(updatedSong);
          }
          
          // Also update the database directly to ensure persistence
          try {
            await fetch(`http://127.0.0.1:${apiPort}/library/update-cover-art`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json', 
                'X-Signing-Key': apiSigningKey 
              },
              body: JSON.stringify({ 
                file_path: song.file_path, 
                cover_art: data.cover_art 
              })
            });
            console.log('✅ Cover art saved to database for:', song.filename);
          } catch (dbError) {
            console.warn('⚠️ Failed to save cover art to database:', dbError);
          }
          
          // Mark as processed since we successfully got cover art
          setProcessedSongs(prev => new Set([...prev, song.id]));
          
          // Show success state briefly
          setCoverArtSuccess(prev => new Set([...prev, song.id]));
          setTimeout(() => {
            setCoverArtSuccess(prev => {
              const newSet = new Set(prev);
              newSet.delete(song.id);
              return newSet;
            });
          }, 2000);
          
          // Add a small delay to ensure database update is complete
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } else if (data.status === 'no_cover_art') {
          console.log(`⚠️ No cover art found in: ${song.filename}`);
          // Don't mark as extracted if no cover art found - allow retry
          setCoverArtErrors(prev => new Map([...prev, [song.id, 'No cover art found in file']]));
          
        } else if (data.status === 'no_tags') {
          console.log(`⚠️ No ID3 tags found in: ${song.filename}`);
          // Don't mark as extracted if no tags found - allow retry
          setCoverArtErrors(prev => new Map([...prev, [song.id, 'No ID3 tags found']]));
          
        } else {
          console.error(`❌ Cover art extraction failed for: ${song.filename}`, data);
          setCoverArtErrors(prev => new Map([...prev, [song.id, data.error || 'Extraction failed']]));
          // Mark as processed for definitive failures to prevent infinite retries
          setProcessedSongs(prev => new Set([...prev, song.id]));
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`❌ HTTP error extracting cover art for: ${song.filename}`, response.status, errorData);
        setCoverArtErrors(prev => new Map([...prev, [song.id, `Server error: ${response.status}`]]));
        // Mark as processed for server errors to prevent infinite retries
        setProcessedSongs(prev => new Set([...prev, song.id]));
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error(`⏰ Timeout extracting cover art for: ${song.filename}`);
        setCoverArtErrors(prev => new Map([...prev, [song.id, 'Request timeout']]));
        // Mark as processed for timeouts to prevent infinite retries
        setProcessedSongs(prev => new Set([...prev, song.id]));
      } else {
        console.error(`❌ Failed to extract cover art for: ${song.filename}`, error);
        setCoverArtErrors(prev => new Map([...prev, [song.id, 'Network error']]));
        // Mark as processed for network errors to prevent infinite retries
        setProcessedSongs(prev => new Set([...prev, song.id]));
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
    // Match CamelotWheel.tsx which uses CSS variables like --camelot-1a / --camelot-1b
    const letter = camelotKey.slice(-1).toLowerCase();
    const number = camelotKey.slice(0, -1);
    return `var(--camelot-${number}${letter})`;
  };

  const getEnergyColor = (level?: number) => {
    if (!level) return '#445';
    // Smooth green-forward palette for readability from low (darker green) to high (brighter lime)
    const colors: { [k: number]: string } = {
      1: '#0d3b2e', 2: '#11553f', 3: '#156a4c', 4: '#1b7d59', 5: '#208e64',
      6: '#27a56f', 7: '#2fbd78', 8: '#48d482', 9: '#7ae08f', 10: '#a8e6a1'
    };
    return colors[level] || '#48d482';
  };

  const getContrastingTextColor = (hex: string) => {
    // Fallback
    if (!hex || typeof hex !== 'string') return '#fff';
    // Expand shorthand
    const full = hex.replace(/^#([\da-f])([\da-f])([\da-f])$/i, '#$1$1$2$2$3$3');
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(full);
    if (!m) return '#fff';
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    // Relative luminance
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.6 ? '#111' : '#fff';
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

  // Check if all cover art extraction is complete using validation layer
  const isCoverArtExtractionComplete = useMemo(() => {
    if (enhancedSongs.length === 0) return true;
    
    // Check if any songs are still being processed
    const songsBeingProcessed = extractingCoverArt.size > 0;
    
    // Check if any songs still need processing using validation layer
    const songsNeedingProcessing = enhancedSongs.filter(song => {
      if (!song.file_path || extractingCoverArt.has(song.id) || processedSongs.has(song.id)) {
        return false;
      }
      
      const displayData = getCoverArtDisplayData(song);
      return displayData.shouldExtract;
    });
    
    return songsNeedingProcessing.length === 0 && !songsBeingProcessed;
  }, [enhancedSongs, extractingCoverArt, processedSongs, coverArtValidation]);

  // Debounce cover art extraction status to prevent flickering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedExtractionComplete(isCoverArtExtractionComplete);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [isCoverArtExtractionComplete]);

  // Notify parent component when cover art extraction status changes
  useEffect(() => {
    if (onCoverArtExtractionStatusChange) {
      onCoverArtExtractionStatusChange(debouncedExtractionComplete);
    }
  }, [debouncedExtractionComplete, onCoverArtExtractionStatusChange]);

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
                  <CoverArt
                    song={song as any}
                    apiPort={apiPort}
                    apiSigningKey={apiSigningKey}
                    onSongUpdate={onSongUpdate}
                    width={40}
                    height={40}
                    isExtracting={extractingCoverArt.has(song.id)}
                    setExtracting={(id, flag) => {
                      if (flag) {
                        setExtractingCoverArt(prev => new Set([...prev, id]));
                      } else {
                        setExtractingCoverArt(prev => {
                          const ns = new Set(prev);
                          ns.delete(id);
                          return ns;
                        });
                      }
                    }}
                    setError={(id, message) => {
                      setCoverArtErrors(prev => {
                        const map = new Map(prev);
                        if (!message) {
                          map.delete(id);
                        } else {
                          map.set(id, message);
                        }
                        return map;
                      });
                    }}
                  />
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
                    (() => {
                      const bg = getEnergyColor(song.energy_level);
                      const fg = getContrastingTextColor(bg);
                      return (
                        <span 
                          className="energy-indicator"
                          style={{ 
                            backgroundColor: bg,
                            color: fg,
                            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)'
                          }}
                        >
                          {renderEditableCell(song, 'energy_level', song.energy_level, 'energy-value')}
                        </span>
                      );
                    })()
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