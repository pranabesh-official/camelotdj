import { doesSongMatchQuery, getMatchingQueryPlaylists, isSongInPlaylist } from '../queryPlaylistUtils';
import { Song } from '../../App';

// Mock song data for testing
const mockSong: Song = {
  id: '1',
  filename: 'test-song.mp3',
  title: 'Test Song',
  artist: 'Test Artist',
  bpm: 128,
  energy_level: 6,
  camelot_key: '8A',
  duration: 180,
  file_size: 5000000,
  status: 'analyzed'
};

const mockQueryPlaylist = {
  id: 'playlist-1',
  name: 'House Music',
  songs: [],
  isQueryBased: true,
  queryCriteria: {
    bpmRange: { min: 120, max: 130 },
    energyRange: { min: 5, max: 7 },
    genres: ['House']
  }
};

describe('Query Playlist Utils', () => {
  test('should match song with query criteria', () => {
    const result = doesSongMatchQuery(mockSong, mockQueryPlaylist.queryCriteria);
    expect(result).toBe(true);
  });

  test('should not match song with different BPM', () => {
    const songWithDifferentBPM = { ...mockSong, bpm: 100 };
    const result = doesSongMatchQuery(songWithDifferentBPM, mockQueryPlaylist.queryCriteria);
    expect(result).toBe(false);
  });

  test('should not match song with different energy level', () => {
    const songWithDifferentEnergy = { ...mockSong, energy_level: 3 };
    const result = doesSongMatchQuery(songWithDifferentEnergy, mockQueryPlaylist.queryCriteria);
    expect(result).toBe(false);
  });

  test('should find matching query playlists', () => {
    const playlists = [mockQueryPlaylist];
    const result = getMatchingQueryPlaylists(mockSong, playlists);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('playlist-1');
  });

  test('should check if song is in playlist', () => {
    const playlistWithSong = { ...mockQueryPlaylist, songs: [mockSong] };
    const result = isSongInPlaylist(mockSong, playlistWithSong);
    expect(result).toBe(true);
  });

  test('should return false if song is not in playlist', () => {
    const result = isSongInPlaylist(mockSong, mockQueryPlaylist);
    expect(result).toBe(false);
  });
});
