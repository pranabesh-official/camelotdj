import React, { useState, useCallback, useMemo } from 'react';
import { InMemoryCache } from "apollo-cache-inmemory";
import { ApolloClient } from "apollo-client";
import { HttpLink } from "apollo-link-http";
import fetch from "isomorphic-fetch";
import './App.css';
import MusicLibrary from './components/MusicLibrary';
import FileUpload from './components/FileUpload';
import CamelotWheel from './components/CamelotWheel';
import AnalysisResults from './components/AnalysisResults';

const ipcRenderer = (window as any).isInElectronRenderer
        ? (window as any).nodeRequire("electron").ipcRenderer
        : (window as any).ipcRendererStub;

export interface Song {
    id: string;
    filename: string;
    file_path?: string;
    key?: string;
    scale?: string;
    key_name?: string;
    camelot_key?: string;
    bpm?: number;
    energy_level?: number;
    duration?: number;
    file_size?: number;
    status?: string;
    analysis_date?: string;
}

const App: React.FC = () => {
    const [songs, setSongs] = useState<Song[]>([]);
    const [selectedSong, setSelectedSong] = useState<Song | null>(null);
    const [apiPort, setApiPort] = useState(5001); // Default to our running backend
    const [apiSigningKey, setApiSigningKey] = useState("devkey"); // Default signing key
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [currentView, setCurrentView] = useState<'library' | 'upload' | 'wheel'>('upload'); // Start with upload view

    const appGlobalClient = useMemo(() => {
        return new ApolloClient({
            cache: new InMemoryCache(),
            link: new HttpLink({
                fetch: (fetch as any),
                uri: "http://127.0.0.1:" + apiPort + "/graphql/",
            }),
        });
    }, [apiPort]);

    const handleFileUpload = useCallback(async (file: File) => {
        if (!apiSigningKey || apiPort === 0) {
            alert("API not ready. Please wait for the application to initialize.");
            return;
        }

        setIsAnalyzing(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('signingkey', apiSigningKey);

        try {
            const response = await fetch(`http://127.0.0.1:${apiPort}/upload-analyze`, {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();
            
            if (result.status === 'success') {
                const newSong: Song = {
                    id: Date.now().toString(),
                    filename: result.filename,
                    file_path: result.file_path,
                    key: result.key,
                    scale: result.scale,
                    key_name: result.key_name,
                    camelot_key: result.camelot_key,
                    bpm: result.bpm,
                    energy_level: result.energy_level,
                    duration: result.duration,
                    file_size: result.file_size,
                    status: 'analyzed',
                    analysis_date: new Date().toISOString()
                };
                
                setSongs(prevSongs => [...prevSongs, newSong]);
                setSelectedSong(newSong);
                setCurrentView('library');
            } else {
                alert(`Analysis failed: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Upload/analysis error:', error);
            alert(`Upload failed: ${error}`);
        } finally {
            setIsAnalyzing(false);
        }
    }, [apiSigningKey, apiPort]);

    const handleSongSelect = useCallback((song: Song) => {
        setSelectedSong(song);
    }, []);

    const handleDeleteSong = useCallback(async (songId: string) => {
        // Simple deletion for clean version - just remove from local state
        setSongs(prevSongs => prevSongs.filter(song => song.id !== songId));
        if (selectedSong && selectedSong.id === songId) {
            setSelectedSong(null);
        }
        // Return resolved promise to satisfy TypeScript requirement
        return Promise.resolve();
    }, [selectedSong]);

    const getCompatibleSongs = useCallback((targetKey: string) => {
        return songs.filter(song => {
            if (!song.camelot_key || !targetKey) return false;
            
            // Simple compatibility check - this could be enhanced
            const targetNum = parseInt(targetKey.slice(0, -1));
            const targetLetter = targetKey.slice(-1);
            const songNum = parseInt(song.camelot_key.slice(0, -1));
            const songLetter = song.camelot_key.slice(-1);
            
            // Same key, adjacent keys, or relative major/minor
            return (
                song.camelot_key === targetKey || // Same key
                (songLetter === targetLetter && Math.abs(songNum - targetNum) <= 1) || // Adjacent
                (songNum === targetNum && songLetter !== targetLetter) // Relative
            );
        });
    }, [songs]);

    return (
        <div className="App">
            <header className="App-header">
                <div className="header-content">
                    <h1>Mixed In Key - Music Analyzer</h1>
                    <nav className="nav-tabs">
                        <button 
                            className={currentView === 'library' ? 'active' : ''}
                            onClick={() => setCurrentView('library')}
                        >
                            Music Library ({songs.length})
                        </button>
                        <button 
                            className={currentView === 'upload' ? 'active' : ''}
                            onClick={() => setCurrentView('upload')}
                        >
                            Add Songs
                        </button>
                        <button 
                            className={currentView === 'wheel' ? 'active' : ''}
                            onClick={() => setCurrentView('wheel')}
                        >
                            Camelot Wheel
                        </button>
                    </nav>
                </div>
            </header>

            <main className="App-main">
                <div className="main-content">
                    {currentView === 'library' && (
                        <div className="library-view">
                            <MusicLibrary 
                                songs={songs}
                                selectedSong={selectedSong}
                                onSongSelect={handleSongSelect}
                                onDeleteSong={handleDeleteSong}
                                getCompatibleSongs={getCompatibleSongs}
                            />
                        </div>
                    )}
                    
                    {currentView === 'upload' && (
                        <div className="upload-view">
                            <FileUpload 
                                onFileUpload={handleFileUpload}
                                isAnalyzing={isAnalyzing}
                            />
                        </div>
                    )}
                    
                    {currentView === 'wheel' && (
                        <div className="wheel-view">
                            <CamelotWheel 
                                songs={songs}
                                selectedSong={selectedSong}
                                onSongSelect={handleSongSelect}
                            />
                        </div>
                    )}
                </div>
                
                {selectedSong && (
                    <div className="sidebar">
                        <AnalysisResults 
                            song={selectedSong}
                            compatibleSongs={getCompatibleSongs(selectedSong.camelot_key || '')}
                        />
                    </div>
                )}
            </main>
        </div>
    );
};

export default App;