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
        const url = `http://127.0.0.1:${this.apiPort}${endpoint}`;
        
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
}

export default DatabaseService;