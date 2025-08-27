import React, { useState, useRef, useMemo } from 'react';
import { Song } from '../App';
import './PlaylistManager.css';

export interface Playlist {
  id: string;
  name: string;
  songs: Song[];
  description?: string;
  createdAt: Date;
  color?: string;
}

interface PlaylistManagerProps {
  playlists: Playlist[];
  songs: Song[];
  selectedPlaylist: Playlist | null;
  onPlaylistSelect: (playlist: Playlist | null) => void;
  onPlaylistCreate: (playlist: { name: string; songs: Song[]; description?: string; color?: string }) => void;
  onPlaylistUpdate: (playlistId: string, updates: { name?: string; songs?: Song[]; description?: string; color?: string }) => void;
  onPlaylistDelete: (playlistId: string) => void;
  onAddToPlaylist: (playlistId: string, songs: Song[]) => void;
  onRemoveFromPlaylist: (playlistId: string, songIds: string[]) => void;
  onFileUpload?: (file: File) => void;
  onFolderUpload?: (files: FileList) => void;
  isAnalyzing?: boolean;
}

// Simple SVG icons for clean UI
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const MusicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="9 18V5l12-2v13"></path>
    <circle cx="6" cy="18" r="3"></circle>
    <circle cx="18" cy="16" r="3"></circle>
  </svg>
);

const PlaylistIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="21 15V6"></path>
    <path d="3 17a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3"></path>
    <path d="21 6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v11"></path>
  </svg>
);

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
  </svg>
);

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg 
    width="14" 
    height="14" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2"
    style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
  >
    <polyline points="9,18 15,12 9,6"></polyline>
  </svg>
);

const DeleteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3,6 5,6 21,6"></polyline>
    <path d="19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"></path>
  </svg>
);

const ExportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7,10 12,15 17,10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

const LoadingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="loading-icon">
    <path d="21 12a9 9 0 11-6.219-8.56"/>
  </svg>
);

