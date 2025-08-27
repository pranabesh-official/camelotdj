import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Song } from '../App';

interface CuePoint {
  id: string;
  time: number;
  label: string;
  color: string;
}

interface AudioPlayerProps {
  song: Song | null;
  onNext?: () => void;
  onPrevious?: () => void;
  apiPort?: number;
  apiSigningKey?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ song, onNext, onPrevious, apiPort = 5002, apiSigningKey = 'devkey' }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [cuePoints, setCuePoints] = useState<CuePoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [waveformError, setWaveformError] = useState<string | null>(null);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformData = useRef<number[]>([]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !song) {
      setDuration(0);
      setCurrentTime(0);
      setIsPlaying(false);
      setAudioError(null);
      return;
    }

    // Reset states when song changes
    setIsLoading(true);
    setAudioError(null);
    setWaveformError(null);
    setIsLoadingWaveform(true);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => {
      setDuration(audio.duration);
      setIsLoading(false);
      console.log('Audio loaded successfully, duration:', audio.duration);
    };
    const handleEnded = () => setIsPlaying(false);
    const handleLoadStart = () => {
      setIsLoading(true);
      console.log('Audio loading started for:', song.filename);
    };
    const handleCanPlay = () => {
      setIsLoading(false);
      console.log('Audio can play:', song.filename);
    };
    const handleError = (e: Event) => {
      setIsLoading(false);
      setAudioError('Failed to load audio file');
      console.error('Audio loading error:', e, 'for file:', song.filename);
    };
    const handleLoadedData = () => {
      console.log('Audio data loaded for:', song.filename);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('loadeddata', handleLoadedData);

    // Fetch real waveform data from backend
    fetchWaveformData();

    // Log the audio URL for debugging
    const audioUrl = `http://127.0.0.1:${apiPort}/audio/${encodeURIComponent(song.filename)}?signingkey=${encodeURIComponent(apiSigningKey)}`;
    console.log('Loading audio from URL:', audioUrl);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [song, apiPort, apiSigningKey]);

  const fetchWaveformData = async () => {
    if (!song) return;
    
    try {
      setIsLoadingWaveform(true);
      setWaveformError(null);
      
      const waveformUrl = `http://127.0.0.1:${apiPort}/waveform/${encodeURIComponent(song.filename)}?signingkey=${encodeURIComponent(apiSigningKey)}&samples=1000`;
      console.log('Fetching waveform from URL:', waveformUrl);
      
      const response = await fetch(waveformUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const waveformResponse = await response.json();
      
      if (waveformResponse.status === 'success' && waveformResponse.waveform_data) {
        waveformData.current = waveformResponse.waveform_data;
        console.log(`📊 Successfully loaded waveform data: ${waveformResponse.waveform_data.length} samples`);
      } else {
        throw new Error(waveformResponse.error || 'Invalid waveform response');
      }
      
      setIsLoadingWaveform(false);
      
    } catch (error) {
      console.error('Failed to fetch waveform:', error);
      setWaveformError(`Failed to load waveform: ${error}`);
      setIsLoadingWaveform(false);
      
      // Fallback to simple waveform
      generateFallbackWaveform();
    }
  };

  const generateFallbackWaveform = () => {
    // Generate simple fallback waveform data
    const samples = 1000;
    const data = [];
    
    for (let i = 0; i < samples; i++) {
      // Create simple sine wave pattern as fallback
      const value = Math.abs(Math.sin(i * 0.02)) * 0.5 + Math.random() * 0.1;
      data.push(value);
    }
    
    waveformData.current = data;
    console.log('📊 Using fallback waveform data');
  };

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const data = waveformData.current;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    if (isLoading || isLoadingWaveform) {
      // Show loading state
      ctx.fillStyle = '#666';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(isLoadingWaveform ? 'Loading waveform...' : 'Loading...', width / 2, height / 2);
      return;
    }

    if (audioError) {
      // Show error state
      ctx.fillStyle = '#ff4444';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Audio Error', width / 2, height / 2);
      return;
    }
    
    if (waveformError) {
      // Show waveform error state but still allow interaction
      ctx.fillStyle = '#ff8800';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Using fallback waveform', width / 2, height / 2);
    }

    if (!duration || data.length === 0) {
      // Show no data state
      ctx.fillStyle = '#666';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('No audio data', width / 2, height / 2);
      return;
    }

    // Draw waveform bars
    const barWidth = Math.max(width / data.length, 1);
    const progress = currentTime / duration;

    data.forEach((value, index) => {
      const barHeight = Math.max(value * height * 0.8, 2);
      const x = index * barWidth;
      const y = (height - barHeight) / 2;

      const isPlayed = index / data.length < progress;
      
      // Simple two-tone waveform
      ctx.fillStyle = isPlayed ? '#1db954' : '#404040';
      ctx.fillRect(x, y, Math.max(barWidth - 0.5, 0.5), barHeight);
    });

    // Draw progress line
    const progressX = progress * width;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(progressX, 0);
    ctx.lineTo(progressX, height);
    ctx.stroke();
    
    // Progress indicator circle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(progressX, height / 2, 3, 0, 2 * Math.PI);
    ctx.fill();
  }, [currentTime, duration, isLoading, audioError, isLoadingWaveform, waveformError]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio || !song || isLoading || audioError) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Playback error:', error);
      setAudioError('Playback failed');
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !duration || isLoading || audioError) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickProgress = x / rect.width;
    const newTime = clickProgress * duration;
    
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const addCuePoint = () => {
    const newCue: CuePoint = {
      id: Date.now().toString(),
      time: currentTime,
      label: `Cue ${cuePoints.length + 1}`,
      color: ['#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff'][cuePoints.length % 5]
    };
    setCuePoints([...cuePoints, newCue]);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!song) {
    return (
      <div className="audio-player no-song">
        <div className="player-placeholder">
          <div className="placeholder-icon">🎵</div>
          <p className="placeholder-text">Select a track to start playing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={song.file_path ? `http://127.0.0.1:${apiPort}/audio/${encodeURIComponent(song.filename)}?signingkey=${encodeURIComponent(apiSigningKey)}` : undefined}
        crossOrigin="anonymous"
      />
      
      <div className="player-layout">
        {/* Transport Controls */}
        <div className="transport-controls">
          <button className="control-btn" onClick={onPrevious} disabled={!onPrevious} title="Previous track">
            ⏮
          </button>
          <button 
            className="control-btn play-btn" 
            onClick={togglePlayPause} 
            disabled={isLoading || !!audioError}
            title={isLoading ? 'Loading...' : audioError ? 'Audio Error' : isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? '⏳' : audioError ? '❌' : isPlaying ? '⏸' : '▶'}
          </button>
          <button className="control-btn" onClick={onNext} disabled={!onNext} title="Next track">
            ⏭
          </button>
        </div>

        {/* Track Info */}
        <div className="track-info">
          <div className="track-title">
            {song.filename.includes(' - ') ? 
              song.filename.split(' - ')[1]?.replace(/\.[^/.]+$/, '') || song.filename.replace(/\.[^/.]+$/, '') : 
              song.filename.replace(/\.[^/.]+$/, '')
            }
          </div>
          <div className="track-artist">
            {song.filename.includes(' - ') ? song.filename.split(' - ')[0] : 'Unknown Artist'}
          </div>
          {isLoading && <div className="loading-indicator">Loading audio...</div>}
          {audioError && <div className="error-indicator">Error: {audioError}</div>}
        </div>

        {/* Waveform */}
        <div className="waveform-container">
          <canvas
            ref={canvasRef}
            width={600}
            height={40}
            onClick={handleSeek}
            className="waveform-canvas"
            title={isLoading ? 'Loading...' : audioError ? 'Audio Error' : 'Click to seek'}
            style={{ cursor: isLoading || audioError ? 'default' : 'pointer' }}
          />
        </div>

        {/* Time Display */}
        <div className="time-display">
          <span className="current-time">{formatTime(currentTime)}</span>
          <span className="time-separator"> / </span>
          <span className="total-time">{formatTime(duration)}</span>
        </div>

        {/* Track Analysis */}
        <div className="track-analysis">
          <div className="analysis-item">
            <span className="analysis-label">Key</span>
            <span className="key-badge" style={{ backgroundColor: getKeyColor(song.camelot_key) }}>
              {song.camelot_key || 'N/A'}
            </span>
          </div>
          <div className="analysis-item">
            <span className="analysis-label">BPM</span>
            <span className="bpm-value">{song.bpm ? Math.round(song.bpm) : '--'}</span>
          </div>
          <div className="analysis-item">
            <span className="analysis-label">Energy</span>
            <span className="energy-badge" style={{ backgroundColor: getEnergyColor(song.energy_level) }}>
              {song.energy_level || '--'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function to get key color
const getKeyColor = (camelotKey?: string) => {
  if (!camelotKey) return '#666';
  const keyMap: { [key: string]: string } = {
    '1A': '#ff9999', '1B': '#ffb366', '2A': '#66ff66', '2B': '#66ffb3',
    '3A': '#66b3ff', '3B': '#9966ff', '4A': '#ffff66', '4B': '#ffb366',
    '5A': '#ff6666', '5B': '#ff9966', '6A': '#ff66ff', '6B': '#b366ff',
    '7A': '#66ffff', '7B': '#66b3ff', '8A': '#99ff66', '8B': '#66ff99',
    '9A': '#ffcc66', '9B': '#ff9966', '10A': '#ff6699', '10B': '#ff66cc',
    '11A': '#9999ff', '11B': '#cc66ff', '12A': '#66ccff', '12B': '#66ffcc'
  };
  return keyMap[camelotKey] || '#666';
};

// Helper function to get energy color with enhanced gradients
const getEnergyColor = (level?: number) => {
  if (!level) return '#666';
  const colors = {
    1: '#1a237e', 2: '#283593', 3: '#3949ab', 4: '#3f51b5', 5: '#2196f3',
    6: '#03a9f4', 7: '#00bcd4', 8: '#009688', 9: '#4caf50', 10: '#8bc34a'
  };
  return colors[level as keyof typeof colors] || '#666';
};

// Helper function to format key names professionally
const formatKeyName = (keyName?: string, camelotKey?: string) => {
  if (keyName) {
    return keyName;
  }
  if (camelotKey) {
    // Convert Camelot key to musical key name
    const keyMap: { [key: string]: string } = {
      '1A': 'C Minor', '1B': 'D♭ Major', '2A': 'G Minor', '2B': 'A♭ Major',
      '3A': 'D Minor', '3B': 'E♭ Major', '4A': 'A Minor', '4B': 'B♭ Major',
      '5A': 'E Minor', '5B': 'F Major', '6A': 'B Minor', '6B': 'C Major',
      '7A': 'F♯ Minor', '7B': 'G Major', '8A': 'C♯ Minor', '8B': 'D Major',
      '9A': 'G♯ Minor', '9B': 'A Major', '10A': 'D♯ Minor', '10B': 'E Major',
      '11A': 'A♯ Minor', '11B': 'B Major', '12A': 'F Minor', '12B': 'F♯ Major'
    };
    return keyMap[camelotKey] || 'Unknown';
  }
  return 'Unknown';
};

export default AudioPlayer;