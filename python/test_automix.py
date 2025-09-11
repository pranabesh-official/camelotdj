"""
Auto Mix Test Suite
==================

Comprehensive unit tests for the automix feature including AI model integration,
API endpoints, and fallback logic.

Author: AI Assistant
Date: 2024
"""

import unittest
import json
import time
from unittest.mock import Mock, patch, MagicMock
from typing import Dict, List, Any

# Import the modules to test
from automix_ai import AutoMixAI, TrackAnalysis, TransitionType, get_automix_ai
from automix_api import AutoMixAPI, get_automix_api

class TestTrackAnalysis(unittest.TestCase):
    """Test the TrackAnalysis dataclass."""
    
    def test_track_analysis_creation(self):
        """Test creating a TrackAnalysis object."""
        track = TrackAnalysis(
            id="test_id",
            filename="test.mp3",
            camelot_key="8B",
            bpm=128.0,
            energy_level=7,
            duration=240.0,
            artist="Test Artist",
            title="Test Title"
        )
        
        self.assertEqual(track.id, "test_id")
        self.assertEqual(track.filename, "test.mp3")
        self.assertEqual(track.camelot_key, "8B")
        self.assertEqual(track.bpm, 128.0)
        self.assertEqual(track.energy_level, 7)
        self.assertEqual(track.duration, 240.0)
        self.assertEqual(track.artist, "Test Artist")
        self.assertEqual(track.title, "Test Title")

class TestTransitionScenarios(unittest.TestCase):
    """Test transition scenario definitions."""
    
    def test_transition_scenarios_exist(self):
        """Test that all transition scenarios are defined."""
        ai = AutoMixAI()
        
        # Check that all transition types have scenarios
        for transition_type in TransitionType:
            self.assertIn(transition_type, ai.TRANSITION_SCENARIOS)
            scenario = ai.TRANSITION_SCENARIOS[transition_type]
            self.assertIsNotNone(scenario.name)
            self.assertIsNotNone(scenario.description)
            self.assertIsInstance(scenario.key_difference, int)
            self.assertIsInstance(scenario.bpm_range, tuple)
            self.assertIsInstance(scenario.energy_change, tuple)

