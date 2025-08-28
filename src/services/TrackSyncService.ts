import { db } from '../firebase';
import { doc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';

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
    const ref = doc(db, 'users', userId, 'tracks', String(tid));
    try {
        console.log('[FS] Upsert track', { userId, trackId: String(tid), online: typeof navigator !== 'undefined' ? navigator.onLine : undefined });
        await setDoc(ref, {
            ...track,
            updatedAt: serverTimestamp(),
        }, { merge: true });
        console.log('[FS] Upsert OK');
    } catch (e) {
        console.error('[FS] Upsert error:', e);
        throw e;
    }

}

export async function upsertManyUserTracks(userId: string, tracks: TrackMetadataPayload[]): Promise<void> {
    if (!tracks || tracks.length === 0) return;
    const batch = writeBatch(db);
    tracks.forEach((track) => {
        const tid = track.track_id || track.id;
        const ref = doc(db, 'users', userId, 'tracks', String(tid));
        batch.set(ref, { ...track, updatedAt: serverTimestamp() }, { merge: true });
    });
    try {
        console.log('[FS] Batch upsert', { count: tracks.length, userId, online: typeof navigator !== 'undefined' ? navigator.onLine : undefined });
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


