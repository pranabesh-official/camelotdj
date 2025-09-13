import React, { useEffect, useMemo, useRef, useState } from 'react';

type SongLike = {
  id: string;
  filename: string;
  file_path?: string;
  title?: string;
  cover_art?: string | null;
  cover_art_extracted?: boolean;
};

interface CoverArtProps {
  song: SongLike;
  apiPort: number;
  apiSigningKey: string;
  onSongUpdate?: (updated: any) => void;
  width?: number;
  height?: number;
  isExtracting?: boolean;
  setExtracting?: (songId: string, extracting: boolean) => void;
  setError?: (songId: string, message?: string) => void;
  showStatusOverlays?: boolean;
}

/**
 * Robust cover art renderer that:
 * - Normalizes base64 vs data URL inputs
 * - Accepts multiple image types (jpeg/png/gif/webp/bmp/tiff)
 * - Falls back to backend extraction if needed (with retry)
 * - Emits parent updates via onSongUpdate when new cover is found
 */
const CoverArt: React.FC<CoverArtProps> = ({
  song,
  apiPort,
  apiSigningKey,
  onSongUpdate,
  width = 40,
  height = 40,
  isExtracting,
  setExtracting,
  setError,
  showStatusOverlays = true
}) => {
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [error, setLocalError] = useState<string | null>(null);
  const [fallbackTried, setFallbackTried] = useState<boolean>(false);
  const triedOnceRef = useRef(false);

  const sizeStyle = useMemo(() => ({
    width: `${width}px`,
    height: `${height}px`
  }), [width, height]);

  const normalizeCoverArt = (value?: string | null): string | null => {
    if (!value || value.trim() === '') return null;
    const v = value.trim();
    // If already data URL
    if (/^data:image\/(jpeg|jpg|png|gif|webp|bmp|tiff);base64,/.test(v)) return v;
    // If likely raw base64, add jpeg prefix
    if (/^[A-Za-z0-9+/=]+$/.test(v)) return `data:image/jpeg;base64,${v}`;
    // If something else, still attempt to use as-is
    return v;
  };

  const trySetFromSong = (): boolean => {
    const normalized = normalizeCoverArt(song.cover_art);
    if (normalized) {
      setDisplaySrc(normalized);
      setLocalError(null);
      return true;
    }
    return false;
  };

  const extractFromBackend = async (): Promise<boolean> => {
    if (!song.file_path) return false;
    try {
      setExtracting && setExtracting(song.id, true);
      const controller = new AbortController();
      const response = await fetch(`http://127.0.0.1:${apiPort}/library/extract-cover-art`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signing-Key': apiSigningKey
        },
        body: JSON.stringify({ file_path: song.file_path }),
        signal: controller.signal
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setLocalError(err?.error || `HTTP ${response.status}`);
        setError && setError(song.id, err?.error || `HTTP ${response.status}`);
        return false;
      }
      const data = await response.json();
      if (data?.status === 'success' && data.cover_art) {
        const normalized = normalizeCoverArt(data.cover_art);
        if (normalized) {
          setDisplaySrc(normalized);
          // Push update to parent/state
          onSongUpdate && onSongUpdate({
            ...song,
            cover_art: data.cover_art,
            cover_art_extracted: true
          });
          setLocalError(null);
          setError && setError(song.id);
          return true;
        }
      } else {
        // no_cover_art or other status
        setLocalError(data?.message || data?.error || 'No cover art found');
        setError && setError(song.id, data?.message || data?.error || 'No cover art found');
      }
      return false;
    } catch (e: any) {
      setLocalError(e?.message || 'Network error');
      setError && setError(song.id, e?.message || 'Network error');
      return false;
    } finally {
      setExtracting && setExtracting(song.id, false);
    }
  };

  useEffect(() => {
    // Reset on song change
    setDisplaySrc(null);
    setLocalError(null);
    setFallbackTried(false);
    triedOnceRef.current = false;
  }, [song.id]);

  useEffect(() => {
    // Initial attempt: use embedded data
    const ok = trySetFromSong();
    if (ok) return;
    // If none, try backend once
    (async () => {
      if (triedOnceRef.current) return;
      triedOnceRef.current = true;
      const success = await extractFromBackend();
      if (!success) setFallbackTried(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.cover_art, song.file_path, apiPort, apiSigningKey]);

  const handleImgError = async () => {
    // If image failed to render but we have not tried backend now, try once
    if (!fallbackTried) {
      const success = await extractFromBackend();
      setFallbackTried(true);
      if (success) return;
    }
    setLocalError(prev => prev || 'Image render failed');
    setError && setError(song.id, 'Image render failed');
    setDisplaySrc(null);
  };

  return (
    <div className="cover-art-container" style={{ position: 'relative' }}>
      {displaySrc ? (
        <img
          src={displaySrc}
          alt={`${song.title || song.filename} cover art`}
          className="cover-art-image"
          style={{
            ...sizeStyle,
            objectFit: 'cover',
            borderRadius: '6px',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.3s ease'
          }}
          onError={handleImgError}
        />
      ) : (
        <div className="cover-art-placeholder" style={{
          ...sizeStyle,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: error ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface-bg)',
          border: error ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border-color)',
          borderRadius: '4px',
          transition: 'all 0.2s ease'
        }}>
          {isExtracting ? (
            <div className="cover-art-loading-container">
              <div className="cover-art-loading-spinner">
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
              </div>
            </div>
          ) : (
            <span style={{ fontSize: '14px' }}>♪</span>
          )}
        </div>
      )}

      {/* Checkmark overlay intentionally hidden per request */}
      {false && showStatusOverlays && !isExtracting && !error && displaySrc && (
        <div className="cover-art-success-overlay">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
        </div>
      )}
    </div>
  );
};

export default CoverArt;