class TestAutoMixAI(unittest.TestCase):
    """Test the AutoMixAI class."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.ai = AutoMixAI()
        
        # Create test tracks
        self.current_track = TrackAnalysis(
            id="current",
            filename="current.mp3",
            camelot_key="8B",
            bpm=128.0,
            energy_level=7,
            duration=240.0,
            artist="Current Artist",
            title="Current Title"
        )
        
        self.available_tracks = [
            TrackAnalysis(
                id="track1",
                filename="track1.mp3",
                camelot_key="8B",
                bpm=130.0,
                energy_level=8,
                duration=200.0,
                artist="Artist 1",
                title="Track 1"
            ),
            TrackAnalysis(
                id="track2",
                filename="track2.mp3",
                camelot_key="9B",
                bpm=125.0,
                energy_level=6,
                duration=180.0,
                artist="Artist 2",
                title="Track 2"
            ),
            TrackAnalysis(
                id="track3",
                filename="track3.mp3",
                camelot_key="7B",
                bpm=132.0,
                energy_level=9,
                duration=220.0,
                artist="Artist 3",
                title="Track 3"
            )
        ]
    
    def test_initialization(self):
        """Test AI initialization."""
        self.assertIsNotNone(self.ai)
        self.assertIsNotNone(self.ai.model_name)
        self.assertIsInstance(self.ai.get_status(), dict)
    
    def test_harmonic_compatibility(self):
        """Test harmonic compatibility checking."""
        # Same key should be compatible
        self.assertTrue(self.ai._is_harmonically_compatible("8B", "8B", 0))
        
        # Adjacent keys should be compatible
        self.assertTrue(self.ai._is_harmonically_compatible("8B", "9B", 1))
        
        # Different letters should be compatible (simplified logic)
        self.assertTrue(self.ai._is_harmonically_compatible("8B", "8A", 0))
        
        # Invalid keys should be compatible (fallback)
        self.assertTrue(self.ai._is_harmonically_compatible("", "8B", 0))
        self.assertTrue(self.ai._is_harmonically_compatible("8B", "", 0))
    
    def test_prompt_generation(self):
        """Test prompt generation for different transition types."""
        for transition_type in TransitionType:
            prompt = self.ai._generate_prompt(
                self.current_track,
                self.available_tracks,
                transition_type
            )
            
            self.assertIsInstance(prompt, str)
            self.assertIn("CURRENT TRACK:", prompt)
            self.assertIn("DESIRED TRANSITION:", prompt)
            self.assertIn("AVAILABLE TRACKS:", prompt)
            self.assertIn("INSTRUCTIONS:", prompt)
    
    def test_fallback_track_selection(self):
        """Test fallback track selection when AI is unavailable."""
        # Test smooth transition
        selected = self.ai._select_track_fallback(
            self.current_track,
            self.available_tracks,
            TransitionType.SMOOTH
        )
        
        # Should return a track (or None if no suitable track)
        self.assertTrue(selected is None or isinstance(selected, TrackAnalysis))
        
        # Test energy raise
        selected = self.ai._select_track_fallback(
            self.current_track,
            self.available_tracks,
            TransitionType.ENERGY_RAISE
        )
        
        self.assertTrue(selected is None or isinstance(selected, TrackAnalysis))
    
    def test_get_next_track_fallback(self):
        """Test getting next track with fallback logic."""
        # This should work even without AI model
        selected = self.ai.get_next_track(
            self.current_track,
            self.available_tracks,
            TransitionType.SMOOTH
        )
        
        # Should return a track or None
        self.assertTrue(selected is None or isinstance(selected, TrackAnalysis))
    
    def test_get_next_track_empty_playlist(self):
        """Test getting next track with empty playlist."""
        selected = self.ai.get_next_track(
            self.current_track,
            [],
            TransitionType.SMOOTH
        )
        
        self.assertIsNone(selected)
    
    def test_get_status(self):
        """Test getting AI status."""
        status = self.ai.get_status()
        
        self.assertIsInstance(status, dict)
        self.assertIn("is_initialized", status)
        self.assertIn("model_name", status)
        self.assertIn("ai_library_available", status)
        self.assertIn("available_transitions", status)

class TestAutoMixAPI(unittest.TestCase):
    """Test the AutoMixAPI class."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.api = AutoMixAPI(api_port=5002, api_signing_key="test_key")
        
        # Create mock request objects
        self.mock_request = Mock()
        self.mock_request.headers = {"X-Signing-Key": "test_key"}
        self.mock_request.args = {}
        
        # Test data
        self.test_song = {
            "id": "test_song",
            "filename": "test.mp3",
            "camelot_key": "8B",
            "bpm": 128.0,
            "energy_level": 7,
            "duration": 240.0,
            "artist": "Test Artist",
            "title": "Test Title"
        }
        
        self.test_playlist = [
            {
                "id": "track1",
                "filename": "track1.mp3",
                "camelot_key": "8B",
                "bpm": 130.0,
                "energy_level": 8,
                "duration": 200.0,
                "artist": "Artist 1",
                "title": "Track 1"
            },
            {
                "id": "track2",
                "filename": "track2.mp3",
                "camelot_key": "9B",
                "bpm": 125.0,
                "energy_level": 6,
                "duration": 180.0,
                "artist": "Artist 2",
                "title": "Track 2"
            }
        ]
    
    def test_validate_signing_key(self):
        """Test signing key validation."""
        # Valid key in headers
        self.mock_request.headers = {"X-Signing-Key": "test_key"}
        self.assertTrue(self.api._validate_signing_key(self.mock_request))
        
        # Valid key in args
        self.mock_request.headers = {}
        self.mock_request.args = {"signingkey": "test_key"}
        self.assertTrue(self.api._validate_signing_key(self.mock_request))
        
        # Invalid key
        self.mock_request.headers = {"X-Signing-Key": "wrong_key"}
        self.mock_request.args = {}
        self.assertFalse(self.api._validate_signing_key(self.mock_request))
    
    def test_song_to_track_analysis(self):
        """Test converting song dict to TrackAnalysis."""
        track = self.api._song_to_track_analysis(self.test_song)
        
        self.assertIsInstance(track, TrackAnalysis)
        self.assertEqual(track.id, "test_song")
        self.assertEqual(track.filename, "test.mp3")
        self.assertEqual(track.camelot_key, "8B")
        self.assertEqual(track.bpm, 128.0)
        self.assertEqual(track.energy_level, 7)
        self.assertEqual(track.duration, 240.0)
        self.assertEqual(track.artist, "Test Artist")
        self.assertEqual(track.title, "Test Title")
    
    def test_get_next_track_success(self):
        """Test successful next track recommendation."""
        self.mock_request.get_json.return_value = {
            "current_song": self.test_song,
            "playlist": self.test_playlist,
            "transition_type": "smooth_transition"
        }
        
        # Mock the AI to return a track
        with patch.object(self.api.automix_ai, 'get_next_track') as mock_get_next:
            mock_track = TrackAnalysis(
                id="recommended",
                filename="recommended.mp3",
                camelot_key="8B",
                bpm=129.0,
                energy_level=7,
                duration=210.0,
                artist="Recommended Artist",
                title="Recommended Title"
            )
            mock_get_next.return_value = mock_track
            
            response, status_code = self.api.get_next_track(self.mock_request)
            
            self.assertEqual(status_code, 200)
            self.assertEqual(response["status"], "success")
            self.assertIn("recommended_track", response)
            self.assertEqual(response["recommended_track"]["id"], "recommended")
    
    def test_get_next_track_no_recommendation(self):
        """Test when no track is recommended."""
        self.mock_request.get_json.return_value = {
            "current_song": self.test_song,
            "playlist": self.test_playlist,
            "transition_type": "smooth_transition"
        }
        
        # Mock the AI to return None
        with patch.object(self.api.automix_ai, 'get_next_track') as mock_get_next:
            mock_get_next.return_value = None
            
            response, status_code = self.api.get_next_track(self.mock_request)
            
            self.assertEqual(status_code, 200)
            self.assertEqual(response["status"], "no_recommendation")
            self.assertIn("message", response)
    
    def test_get_next_track_invalid_signing_key(self):
        """Test with invalid signing key."""
        self.mock_request.headers = {"X-Signing-Key": "wrong_key"}
        
        response, status_code = self.api.get_next_track(self.mock_request)
        
        self.assertEqual(status_code, 401)
        self.assertIn("error", response)
    
    def test_get_next_track_missing_data(self):
        """Test with missing required data."""
        self.mock_request.get_json.return_value = {}
        
        response, status_code = self.api.get_next_track(self.mock_request)
        
        self.assertEqual(status_code, 400)
        self.assertIn("error", response)
    
    def test_analyze_playlist(self):
        """Test playlist analysis."""
        self.mock_request.get_json.return_value = {
            "playlist": self.test_playlist
        }
        
        response, status_code = self.api.analyze_playlist(self.mock_request)
        
        self.assertEqual(status_code, 200)
        self.assertEqual(response["status"], "success")
        self.assertIn("playlist_analysis", response)
        self.assertIn("track_count", response)
        self.assertEqual(response["track_count"], 2)
    
    def test_get_ai_status(self):
        """Test getting AI status."""
        response, status_code = self.api.get_ai_status(self.mock_request)
        
        self.assertEqual(status_code, 200)
        self.assertEqual(response["status"], "success")
        self.assertIn("ai_status", response)
    
    def test_get_transition_types(self):
        """Test getting available transition types."""
        response, status_code = self.api.get_transition_types(self.mock_request)
        
        self.assertEqual(status_code, 200)
        self.assertEqual(response["status"], "success")
        self.assertIn("transition_types", response)
        self.assertIsInstance(response["transition_types"], list)
        self.assertGreater(len(response["transition_types"]), 0)

