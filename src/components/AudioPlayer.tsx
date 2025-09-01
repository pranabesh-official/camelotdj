import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Loader2, 
  AlertCircle, 
  Music2,
  Clock,
  Zap,
  Music
} from 'lucide-react';
import { Song } from '../App';
import './AudioPlayer.css';

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
  const [animationFrame, setAnimationFrame] = useState<number | null>(null);

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
    // Generate enhanced fallback waveform data with more realistic patterns
    const samples = 1000;
    const data = [];
    
    // Create multiple frequency components for more realistic sound
    const baseFreq = 0.02;
    const highFreq = 0.1;
    const midFreq = 0.05;
    
    for (let i = 0; i < samples; i++) {
      // Combine multiple sine waves for more realistic audio representation
      const baseWave = Math.abs(Math.sin(i * baseFreq)) * 0.4;
      const highWave = Math.abs(Math.sin(i * highFreq)) * 0.2;
      const midWave = Math.abs(Math.sin(i * midFreq)) * 0.3;
      
      // Add some randomness for natural variation
      const randomFactor = (Math.random() - 0.5) * 0.1;
      
      // Combine all components
      let value = baseWave + highWave + midWave + randomFactor;
      
      // Add some rhythmic patterns (like beats)
      if (i % 50 < 25) {
        value *= 1.2; // Emphasize certain sections
      }
      
      // Ensure values are within bounds
      value = Math.max(0.1, Math.min(0.9, value));
      
      data.push(value);
    }
    
    waveformData.current = data;
    console.log('📊 Using enhanced fallback waveform data');
  };

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const data = waveformData.current;

    // Clear canvas with subtle gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1a1a1a');
    gradient.addColorStop(1, '#0f0f0f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (isLoading || isLoadingWaveform) {
      // Enhanced loading state with animated bars
      const loadingBars = 20;
      const barWidth = width / loadingBars;
      const time = Date.now() * 0.005;
      
      for (let i = 0; i < loadingBars; i++) {
        const barHeight = Math.sin(time + i * 0.3) * 0.5 + 0.5;
        const x = i * barWidth;
        const y = (height - barHeight * height * 0.6) / 2;
        
        // Create gradient for loading bars
        const barGradient = ctx.createLinearGradient(x, y, x, y + barHeight * height * 0.6);
        barGradient.addColorStop(0, '#1db954');
        barGradient.addColorStop(0.5, '#1ed760');
        barGradient.addColorStop(1, '#1db954');
        
        ctx.fillStyle = barGradient;
        ctx.fillRect(x + 1, y, Math.max(barWidth - 2, 1), barHeight * height * 0.6);
      }
      
      // Loading text with better styling
      ctx.fillStyle = '#888';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(isLoadingWaveform ? 'Loading waveform...' : 'Loading audio...', width / 2, height - 8);
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

    // Enhanced waveform bars with gradients and better visual effects
    const barWidth = Math.max(width / data.length, 1);
    const progress = currentTime / duration;

    data.forEach((value, index) => {
      const barHeight = Math.max(value * height * 0.8, 2);
      const x = index * barWidth;
      const y = (height - barHeight) / 2;

      const isPlayed = index / data.length < progress;
      const progressInBar = Math.max(0, Math.min(1, (progress - index / data.length) / (1 / data.length)));
      
      if (isPlayed) {
        // Played bars with gradient
        const playedGradient = ctx.createLinearGradient(x, y, x, y + barHeight);
        playedGradient.addColorStop(0, '#1db954');
        playedGradient.addColorStop(0.5, '#1ed760');
        playedGradient.addColorStop(1, '#1db954');
        ctx.fillStyle = playedGradient;
      } else {
        // Unplayed bars with subtle gradient
        const unplayedGradient = ctx.createLinearGradient(x, y, x, y + barHeight);
        unplayedGradient.addColorStop(0, '#404040');
        unplayedGradient.addColorStop(0.5, '#505050');
        unplayedGradient.addColorStop(1, '#404040');
        ctx.fillStyle = unplayedGradient;
      }
      
      // Draw main bar
      ctx.fillRect(x + 0.5, y, Math.max(barWidth - 1, 0.5), barHeight);
      
      // Add subtle highlight for played bars
      if (isPlayed && progressInBar > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        const highlightHeight = barHeight * progressInBar;
        ctx.fillRect(x + 0.5, y, Math.max(barWidth - 1, 0.5), highlightHeight);
      }
    });

    // Enhanced progress line with glow effect
    const progressX = progress * width;
    
    // Glow effect
    ctx.shadowColor = '#1db954';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#1db954';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(progressX, 0);
    ctx.lineTo(progressX, height);
    ctx.stroke();
    
    // Reset shadow
    ctx.shadowBlur = 0;
    
    // Main progress line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(progressX, 0);
    ctx.lineTo(progressX, height);
    ctx.stroke();
    
    // Enhanced progress indicator circle with glow
    ctx.shadowColor = '#1db954';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(progressX, height / 2, 4, 0, 2 * Math.PI);
    ctx.fill();
    
        // Reset shadow
    ctx.shadowBlur = 0;
    
    // Add subtle grid lines for better visual reference
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const gridY = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, gridY);
      ctx.lineTo(width, gridY);
      ctx.stroke();
    }
}, [currentTime, duration, isLoading, audioError, isLoadingWaveform, waveformError]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  // Add smooth animation loop for loading state
  useEffect(() => {
    if (isLoading || isLoadingWaveform) {
      const animate = () => {
        drawWaveform();
        const frame = requestAnimationFrame(animate);
        setAnimationFrame(frame);
      };
      animate();
    } else if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      setAnimationFrame(null);
    }

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isLoading, isLoadingWaveform, drawWaveform, animationFrame]);

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
          <div className="placeholder-icon">
            <Music2 size={24} className="text-gray-400" />
          </div>
          <p className="placeholder-text">Select a track to start playing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={song.file_path ? `http://127.0.0.1:${apiPort}/audio/${encodeURIComponent(song.filename)}?signingkey=${encodeURIComponent(apiSigningKey)}&path=${encodeURIComponent(song.file_path)}` : undefined}
        crossOrigin="anonymous"
      />
      
      <div className="player-layout">
        {/* Transport Controls */}
        <div className="transport-controls">
          <button className="control-btn" onClick={onPrevious} disabled={!onPrevious} title="Previous track">
            <SkipBack size={20} />
          </button>
          <button 
            className="control-btn play-btn" 
            onClick={togglePlayPause} 
            disabled={isLoading || !!audioError}
            title={isLoading ? 'Loading...' : audioError ? 'Audio Error' : isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? (
              <Loader2 size={24} className="animate-spin" />
            ) : audioError ? (
              <AlertCircle size={24} className="text-red-500" />
            ) : isPlaying ? (
              <Pause size={24} />
            ) : (
              <Play size={24} />
            )}
          </button>
          <button className="control-btn" onClick={onNext} disabled={!onNext} title="Next track">
            <SkipForward size={20} />
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
          {isLoading && (
            <div className="loading-indicator">
              <Loader2 size={16} className="animate-spin mr-2" />
              Loading audio...
            </div>
          )}
          {audioError && (
            <div className="error-indicator">
              <AlertCircle size={16} className="mr-2" />
              Error: {audioError}
            </div>
          )}
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
          <Clock size={16} className="mr-1 text-gray-400" />
          <span className="current-time">{formatTime(currentTime)}</span>
          <span className="time-separator"> / </span>
          <span className="total-time">{formatTime(duration)}</span>
        </div>

        {/* Track Analysis */}
        <div className="track-analysis">
          <div className="analysis-item">
            <Music size={16} className="mr-1 text-gray-400" />
            <span className="analysis-label">Key</span>
            <span className="key-badge" style={{ backgroundColor: getKeyColor(song.camelot_key) }}>
              {song.camelot_key || 'N/A'}
            </span>
          </div>
          <div className="analysis-item">
            <Clock size={16} className="mr-1 text-gray-400" />
            <span className="analysis-label">BPM</span>
            <span className="bpm-value">{song.bpm ? Math.round(song.bpm) : '--'}</span>
          </div>
          <div className="analysis-item">
            <Zap size={16} className="mr-1 text-gray-400" />
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