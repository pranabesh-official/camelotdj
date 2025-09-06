// Database service for Mixed In Key application
// Handles communication with Python backend database endpoints

export interface LibraryStats {
    total_files: number;
    status_counts: { [status: string]: number };
    key_distribution: { [key: string]: number };
    total_duration_hours: number;
}

export interface ScanLocation {
    id: number;
    path: string;
    name: string;
    last_scanned: string;
    files_found: number;
    is_active: boolean;
    created_at: string;
}

export class DatabaseService {
    private apiPort: number;
    private apiSigningKey: string;

    constructor(apiPort: number, apiSigningKey: string) {
        this.apiPort = apiPort;
        this.apiSigningKey = apiSigningKey;
    }

    private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
        // Always include signing key in both header and query to satisfy all server handlers
        const baseUrl = `http://127.0.0.1:${this.apiPort}`;
        // Preserve existing query params and append signingkey if missing
        let url: string;
        try {
            const hasProtocol = endpoint.startsWith('http://') || endpoint.startsWith('https://');
            const fullUrl = hasProtocol ? endpoint : `${baseUrl}${endpoint}`;
            const u = new URL(fullUrl);
            if (!u.searchParams.has('signingkey')) {
                u.searchParams.set('signingkey', this.apiSigningKey);
            }
            url = u.toString();
        } catch {
            // Fallback if URL parsing fails for any reason
            const join = endpoint.includes('?') ? '&' : '?';
            url = `${baseUrl}${endpoint}${join}signingkey=${encodeURIComponent(this.apiSigningKey)}`;
        }
        
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'X-Signing-Key': this.apiSigningKey
        };

        const response = await fetch(url, {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Get all music files from the database library
     */
    async getLibrary(statusFilter?: string): Promise<any[]> {
        try {
            const params = new URLSearchParams({ signingkey: this.apiSigningKey });
            if (statusFilter) {
                params.append('status', statusFilter);
            }

            const result = await this.makeRequest(`/library?${params}`);
            
            if (result.status === 'success') {
                return result.songs || [];
            } else {
                throw new Error(result.error || 'Failed to get library');
            }
        } catch (error) {
            console.error('Error getting library:', error);
            throw error;
        }
    }

    /**
     * Get library statistics
     */
    async getLibraryStats(): Promise<LibraryStats> {
        try {
            const params = new URLSearchParams({ signingkey: this.apiSigningKey });
            const result = await this.makeRequest(`/library/stats?${params}`);
            
            if (result.status === 'success') {
                return result.stats;
            } else {
                throw new Error(result.error || 'Failed to get library stats');
            }
        } catch (error) {
            console.error('Error getting library stats:', error);
            throw error;
        }
    }

    /**
     * Verify that all files in the library still exist
     */
    async verifyLibrary(): Promise<{ found: number; missing: number; total: number }> {
        try {
            const result = await this.makeRequest('/library/verify', {
                method: 'POST',
                body: JSON.stringify({ signingkey: this.apiSigningKey })
            });
            
            if (result.status === 'success') {
                return {
                    found: result.found,
                    missing: result.missing,
                    total: result.total
                };
            } else {
                throw new Error(result.error || 'Failed to verify library');
            }
        } catch (error) {
            console.error('Error verifying library:', error);
            throw error;
        }
    }

    /**
     * Get remembered scan locations
     */
    async getScanLocations(): Promise<ScanLocation[]> {
        try {
            const params = new URLSearchParams({ signingkey: this.apiSigningKey });
            const result = await this.makeRequest(`/scan-locations?${params}`);
            
            if (result.status === 'success') {
                return result.locations || [];
            } else {
                throw new Error(result.error || 'Failed to get scan locations');
            }
        } catch (error) {
            console.error('Error getting scan locations:', error);
            throw error;
        }
    }

    /**
     * Add a new scan location to remember
     */
    async addScanLocation(path: string, name?: string): Promise<number> {
        try {
            const result = await this.makeRequest('/scan-locations', {
                method: 'POST',
                body: JSON.stringify({
                    path,
                    name,
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status === 'success') {
                return result.location_id;
            } else {
                throw new Error(result.error || 'Failed to add scan location');
            }
        } catch (error) {
            console.error('Error adding scan location:', error);
            throw error;
        }
    }

    /**
     * Load library from database on app startup
     */
    async loadLibraryFromDatabase(): Promise<any[]> {
        try {
            console.log('Loading music library from database...');
            const songs = await this.getLibrary('found'); // Only get found files
            console.log(`Loaded ${songs.length} songs from database`);
            return songs;
        } catch (error) {
            console.warn('Could not load library from database:', error);
            return []; // Return empty array if database is not available
        }
    }

    /**
     * Get library statistics for dashboard display
     */
    async getLibraryStatsForDisplay(): Promise<{
        totalFiles: number;
        foundFiles: number;
        missingFiles: number;
        keysWithSongs: number;
        totalDurationHours: number;
        keyDistribution: { [key: string]: number };
    }> {
        try {
            const stats = await this.getLibraryStats();
            
            return {
                totalFiles: stats.total_files,
                foundFiles: stats.status_counts['found'] || 0,
                missingFiles: stats.status_counts['missing'] || 0,
                keysWithSongs: Object.keys(stats.key_distribution).length,
                totalDurationHours: stats.total_duration_hours,
                keyDistribution: stats.key_distribution
            };
        } catch (error) {
            console.warn('Could not get library stats:', error);
            return {
                totalFiles: 0,
                foundFiles: 0,
                missingFiles: 0,
                keysWithSongs: 0,
                totalDurationHours: 0,
                keyDistribution: {}
            };
        }
    }

    /**
     * Save download path setting
     */
    async saveDownloadPath(path: string): Promise<void> {
        try {
            const result = await this.makeRequest('/settings/download-path', {
                method: 'POST',
                body: JSON.stringify({
                    path,
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status !== 'success') {
                throw new Error(result.error || 'Failed to save download path');
            }
        } catch (error) {
            console.error('Error saving download path:', error);
            // Don't throw error as this is not critical for app functionality
        }
    }

    /**
     * Get download path setting
     */
    async getDownloadPath(): Promise<string | null> {
        try {
            const params = new URLSearchParams({ signingkey: this.apiSigningKey });
            const result = await this.makeRequest(`/settings/download-path?${params}`);
            
            if (result.status === 'success') {
                return result.path || null;
            } else {
                return null;
            }
        } catch (error) {
            console.error('Error getting download path:', error);
            return null;
        }
    }

    /**
     * Clear download path setting
     */
    async clearDownloadPath(): Promise<void> {
        try {
            const result = await this.makeRequest('/settings/download-path', {
                method: 'DELETE',
                body: JSON.stringify({
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status !== 'success') {
                throw new Error(result.error || 'Failed to clear download path');
            }
        } catch (error) {
            console.error('Error clearing download path:', error);
            // Don't throw error as this is not critical for app functionality
        }
    }

    /**
     * Save Gemini API key to database settings
     */
    async saveGeminiApiKey(apiKey: string): Promise<void> {
        try {
            const result = await this.makeRequest('/settings/gemini-api-key', {
                method: 'POST',
                body: JSON.stringify({
                    api_key: apiKey,
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status !== 'success') {
                throw new Error(result.error || 'Failed to save Gemini API key');
            }
        } catch (error) {
            console.error('Error saving Gemini API key:', error);
            throw error;
        }
    }

    /**
     * Get Gemini API key from database settings
     */
    async getGeminiApiKey(): Promise<string | null> {
        try {
            const params = new URLSearchParams({ signingkey: this.apiSigningKey });
            const result = await this.makeRequest(`/settings/gemini-api-key?${params}`);
            
            if (result.status === 'success') {
                return result.api_key || null;
            } else {
                return null;
            }
        } catch (error) {
            console.error('Error getting Gemini API key:', error);
            return null;
        }
    }

    /**
     * Clear Gemini API key from database settings
     */
    async clearGeminiApiKey(): Promise<void> {
        try {
            const result = await this.makeRequest('/settings/gemini-api-key', {
                method: 'DELETE',
                body: JSON.stringify({
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status !== 'success') {
                throw new Error(result.error || 'Failed to clear Gemini API key');
            }
        } catch (error) {
            console.error('Error clearing Gemini API key:', error);
            // Don't throw error as this is not critical for app functionality
        }
    }

    /**
     * Create an AI-generated playlist
     */
    async createAIPlaylist(requestData: {
        user_request: string;
        genre: string;
        bpm_min: number;
        bpm_max: number;
        target_count: number;
        download_path: string;
    }): Promise<any> {
        try {
            const result = await this.makeRequest('/ai-agent/create-playlist', {
                method: 'POST',
                body: JSON.stringify({
                    ...requestData,
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status === 'success') {
                return result;
            } else {
                throw new Error(result.error || 'Failed to create AI playlist');
            }
        } catch (error) {
            console.error('Error creating AI playlist:', error);
            throw error;
        }
    }

    /**
     * Get AI agent task status
     */
    async getAITaskStatus(taskId: string): Promise<any> {
        try {
            const result = await this.makeRequest(`/ai-agent/task/${taskId}?signingkey=${this.apiSigningKey}`, {
                method: 'GET'
            });
            
            if (result.status === 'success') {
                return result.task_progress;
            } else {
                throw new Error(result.error || 'Failed to get AI task status');
            }
        } catch (error) {
            console.error('Error getting AI task status:', error);
            throw error;
        }
    }

    /**
     * Pause AI agent task
     */
    async pauseAITask(taskId: string): Promise<void> {
        try {
            const result = await this.makeRequest(`/ai-agent/task/${taskId}/pause`, {
                method: 'POST',
                body: JSON.stringify({
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status !== 'success') {
                throw new Error(result.error || 'Failed to pause AI task');
            }
        } catch (error) {
            console.error('Error pausing AI task:', error);
            throw error;
        }
    }

    /**
     * Resume AI agent task
     */
    async resumeAITask(taskId: string): Promise<void> {
        try {
            const result = await this.makeRequest(`/ai-agent/task/${taskId}/resume`, {
                method: 'POST',
                body: JSON.stringify({
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status !== 'success') {
                throw new Error(result.error || 'Failed to resume AI task');
            }
        } catch (error) {
            console.error('Error resuming AI task:', error);
            throw error;
        }
    }

    /**
     * Cancel AI agent task
     */
    async cancelAITask(taskId: string): Promise<void> {
        try {
            const result = await this.makeRequest(`/ai-agent/task/${taskId}/cancel`, {
                method: 'POST',
                body: JSON.stringify({
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status !== 'success') {
                throw new Error(result.error || 'Failed to cancel AI task');
            }
        } catch (error) {
            console.error('Error cancelling AI task:', error);
            throw error;
        }
    }

    /**
     * Get active AI agent sessions
     */
    async getActiveAISessions(): Promise<any[]> {
        try {
            const result = await this.makeRequest(`/ai-agent/active-sessions?signingkey=${this.apiSigningKey}`, {
                method: 'GET'
            });
            
            if (result.status === 'success') {
                return result.active_sessions;
            } else {
                throw new Error(result.error || 'Failed to get active AI sessions');
            }
        } catch (error) {
            console.error('Error getting active AI sessions:', error);
            throw error;
        }
    }

    /**
     * Delete a song from the database library
     */
    async deleteSong(songId: string): Promise<void> {
        try {
            const result = await this.makeRequest('/library/delete', {
                method: 'DELETE',
                body: JSON.stringify({
                    song_id: songId,
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status !== 'success') {
                throw new Error(result.error || 'Failed to delete song');
            }
        } catch (error) {
            console.error('Error deleting song:', error);
            throw error;
        }
    }

    /**
     * Delete a song by file path from the database library
     */
    async deleteSongByPath(filePath: string): Promise<void> {
        try {
            const result = await this.makeRequest('/library/delete-by-path', {
                method: 'DELETE',
                body: JSON.stringify({
                    file_path: filePath,
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status !== 'success') {
                throw new Error(result.error || 'Failed to delete song by path');
            }
        } catch (error) {
            console.error('Error deleting song by path:', error);
            throw error;
        }
    }

    // Playlist Management Methods

    /**
     * Get all playlists from the database
     */
    async getPlaylists(): Promise<any[]> {
        try {
            const result = await this.makeRequest('/playlists');
            
            if (result.status === 'success') {
                return result.playlists || [];
            } else {
                throw new Error(result.error || 'Failed to get playlists');
            }
        } catch (error) {
            console.error('Error getting playlists:', error);
            throw error;
        }
    }

    /**
     * Create a new playlist
     */
    async createPlaylist(playlistData: {
        name: string;
        description?: string;
        color?: string;
        is_query_based?: boolean;
        query_criteria?: any;
        songs?: any[];
    }): Promise<any> {
        try {
            const result = await this.makeRequest('/playlists', {
                method: 'POST',
                body: JSON.stringify({
                    ...playlistData,
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status === 'success') {
                return result.playlist;
            } else {
                throw new Error(result.error || 'Failed to create playlist');
            }
        } catch (error) {
            console.error('Error creating playlist:', error);
            throw error;
        }
    }

    /**
     * Update a playlist
     */
    async updatePlaylist(playlistId: string, updates: {
        name?: string;
        description?: string;
        color?: string;
        is_query_based?: boolean;
        query_criteria?: any;
    }): Promise<any> {
        try {
            const result = await this.makeRequest(`/playlists/${playlistId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    ...updates,
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status === 'success') {
                return result.playlist;
            } else {
                throw new Error(result.error || 'Failed to update playlist');
            }
        } catch (error) {
            console.error('Error updating playlist:', error);
            throw error;
        }
    }

    /**
     * Delete a playlist
     */
    async deletePlaylist(playlistId: string): Promise<void> {
        try {
            const result = await this.makeRequest(`/playlists/${playlistId}`, {
                method: 'DELETE',
                body: JSON.stringify({
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status !== 'success') {
                throw new Error(result.error || 'Failed to delete playlist');
            }
        } catch (error) {
            console.error('Error deleting playlist:', error);
            throw error;
        }
    }

    /**
     * Add a song to a playlist
     */
    async addSongToPlaylist(playlistId: string, musicFileId: string, position?: number): Promise<void> {
        try {
            const result = await this.makeRequest(`/playlists/${playlistId}/songs`, {
                method: 'POST',
                body: JSON.stringify({
                    music_file_id: musicFileId,
                    position: position,
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status !== 'success') {
                throw new Error(result.error || 'Failed to add song to playlist');
            }
        } catch (error) {
            console.error('Error adding song to playlist:', error);
            throw error;
        }
    }

    /**
     * Remove a song from a playlist
     */
    async removeSongFromPlaylist(playlistId: string, musicFileId: string): Promise<void> {
        try {
            const result = await this.makeRequest(`/playlists/${playlistId}/songs/${musicFileId}`, {
                method: 'DELETE',
                body: JSON.stringify({
                    signingkey: this.apiSigningKey
                })
            });
            
            if (result.status !== 'success') {
                throw new Error(result.error || 'Failed to remove song from playlist');
            }
        } catch (error) {
            console.error('Error removing song from playlist:', error);
            throw error;
        }
    }
}

export default DatabaseService;