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

const AudioPlayer: React.FC<AudioPlayerProps> = ({ song, onNext, onPrevious, apiPort = 5001, apiSigningKey = 'devkey' }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [cuePoints, setCuePoints] = useState<CuePoint[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformData = useRef<number[]>([]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !song) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    // Generate sample waveform data (in a real app, this would come from audio analysis)
    generateWaveformData();

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [song]);

  const generateWaveformData = () => {
    // Generate more realistic waveform data with variations
    const samples = 1000;
    const data = [];
    
    for (let i = 0; i < samples; i++) {
      // Create multiple frequency components for realistic waveform
      const baseFreq = Math.sin(i * 0.02) * 0.5;
      const highFreq = Math.sin(i * 0.1) * 0.3;
      const noise = (Math.random() - 0.5) * 0.2;
      
      // Combine frequencies and add envelope
      const envelope = Math.sin((i / samples) * Math.PI); // Natural fade in/out
      const value = (baseFreq + highFreq + noise) * envelope;
      
      // Ensure positive values and add some variation
      data.push(Math.abs(value) * (0.3 + Math.random() * 0.7));
    }
    
    waveformData.current = data;
  };

    const drawWaveform = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !duration) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const data = waveformData.current;

        // Clear canvas with dark background
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, width, height);

        // Create waveform gradient - blue theme
        const playedGradient = ctx.createLinearGradient(0, 0, 0, height);
        playedGradient.addColorStop(0, '#4a90e2');
        playedGradient.addColorStop(0.5, '#5ba0f2');
        playedGradient.addColorStop(1, '#4a90e2');

        const unplayedGradient = ctx.createLinearGradient(0, 0, 0, height);
        unplayedGradient.addColorStop(0, '#606060');
        unplayedGradient.addColorStop(0.5, '#808080');
        unplayedGradient.addColorStop(1, '#606060');

        // Draw waveform bars
        const barWidth = Math.max(width / data.length, 1);
        const progress = currentTime / duration;

        data.forEach((value, index) => {
            const barHeight = Math.max(value * height * 0.8, 2);
            const x = index * barWidth;
            const y = (height - barHeight) / 2;

            const isPlayed = index / data.length < progress;
            
            ctx.fillStyle = isPlayed ? playedGradient : unplayedGradient;
            ctx.fillRect(x, y, Math.max(barWidth - 0.5, 0.5), barHeight);
        });

        // Draw cue points with labels and colors from the image
        const cuePointsFromImage = [
            { time: duration * 0.1, label: 'Cue 1', color: '#ff6b6b' },
            { time: duration * 0.3, label: 'Cue 3', color: '#4ecdc4' },
            { time: duration * 0.5, label: 'Cue 4', color: '#45b7d1' },
            { time: duration * 0.65, label: 'Cue 5', color: '#f39c12' },
            { time: duration * 0.75, label: 'Cue 6', color: '#e74c3c' },
            { time: duration * 0.9, label: 'Cue 8', color: '#9b59b6' }
        ];

        cuePointsFromImage.forEach(cue => {
            const x = (cue.time / duration) * width;
            
            // Draw cue point line
            ctx.strokeStyle = cue.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            
            // Draw cue label background
            ctx.fillStyle = cue.color;
            const labelWidth = 40;
            const labelHeight = 16;
            const labelX = Math.min(x - labelWidth/2, width - labelWidth);
            const labelY = 4;
            
            ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
            
            // Draw cue label text
            ctx.fillStyle = 'white';
            ctx.font = 'bold 10px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(cue.label, labelX + labelWidth/2, labelY + 12);
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
        ctx.arc(progressX, height / 2, 4, 0, 2 * Math.PI);
        ctx.fill();
    }, [currentTime, duration]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio || !song) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !duration) return;

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
          
          <p>Select a track to play</p>
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
        {/* Left: Transport Controls */}
        <div className="transport-controls">
          <button onClick={onPrevious} disabled={!onPrevious}>⏮️</button>
          <button className="play-pause-btn" onClick={togglePlayPause}>
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          <button onClick={onNext} disabled={!onNext}>⏭️</button>
        </div>

        {/* Center: Waveform and Track Info */}
        <div className="waveform-section">
          <div className="track-header">
            <div className="track-title">
              James Hype - Roses (Extended Mix)
            </div>
            <div className="track-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>
          
          <div className="waveform-container">
            <canvas
              ref={canvasRef}
              width={1000}
              height={80}
              onClick={handleSeek}
              className="waveform-canvas"
            />
          </div>
          
          <div className="track-details">
            <div className="track-info-row">
              <span className="info-label">Key</span>
              <span className="key-badge" style={{ backgroundColor: '#ffb366' }}>4A</span>
              <span className="key-description">F Minor</span>
              
              <span className="info-label">Tempo</span>
              <span className="tempo-value">126</span>
              
              <span className="info-label">Energy</span>
              <span className="energy-value">6</span>
              
              <span className="info-label">Cue points</span>
              <span className="cue-count">🔍 2️⃣</span>
              
              <button className="add-cue-btn">✚ Add cue</button>
              
              <button className="snap-cue-btn">🎧 Snap cue</button>
              
              <div className="additional-controls">
                <button className="piano-btn">🎹 Piano</button>
                <button className="song-info-btn">🎵 Song info</button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Energy Level Display */}
        <div className="energy-display">
          <div className="energy-label">Energy level</div>
          <div className="energy-number">6</div>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;