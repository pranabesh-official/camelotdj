import { Song } from '../App';

export interface QueryCriteria {
  bpmRange?: { min: number; max: number };
  energyRange?: { min: number; max: number };
  genres?: string[];
}

/**
 * Check if a song matches the given query criteria
 */
export const doesSongMatchQuery = (song: Song, queryCriteria: QueryCriteria): boolean => {
  if (!song || typeof song !== 'object') return false;

  // BPM filter
  if (queryCriteria.bpmRange && song.bpm) {
    const { min, max } = queryCriteria.bpmRange;
    if (song.bpm < min || song.bpm > max) {
      return false;
    }
  }

  // Energy filter
  if (queryCriteria.energyRange && song.energy_level) {
    const { min, max } = queryCriteria.energyRange;
    if (song.energy_level < min || song.energy_level > max) {
      return false;
    }
  }

  // Genre filter (based on energy level and BPM patterns)
  if (queryCriteria.genres && queryCriteria.genres.length > 0) {
    const matchesGenre = queryCriteria.genres.some((genre: string) => {
      if (!song.bpm || !song.energy_level) return false;
      
      switch(genre) {
        case 'House': return song.energy_level >= 5 && song.energy_level <= 7 && song.bpm >= 120 && song.bpm <= 130;
        case 'Techno': return song.energy_level > 7 && song.bpm >= 120 && song.bpm <= 140;
        case 'Hip-Hop': return song.energy_level <= 4 && song.bpm >= 70 && song.bpm <= 100;
        case 'Jazz': return song.energy_level <= 3 && song.bpm >= 60 && song.bpm <= 120;
        case 'Rock': return song.energy_level >= 6 && song.bpm >= 100 && song.bpm <= 140;
        case 'Pop': return song.energy_level >= 4 && song.energy_level <= 6 && song.bpm >= 100 && song.bpm <= 130;
        case 'Reggae': return song.energy_level >= 3 && song.energy_level <= 5 && song.bpm >= 60 && song.bpm <= 90;
        case 'Ambient': return song.energy_level <= 2 && song.bpm <= 80;
        case 'Electronic': return song.energy_level >= 5 && song.bpm >= 120;
        case 'Drum & Bass': return song.energy_level >= 7 && song.bpm >= 160 && song.bpm <= 180;
        case 'Trance': return song.energy_level >= 6 && song.bpm >= 130 && song.bpm <= 140;
        case 'Dubstep': return song.energy_level >= 7 && song.bpm >= 140 && song.bpm <= 160;
        default: return false;
      }
    });
    
    if (!matchesGenre) {
      return false;
    }
  }

  return true;
};

/**
 * Get all query playlists that a song matches
 */
export const getMatchingQueryPlaylists = (song: Song, queryPlaylists: any[]): any[] => {
  return queryPlaylists.filter(playlist => {
    return playlist.isQueryBased && 
           playlist.queryCriteria && 
           doesSongMatchQuery(song, playlist.queryCriteria);
  });
};

/**
 * Check if a song is already in a playlist
 */
export const isSongInPlaylist = (song: Song, playlist: any): boolean => {
  if (!playlist || !playlist.songs || !Array.isArray(playlist.songs)) {
    return false;
  }
  return playlist.songs.some((playlistSong: Song) => playlistSong.id === song.id);
};

/**
 * Get unique songs from an array, removing duplicates based on song ID
 */
export const getUniqueSongs = (songs: Song[]): Song[] => {
  const seen = new Set<string>();
  return songs.filter(song => {
    if (seen.has(song.id)) {
      return false;
    }
    seen.add(song.id);
    return true;
  });
};

/**
 * Validate playlist songs and remove duplicates
 */
export const validatePlaylistSongs = (playlist: any): any => {
  if (!playlist || !playlist.songs || !Array.isArray(playlist.songs)) {
    return playlist;
  }
  
  const uniqueSongs = getUniqueSongs(playlist.songs);
  const duplicateCount = playlist.songs.length - uniqueSongs.length;
  
  if (duplicateCount > 0) {
    console.warn(`🔍 Found ${duplicateCount} duplicate songs in playlist "${playlist.name}", removing duplicates`);
  }
  
  return {
    ...playlist,
    songs: uniqueSongs
  };
};