const PlaylistManager: React.FC<PlaylistManagerProps> = ({
  playlists,
  songs,
  selectedPlaylist,
  onPlaylistSelect,
  onPlaylistCreate,
  onPlaylistUpdate,
  onPlaylistDelete,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onFileUpload,
  onFolderUpload,
  isAnalyzing = false
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showAddSongs, setShowAddSongs] = useState(false);
  const [selectedSongs, setSelectedSongs] = useState<string[]>([]);
  const [playlistSearch, setPlaylistSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const playlistColors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
    '#dda0dd', '#98d8c8', '#f7dc6f', '#bb8fce', '#85c1e9'
  ];

  const handleCreatePlaylist = () => {
    if (newPlaylistName.trim()) {
      const newPlaylist: { name: string; songs: Song[]; description?: string; color?: string } = {
        name: newPlaylistName.trim(),
        songs: [],
        description: '',
        color: playlistColors[playlists.length % playlistColors.length]
      };
      onPlaylistCreate(newPlaylist);
      setNewPlaylistName('');
      setIsCreating(false);
    }
  };

  const handleAddSongs = () => {
    if (selectedPlaylist && selectedSongs.length > 0) {
      const songsToAdd = songs.filter(song => selectedSongs.includes(song.id));
      onAddToPlaylist(selectedPlaylist.id, songsToAdd);
      setSelectedSongs([]);
      setShowAddSongs(false);
    }
  };

  const exportPlaylist = (playlist: Playlist) => {
    const m3uContent = [
      '#EXTM3U',
      ...playlist.songs.map(song => 
        `#EXTINF:${Math.floor(song.duration || 0)},${song.filename}\n${song.file_path || song.filename}`
      )
    ].join('\n');

    const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${playlist.name}.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportPlaylistAsFolder = async (playlist: Playlist) => {
    try {
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        const playlistFolder = await dirHandle.getDirectoryHandle(playlist.name, { create: true });
        
        for (const song of playlist.songs) {
          if (song.file_path) {
            console.log(`Would copy ${song.filename} to playlist folder`);
          }
        }
        
        const m3uContent = [
          '#EXTM3U',
          ...playlist.songs.map(song => 
            `#EXTINF:${Math.floor(song.duration || 0)},${song.filename}\n${song.filename}`
          )
        ].join('\n');
        
        const m3uFile = await playlistFolder.getFileHandle(`${playlist.name}.m3u`, { create: true });
        const writable = await m3uFile.createWritable();
        await writable.write(m3uContent);
        await writable.close();
        
        alert(`Playlist exported successfully to folder: ${playlist.name}`);
      } else {
        exportPlaylist(playlist);
        alert('Folder export not supported in this browser. M3U file downloaded instead.');
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const getPlaylistStats = (playlist: Playlist) => {
    const totalDuration = playlist.songs.reduce((sum, song) => sum + (song.duration || 0), 0);
    const avgBpm = playlist.songs.length > 0 
      ? Math.round(playlist.songs.reduce((sum, song) => sum + (song.bpm || 0), 0) / playlist.songs.length)
      : 0;

    return {
      duration: Math.floor(totalDuration / 60),
      avgBpm,
      tracks: playlist.songs.length
    };
  };

  const filteredPlaylists = useMemo(() => {
    const query = playlistSearch.trim().toLowerCase();
    if (!query) return playlists;
    return playlists.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query))
    );
  }, [playlists, playlistSearch]);

  return (
    <div className="playlist-manager-compact">
      {/* Add Tracks Button */}
      <div className="add-tracks-section">
        {isAnalyzing ? (
          <button className="add-tracks-btn analyzing" disabled>
            <LoadingIcon />
            Analyzing...
          </button>
        ) : (
          <label className="add-tracks-btn">
            <input 
              type="file" 
              accept=".mp3,.wav,.flac,.aac,.ogg,.m4a,audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && onFileUpload) {
                  onFileUpload(file);
                }
                e.target.value = '';
              }}
              style={{ display: 'none' }}
            />
            <PlusIcon />
            Add Tracks
          </label>
        )}
      </div>

      {/* Playlists Header */}
      <div className="section-title">
        Playlists
        <span className="item-count">{playlists.length}</span>
      </div>

      {/* Main Content - Scrollable */}
      <div className="playlist-content">
        {/* All Music */}
        <div className="playlist-item-row" onClick={() => onPlaylistSelect(null)}>
          <div className="playlist-item-icon">
            <MusicIcon />
          </div>
          <div className="playlist-item-info">
            <span className="playlist-item-name">All Music</span>
            <span className="playlist-item-count">({songs.length})</span>
          </div>
        </div>

        {/* Genre-based playlists */}
        {['House', 'Techno', 'Hip-Hop', 'Jazz', 'Rock', 'Pop', 'Reggae', 'Ambient'].map((genre) => {
          const genreCount = songs.filter(song => {
            if (!song.bpm || !song.energy_level) return false;
            
            switch(genre) {
              case 'House': return song.energy_level >= 5 && song.energy_level <= 7;
              case 'Techno': return song.energy_level > 7;
              case 'Hip-Hop': return song.energy_level <= 4 && song.bpm >= 70 && song.bpm <= 100;
              case 'Jazz': return song.energy_level <= 3;
              case 'Rock': return song.energy_level >= 6;
              case 'Pop': return song.energy_level >= 4 && song.energy_level <= 6;
              default: return false;
            }
          }).length;
          
          return (
            <div key={genre} className="playlist-item-row genre-item">
              <div className="genre-indicator">●</div>
              <div className="playlist-item-info">
                <span className="playlist-item-name">{genre}</span>
                <span className="playlist-item-count">({genreCount})</span>
              </div>
            </div>
          );
        })}

        {/* User Playlists */}
        <div className="user-playlists">
          {filteredPlaylists.map(playlist => {
            const stats = {
              tracks: playlist.songs.length
            };
            
            return (
              <div
                key={playlist.id}
                className={`playlist-item-row user-playlist ${
                  selectedPlaylist?.id === playlist.id ? 'selected' : ''
                }`}
                onClick={() => onPlaylistSelect(playlist)}
              >
                <div className="playlist-item-icon">
                  <PlaylistIcon />
                </div>
                <div className="playlist-item-info">
                  <span className="playlist-item-name">{playlist.name}</span>
                  <span className="playlist-item-count">({stats.tracks})</span>
                </div>
                <div className="playlist-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      exportPlaylist(playlist);
                    }}
                    title="Export playlist"
                  >
                    <ExportIcon />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete playlist "${playlist.name}"?`)) {
                        onPlaylistDelete(playlist.id);
                      }
                    }}
                    title="Delete playlist"
                  >
                    <DeleteIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Playlist Button */}
      <div className="create-playlist-footer">
        <button 
          className="create-playlist-btn"
          onClick={() => setIsCreating(true)}
        >
          <PlusIcon />
          New Playlist
        </button>
      </div>

      {/* Inline Create Form */}
      {isCreating && (
        <div className="create-playlist-inline">
          <input
            type="text"
            placeholder="Playlist name..."
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleCreatePlaylist();
              } else if (e.key === 'Escape') {
                setIsCreating(false);
                setNewPlaylistName('');
              }
            }}
            onBlur={() => {
              if (!newPlaylistName.trim()) {
                setIsCreating(false);
              } else {
                handleCreatePlaylist();
              }
            }}
            autoFocus
          />
        </div>
      )}

      {/* Add Songs Modal */}
      {showAddSongs && selectedPlaylist && (
        <div className="add-songs-modal">
          <div className="modal-content">
            <h4>Add Songs to {selectedPlaylist.name}</h4>
            <div className="available-songs">
              {songs
                .filter(song => !selectedPlaylist.songs.some(ps => ps.id === song.id))
                .map(song => (
                  <div key={song.id} className="song-option">
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedSongs.includes(song.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSongs([...selectedSongs, song.id]);
                          } else {
                            setSelectedSongs(selectedSongs.filter(id => id !== song.id));
                          }
                        }}
                      />
                      <span className="song-name">{song.filename}</span>
                      <span className="song-key">{song.camelot_key}</span>
                    </label>
                  </div>
                ))}
            </div>
            <div className="modal-actions">
              <button onClick={handleAddSongs} disabled={selectedSongs.length === 0}>
                Add {selectedSongs.length} Songs
              </button>
              <button onClick={() => {
                setShowAddSongs(false);
                setSelectedSongs([]);
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for M3U import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".m3u,.m3u8"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const content = event.target?.result as string;
              const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
              const playlistSongs = songs.filter(song => 
                lines.some(line => line.includes(song.filename))
              );
              
              const newPlaylist = {
                name: file.name.replace('.m3u', ''),
                songs: playlistSongs,
                description: 'Imported playlist',
                color: playlistColors[playlists.length % playlistColors.length]
              };
              onPlaylistCreate(newPlaylist);
            };
            reader.readAsText(file);
          }
          e.target.value = '';
        }}
      />
    </div>
  );
};

export default PlaylistManager;