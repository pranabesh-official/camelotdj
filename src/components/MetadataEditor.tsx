import React, { useState, useEffect } from 'react';
import { Song } from '../App';

interface MetadataEditorProps {
  song: Song | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (song: Song, renameFile: boolean) => Promise<void>;
  apiPort: number;
  apiSigningKey: string;
}

const MetadataEditor: React.FC<MetadataEditorProps> = ({
  song,
  isOpen,
  onClose,
  onSave,
  apiPort,
  apiSigningKey
}) => {
  const [editedSong, setEditedSong] = useState<Song | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [renameFile, setRenameFile] = useState(false);
  const [customFilename, setCustomFilename] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Initialize edited song when modal opens
  useEffect(() => {
    if (song && isOpen) {
      setEditedSong({ ...song });
      setCustomFilename(song.filename);
      setError(null);
      setSuccess(null);
    }
  }, [song, isOpen]);

  if (!isOpen || !song || !editedSong) {
    return null;
  }

  const handleInputChange = (field: keyof Song, value: any) => {
    setEditedSong(prev => prev ? { ...prev, [field]: value } : null);
  };

  const handleSave = async () => {
    if (!editedSong) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Prepare metadata updates
      const metadataUpdates: Partial<Song> = {};
      if (editedSong.key !== song.key && editedSong.key && editedSong.key.trim()) metadataUpdates.key = editedSong.key.trim();
      if (editedSong.scale !== song.scale && editedSong.scale && editedSong.scale.trim()) metadataUpdates.scale = editedSong.scale.trim();
      if (editedSong.key_name !== song.key_name && editedSong.key_name && editedSong.key_name.trim()) metadataUpdates.key_name = editedSong.key_name.trim();
      if (editedSong.camelot_key !== song.camelot_key && editedSong.camelot_key && editedSong.camelot_key.trim()) metadataUpdates.camelot_key = editedSong.camelot_key.trim();
      if (editedSong.bpm !== song.bpm && editedSong.bpm && editedSong.bpm > 0) metadataUpdates.bpm = editedSong.bpm;
      if (editedSong.energy_level !== song.energy_level && editedSong.energy_level && editedSong.energy_level >= 1 && editedSong.energy_level <= 10) metadataUpdates.energy_level = editedSong.energy_level;
      if (editedSong.duration !== song.duration && editedSong.duration && editedSong.duration > 0) metadataUpdates.duration = editedSong.duration;

      // 1) Update metadata first
      const response = await fetch(`http://127.0.0.1:${apiPort}/library/update-metadata`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Signing-Key': apiSigningKey
        },
        body: JSON.stringify({
          song_id: song.id,
          filename: song.filename,
          file_path: song.file_path,
          metadata: metadataUpdates,
          rename_file: false
        })
      });

      if (!response.ok) {
        let errorText = 'Failed to update metadata';
        try { const errJson = await response.json(); errorText = errJson.error || errorText; } catch {}
        throw new Error(errorText);
      }

      const result = await response.json();

      let updatedSong = { ...editedSong, ...result.song } as Song;

      // 2) If rename requested, perform rename that updates real file + DB
      if (renameFile) {
        const newName = generatePreviewFilename();
        const renameRes = await fetch(`http://127.0.0.1:${apiPort}/library/rename-file`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Signing-Key': apiSigningKey
          },
          body: JSON.stringify({
            song_id: song.id,
            new_filename: newName
          })
        });
        if (!renameRes.ok) {
          const errorData = await renameRes.json();
          throw new Error(errorData.error || 'Failed to rename file');
        }
        const renameJson = await renameRes.json();
        updatedSong = { ...updatedSong, filename: renameJson.song.filename, file_path: renameJson.song.file_path } as Song;
      }

      await onSave(updatedSong, renameFile);
      setSuccess('Saved successfully');
      setTimeout(() => { onClose(); }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomRename = async () => {
    if (!customFilename.trim()) {
      setError('Please enter a filename');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/library/rename-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signing-Key': apiSigningKey
        },
        body: JSON.stringify({
          song_id: song.id,
          filename: song.filename,
          file_path: song.file_path,
          new_filename: customFilename
        })
      });

      if (!response.ok) {
        let msg = 'Failed to rename file';
        try { const j = await response.json(); msg = j.error || msg; } catch {}
        throw new Error(msg);
      }

      const result = await response.json();
      
      const updatedSong = { ...editedSong, filename: result.song.filename, file_path: result.song.file_path } as Song;
      await onSave(updatedSong, true);
      setSuccess('File renamed successfully!');
      setTimeout(() => { onClose(); }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const generatePreviewFilename = () => {
    if (!editedSong) return '';
    
    const artist = editedSong.filename.includes(' - ') ? 
      editedSong.filename.split(' - ')[0] : 'Unknown Artist';
    const title = editedSong.filename.includes(' - ') ? 
      editedSong.filename.split(' - ')[1]?.replace(/\.[^/.]+$/, '') || editedSong.filename.replace(/\.[^/.]+$/, '') : 
      editedSong.filename.replace(/\.[^/.]+$/, '');
    
    const bpm = editedSong.bpm ? ` bpm ${Math.round(editedSong.bpm)}` : '';
    const key = editedSong.camelot_key ? ` - ${editedSong.camelot_key}` : '';
    
    return `${artist} - ${title}${bpm}${key}.mp3`;
  };

  return (
    <div className="metadata-editor-overlay">
      <div className="metadata-editor-modal">
        <div className="metadata-editor-header">
          <h2>Edit Song Metadata</h2>
          <button className="close-btn" onClick={onClose} disabled={isLoading}>
            ×
          </button>
        </div>

        <div className="metadata-editor-content">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {success && (
            <div className="success-message">
              {success}
            </div>
          )}

          <div className="metadata-section">
            <h3>Basic Information</h3>
            
            <div className="form-group">
              <label>Artist:</label>
              <input
                type="text"
                value={editedSong.filename.includes(' - ') ? 
                  editedSong.filename.split(' - ')[0] : 'Unknown Artist'}
                disabled
                className="disabled-input"
              />
            </div>

            <div className="form-group">
              <label>Title:</label>
              <input
                type="text"
                value={editedSong.filename.includes(' - ') ? 
                  editedSong.filename.split(' - ')[1]?.replace(/\.[^/.]+$/, '') || editedSong.filename.replace(/\.[^/.]+$/, '') : 
                  editedSong.filename.replace(/\.[^/.]+$/, '')}
                disabled
                className="disabled-input"
              />
            </div>
          </div>

          <div className="metadata-section">
            <h3>Music Analysis</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label>Key:</label>
                <input
                  type="text"
                  value={editedSong.key || ''}
                  onChange={(e) => handleInputChange('key', e.target.value)}
                  placeholder="e.g., C, F#, Bb"
                />
              </div>

              <div className="form-group">
                <label>Scale:</label>
                <select
                  value={editedSong.scale || ''}
                  onChange={(e) => handleInputChange('scale', e.target.value)}
                >
                  <option value="">Select scale</option>
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Key Name:</label>
                <input
                  type="text"
                  value={editedSong.key_name || ''}
                  onChange={(e) => handleInputChange('key_name', e.target.value)}
                  placeholder="e.g., C major, F# minor"
                />
              </div>

              <div className="form-group">
                <label>Camelot Key:</label>
                <input
                  type="text"
                  value={editedSong.camelot_key || ''}
                  onChange={(e) => handleInputChange('camelot_key', e.target.value)}
                  placeholder="e.g., 8B, 5A"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>BPM:</label>
                <input
                  type="number"
                  value={editedSong.bpm ? Math.round(editedSong.bpm) : ''}
                  onChange={(e) => handleInputChange('bpm', e.target.value)}
                  placeholder="e.g., 128"
                  min="0"
                  max="999"
                  step="0.1"
                />
              </div>

              <div className="form-group">
                <label>Energy Level:</label>
                <input
                  type="number"
                  value={editedSong.energy_level || ''}
                  onChange={(e) => handleInputChange('energy_level', e.target.value)}
                  placeholder="1-10"
                  min="1"
                  max="10"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Duration (seconds):</label>
              <input
                type="number"
                value={editedSong.duration ? Math.round(editedSong.duration * 10) / 10 : ''}
                onChange={(e) => handleInputChange('duration', e.target.value)}
                placeholder="e.g., 180.5"
                min="0"
                step="0.1"
              />
            </div>
          </div>

          <div className="metadata-section">
            <h3>File Renaming</h3>
            
            <div className="rename-options">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={renameFile}
                  onChange={(e) => setRenameFile(e.target.checked)}
                />
                Automatically rename file with key and BPM information
              </label>

              {renameFile && (
                <div className="filename-preview">
                  <label>Preview:</label>
                  <div className="preview-filename">
                    {generatePreviewFilename()}
                  </div>
                </div>
              )}
            </div>

            <div className="custom-rename">
              <h4>Custom Filename</h4>
              <div className="form-group">
                <label>New filename:</label>
                <input
                  type="text"
                  value={customFilename}
                  onChange={(e) => setCustomFilename(e.target.value)}
                  placeholder="Enter new filename (without extension)"
                />
                <button
                  className="rename-btn"
                  onClick={handleCustomRename}
                  disabled={isLoading || !customFilename.trim()}
                >
                  {isLoading ? 'Renaming...' : 'Rename File'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="metadata-editor-footer">
          <button
            className="cancel-btn"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className="save-btn"
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MetadataEditor;
