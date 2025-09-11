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
  Music,
  Volume2,
  VolumeX,
  Shuffle,
  Sparkles
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
  volume?: number;
  onVolumeChange?: (volume: number) => void;
  isLibraryLoaded?: boolean;
  isCoverArtExtractionComplete?: boolean;
  // Auto Mix props
  isAutoMixEnabled?: boolean;
  onAutoMixToggle?: (enabled: boolean) => void;
  onAutoMixNext?: () => void;
  playlist?: Song[];
  // Auto play prop
  autoPlay?: boolean;
  onAutoPlayComplete?: () => void;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ 
  song, 
  onNext, 
  onPrevious, 
  apiPort = 5002, 
  apiSigningKey = 'devkey', 
  volume = 1, 
  onVolumeChange, 
  isLibraryLoaded = true, 
  isCoverArtExtractionComplete = true,
  isAutoMixEnabled = false,
  onAutoMixToggle,
  onAutoMixNext,
  playlist = [],
  autoPlay = false,
  onAutoPlayComplete
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [cuePoints, setCuePoints] = useState<CuePoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [waveformError, setWaveformError] = useState<string | null>(null);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [localVolume, setLocalVolume] = useState(volume);
  const [isAutoMixLoading, setIsAutoMixLoading] = useState(false);
  const [autoMixError, setAutoMixError] = useState<string | null>(null);
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
    const handleEnded = () => {
      console.log('🎵 ===== SONG ENDED EVENT =====');
      console.log('🎵 Song ended! Auto Mix enabled:', isAutoMixEnabled, 'onAutoMixNext available:', !!onAutoMixNext);
      console.log('🎵 Current song:', song?.filename);
      console.log('🎵 Playlist length:', playlist.length);
      console.log('🎵 Audio element state:', {
        currentTime: audioRef.current?.currentTime,
        duration: audioRef.current?.duration,
        paused: audioRef.current?.paused,
        ended: audioRef.current?.ended
      });
      
      setIsPlaying(false);
      
      // Trigger Auto Mix next track if enabled
      if (isAutoMixEnabled && onAutoMixNext) {
        console.log('🎵 Song ended, triggering Auto Mix next track...');
        // Add a small delay to ensure the audio state is properly updated
        setTimeout(() => {
          onAutoMixNext();
        }, 100);
      } else {
        console.log('🎵 Song ended but Auto Mix not triggered - enabled:', isAutoMixEnabled, 'handler available:', !!onAutoMixNext);
      }
      console.log('🎵 ===== END SONG ENDED EVENT =====');
    };
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

  // Auto-play effect for Auto Mix
  useEffect(() => {
    console.log('🎵 Auto-play effect triggered:', {
      autoPlay,
      hasSong: !!song,
      songFilename: song?.filename,
      isLoading,
      audioError,
      isLibraryLoaded,
      isCoverArtExtractionComplete
    });
    
    if (autoPlay && song && !isLoading && !audioError && isLibraryLoaded && isCoverArtExtractionComplete) {
      console.log('🎵 Auto-play triggered for:', song.filename);
      const audio = audioRef.current;
      if (audio) {
        audio.play().then(() => {
          console.log('🎵 Auto-play started successfully');
          setIsPlaying(true);
          if (onAutoPlayComplete) {
            onAutoPlayComplete();
          }
        }).catch((error) => {
          console.error('🎵 Auto-play failed:', error);
          setAudioError('Auto-play failed');
        });
      } else {
        console.error('🎵 Auto-play failed: No audio element found');
      }
    }
  }, [autoPlay, song, isLoading, audioError, isLibraryLoaded, isCoverArtExtractionComplete, onAutoPlayComplete]);

  // Robust song end detection for Auto Mix
  useEffect(() => {
    if (!isAutoMixEnabled || !onAutoMixNext || !song || !audioRef.current) {
      return;
    }

    console.log('🎵 Setting up song end detection for Auto Mix');
    
    const checkSongEnd = () => {
      const audio = audioRef.current;
      if (!audio || !duration || duration <= 0) return;
      
      const currentTime = audio.currentTime;
      const timeDiff = Math.abs(currentTime - duration);
      const progressPercent = (currentTime / duration) * 100;
      
      // Check if we're very close to the end (within 0.5 seconds or 99.5% complete)
      if ((timeDiff < 0.5 && currentTime >= duration * 0.995) || progressPercent >= 99.5) {
        console.log('🎵 Song end detected via time tracking:', {
          currentTime,
          duration,
          timeDiff,
          progressPercent: progressPercent.toFixed(2) + '%',
          isPlaying,
          isAutoMixLoading
        });
        
        // Only trigger if we're not already processing Auto Mix
        if (!isAutoMixLoading) {
          console.log('🎵 Triggering Auto Mix from song end detection');
          // Trigger Auto Mix directly instead of calling handleEnded
          setIsPlaying(false);
          onAutoMixNext();
        }
      }
    };

    // Check every 100ms when Auto Mix is enabled
    const interval = setInterval(checkSongEnd, 100);
    
    return () => {
      console.log('🎵 Cleaning up song end detection');
      clearInterval(interval);
    };
  }, [isAutoMixEnabled, onAutoMixNext, song, duration, isAutoMixLoading]);

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
        
        // Clear loading state and force redraw
        setIsLoadingWaveform(false);
        setWaveformError(null);
        
        // Force a redraw of the waveform immediately after loading
        requestAnimationFrame(() => {
          console.log('🎨 Redrawing waveform after successful load...');
          drawWaveform();
        });
        
        // Also redraw after a short delay to ensure it's visible
        setTimeout(() => {
          console.log('🎨 Delayed redraw to ensure visibility...');
          drawWaveform();
        }, 100);
      } else {
        throw new Error(waveformResponse.error || 'Invalid waveform response');
      }
      
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
      
      // Add some dramatic peaks for visibility
      if (i % 100 === 0) {
        value = Math.random() * 0.8 + 0.2; // Random peaks
      }
      
      // Ensure values are within bounds but more visible
      value = Math.max(0.15, Math.min(0.95, value));
      
      data.push(value);
    }
    
    waveformData.current = data;
    console.log('📊 Using enhanced fallback waveform data');
    
    // Force a redraw of the waveform immediately
    requestAnimationFrame(() => {
      console.log('🎨 Redrawing waveform after fallback generation...');
      drawWaveform();
    });
  };

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get the actual display size of the canvas
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const data = waveformData.current;

    // Clear canvas with subtle gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1a1a1a');
    gradient.addColorStop(1, '#0f0f0f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (isLoadingWaveform) {
      // Professional shimmer skeleton for waveform loading
      const skeletonBars = 120;
      const barWidth = Math.max(2, width / skeletonBars);

      // Base neutral bars (subtle variation, deterministic per index)
      for (let i = 0; i < skeletonBars; i++) {
        const x = i * barWidth;
        // Deterministic pseudo-random height between 35% and 65%
        const rand = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
        const base = 0.35 + rand * 0.30;
        const barHeight = Math.max(2, base * height * 0.8);
        const y = (height - barHeight) / 2;

        const neutral = ctx.createLinearGradient(x, y, x, y + barHeight);
        neutral.addColorStop(0, '#3a3a3a');
        neutral.addColorStop(1, '#2e2e2e');
        ctx.fillStyle = neutral;
        ctx.fillRect(x + 0.5, y, Math.max(barWidth - 1, 1), barHeight);
      }

      // Shimmer sweep overlay
      const shimmerWidth = Math.max(width * 0.18, 80);
      const t = (Date.now() * 0.4) % (width + shimmerWidth);
      const shimmerX = t - shimmerWidth;
      const shimmerGradient = ctx.createLinearGradient(shimmerX, 0, shimmerX + shimmerWidth, 0);
      shimmerGradient.addColorStop(0, 'rgba(255,255,255,0)');
      shimmerGradient.addColorStop(0.5, 'rgba(255,255,255,0.10)');
      shimmerGradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shimmerGradient;
      ctx.fillRect(0, 0, width, height);

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

    if (data.length === 0) {
      // Show no data state
      ctx.fillStyle = '#666';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('No audio data', width / 2, height / 2);
      return;
    }

    // Enhanced waveform bars with gradients and better visual effects
    const barWidth = Math.max(width / data.length, 1);
    // If no duration yet, use a default progress of 0, otherwise use current progress
    const progress = duration ? currentTime / duration : 0;

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

  // Volume control effects
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = isMuted ? 0 : localVolume;
    }
  }, [localVolume, isMuted]);

  // Sync with parent volume prop
  useEffect(() => {
    setLocalVolume(volume);
  }, [volume]);

  // Keyboard shortcuts for volume control
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle volume shortcuts when audio player is focused or when a song is playing
      if (!song) return;
      
      if (e.key === 'ArrowUp' && e.ctrlKey) {
        e.preventDefault();
        handleVolumeChange(Math.min(1, localVolume + 0.1));
      } else if (e.key === 'ArrowDown' && e.ctrlKey) {
        e.preventDefault();
        handleVolumeChange(Math.max(0, localVolume - 0.1));
      } else if (e.key === 'm' && e.ctrlKey) {
        e.preventDefault();
        handleMuteToggle();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [localVolume, song]);

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

  // Redraw waveform when data changes
  useEffect(() => {
    if (!isLoadingWaveform && waveformData.current.length > 0) {
      console.log('🔄 Waveform data changed, redrawing...');
      requestAnimationFrame(() => {
        drawWaveform();
      });
    }
  }, [isLoadingWaveform, drawWaveform]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
      
      drawWaveform();
    };

    // Initial resize
    handleResize();

    // Listen for resize events
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [drawWaveform]);

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio || !song || isLoading || audioError || !isLibraryLoaded || !isCoverArtExtractionComplete) return;

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
    if (!canvas || !audio || !duration || isLoading || audioError || !isLibraryLoaded || !isCoverArtExtractionComplete) return;

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

  const handleVolumeChange = (newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setLocalVolume(clampedVolume);
    setIsMuted(clampedVolume === 0);
    onVolumeChange?.(clampedVolume);
  };

  const handleMuteToggle = () => {
    if (isMuted) {
      // Unmute - restore previous volume or default to 0.5
      const newVolume = localVolume > 0 ? localVolume : 0.5;
      setLocalVolume(newVolume);
      setIsMuted(false);
      onVolumeChange?.(newVolume);
    } else {
      // Mute
      setIsMuted(true);
      onVolumeChange?.(0);
    }
  };

  const handleAutoMixToggle = async () => {
    console.log('🎵 Auto Mix Toggle clicked');
    console.log('🎵 Current state:', {
      isAutoMixEnabled,
      isLibraryLoaded,
      isCoverArtExtractionComplete,
      isAutoMixLoading,
      playlistLength: playlist.length,
      hasSong: !!song
    });
    
    if (!onAutoMixToggle) {
      console.log('❌ No onAutoMixToggle handler provided');
      return;
    }
    
    const newState = !isAutoMixEnabled;
    setIsAutoMixLoading(true);
    setAutoMixError(null);
    
    try {
      // If enabling auto mix, get the next track immediately
      if (newState && song && playlist.length > 0) {
        console.log('🎵 Enabling Auto Mix and getting next track...');
        await handleAutoMixNext();
      }
      
      console.log('🎵 Calling onAutoMixToggle with:', newState);
      onAutoMixToggle(newState);
    } catch (error) {
      console.error('❌ Auto Mix toggle error:', error);
      setAutoMixError('Failed to toggle Auto Mix');
    } finally {
      setIsAutoMixLoading(false);
    }
  };

  const handleAutoMixNext = async () => {
    console.log('🎵 ===== AUDIO PLAYER AUTO MIX NEXT =====');
    console.log('🎵 AudioPlayer: handleAutoMixNext called, song:', song?.filename);
    console.log('🎵 onAutoMixNext available:', !!onAutoMixNext);
    
    if (!onAutoMixNext || !song) {
      console.log('🎵 AudioPlayer: Missing requirements - onAutoMixNext:', !!onAutoMixNext, 'song:', !!song);
      return;
    }
    
    setIsAutoMixLoading(true);
    setAutoMixError(null);
    
    try {
      console.log('🎵 AudioPlayer: Calling onAutoMixNext...');
      await onAutoMixNext();
      console.log('🎵 AudioPlayer: onAutoMixNext completed successfully');
    } catch (error) {
      console.error('🎵 AudioPlayer: Auto Mix next track error:', error);
      setAutoMixError('Failed to get next track');
    } finally {
      setIsAutoMixLoading(false);
      console.log('🎵 ===== END AUDIO PLAYER AUTO MIX NEXT =====');
    }
  };

  if (!isLibraryLoaded) {
    return (
      <div className="audio-player library-loading">
        <div className="player-placeholder">
          <div className="placeholder-icon">
            <Loader2 size={24} className="animate-spin text-yellow-500" />
          </div>
          <p className="placeholder-text">Loading music library...</p>
        </div>
      </div>
    );
  }

  if (!isCoverArtExtractionComplete) {
    return (
      <div className="audio-player cover-art-loading">
        <div className="player-placeholder">
          <div className="placeholder-icon">
            <Loader2 size={24} className="animate-spin text-blue-500" />
          </div>
          <p className="placeholder-text">Extracting cover art...</p>
        </div>
      </div>
    );
  }

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
      
      <div className="player-layout-compact">
        {/* Waveform and Controls Combined */}
        <div className="waveform-controls-container">
          {/* Waveform */}
          <div className="waveform-container">
            <canvas
              ref={canvasRef}
              width={800}
              height={40}
              onClick={handleSeek}
              className="waveform-canvas"
              title={!isLibraryLoaded ? 'Library loading...' : !isCoverArtExtractionComplete ? 'Extracting cover art...' : isLoading ? 'Loading...' : audioError ? 'Audio Error' : 'Click to seek'}
              style={{ 
                cursor: !isLibraryLoaded || !isCoverArtExtractionComplete || isLoading || audioError ? 'default' : 'pointer',
                opacity: !isLibraryLoaded || !isCoverArtExtractionComplete ? 0.5 : 1
              }}
            />
          </div>

          {/* Controls Row */}
          <div className="controls-row-compact">
            {/* Transport Controls */}
            <div className="transport-controls">
              <button className="control-btn" onClick={onPrevious} disabled={!onPrevious || !isLibraryLoaded || !isCoverArtExtractionComplete} title={!isLibraryLoaded ? "Library loading..." : !isCoverArtExtractionComplete ? "Extracting cover art..." : "Previous track"}>
                <SkipBack size={16} />
              </button>
              <button 
                className="control-btn play-btn" 
                onClick={togglePlayPause} 
                disabled={isLoading || !!audioError || !isLibraryLoaded || !isCoverArtExtractionComplete}
                title={!isLibraryLoaded ? "Library loading..." : !isCoverArtExtractionComplete ? "Extracting cover art..." : isLoading ? 'Loading...' : audioError ? 'Audio Error' : isPlaying ? 'Pause' : 'Play'}
              >
                {!isLibraryLoaded ? (
                  <Loader2 size={18} className="animate-spin text-yellow-500" />
                ) : !isCoverArtExtractionComplete ? (
                  <Loader2 size={18} className="animate-spin text-blue-500" />
                ) : isLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : audioError ? (
                  <AlertCircle size={18} className="text-red-500" />
                ) : isPlaying ? (
                  <Pause size={18} />
                ) : (
                  <Play size={18} />
                )}
              </button>
              <button className="control-btn" onClick={onNext} disabled={!onNext || !isLibraryLoaded || !isCoverArtExtractionComplete} title={!isLibraryLoaded ? "Library loading..." : !isCoverArtExtractionComplete ? "Extracting cover art..." : "Next track"}>
                <SkipForward size={16} />
              </button>
            </div>

            {/* Auto Mix Controls */}
            <div className="automix-controls">
              <button 
                className={`control-btn automix-btn ${isAutoMixEnabled ? 'active' : ''}`}
                onClick={handleAutoMixToggle}
                disabled={!isLibraryLoaded || !isCoverArtExtractionComplete || isAutoMixLoading}
                title={
                  !isLibraryLoaded ? "Library loading..." : 
                  !isCoverArtExtractionComplete ? "Extracting cover art..." : 
                  isAutoMixLoading ? "Processing..." :
                  isAutoMixEnabled ? 'Disable Auto Mix' : 'Enable Auto Mix'
                }
              >
                {isAutoMixLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : isAutoMixEnabled ? (
                  <Sparkles size={14} />
                ) : (
                  <Shuffle size={14} />
                )}
              </button>
              <span className="automix-label">
                {isAutoMixEnabled ? 'Auto Mix ON' : 'Auto Mix OFF'}
              </span>
              {autoMixError && (
                <span className="automix-error" title={autoMixError}>
                  ⚠️
                </span>
              )}
            </div>

            {/* Volume Controls */}
            <div className="volume-controls">
              <button 
                className="control-btn volume-btn" 
                onClick={handleMuteToggle}
                disabled={!isLibraryLoaded || !isCoverArtExtractionComplete}
                title={!isLibraryLoaded ? "Library loading..." : !isCoverArtExtractionComplete ? "Extracting cover art..." : isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <div className="volume-slider-container">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : localVolume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="volume-slider"
                  disabled={!isLibraryLoaded || !isCoverArtExtractionComplete}
                  title={!isLibraryLoaded ? "Library loading..." : !isCoverArtExtractionComplete ? "Extracting cover art..." : `Volume: ${Math.round((isMuted ? 0 : localVolume) * 100)}%`}
                />
              </div>
              <span className="volume-percentage">
                {Math.round((isMuted ? 0 : localVolume) * 100)}%
              </span>
            </div>

            {/* Time Display */}
            <div className="time-display">
              <Clock size={12} className="mr-1 text-gray-400" />
              <span className="current-time">{formatTime(currentTime)}</span>
              <span className="time-separator"> / </span>
              <span className="total-time">{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        {/* Track Info and Analysis Row */}
        <div className="track-info-row-compact">
          {/* Track Info */}
          <div className="track-info">
            <div className="track-title" title={song.filename}>
              {song.filename.replace(/\.[^/.]+$/, '')}
            </div>
            <div className="track-artist">
              {song.filename.includes(' - ') ? song.filename.split(' - ')[0] : 'Unknown Artist'}
            </div>
            {isLoading && (
              <div className="loading-indicator">
                <Loader2 size={12} className="animate-spin mr-1" />
                Loading...
              </div>
            )}
            {audioError && (
              <div className="error-indicator">
                <AlertCircle size={12} className="mr-1" />
                Error: {audioError}
              </div>
            )}
          </div>

          {/* Track Analysis */}
          <div className="track-analysis">
            <div className="analysis-item">
              <Music size={12} className="mr-1 text-gray-400" />
              <span className="analysis-label">Key</span>
              <span className="key-badge" style={{ backgroundColor: getKeyColor(song.camelot_key) }}>
                {song.camelot_key || 'N/A'}
              </span>
            </div>
            <div className="analysis-item">
              <Clock size={12} className="mr-1 text-gray-400" />
              <span className="analysis-label">BPM</span>
              <span className="bpm-value">{song.bpm ? Math.round(song.bpm) : '--'}</span>
            </div>
            <div className="analysis-item">
              <Zap size={12} className="mr-1 text-gray-400" />
              <span className="analysis-label">Energy</span>
              <span className="energy-badge" style={{ backgroundColor: getEnergyColor(song.energy_level) }}>
                {song.energy_level || '--'}
              </span>
            </div>
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