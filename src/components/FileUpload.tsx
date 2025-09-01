import React, { useCallback, useState } from 'react';

// Professional SVG icons
const MusicIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="18" cy="16" r="3"/>
  </svg>
);

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

interface FileUploadProps {
    onFileUpload: (file: File) => void;
    onMultiFileUpload?: (files: File[]) => void;
    onFolderUpload?: (files: FileList) => void;
    isAnalyzing: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, onMultiFileUpload, onFolderUpload, isAnalyzing }) => {
    const [dragOver, setDragOver] = useState(false);
    
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    }, []);
    
    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
    }, []);
    
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        
        const files = Array.from(e.dataTransfer.files);
        const musicFiles = files.filter(file => 
            file.type.startsWith('audio/') || 
            /\\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(file.name)
        );
        
        if (musicFiles.length === 0) {
            alert('Please upload valid audio files (MP3, WAV, FLAC, AAC, OGG, M4A)');
            return;
        }
        
        if (musicFiles.length === 1) {
            onFileUpload(musicFiles[0]);
        } else if (onMultiFileUpload) {
            onMultiFileUpload(musicFiles);
        } else {
            // Fallback to single file upload for the first file
            onFileUpload(musicFiles[0]);
        }
    }, [onFileUpload, onMultiFileUpload]);
    
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            const fileArray = Array.from(files);
            if (fileArray.length === 1) {
                onFileUpload(fileArray[0]);
            } else if (onMultiFileUpload) {
                onMultiFileUpload(fileArray);
            } else {
                // Fallback to single file upload for the first file
                onFileUpload(fileArray[0]);
            }
        }
        // Reset input value to allow selecting the same file again
        e.target.value = '';
    }, [onFileUpload, onMultiFileUpload]);
    
    const handleFolderSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0 && onFolderUpload) {
            onFolderUpload(files);
        }
        // Reset input value
        e.target.value = '';
    }, [onFolderUpload]);
    
    return (
        <div className="file-upload-container">
            <h2>Add Music to Your Library</h2>
            <p>Upload music files to analyze their key, BPM, and energy level for harmonic mixing.</p>
            
            <div 
                className={`drop-zone ${dragOver ? 'drag-over' : ''} ${isAnalyzing ? 'analyzing' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {isAnalyzing ? (
                    <div className="analyzing-state">
                        <div className="spinner"></div>
                        <h3>Analyzing Music...</h3>
                        <p>Detecting key, BPM, and energy level</p>
                    </div>
                ) : (
                    <div className="upload-state">
                        <div className="upload-icon">
                            <MusicIcon />
                        </div>
                        <h3>Drag & Drop Music Files Here</h3>
                        <p>Select multiple files or folders for batch analysis</p>
                        <label className="file-input-label">
                            <input 
                                type="file" 
                                multiple
                                accept=".mp3,.wav,.flac,.aac,.ogg,.m4a,audio/*"
                                onChange={handleFileSelect}
                                disabled={isAnalyzing}
                            />
                            Choose Files
                        </label>
                        {/* {onFolderUpload && (
                            <label className="folder-upload-btn">
                                <input 
                                    type="file" 
                                    {...({ webkitdirectory: "", directory: "" } as any)}
                                    multiple
                                    accept=".mp3,.wav,.flac,.aac,.ogg,.m4a,audio/*"
                                    onChange={handleFolderSelect}
                                    disabled={isAnalyzing}
                                />
                                <FolderIcon />
                                Choose Folder
                            </label>
                        )} */}
                        <div className="supported-formats">
                            <small>Supported formats: MP3, WAV, FLAC, AAC, OGG, M4A</small>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="upload-tips">
                <h3>Tips for Best Results:</h3>
                <ul>
                    <li>Use high-quality audio files for more accurate analysis</li>
                    <li>Ensure files are not corrupted or heavily compressed</li>
                    <li>Analysis may take a few seconds depending on file size</li>
                    <li>Results include Camelot key notation for easy harmonic mixing</li>
                </ul>
            </div>
        </div>
    );
};

export default FileUpload;