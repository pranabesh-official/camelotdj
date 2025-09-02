import React, { useState, useEffect } from 'react';
import './USBExport.css';

interface USBDevice {
  name: string;
  path: string;
  total_space_gb: number;
  free_space_gb: number;
  used_space_gb: number;
  free_space_percent: number;
  type: string;
}

interface Playlist {
  id: string;
  name: string;
  songs: Array<{
    id: string;
    filename: string;
    file_path?: string;
  }>;
}

interface USBExportProps {
  playlist: Playlist | null;
  onClose: () => void;
}

// Professional SVG icons
const USBIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 2v7.31"/>
    <path d="M15 2v7.31"/>
    <path d="M8 9.31V2"/>
    <path d="M17 9.31V2"/>
    <path d="M12 9.31V2"/>
    <path d="M2 9.31V2"/>
    <path d="M20 9.31V2"/>
    <path d="M2 9.31h20"/>
    <path d="M2 9.31v4.69a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9.31"/>
  </svg>
);

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M23 4v6h-6"/>
    <path d="M1 20v-6h6"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const ExportIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7,10 12,15 17,10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const CancelIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const USBExport: React.FC<USBExportProps> = ({ playlist, onClose }) => {
  const [usbDevices, setUsbDevices] = useState<USBDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<USBDevice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUSBDevices();
  }, []);

  const getUSBDevices = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('http://localhost:5002/api/usb/devices?signingkey=devkey');
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUsbDevices(data.devices);
          console.log('USB devices loaded:', data.devices.length);
        } else {
          setError(data.error || 'Failed to get USB devices');
        }
      } else {
        setError('Failed to get USB devices');
      }
    } catch (err) {
      console.error('Error getting USB devices:', err);
      setError('Failed to get USB devices');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    if (!selectedDevice || !playlist) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const exportData = {
        playlist: {
          name: playlist.name,
          songs: playlist.songs.map(song => ({
            filename: song.filename,
            file_path: song.file_path
          }))
        },
        usb_path: selectedDevice.path
      };
      
      const response = await fetch('http://localhost:5002/api/usb/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signing-Key': 'devkey'
        },
        body: JSON.stringify(exportData)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          alert(`Playlist "${playlist.name}" exported successfully to ${selectedDevice.name}`);
          onClose();
        } else {
          setError(data.error || 'Export failed');
        }
      } else {
        setError('Export failed - server error');
      }
    } catch (err) {
      console.error('Export error:', err);
      setError('Export failed - network error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!playlist) return null;

  // Filter USB storage devices
  const storageDevices = usbDevices.filter(device => device.type === 'usb_storage');
  const otherDevices = usbDevices.filter(device => device.type !== 'usb_storage');

  return (
    <div className="usb-export-overlay">
      <div className="usb-export-modal">
        <div className="modal-header">
          <div className="header-content">
            <USBIcon />
            <h3>Export Playlist to USB</h3>
          </div>
          <button className="close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        
        <div className="modal-body">
          <div className="playlist-info">
            <h4>{playlist.name}</h4>
            <p>{playlist.songs.length} tracks</p>
          </div>
          
          <div className="usb-devices-section">
            <div className="section-header">
              <h4>USB Devices</h4>
              <button 
                className="refresh-btn"
                onClick={getUSBDevices}
                disabled={isLoading}
                title="Refresh USB devices"
              >
                <RefreshIcon />
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            
            {!selectedDevice && (
              <div className="device-selection-hint">
                <p>Select a USB device to export your playlist</p>
              </div>
            )}
            
            {isLoading ? (
              <div className="loading">Loading USB devices...</div>
            ) : storageDevices.length === 0 ? (
              <div className="no-devices">
                <p>No USB storage devices detected</p>
                <p className="hint">Connect a USB drive or external hard drive and click Refresh</p>
                {otherDevices.length > 0 && (
                  <div className="other-devices-info">
                    <p className="info-text">
                      Found {otherDevices.length} other USB devices (mouse, keyboard, etc.) but no storage devices.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="device-list">
                {storageDevices.map((device, index) => (
                  <div
                    key={index}
                    className={`device-item ${selectedDevice?.path === device.path ? 'selected' : ''}`}
                    onClick={() => setSelectedDevice(device)}
                  >
                    <div className="device-info">
                      <div className="device-name">{device.name}</div>
                      <div className="device-path">{device.path}</div>
                    </div>
                    <div className="device-status">
                      <div className="device-space">
                        <span className="free-space">
                          {device.free_space_gb.toFixed(1)} GB free
                        </span>
                        <span className="total-space">
                          of {device.total_space_gb.toFixed(1)} GB
                        </span>
                      </div>
                      <div className="space-bar">
                        <div 
                          className="space-used"
                          style={{ width: `${100 - device.free_space_percent}%` }}
                        />
                      </div>
                      <span className="space-percent">
                        {device.free_space_percent.toFixed(1)}% free
                      </span>
                      {selectedDevice?.path === device.path && (
                        <div className="selected-indicator">✓</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>
        
        <div className="modal-actions">
          <button onClick={onClose} className="cancel-btn">
            <CancelIcon />
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={!selectedDevice || isLoading}
            className="export-btn"
            title={!selectedDevice ? 'Please select a USB device first' : 'Export to USB'}
          >
            <ExportIcon />
            {isLoading ? 'Exporting...' : !selectedDevice ? 'Select Device First' : 'Export to USB'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default USBExport;
