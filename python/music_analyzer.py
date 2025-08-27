import librosa
import numpy as np
from typing import Dict, Any, Tuple, List, Union, Optional
from mutagen.easyid3 import EasyID3  # type: ignore
from mutagen.id3 import ID3, COMM, ID3NoHeaderError  # type: ignore
import os

# Try to import Essentia with proper error handling
try:
    import essentia.standard as es  # type: ignore
    ESSENTIA_AVAILABLE = True
except ImportError:
    ESSENTIA_AVAILABLE = False
    es = None

class MusicAnalyzer:
    """
    A comprehensive music analyzer that extracts key, BPM, and energy information
    from audio files using librosa and essentia libraries.
    """
    
    # Camelot Wheel mapping
    CAMELOT_WHEEL = {
        # Minor keys (inner wheel)
        'A minor': '8A', 'A# minor': '3A', 'B minor': '10A', 'C minor': '5A',
        'C# minor': '12A', 'D minor': '7A', 'D# minor': '2A', 'E minor': '9A',
        'F minor': '4A', 'F# minor': '11A', 'G minor': '6A', 'G# minor': '1A',
        'Bb minor': '3A', 'Db minor': '12A', 'Eb minor': '2A', 'Ab minor': '1A',
        
        # Major keys (outer wheel)
        'A major': '11B', 'A# major': '6B', 'B major': '1B', 'C major': '8B',
        'C# major': '3B', 'D major': '10B', 'D# major': '5B', 'E major': '12B',
        'F major': '7B', 'F# major': '2B', 'G major': '9B', 'G# major': '4B',
        'Bb major': '6B', 'Db major': '3B', 'Eb major': '5B', 'Ab major': '4B'
    }
    
    def __init__(self):
        # Initialize Essentia algorithms
        self.key_detector: Optional[Any] = None
        self.rhythm_detector: Optional[Any] = None
        
        if ESSENTIA_AVAILABLE and es is not None:
            try:
                # Try different possible names for KeyExtractor
                key_detector_classes = ['KeyExtractor', 'Key']
                for class_name in key_detector_classes:
                    if hasattr(es, class_name):
                        self.key_detector = getattr(es, class_name)()
                        break
                
                # Try different possible names for RhythmExtractor
                rhythm_detector_classes = ['RhythmExtractor2013', 'RhythmExtractor']
                for class_name in rhythm_detector_classes:
                    if hasattr(es, class_name):
                        self.rhythm_detector = getattr(es, class_name)()
                        break
            except Exception as e:
                print(f"Warning: Failed to initialize Essentia algorithms: {e}")
                self.key_detector = None
                self.rhythm_detector = None
        
    def analyze_audio_file(self, file_path: str) -> Dict[str, Any]:
        """
        Analyze an audio file and return comprehensive analysis results.
        
        Args:
            file_path (str): Path to the audio file
            
        Returns:
            Dict[str, Any]: Analysis results including key, BPM, energy, etc.
        """
        try:
            # Load audio file
            audio, sr = librosa.load(file_path, sr=44100)
            
            # Perform all analyses
            key_info = self._analyze_key(audio, sr)
            bpm_info = self._analyze_bpm(audio, sr)
            energy_info = self._analyze_energy(audio, sr)
            cue_points = self._detect_cue_points(audio, sr)
            
            # Get file info
            file_info = self._get_file_info(file_path)
            
            return {
                **file_info,
                **key_info,
                **bpm_info,
                **energy_info,
                'cue_points': cue_points,
                'status': 'success'
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'error_message': str(e),
                'filename': os.path.basename(file_path) if file_path else 'Unknown'
            }
    
    def _analyze_key(self, audio: np.ndarray, sr: Union[int, float]) -> Dict[str, Any]:
        """Analyze musical key using Essentia's KeyExtractor if available, otherwise use librosa."""
        try:
            # Try Essentia for key detection if available
            if self.key_detector is not None:
                try:
                    key, scale, strength = self.key_detector(audio)
                    
                    # Format key name
                    key_name = f"{key} {scale}"
                    
                    # Get Camelot notation
                    camelot_key = self.CAMELOT_WHEEL.get(key_name, 'Unknown')
                    
                    essentia_success = True
                except Exception:
                    essentia_success = False
                    key, scale, strength = 'Unknown', 'Unknown', 0.0
                    key_name = 'Unknown'
                    camelot_key = 'Unknown'
            else:
                essentia_success = False
                key, scale, strength = 'Unknown', 'Unknown', 0.0
                key_name = 'Unknown'
                camelot_key = 'Unknown'
            
            # Use librosa for key estimation (as backup or primary method)
            chroma = librosa.feature.chroma_stft(y=audio, sr=sr)
            chroma_mean = np.mean(chroma, axis=1)
            key_index = np.argmax(chroma_mean)
            
            # Chromatic scale
            notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
            estimated_key = notes[key_index]
            
            # If Essentia failed, try to provide a better estimate
            if not essentia_success:
                # Simple major/minor detection based on chroma profile
                # This is a basic heuristic - not as accurate as Essentia
                major_profile = np.array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1])
                minor_profile = np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0])
                
                # Shift profiles to match detected key
                major_shifted = np.roll(major_profile, key_index)
                minor_shifted = np.roll(minor_profile, key_index)
                
                # Calculate correlation with major and minor profiles
                major_corr = np.corrcoef(chroma_mean, major_shifted)[0, 1]
                minor_corr = np.corrcoef(chroma_mean, minor_shifted)[0, 1]
                
                if not np.isnan(major_corr) and not np.isnan(minor_corr):
                    if major_corr > minor_corr:
                        scale = 'major'
                        strength = float(major_corr)
                    else:
                        scale = 'minor'
                        strength = float(minor_corr)
                    
                    key = estimated_key
                    key_name = f"{key} {scale}"
                    camelot_key = self.CAMELOT_WHEEL.get(key_name, 'Unknown')
            
            return {
                'key': key,
                'scale': scale,
                'key_name': key_name,
                'camelot_key': camelot_key,
                'key_strength': float(strength),
                'estimated_key_librosa': estimated_key,
                'essentia_available': self.key_detector is not None
            }
            
        except Exception as e:
            return {
                'key': 'Unknown',
                'scale': 'Unknown',
                'key_name': 'Unknown',
                'camelot_key': 'Unknown',
                'key_strength': 0.0,
                'estimated_key_librosa': 'Unknown',
                'essentia_available': False,
                'error': str(e)
            }
    
    def _analyze_bpm(self, audio: np.ndarray, sr: Union[int, float]) -> Dict[str, Any]:
        """Analyze BPM using both Essentia and librosa."""
        try:
            # Try Essentia rhythm analysis if available
            if self.rhythm_detector is not None:
                try:
                    bpm, beats, beats_confidence, _, beats_intervals = self.rhythm_detector(audio)
                    essentia_success = True
                except Exception:
                    essentia_success = False
                    bpm, beats, beats_confidence = 120.0, [], 0.0
            else:
                essentia_success = False
                bpm, beats, beats_confidence = 120.0, [], 0.0
            
            # Librosa tempo estimation (always try this as backup)
            try:
                tempo, _ = librosa.beat.beat_track(y=audio, sr=sr)
                # Convert tempo to scalar value safely
                tempo_value = float(np.asarray(tempo).flatten()[0]) if hasattr(tempo, '__len__') else float(tempo)
            except Exception:
                tempo_value = 120.0
            
            # Use Essentia BPM if available, otherwise use librosa
            final_bpm = float(bpm) if essentia_success else tempo_value
            
            return {
                'bpm': final_bpm,
                'bpm_librosa': tempo_value,
                'beats_confidence': float(beats_confidence),
                'beat_count': len(beats) if isinstance(beats, (list, np.ndarray)) else 0,
                'essentia_available': self.rhythm_detector is not None,
                'essentia_success': essentia_success
            }
            
        except Exception as e:
            # Final fallback
            try:
                tempo, _ = librosa.beat.beat_track(y=audio, sr=sr)
                tempo_value = float(np.asarray(tempo).flatten()[0]) if hasattr(tempo, '__len__') else float(tempo)
                
                return {
                    'bpm': tempo_value,
                    'bpm_librosa': tempo_value,
                    'beats_confidence': 0.0,
                    'beat_count': 0,
                    'essentia_available': False,
                    'warning': 'Both Essentia and advanced librosa analysis failed, using basic tempo detection'
                }
            except Exception as e2:
                return {
                    'bpm': 120.0,  # Default BPM
                    'bpm_librosa': 120.0,
                    'beats_confidence': 0.0,
                    'beat_count': 0,
                    'essentia_available': False,
                    'error': f"BPM analysis failed: {str(e2)}"
                }
    
    def _analyze_energy(self, audio: np.ndarray, sr: Union[int, float]) -> Dict[str, Any]:
        """Analyze energy level and other perceptual features."""
        try:
            # RMS energy
            rms = librosa.feature.rms(y=audio)[0]
            rms_mean = np.mean(rms)
            rms_std = np.std(rms)
            
            # Spectral centroid (brightness)
            spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
            brightness = np.mean(spectral_centroid)
            
            # Spectral rolloff
            spectral_rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr)[0]
            rolloff_mean = np.mean(spectral_rolloff)
            
            # Zero crossing rate (relates to percussiveness)
            zcr = librosa.feature.zero_crossing_rate(audio)[0]
            zcr_mean = np.mean(zcr)
            
            # MFCC features for timbral characteristics
            mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
            mfcc_mean = np.mean(mfccs, axis=1)
            
            # Calculate overall energy level (1-10 scale)
            # Normalize and combine multiple features
            energy_factors = [
                rms_mean * 10,  # RMS energy
                brightness / 5000,  # Spectral brightness
                zcr_mean * 20,  # Percussiveness
                rolloff_mean / 10000  # High frequency content
            ]
            
            raw_energy = np.mean(energy_factors)
            energy_level = max(1, min(10, int(raw_energy * 5) + 1))
            
            return {
                'energy_level': energy_level,
                'raw_energy': float(raw_energy),
                'rms_energy': float(rms_mean),
                'rms_std': float(rms_std),
                'brightness': float(brightness),
                'spectral_rolloff': float(rolloff_mean),
                'zero_crossing_rate': float(zcr_mean),
                'mfcc_1': float(mfcc_mean[0]),
                'mfcc_2': float(mfcc_mean[1])
            }
            
        except Exception as e:
            return {
                'energy_level': 5,  # Default medium energy
                'raw_energy': 0.5,
                'rms_energy': 0.0,
                'error': str(e)
            }
    
    def _get_file_info(self, file_path: str) -> Dict[str, Any]:
        """Get basic file information."""
        try:
            file_size = os.path.getsize(file_path)
            filename = os.path.basename(file_path)
            file_ext = os.path.splitext(filename)[1].lower()
            
            # Get audio duration
            try:
                audio, sr = librosa.load(file_path, sr=None)
                duration = len(audio) / sr
            except:
                duration = 0.0
            
            return {
                'filename': filename,
                'file_path': file_path,
                'file_size': file_size,
                'file_extension': file_ext,
                'duration': float(duration)
            }
            
        except Exception as e:
            return {
                'filename': os.path.basename(file_path) if file_path else 'Unknown',
                'file_path': file_path or 'Unknown',
                'file_size': 0,
                'file_extension': '',
                'duration': 0.0,
                'file_info_error': str(e)
            }
    
    def get_compatible_keys(self, camelot_key: str) -> Dict[str, Union[List[str], str]]:
        """
        Get harmonically compatible keys according to the Camelot wheel system.
        
        Args:
            camelot_key (str): Camelot key notation (e.g., '8A', '5B')
            
        Returns:
            Dict[str, Union[List[str], str]]: Compatible keys for different mixing techniques or error message
        """
        if not camelot_key or camelot_key == 'Unknown':
            return {'error': 'Invalid camelot key'}
        
        try:
            # Parse the key
            if len(camelot_key) < 2:
                return {'error': 'Invalid camelot key format'}
            
            number = int(camelot_key[:-1])
            letter = camelot_key[-1]
            
            # Perfect matches (same key)
            perfect = [camelot_key]
            
            # Adjacent keys (up/down one semitone)
            adjacent = []
            for offset in [-1, 1]:
                new_number = ((number - 1 + offset) % 12) + 1
                adjacent.append(f"{new_number}{letter}")
            
            # Relative major/minor
            relative = []
            new_letter = 'B' if letter == 'A' else 'A'
            relative.append(f"{number}{new_letter}")
            
            # Compatible for energy mixing (adjacent + relative)
            energy_compatible = adjacent + relative
            
            return {
                'perfect_match': perfect,
                'adjacent': adjacent,
                'relative': relative,
                'energy_compatible': energy_compatible,
                'all_compatible': perfect + adjacent + relative
            }
            
        except Exception as e:
            return {'error': f'Error calculating compatible keys: {str(e)}'}

    def _detect_cue_points(self, audio: np.ndarray, sr: Union[int, float]) -> List[float]:
        """Detect cue points using onsets and beats; return up to 8 seconds values."""
        try:
            onset_env = librosa.onset.onset_strength(y=audio, sr=sr)
            onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
            onset_times = librosa.frames_to_time(onsets, sr=sr)
            tempo, beats = librosa.beat.beat_track(y=audio, sr=sr)
            beat_times = librosa.frames_to_time(beats, sr=sr)
            candidates = np.unique(np.concatenate([onset_times, beat_times]))
            filtered = [t for t in candidates if t > 3.0]
            if len(filtered) > 8:
                step = max(1, int(len(filtered) / 8))
                filtered = filtered[::step][:8]
            return [float(round(t, 2)) for t in filtered[:8]]
        except Exception:
            return []
    
    def generate_waveform_data(self, file_path: str, samples: int = 1000) -> List[float]:
        """Generate waveform data for visualization.
        
        Args:
            file_path (str): Path to the audio file
            samples (int): Number of waveform samples to generate
            
        Returns:
            List[float]: Normalized waveform data points (0-1 range)
        """
        try:
            # Load audio with librosa
            audio, sr = librosa.load(file_path, sr=22050)  # Lower sample rate for faster processing
            
            # Calculate the duration and chunk size
            duration = len(audio) / sr
            chunk_size = len(audio) // samples
            
            if chunk_size == 0:
                chunk_size = 1
            
            waveform_data = []
            
            # Process audio in chunks to create waveform points
            for i in range(0, len(audio), chunk_size):
                chunk = audio[i:i+chunk_size]
                if len(chunk) > 0:
                    # Calculate RMS (root mean square) for this chunk
                    rms = np.sqrt(np.mean(chunk**2))
                    waveform_data.append(float(rms))
                    
                # Stop when we have enough samples
                if len(waveform_data) >= samples:
                    break
            
            # Ensure we have exactly the requested number of samples
            while len(waveform_data) < samples:
                waveform_data.append(0.0)
            
            waveform_data = waveform_data[:samples]
            
            # Normalize to 0-1 range
            if waveform_data and max(waveform_data) > 0:
                max_val = max(waveform_data)
                waveform_data = [val / max_val for val in waveform_data]
            
            return waveform_data
            
        except Exception as e:
            print(f"Error generating waveform for {file_path}: {str(e)}")
            # Return flat line as fallback
            return [0.1] * samples

    def write_id3_tags(self, file_path: str, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Write key, BPM, energy, and cue points to ID3 tags (cleaned)."""
        try:
            try:
                tags = EasyID3(file_path)
            except ID3NoHeaderError:
                tags = EasyID3()
                tags.save(file_path)
                tags = EasyID3(file_path)

            if analysis.get('key_name'):
                tags['initialkey'] = analysis['key_name']
            if analysis.get('bpm') is not None:
                tags['bpm'] = str(int(round(float(analysis['bpm']))))
            if analysis.get('energy_level') is not None:
                tags['comment'] = [f"Energy {analysis['energy_level']}"]
            # Remove common junk
            for junk in ['encodedby', 'lyricist', 'composer']:
                if junk in tags:
                    del tags[junk]
            tags.save(file_path)

            # Write cue points to COMM frame with desc CUE
            cue_points = analysis.get('cue_points') or []
            try:
                id3 = ID3(file_path)
            except ID3NoHeaderError:
                id3 = ID3()
            cue_str = ','.join([str(round(float(t), 2)) for t in cue_points])
            id3.add(COMM(encoding=3, lang='eng', desc='CUE', text=cue_str))
            id3.save(file_path)
            return { 'updated': True, 'cue_points': cue_points }
        except Exception as e:
            return { 'updated': False, 'error': str(e) }


# Convenience function for single file analysis
def analyze_music_file(file_path: str) -> Dict[str, Any]:
    """
    Convenience function to analyze a single music file.
    
    Args:
        file_path (str): Path to the audio file
        
    Returns:
        Dict[str, Any]: Analysis results
    """
    analyzer = MusicAnalyzer()
    return analyzer.analyze_audio_file(file_path)