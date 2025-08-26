import React, { useCallback, useState } from 'react';

interface FileUploadProps {
    onFileUpload: (file: File) => void;
    onFolderUpload?: (files: FileList) => void;
    isAnalyzing: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, onFolderUpload, isAnalyzing }) => {
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
        const musicFile = files.find(file => 
            file.type.startsWith('audio/') || 
            /\\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(file.name)
        );
        
        if (musicFile) {
            onFileUpload(musicFile);
        } else {
            alert('Please upload a valid audio file (MP3, WAV, FLAC, AAC, OGG, M4A)');
        }
    }, [onFileUpload]);
    
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
            onFileUpload(file);
        }
        // Reset input value to allow selecting the same file again
        e.target.value = '';
    }, [onFileUpload]);
    
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
                        <div className="upload-icon">🎵</div>
                        <h3>Drag & Drop Music Files Here</h3>
                        <p>or</p>
                        <label className="file-input-label">
                            <input 
                                type="file" 
                                accept=".mp3,.wav,.flac,.aac,.ogg,.m4a,audio/*"
                                onChange={handleFileSelect}
                                disabled={isAnalyzing}
                            />
                            Choose Files
                        </label>
                        {onFolderUpload && (
                            <label className="folder-upload-btn">
                                <input 
                                    type="file" 
                                    {...({ webkitdirectory: "", directory: "" } as any)}
                                    multiple
                                    accept=".mp3,.wav,.flac,.aac,.ogg,.m4a,audio/*"
                                    onChange={handleFolderSelect}
                                    disabled={isAnalyzing}
                                />
                                📁 Choose Folder
                            </label>
                        )}
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