"""
Auto Mix API Module
==================

This module provides REST API endpoints for the automix feature, including
track recommendation, playlist analysis, and AI model integration.

Author: AI Assistant
Date: 2024
"""

import json
import logging
from typing import Dict, List, Optional, Any
from flask import request, jsonify
from dataclasses import asdict

from automix_ai import AutoMixAI, TrackAnalysis, TransitionType, get_automix_ai

# Configure logging
logger = logging.getLogger(__name__)

class AutoMixAPI:
    """
    API handler for automix functionality.
    
    This class provides REST endpoints for:
    - Getting next track recommendations
    - Analyzing playlists for automix compatibility
    - Managing AI model status
    - Handling transition scenarios
    """
    
    def __init__(self, api_port: int = 5002, api_signing_key: str = "devkey"):
        """
        Initialize the Auto Mix API.
        
        Args:
            api_port: Port number for the API server
            api_signing_key: Signing key for API authentication
        """
        self.api_port = api_port
        self.api_signing_key = api_signing_key
        # Create a new instance with the correct model
        from automix_ai import AutoMixAI
        self.automix_ai = AutoMixAI(model_name="gpt-4o-mini")
    
    def _validate_signing_key(self, request) -> bool:
        """Validate the API signing key."""
        signing_key = request.headers.get('X-Signing-Key') or request.args.get('signingkey')
        return signing_key == self.api_signing_key
    
    def _song_to_track_analysis(self, song: Dict[str, Any]) -> TrackAnalysis:
        """Convert a song dictionary to TrackAnalysis object."""
        return TrackAnalysis(
            id=song.get('id', ''),
            filename=song.get('filename', ''),
            camelot_key=song.get('camelot_key', ''),
            bpm=float(song.get('bpm', 0)),
            energy_level=int(song.get('energy_level', 0)),
            duration=float(song.get('duration', 0)),
            artist=song.get('artist'),
            title=song.get('title')
        )
    
    def get_next_track(self, request) -> Dict[str, Any]:
        """
        Get the next track recommendation for automix.
        
        Expected JSON payload:
        {
            "current_song": {
                "id": "song_id",
                "filename": "song.mp3",
                "camelot_key": "8B",
                "bpm": 128.0,
                "energy_level": 7,
                "duration": 240.0,
                "artist": "Artist Name",
                "title": "Song Title"
            },
            "playlist": [
                // Array of song objects with same structure
            ],
            "transition_type": "smooth_transition" // Optional
        }
        
        Returns:
            JSON response with recommended track or error
        """
        if not self._validate_signing_key(request):
            return {"error": "Invalid signing key"}, 401
        
        try:
            data = request.get_json()
            if not data:
                return {"error": "No JSON data provided"}, 400
            
            # Extract current song
            current_song_data = data.get('current_song')
            if not current_song_data:
                return {"error": "current_song is required"}, 400
            
            # Extract playlist
            playlist_data = data.get('playlist', [])
            if not playlist_data:
                return {"error": "playlist is required and cannot be empty"}, 400
            
            # Extract transition type
            transition_type_str = data.get('transition_type', 'random')
            try:
                transition_type = TransitionType(transition_type_str)
            except ValueError:
                return {"error": f"Invalid transition_type: {transition_type_str}"}, 400
            
            # Convert to TrackAnalysis objects
            current_track = self._song_to_track_analysis(current_song_data)
            available_tracks = [self._song_to_track_analysis(song) for song in playlist_data]
            
            # Get recommendation
            logger.info(f"Getting next track recommendation for {current_track.filename}")
            logger.info(f"Transition type: {transition_type} (type: {type(transition_type)})")
            try:
                recommended_track = self.automix_ai.get_next_track(
                    current_track, 
                    available_tracks, 
                    transition_type
                )
            except Exception as e:
                logger.error(f"Error in get_next_track call: {str(e)}")
                import traceback
                logger.error(f"Traceback: {traceback.format_exc()}")
                raise
            
            if recommended_track:
                # Convert back to dictionary manually to avoid serialization issues
                track_dict = {
                    "id": recommended_track.id,
                    "filename": recommended_track.filename,
                    "camelot_key": recommended_track.camelot_key,
                    "bpm": recommended_track.bpm,
                    "energy_level": recommended_track.energy_level,
                    "duration": recommended_track.duration,
                    "artist": recommended_track.artist,
                    "title": recommended_track.title
                }
                return {
                    "status": "success",
                    "recommended_track": track_dict,
                    "transition_type": transition_type.value
                }
            else:
                return {
                    "status": "no_recommendation",
                    "message": "No suitable track found for the given criteria"
                }
                
        except Exception as e:
            logger.error(f"Error in get_next_track: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return {"error": f"Internal server error: {str(e)}"}, 500
    
    def analyze_playlist(self, request) -> Dict[str, Any]:
        """
        Analyze a playlist for automix compatibility.
        
        Expected JSON payload:
        {
            "playlist": [
                // Array of song objects
            ],
            "analysis_type": "compatibility" // Optional
        }
        
        Returns:
            JSON response with playlist analysis
        """
        if not self._validate_signing_key(request):
            return {"error": "Invalid signing key"}, 401
        
        try:
            data = request.get_json()
            if not data:
                return {"error": "No JSON data provided"}, 400
            
            playlist_data = data.get('playlist', [])
            if not playlist_data:
                return {"error": "playlist is required"}, 400
            
            # Convert to TrackAnalysis objects
            tracks = [self._song_to_track_analysis(song) for song in playlist_data]
            
            # Analyze playlist
            analysis = self._analyze_playlist_compatibility(tracks)
            
            return {
                "status": "success",
                "playlist_analysis": analysis,
                "track_count": len(tracks)
            }
            
        except Exception as e:
            logger.error(f"Error in analyze_playlist: {str(e)}")
            return {"error": f"Internal server error: {str(e)}"}, 500
    
    def _analyze_playlist_compatibility(self, tracks: List[TrackAnalysis]) -> Dict[str, Any]:
        """
        Analyze playlist compatibility for automix.
        
        Args:
            tracks: List of TrackAnalysis objects
            
        Returns:
            Dictionary containing analysis results
        """
        if not tracks:
            return {"error": "No tracks to analyze"}
        
        # Extract musical characteristics
        keys = [track.camelot_key for track in tracks if track.camelot_key]
        bpms = [track.bpm for track in tracks if track.bpm > 0]
        energy_levels = [track.energy_level for track in tracks if track.energy_level > 0]
        
        # Calculate statistics
        analysis = {
            "total_tracks": len(tracks),
            "key_diversity": len(set(keys)) if keys else 0,
            "unique_keys": list(set(keys)) if keys else [],
            "bpm_range": {
                "min": min(bpms) if bpms else 0,
                "max": max(bpms) if bpms else 0,
                "average": sum(bpms) / len(bpms) if bpms else 0
            },
            "energy_range": {
                "min": min(energy_levels) if energy_levels else 0,
                "max": max(energy_levels) if energy_levels else 0,
                "average": sum(energy_levels) / len(energy_levels) if energy_levels else 0
            },
            "compatibility_score": 0,
            "recommendations": []
        }
        
        # Calculate compatibility score
        if keys and bpms and energy_levels:
            # Key diversity (lower is better for smooth mixing)
            key_score = max(0, 100 - (len(set(keys)) * 10))
            
            # BPM consistency (smaller range is better)
            bpm_range = analysis["bpm_range"]["max"] - analysis["bpm_range"]["min"]
            bpm_score = max(0, 100 - (bpm_range / 2))
            
            # Energy progression (smooth transitions are better)
            energy_variance = self._calculate_variance(energy_levels)
            energy_score = max(0, 100 - (energy_variance * 10))
            
            # Overall compatibility score
            analysis["compatibility_score"] = int((key_score + bpm_score + energy_score) / 3)
            
            # Generate recommendations
            analysis["recommendations"] = self._generate_playlist_recommendations(tracks)
        
        return analysis
    
    def _calculate_variance(self, values: List[float]) -> float:
        """Calculate variance of a list of values."""
        if len(values) < 2:
            return 0
        
        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        return variance
    
    def _generate_playlist_recommendations(self, tracks: List[TrackAnalysis]) -> List[str]:
        """Generate recommendations for improving playlist compatibility."""
        recommendations = []
        
        # Check for missing analysis data
        missing_keys = sum(1 for track in tracks if not track.camelot_key)
        missing_bpms = sum(1 for track in tracks if not track.bpm or track.bpm <= 0)
        missing_energy = sum(1 for track in tracks if not track.energy_level or track.energy_level <= 0)
        
        if missing_keys > 0:
            recommendations.append(f"Analyze {missing_keys} tracks for key detection")
        
        if missing_bpms > 0:
            recommendations.append(f"Analyze {missing_bpms} tracks for BPM detection")
        
        if missing_energy > 0:
            recommendations.append(f"Analyze {missing_energy} tracks for energy level detection")
        
        # Check for BPM consistency
        bpms = [track.bpm for track in tracks if track.bpm > 0]
        if bpms:
            bpm_range = max(bpms) - min(bpms)
            if bpm_range > 20:
                recommendations.append("Consider grouping tracks by BPM range for smoother transitions")
        
        # Check for energy progression
        energy_levels = [track.energy_level for track in tracks if track.energy_level > 0]
        if energy_levels:
            energy_range = max(energy_levels) - min(energy_levels)
            if energy_range > 5:
                recommendations.append("Consider organizing tracks by energy level for better flow")
        
        return recommendations
    
    def get_ai_status(self, request) -> Dict[str, Any]:
        """
        Get the current status of the AI system.
        
        Returns:
            JSON response with AI status information
        """
        if not self._validate_signing_key(request):
            return {"error": "Invalid signing key"}, 401
        
        try:
            status = self.automix_ai.get_status()
            return {
                "status": "success",
                "ai_status": status
            }
        except Exception as e:
            logger.error(f"Error in get_ai_status: {str(e)}")
            return {"error": f"Internal server error: {str(e)}"}, 500
    
    def get_transition_types(self, request) -> Dict[str, Any]:
        """
        Get available transition types for automix.
        
        Returns:
            JSON response with available transition types
        """
        if not self._validate_signing_key(request):
            return {"error": "Invalid signing key"}, 401
        
        try:
            transition_types = []
            for transition_type in TransitionType:
                scenario = self.automix_ai.TRANSITION_SCENARIOS[transition_type]
                transition_types.append({
                    "type": transition_type.value,
                    "name": scenario.name,
                    "description": scenario.description,
                    "key_difference": scenario.key_difference,
                    "bpm_range": scenario.bpm_range,
                    "energy_change": scenario.energy_change
                })
            
            return {
                "status": "success",
                "transition_types": transition_types
            }
        except Exception as e:
            logger.error(f"Error in get_transition_types: {str(e)}")
            return {"error": f"Internal server error: {str(e)}"}, 500

# Global API instance
automix_api = AutoMixAPI()

def get_automix_api() -> AutoMixAPI:
    """Get the global Auto Mix API instance."""
    return automix_api
