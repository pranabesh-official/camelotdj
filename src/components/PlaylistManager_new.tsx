import React, { useState, useRef, useMemo } from 'react';
import { Song } from '../App';

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
}

const PlaylistManager: React.FC<PlaylistManagerProps> = ({
  playlists,
  songs,
  selectedPlaylist,
  onPlaylistSelect,
  onPlaylistCreate,
  onPlaylistUpdate,
  onPlaylistDelete,
  onAddToPlaylist,
  onRemoveFromPlaylist
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
    <div className="playlist-manager">
      <div className="playlist-header">
        <button className="add-tracks-btn" onClick={() => setShowAddSongs(true)}>
          ➕ Add tracks
        </button>
      </div>

      <div className="all-music-stats">
        <div className="stats-item">
          <span className="icon">🎵</span>
          <div className="stats-content">
            <span className="label">All Music</span>
            <span className="count">{songs.length} tracks</span>
          </div>
        </div>
      </div>

      <div className="analysis-section">
        <div className="section-header">
          <span className="icon">📊</span>
          <span className="title">Analysis Queue</span>
          <span className="count">0</span>
        </div>
      </div>

      <div className="improve-section">
        <div className="section-header">
          <span className="icon">✨</span>
          <span className="title">Improve Tracks</span>
          <span className="count">0</span>
        </div>
      </div>

      <div className="folder-section">
        <div className="section-header">
          <span className="icon">📁</span>
          <span className="title">My Music</span>
          <button className="expand-btn">▼</button>
        </div>
        
        <div className="genre-list">
          <div className="genre-item">
            <span className="genre-icon">🎸</span>
            <span className="genre-name">Rock</span>
            <span className="genre-count">0</span>
          </div>
          <div className="genre-item">
            <span className="genre-icon">🎵</span>
            <span className="genre-name">Pop</span>
            <span className="genre-count">0</span>
          </div>
          <div className="genre-item">
            <span className="genre-icon">🎧</span>
            <span className="genre-name">Electronic</span>
            <span className="genre-count">{songs.length}</span>
          </div>
          <div className="genre-item">
            <span className="genre-icon">🎤</span>
            <span className="genre-name">Hip Hop</span>
            <span className="genre-count">0</span>
          </div>
          <div className="genre-item">
            <span className="genre-icon">🎺</span>
            <span className="genre-name">Jazz</span>
            <span className="genre-count">0</span>
          </div>
        </div>
      </div>

      <div className="playlists-section">
        <div className="section-header">
          <span className="icon">📋</span>
          <span className="title">Playlists</span>
          <button className="create-btn" onClick={() => setIsCreating(true)}>+</button>
        </div>

        {isCreating && (
          <div className="create-playlist-form">
            <input
              type="text"
              placeholder="Playlist name..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreatePlaylist()}
              autoFocus
            />
            <div className="form-actions">
              <button onClick={handleCreatePlaylist} disabled={!newPlaylistName.trim()}>
                Create
              </button>
              <button onClick={() => {
                setIsCreating(false);
                setNewPlaylistName('');
              }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="playlist-search">
          <input
            type="text"
            placeholder="Search playlists..."
            value={playlistSearch}
            onChange={(e) => setPlaylistSearch(e.target.value)}
          />
        </div>

        <div className="playlist-list">
          {filteredPlaylists.map(playlist => {
            const stats = getPlaylistStats(playlist);
            return (
              <div
                key={playlist.id}
                className={`playlist-item ${selectedPlaylist?.id === playlist.id ? 'selected' : ''}`}
                onClick={() => onPlaylistSelect(playlist)}
              >
                <div className="playlist-color" style={{ backgroundColor: playlist.color }} />
                <div className="playlist-info">
                  <div className="playlist-name">{playlist.name}</div>
                  <div className="playlist-stats">
                    {stats.tracks} tracks • {stats.duration}min
                    {stats.avgBpm > 0 && ` • ${stats.avgBpm} BPM avg`}
                  </div>
                </div>
                <div className="playlist-actions-menu">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      exportPlaylist(playlist);
                    }}
                    title="Export as M3U"
                  >
                    📤
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      exportPlaylistAsFolder(playlist);
                    }}
                    title="Export as folder"
                  >
                    📁
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
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filteredPlaylists.length === 0 && (
          <div className="empty-playlists">
            <p>No playlists found</p>
          </div>
        )}
      </div>

      {selectedPlaylist && (
        <div className="selected-playlist-details">
          <h4>{selectedPlaylist.name}</h4>
          <button 
            className="add-songs-btn"
            onClick={() => setShowAddSongs(true)}
          >
            Add Songs
          </button>
          <div className="playlist-song-list">
            {selectedPlaylist.songs.map(song => (
              <div key={song.id} className="playlist-song">
                <span className="song-title">{song.filename}</span>
                <button 
                  onClick={() => onRemoveFromPlaylist(selectedPlaylist.id, [song.id])}
                  title="Remove from playlist"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddSongs && selectedPlaylist && (
        <div className="add-songs-modal">
          <div className="modal-content">
            <h4>Add Songs to "{selectedPlaylist.name}"</h4>
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