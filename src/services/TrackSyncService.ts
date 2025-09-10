import { db } from '../firebase';
import { doc, setDoc, serverTimestamp, writeBatch, collection } from 'firebase/firestore';

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

export async function upsertUserTrack(userId: string, track: TrackMetadataPayload): Promise<void> {
    // Store per-user track under users/{uid}/tracks/{track_id}
    const tid = track.track_id || track.id;
    if (!tid || tid === 'undefined' || tid === 'null') {
        console.error('[FS] Error: No valid track_id or id provided for track', track.filename, 'track_id:', track.track_id, 'id:', track.id);
        throw new Error('No valid track_id or id provided for Firestore sync');
    }
    
    const ref = doc(db, 'users', userId, 'tracks', String(tid));
    try {
        console.log('[FS] Upsert track', { 
            userId, 
            trackId: String(tid), 
            filename: track.filename,
            path: `users/${userId}/tracks/${String(tid)}`,
            online: typeof navigator !== 'undefined' ? navigator.onLine : undefined 
        });
        
        // Ensure we have a valid object to save
        const trackToSave = {
            ...track,
            updatedAt: serverTimestamp(),
        };
        
        await setDoc(ref, trackToSave, { merge: true });
        console.log('[FS] Upsert OK for track:', track.filename);
    } catch (e) {
        console.error('[FS] Upsert error:', e);
        throw e;
    }
}

export async function upsertManyUserTracks(userId: string, tracks: TrackMetadataPayload[]): Promise<void> {
    if (!tracks || tracks.length === 0) {
        console.log('[FS] No tracks to batch upsert');
        return;
    }
    
    // Filter out tracks without track_id or id
    const validTracks = tracks.filter(track => {
        const tid = track.track_id || track.id;
        if (!tid || tid === 'undefined' || tid === 'null') {
            console.error('[FS] Skipping track with no valid track_id or id:', track.filename, 'track_id:', track.track_id, 'id:', track.id);
            return false;
        }
        return true;
    });
    
    if (validTracks.length === 0) {
        console.error('[FS] No valid tracks to batch upsert after filtering');
        return;
    }
    
    const batch = writeBatch(db);
    const trackIds: string[] = [];
    
    validTracks.forEach((track) => {
        const tid = track.track_id || track.id;
        const ref = doc(db, 'users', userId, 'tracks', String(tid));
        batch.set(ref, { ...track, updatedAt: serverTimestamp() }, { merge: true });
        trackIds.push(String(tid));
    });
    
    try {
        console.log('[FS] Batch upsert', { 
            count: validTracks.length, 
            userId, 
            trackIds,
            online: typeof navigator !== 'undefined' ? navigator.onLine : undefined 
        });
        await batch.commit();
        console.log('[FS] Batch upsert OK');
    } catch (e) {
        console.error('[FS] Batch upsert error:', e);
        throw e;
    }

}

export async function writeAuthHealth(userId: string): Promise<void> {
    const ref = doc(db, 'users', userId, '_meta', 'health');
    try {
        console.log('[FS] Health check write for user', userId);
        await setDoc(ref, { ok: true, at: serverTimestamp() }, { merge: true });
        console.log('[FS] Health check OK');
    } catch (e) {
        console.error('[FS] Health check error:', e);
        throw e;
    }
}

/**
 * Save song analysis data to the global analysis_songs collection
 * This allows sharing analysis data across users
 */
export async function saveToAnalysisSongs(userId: string, track: TrackMetadataPayload): Promise<void> {
    // Use track_id or id as the document ID in analysis_songs collection
    const tid = track.track_id || track.id;
    if (!tid || tid === 'undefined' || tid === 'null') {
        console.error('[FS] Error: No valid track_id or id provided for analysis_songs', track.filename, 'track_id:', track.track_id, 'id:', track.id);
        throw new Error('No valid track_id or id provided for analysis_songs sync');
    }
    
    const ref = doc(db, 'analysis_songs', String(tid));
    try {
        console.log('[FS] Saving to analysis_songs', { 
            userId, 
            trackId: String(tid), 
            filename: track.filename,
            path: `analysis_songs/${String(tid)}`,
            online: typeof navigator !== 'undefined' ? navigator.onLine : undefined 
        });
        
        // Prepare data to save - include user info and metadata
        const dataToSave = {
            ...track,
            user_id: userId,
            username: track.id3?.artist || 'Unknown',
            title: track.id3?.title || track.filename,
            artist: track.id3?.artist || 'Unknown',
            album: track.id3?.album || 'Unknown',
            genre: track.id3?.genre || 'Unknown',
            year: track.id3?.year || '',
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
        };
        
        await setDoc(ref, dataToSave, { merge: true });
        console.log('[FS] Save to analysis_songs OK for track:', track.filename);
    } catch (e) {
        console.error('[FS] Save to analysis_songs error:', e);
        throw e;
    }
}


