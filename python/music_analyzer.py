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
            # Load audio file with better error handling
            print(f"🎵 Loading audio file: {file_path}")
            audio, sr = librosa.load(file_path, sr=44100)
            print(f"✅ Audio loaded successfully - Duration: {len(audio)/sr:.2f}s, Sample rate: {sr}Hz")
            
            # Perform all analyses
            key_info = self._analyze_key(audio, sr)
            bpm_info = self._analyze_bpm(audio, sr)
            energy_info = self._analyze_energy(audio, sr)
            cue_points = self._detect_cue_points(audio, sr)
            
            # Get file info
            file_info = self._get_file_info(file_path)
            
            # Extract ID3 metadata
            id3_metadata = self._extract_id3_metadata(file_path)
            
            return {
                **file_info,
                **key_info,
                **bpm_info,
                **energy_info,
                'cue_points': cue_points,
                'id3': id3_metadata,
                'status': 'success'
            }
            
        except Exception as e:
            import traceback
            print(f"❌ Music analysis failed for {file_path}: {str(e)}")
            print(f"📋 Full error traceback:")
            traceback.print_exc()
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

    def _extract_id3_metadata(self, file_path: str) -> Dict[str, Any]:
        """Extract existing ID3 metadata from the audio file."""
        metadata = {}
        
        try:
            # Try to load existing ID3 tags
            try:
                tags = EasyID3(file_path)
                
                # Extract standard ID3 tags
                metadata['title'] = tags.get('title', [''])[0] if tags.get('title') else ''
                metadata['artist'] = tags.get('artist', [''])[0] if tags.get('artist') else ''
                metadata['album'] = tags.get('album', [''])[0] if tags.get('album') else ''
                metadata['albumartist'] = tags.get('albumartist', [''])[0] if tags.get('albumartist') else ''
                metadata['date'] = tags.get('date', [''])[0] if tags.get('date') else ''
                metadata['year'] = metadata['date'][:4] if metadata['date'] and len(metadata['date']) >= 4 else ''
                metadata['genre'] = tags.get('genre', [''])[0] if tags.get('genre') else ''
                metadata['composer'] = tags.get('composer', [''])[0] if tags.get('composer') else ''
                metadata['tracknumber'] = tags.get('tracknumber', [''])[0] if tags.get('tracknumber') else ''
                metadata['discnumber'] = tags.get('discnumber', [''])[0] if tags.get('discnumber') else ''
                # Try different comment fields that might exist
                metadata['comment'] = (tags.get('comment', [''])[0] if tags.get('comment') else 
                                     tags.get('grouping', [''])[0] if tags.get('grouping') else '')
                metadata['initialkey'] = tags.get('initialkey', [''])[0] if tags.get('initialkey') else ''
                metadata['bpm'] = tags.get('bpm', [''])[0] if tags.get('bpm') else ''
                metadata['website'] = tags.get('website', [''])[0] if tags.get('website') else ''
                metadata['isrc'] = tags.get('isrc', [''])[0] if tags.get('isrc') else ''
                metadata['language'] = tags.get('language', [''])[0] if tags.get('language') else ''
                metadata['organization'] = tags.get('organization', [''])[0] if tags.get('organization') else ''
                metadata['copyright'] = tags.get('copyright', [''])[0] if tags.get('copyright') else ''
                metadata['encodedby'] = tags.get('encodedby', [''])[0] if tags.get('encodedby') else ''
                
                print(f"✅ ID3 metadata extracted from: {os.path.basename(file_path)}")
                if metadata['title'] or metadata['artist']:
                    print(f"📝 Found: '{metadata['title']}' by '{metadata['artist']}'")
                
            except ID3NoHeaderError:
                print(f"⚠️ No ID3 header found in: {os.path.basename(file_path)}")
                # Initialize empty metadata for files without ID3 tags
                metadata = {
                    'title': '', 'artist': '', 'album': '', 'albumartist': '', 'date': '', 'year': '',
                    'genre': '', 'composer': '', 'tracknumber': '', 'discnumber': '', 'comment': '',
                    'initialkey': '', 'bpm': '', 'website': '', 'isrc': '', 'language': '',
                    'organization': '', 'copyright': '', 'encodedby': ''
                }
            except Exception as e:
                print(f"⚠️ Error reading ID3 tags from {file_path}: {str(e)}")
                metadata = {
                    'title': '', 'artist': '', 'album': '', 'albumartist': '', 'date': '', 'year': '',
                    'genre': '', 'composer': '', 'tracknumber': '', 'discnumber': '', 'comment': '',
                    'initialkey': '', 'bpm': '', 'website': '', 'isrc': '', 'language': '',
                    'organization': '', 'copyright': '', 'encodedby': '', 'error': str(e)
                }
            
            # Try to get additional metadata using mutagen for more comprehensive info
            try:
                from mutagen import File
                audio_file = File(file_path)
                if audio_file is not None:
                    # Get audio properties
                    if hasattr(audio_file, 'info'):
                        info = audio_file.info
                        metadata['bitrate'] = getattr(info, 'bitrate', 0)
                        metadata['sample_rate'] = getattr(info, 'sample_rate', 0)
                        metadata['channels'] = getattr(info, 'channels', 0)
                        metadata['file_size'] = os.path.getsize(file_path) if os.path.exists(file_path) else 0
                        
                        # Duration from mutagen (more accurate than librosa for metadata)
                        if hasattr(info, 'length'):
                            metadata['duration_from_tags'] = float(info.length)
                            
            except Exception as e:
                print(f"⚠️ Error reading additional metadata: {str(e)}")
                
        except Exception as e:
            print(f"❌ Error extracting ID3 metadata from {file_path}: {str(e)}")
            metadata = {'error': str(e)}
            
        return metadata

    def write_id3_tags(self, file_path: str, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Write comprehensive metadata to ID3 tags with specific format requirements."""
        try:
            # Initialize or load existing ID3 tags
            try:
                tags = EasyID3(file_path)
            except ID3NoHeaderError:
                tags = EasyID3()
                tags.save(file_path)
                tags = EasyID3(file_path)

            # Get original metadata to preserve
            original_title = tags.get('title', [''])[0] if tags.get('title') else ''
            original_artist = tags.get('artist', [''])[0] if tags.get('artist') else ''
            original_album = tags.get('album', [''])[0] if tags.get('album') else ''
            original_genre = tags.get('genre', [''])[0] if tags.get('genre') else ''
            
            # Create new title format: 100BPM_11A_songname
            new_title = ""
            if analysis.get('bpm') and analysis.get('camelot_key'):
                bpm_value = int(round(float(analysis['bpm'])))
                camelot_key = analysis['camelot_key']
                
                # Extract song name from original title or filename
                song_name = original_title if original_title else os.path.splitext(os.path.basename(file_path))[0]
                # Clean song name (remove artist prefix if present)
                if ' - ' in song_name:
                    song_name = song_name.split(' - ', 1)[1]
                
                new_title = f"{bpm_value}BPM_{camelot_key}_{song_name}"
            else:
                # Fallback if missing BPM or key
                new_title = original_title if original_title else os.path.splitext(os.path.basename(file_path))[0]
            
            # Update title with new format
            tags['title'] = [new_title]
            
            # Preserve original artist and album
            if original_artist:
                tags['artist'] = [original_artist]
            if original_album:
                tags['album'] = [original_album]
            
            # Preserve original genre
            if original_genre:
                tags['genre'] = [original_genre]
            
            # Write BPM
            if analysis.get('bpm') is not None:
                bpm_value = int(round(float(analysis['bpm'])))
                tags['bpm'] = [str(bpm_value)]
            
            # Create comment format: 8A - Energy 8
            comment = ""
            if analysis.get('camelot_key') and analysis.get('energy_level') is not None:
                camelot_key = analysis['camelot_key']
                energy_value = int(float(analysis['energy_level']))
                comment = f"{camelot_key} - Energy {energy_value}"
            elif analysis.get('camelot_key'):
                comment = f"{analysis['camelot_key']}"
            elif analysis.get('energy_level') is not None:
                energy_value = int(float(analysis['energy_level']))
                comment = f"Energy {energy_value}"
            
            # Calculate track number based on harmonic key (Camelot position)
            if analysis.get('camelot_key'):
                camelot_key = analysis['camelot_key']
                try:
                    # Extract number from camelot key (e.g., "8A" -> 8, "11B" -> 11)
                    track_num = int(''.join(filter(str.isdigit, camelot_key)))
                    # Ensure it's within valid range (1-12)
                    track_num = max(1, min(12, track_num))
                    tags['tracknumber'] = [str(track_num)]
                except (ValueError, TypeError):
                    # Fallback to track 1 if parsing fails
                    tags['tracknumber'] = ['1']
            
            # Add analysis timestamp to grouping
            from datetime import datetime
            analysis_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            analysis_info = f"Analyzed: {analysis_time}"
            
            # Add additional analysis info to grouping
            grouping_parts = [analysis_info]
            
            # Add key information if available
            if analysis.get('key_name'):
                grouping_parts.append(f"Key: {analysis['key_name']}")
            
            # Add comment (camelot + energy) to grouping
            if comment:
                grouping_parts.append(comment)
            
            if analysis.get('duration') is not None:
                duration_seconds = float(analysis['duration'])
                duration_minutes = int(duration_seconds // 60)
                duration_secs = int(duration_seconds % 60)
                grouping_parts.append(f"Duration: {duration_minutes}:{duration_secs:02d}")
            
            # Write grouping with analysis info
            tags['grouping'] = [' | '.join(grouping_parts)]
            
            # Clean up common junk tags
            for junk in ['encodedby', 'lyricist', 'composer']:
                if junk in tags:
                    del tags[junk]
            
            # Save the tags
            tags.save(file_path)

            # Write cue points to COMM frame with desc CUE
            cue_points = analysis.get('cue_points') or []
            if cue_points:
                try:
                    id3 = ID3(file_path)
                except ID3NoHeaderError:
                    id3 = ID3()
                
                cue_str = ','.join([str(round(float(t), 2)) for t in cue_points])
                id3.add(COMM(encoding=3, lang='eng', desc='CUE', text=cue_str))
                id3.save(file_path)
            
            print(f"✅ Successfully updated ID3 tags for: {os.path.basename(file_path)}")
            print(f"📝 New title: {new_title}")
            print(f"💬 Comment: {comment}")
            print(f"🎵 Track number: {tags.get('tracknumber', ['N/A'])[0]}")
            
            return { 
                'updated': True, 
                'cue_points': cue_points,
                'metadata_written': {
                    'title': new_title,
                    'artist': original_artist,
                    'album': original_album,
                    'genre': original_genre,
                    'key': analysis.get('key_name'),
                    'bpm': analysis.get('bpm'),
                    'energy': analysis.get('energy_level'),
                    'camelot': analysis.get('camelot_key'),
                    'comment': comment,
                    'track_number': tags.get('tracknumber', ['N/A'])[0],
                    'duration': analysis.get('duration')
                }
            }
            
        except Exception as e:
            print(f"❌ Error writing ID3 tags for {file_path}: {str(e)}")
            import traceback
            traceback.print_exc()
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