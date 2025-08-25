import librosa
import numpy as np
import essentia.standard as es
from typing import Dict, Any, Tuple
import os

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
        self.key_detector = es.KeyExtractor()
        self.rhythm_detector = es.RhythmExtractor2013()
        
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
            
            # Get file info
            file_info = self._get_file_info(file_path)
            
            return {
                **file_info,
                **key_info,
                **bpm_info,
                **energy_info,
                'status': 'success'
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'error_message': str(e),
                'filename': os.path.basename(file_path) if file_path else 'Unknown'
            }
    
    def _analyze_key(self, audio: np.ndarray, sr: int) -> Dict[str, Any]:
        """Analyze musical key using Essentia's KeyExtractor."""
        try:
            # Use Essentia for key detection
            key, scale, strength = self.key_detector(audio)
            
            # Format key name
            key_name = f"{key} {scale}"
            
            # Get Camelot notation
            camelot_key = self.CAMELOT_WHEEL.get(key_name, 'Unknown')
            
            # Also try with librosa for comparison
            chroma = librosa.feature.chroma_stft(y=audio, sr=sr)
            chroma_mean = np.mean(chroma, axis=1)
            key_index = np.argmax(chroma_mean)
            
            # Chromatic scale
            notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F# ', 'G', 'G#', 'A', 'A#', 'B']
            estimated_key = notes[key_index]
            
            return {
                'key': key,
                'scale': scale,
                'key_name': key_name,
                'camelot_key': camelot_key,
                'key_strength': float(strength),
                'estimated_key_librosa': estimated_key
            }
            
        except Exception as e:
            return {
                'key': 'Unknown',
                'scale': 'Unknown',
                'key_name': 'Unknown',
                'camelot_key': 'Unknown',
                'key_strength': 0.0,
                'error': str(e)
            }
    
    def _analyze_bpm(self, audio: np.ndarray, sr: int) -> Dict[str, Any]:
        """Analyze BPM using both Essentia and librosa."""
        try:
            # Essentia rhythm analysis
            bpm, beats, beats_confidence, _, beats_intervals = self.rhythm_detector(audio)
            
            # Librosa tempo estimation
            tempo, _ = librosa.beat.beat_track(y=audio, sr=sr)
            
            return {
                'bpm': float(bpm),
                'bpm_librosa': float(tempo) if isinstance(tempo, (int, float)) else float(tempo[0]),
                'beats_confidence': float(beats_confidence),
                'beat_count': len(beats)
            }
            
        except Exception as e:
            # Fallback to librosa only
            try:
                tempo, _ = librosa.beat.beat_track(y=audio, sr=sr)
                return {
                    'bpm': float(tempo) if isinstance(tempo, (int, float)) else float(tempo[0]),
                    'bpm_librosa': float(tempo) if isinstance(tempo, (int, float)) else float(tempo[0]),
                    'beats_confidence': 0.0,
                    'beat_count': 0,
                    'warning': 'Essentia analysis failed, using librosa only'
                }
            except Exception as e2:
                return {
                    'bpm': 120.0,  # Default BPM
                    'bpm_librosa': 120.0,
                    'beats_confidence': 0.0,
                    'beat_count': 0,
                    'error': f"BPM analysis failed: {str(e2)}"
                }
    
    def _analyze_energy(self, audio: np.ndarray, sr: int) -> Dict[str, Any]:
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
    
    def get_compatible_keys(self, camelot_key: str) -> Dict[str, list]:
        """
        Get harmonically compatible keys according to the Camelot wheel system.
        
        Args:
            camelot_key (str): Camelot key notation (e.g., '8A', '5B')
            
        Returns:
            Dict[str, list]: Compatible keys for different mixing techniques
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