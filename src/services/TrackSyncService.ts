export interface TrackMetadataPayload {
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
    bitrate?: number;
    analysis_date?: string;
    cue_points?: number[];
    track_id?: string;
    id3?: any;
}

// Bypassed for "simple app" mode
export async function upsertUserTrack(userId: string, track: TrackMetadataPayload): Promise<void> {
    console.log('[TrackSyncService] upsertUserTrack bypassed in simple mode');
}

export async function upsertManyUserTracks(userId: string, tracks: TrackMetadataPayload[]): Promise<void> {
    console.log('[TrackSyncService] upsertManyUserTracks bypassed in simple mode');
}

export async function writeAuthHealth(userId: string): Promise<void> {
    console.log('[TrackSyncService] writeAuthHealth bypassed in simple mode');
}

export async function saveToAnalysisSongs(userId: string, track: TrackMetadataPayload): Promise<void> {
    console.log('[TrackSyncService] saveToAnalysisSongs bypassed in simple mode');
}