class TestPlaylistAnalysis(unittest.TestCase):
    """Test playlist analysis functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.api = AutoMixAPI()
        
        # Create test tracks with various characteristics
        self.tracks = [
            TrackAnalysis(
                id="track1",
                filename="track1.mp3",
                camelot_key="8B",
                bpm=128.0,
                energy_level=7,
                duration=240.0
            ),
            TrackAnalysis(
                id="track2",
                filename="track2.mp3",
                camelot_key="8B",
                bpm=130.0,
                energy_level=8,
                duration=200.0
            ),
            TrackAnalysis(
                id="track3",
                filename="track3.mp3",
                camelot_key="9B",
                bpm=125.0,
                energy_level=6,
                duration=180.0
            )
        ]
    
    def test_analyze_playlist_compatibility(self):
        """Test playlist compatibility analysis."""
        analysis = self.api._analyze_playlist_compatibility(self.tracks)
        
        self.assertIsInstance(analysis, dict)
        self.assertIn("total_tracks", analysis)
        self.assertIn("key_diversity", analysis)
        self.assertIn("bpm_range", analysis)
        self.assertIn("energy_range", analysis)
        self.assertIn("compatibility_score", analysis)
        self.assertIn("recommendations", analysis)
        
        self.assertEqual(analysis["total_tracks"], 3)
        self.assertGreater(analysis["compatibility_score"], 0)
    
    def test_analyze_empty_playlist(self):
        """Test analyzing empty playlist."""
        analysis = self.api._analyze_playlist_compatibility([])
        
        self.assertIn("error", analysis)
    
    def test_calculate_variance(self):
        """Test variance calculation."""
        values = [1, 2, 3, 4, 5]
        variance = self.api._calculate_variance(values)
        
        self.assertIsInstance(variance, float)
        self.assertGreaterEqual(variance, 0)
        
        # Test with single value
        single_variance = self.api._calculate_variance([5])
        self.assertEqual(single_variance, 0)
    
    def test_generate_playlist_recommendations(self):
        """Test generating playlist recommendations."""
        recommendations = self.api._generate_playlist_recommendations(self.tracks)
        
        self.assertIsInstance(recommendations, list)
        # Should have some recommendations for a diverse playlist
        self.assertGreater(len(recommendations), 0)

class TestIntegration(unittest.TestCase):
    """Integration tests for the complete automix system."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.ai = AutoMixAI()
        self.api = AutoMixAPI()
        
        # Create a realistic test scenario
        self.current_track = TrackAnalysis(
            id="current",
            filename="current_track.mp3",
            camelot_key="8B",
            bpm=128.0,
            energy_level=7,
            duration=240.0,
            artist="Current Artist",
            title="Current Track"
        )
        
        self.playlist = [
            TrackAnalysis(
                id="track1",
                filename="track1.mp3",
                camelot_key="8B",
                bpm=130.0,
                energy_level=8,
                duration=200.0,
                artist="Artist 1",
                title="Track 1"
            ),
            TrackAnalysis(
                id="track2",
                filename="track2.mp3",
                camelot_key="9B",
                bpm=125.0,
                energy_level=6,
                duration=180.0,
                artist="Artist 2",
                title="Track 2"
            ),
            TrackAnalysis(
                id="track3",
                filename="track3.mp3",
                camelot_key="7B",
                bpm=132.0,
                energy_level=9,
                duration=220.0,
                artist="Artist 3",
                title="Track 3"
            )
        ]
    
    def test_end_to_end_recommendation(self):
        """Test end-to-end track recommendation."""
        # Test with different transition types
        for transition_type in TransitionType:
            recommended = self.ai.get_next_track(
                self.current_track,
                self.playlist,
                transition_type
            )
            
            # Should return a track or None
            self.assertTrue(recommended is None or isinstance(recommended, TrackAnalysis))
            
            # If a track is returned, it shouldn't be the current track
            if recommended:
                self.assertNotEqual(recommended.id, self.current_track.id)
    
    def test_api_integration(self):
        """Test API integration with mock data."""
        # Create mock request
        mock_request = Mock()
        mock_request.headers = {"X-Signing-Key": "test_key"}
        mock_request.get_json.return_value = {
            "current_song": {
                "id": self.current_track.id,
                "filename": self.current_track.filename,
                "camelot_key": self.current_track.camelot_key,
                "bpm": self.current_track.bpm,
                "energy_level": self.current_track.energy_level,
                "duration": self.current_track.duration,
                "artist": self.current_track.artist,
                "title": self.current_track.title
            },
            "playlist": [
                {
                    "id": track.id,
                    "filename": track.filename,
                    "camelot_key": track.camelot_key,
                    "bpm": track.bpm,
                    "energy_level": track.energy_level,
                    "duration": track.duration,
                    "artist": track.artist,
                    "title": track.title
                }
                for track in self.playlist
            ],
            "transition_type": "smooth_transition"
        }
        
        # Test API call
        response, status_code = self.api.get_next_track(mock_request)
        
        self.assertEqual(status_code, 200)
        self.assertIn("status", response)

def run_automix_tests():
    """Run all automix tests."""
    # Create test suite
    test_suite = unittest.TestSuite()
    
    # Add test cases
    test_classes = [
        TestTrackAnalysis,
        TestTransitionScenarios,
        TestAutoMixAI,
        TestAutoMixAPI,
        TestPlaylistAnalysis,
        TestIntegration
    ]
    
    for test_class in test_classes:
        tests = unittest.TestLoader().loadTestsFromTestCase(test_class)
        test_suite.addTests(tests)
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    return result.wasSuccessful()

if __name__ == "__main__":
    print("🧪 Running Auto Mix Test Suite...")
    print("=" * 50)
    
    success = run_automix_tests()
    
    if success:
        print("\n✅ All tests passed!")
    else:
        print("\n❌ Some tests failed!")
    
    print("=" * 50)
