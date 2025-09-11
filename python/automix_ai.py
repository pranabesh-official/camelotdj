"""
Auto Mix AI Module
=================

This module provides AI-powered track selection for the automix feature using smollm2-135M.
It handles prompt generation, model inference, and track recommendation based on
harmonic compatibility, BPM, and energy levels.

Author: AI Assistant
Date: 2024
"""

import json
import logging
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum
import time

# Try to import the AI model with proper error handling
try:
    import llm
    from llm import get_model
    AI_MODEL_AVAILABLE = True
except ImportError:
    AI_MODEL_AVAILABLE = False
    llm = None
    get_model = None

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TransitionType(Enum):
    """Types of musical transitions for automix."""
    SMOOTH = "smooth_transition"
    ENERGY_RAISE = "energy_raise"
    PEAK_BUILDUP = "peak_buildup"
    COOLDOWN = "cooldown"
    RANDOM = "random"

@dataclass
class TrackAnalysis:
    """Analysis data for a track."""
    id: str
    filename: str
    camelot_key: str
    bpm: float
    energy_level: int
    duration: float
    artist: Optional[str] = None
    title: Optional[str] = None

@dataclass
class TransitionScenario:
    """A transition scenario with specific musical parameters."""
    name: str
    key_difference: int  # Camelot wheel steps
    bpm_range: Tuple[int, int]  # BPM variation range
    energy_change: Tuple[int, int]  # Energy level change range
    description: str

class AutoMixAI:
    """
    AI-powered automix system using smollm2-135M for intelligent track selection.
    
    This class handles:
    - Model initialization and management
    - Prompt generation for different transition scenarios
    - Track recommendation based on musical analysis
    - Fallback strategies when AI is unavailable
    """
    
    # Predefined transition scenarios
    TRANSITION_SCENARIOS = {
        TransitionType.SMOOTH: TransitionScenario(
            name="Smooth Transition",
            key_difference=0,  # Same key
            bpm_range=(-3, 3),  # ±3 BPM
            energy_change=(-1, 1),  # ±1 energy level
            description="Harmonic key match with minimal BPM and energy changes"
        ),
        TransitionType.ENERGY_RAISE: TransitionScenario(
            name="Energy Raise",
            key_difference=2,  # +2 Camelot steps
            bpm_range=(-5, 5),  # ±5 BPM
            energy_change=(1, 3),  # +1 to +3 energy levels
            description="Gradual energy increase with harmonic progression"
        ),
        TransitionType.PEAK_BUILDUP: TransitionScenario(
            name="Peak Buildup",
            key_difference=0,  # Same key
            bpm_range=(3, 7),  # +3 to +7 BPM
            energy_change=(2, 4),  # +2 to +4 energy levels
            description="Intense buildup maintaining harmonic stability"
        ),
        TransitionType.COOLDOWN: TransitionScenario(
            name="Cooldown",
            key_difference=0,  # Same key
            bpm_range=(-5, 3),  # -5 to +3 BPM
            energy_change=(-2, 0),  # -2 to 0 energy levels
            description="Gentle cooldown with maintained harmonic flow"
        ),
        TransitionType.RANDOM: TransitionScenario(
            name="Random Selection",
            key_difference=0,  # No specific key requirement
            bpm_range=(-10, 10),  # Wide BPM range
            energy_change=(-3, 3),  # Wide energy range
            description="Random track selection from available options"
        )
    }
    
    def __init__(self, model_name: str = "gpt-4o-mini"):
        """
        Initialize the Auto Mix AI system.
        
        Args:
            model_name: Name of the AI model to use
        """
        self.model_name = model_name
        self.model = None
        self.is_initialized = False
        self.initialization_error = None
        
        # Initialize the model
        self._initialize_model()
    
    def _initialize_model(self) -> None:
        """Initialize the AI model with error handling."""
        if not AI_MODEL_AVAILABLE:
            logger.warning("AI model library not available. Auto Mix will use fallback strategies.")
            self.initialization_error = "AI model library not installed"
            return
        
        try:
            logger.info(f"Initializing AI model: {self.model_name}")
            start_time = time.time()
            
            # Initialize the model
            self.model = get_model(self.model_name)
            
            # Test the model with a simple prompt
            test_prompt = "Test prompt for model initialization"
            test_response = self.model.prompt(test_prompt)
            
            initialization_time = time.time() - start_time
            logger.info(f"AI model initialized successfully in {initialization_time:.2f}s")
            
            self.is_initialized = True
            
        except Exception as e:
            logger.error(f"Failed to initialize AI model: {str(e)}")
            self.initialization_error = str(e)
            self.is_initialized = False
    
    def _generate_prompt(self, 
                        current_track: TrackAnalysis, 
                        available_tracks: List[TrackAnalysis],
                        transition_type: TransitionType) -> str:
        """
        Generate a detailed prompt for the AI model based on the current context.
        
        Args:
            current_track: Currently playing track analysis
            available_tracks: List of available tracks for selection
            transition_type: Type of transition to generate
            
        Returns:
            Formatted prompt string for the AI model
        """
        scenario = self.TRANSITION_SCENARIOS[transition_type]
        
        # Build track information
        track_info = []
        for i, track in enumerate(available_tracks[:20]):  # Limit to first 20 tracks
            track_info.append(
                f"{i+1}. {track.artist or 'Unknown'} - {track.title or track.filename} "
                f"(Key: {track.camelot_key}, BPM: {track.bpm}, Energy: {track.energy_level})"
            )
        
        # Create the prompt
        prompt = f"""You are an expert DJ and music curator. Select the next track for a seamless mix.

CURRENT TRACK:
- Artist: {current_track.artist or 'Unknown'}
- Title: {current_track.title or current_track.filename}
- Key: {current_track.camelot_key}
- BPM: {current_track.bpm}
- Energy Level: {current_track.energy_level}/10

DESIRED TRANSITION: {scenario.name}
- Key Change: {scenario.key_difference} Camelot steps
- BPM Range: {scenario.bpm_range[0]} to {scenario.bpm_range[1]} BPM change
- Energy Change: {scenario.energy_change[0]} to {scenario.energy_change[1]} levels
- Description: {scenario.description}

AVAILABLE TRACKS:
{chr(10).join(track_info)}

INSTRUCTIONS:
1. Analyze the current track's musical characteristics
2. Consider harmonic compatibility using Camelot wheel theory
3. Match the desired transition scenario parameters
4. Select the track number that best fits the transition
5. Respond with ONLY the track number (1-{len(available_tracks[:20])})

SELECTED TRACK NUMBER:"""
        
        return prompt
    
    def _select_track_fallback(self, 
                              current_track: TrackAnalysis, 
                              available_tracks: List[TrackAnalysis],
                              transition_type: TransitionType) -> Optional[TrackAnalysis]:
        """
        Fallback track selection using rule-based logic when AI is unavailable.
        
        Args:
            current_track: Currently playing track analysis
            available_tracks: List of available tracks for selection
            transition_type: Type of transition to generate
            
        Returns:
            Selected track or None if no suitable track found
        """
        try:
            scenario = self.TRANSITION_SCENARIOS[transition_type]
            logger.info(f"Using scenario: {scenario.name}, bpm_range: {scenario.bpm_range}, energy_change: {scenario.energy_change}")
        except Exception as e:
            logger.error(f"Error accessing scenario: {e}")
            raise
        
        # Filter tracks based on scenario parameters
        suitable_tracks = []
        
        for track in available_tracks:
            try:
                # Skip the current track
                if track.id == current_track.id:
                    continue
                
                # Check BPM compatibility
                bpm_diff = track.bpm - current_track.bpm
                if not (scenario.bpm_range[0] <= bpm_diff <= scenario.bpm_range[1]):
                    continue
                
                # Check energy level compatibility
                energy_diff = track.energy_level - current_track.energy_level
                if not (scenario.energy_change[0] <= energy_diff <= scenario.energy_change[1]):
                    continue
                
                # Check harmonic compatibility (simplified Camelot wheel logic)
                if self._is_harmonically_compatible(current_track.camelot_key, track.camelot_key, scenario.key_difference):
                    suitable_tracks.append(track)
            except Exception as e:
                logger.error(f"Error processing track {track.filename}: {e}")
                continue
        
        if not suitable_tracks:
            # If no tracks match exactly, relax constraints
            for track in available_tracks:
                if track.id != current_track.id:
                    suitable_tracks.append(track)
        
        # Return the first suitable track or None
        return suitable_tracks[0] if suitable_tracks else None
    
    def _is_harmonically_compatible(self, 
                                   current_key: str, 
                                   target_key: str, 
                                   max_difference: int) -> bool:
        """
        Check if two Camelot keys are harmonically compatible.
        
        Args:
            current_key: Current track's Camelot key
            target_key: Target track's Camelot key
            max_difference: Maximum allowed key difference
            
        Returns:
            True if keys are compatible, False otherwise
        """
        try:
            if not current_key or not target_key:
                return True  # Allow if keys are unknown
            
            # Extract number and letter from Camelot keys
            current_num = int(current_key[:-1])
            current_letter = current_key[-1]
            target_num = int(target_key[:-1])
            target_letter = target_key[-1]
            
            # Calculate key difference
            if current_letter == target_letter:
                # Same letter (major/minor), check number difference
                diff = abs(target_num - current_num)
                return diff <= max_difference
            else:
                # Different letters, check if they're adjacent on the wheel
                # This is a simplified check - in practice, you'd use the full Camelot wheel logic
                return True
                
        except (ValueError, IndexError) as e:
            # If we can't parse the keys, assume compatibility
            logger.warning(f"Error parsing keys {current_key} and {target_key}: {e}")
            return True
        except Exception as e:
            logger.error(f"Unexpected error in harmonic compatibility check: {e}")
            return True
    
    def get_next_track(self, 
                      current_track: TrackAnalysis, 
                      available_tracks: List[TrackAnalysis],
                      transition_type: Optional[TransitionType] = None) -> Optional[TrackAnalysis]:
        """
        Get the next track recommendation using AI or fallback logic.
        
        Args:
            current_track: Currently playing track analysis
            available_tracks: List of available tracks for selection
            transition_type: Type of transition (defaults to random if not specified)
            
        Returns:
            Recommended next track or None if no suitable track found
        """
        if not available_tracks:
            logger.warning("No available tracks for selection")
            return None
        
        # Use random transition type if not specified
        if transition_type is None:
            import random
            transition_type = random.choice(list(TransitionType))
        
        logger.info(f"Selecting next track with transition type: {transition_type.value}")
        
        # Try AI-based selection first
        if self.is_initialized and self.model:
            try:
                return self._get_ai_recommendation(current_track, available_tracks, transition_type)
            except Exception as e:
                logger.error(f"AI recommendation failed: {str(e)}")
                logger.info("Falling back to rule-based selection")
        
        # Fall back to rule-based selection
        return self._select_track_fallback(current_track, available_tracks, transition_type)
    
    def _get_ai_recommendation(self, 
                              current_track: TrackAnalysis, 
                              available_tracks: List[TrackAnalysis],
                              transition_type: TransitionType) -> Optional[TrackAnalysis]:
        """
        Get track recommendation using the AI model.
        
        Args:
            current_track: Currently playing track analysis
            available_tracks: List of available tracks for selection
            transition_type: Type of transition to generate
            
        Returns:
            Recommended track or None if selection fails
        """
        try:
            # Generate prompt
            prompt = self._generate_prompt(current_track, available_tracks, transition_type)
            
            # Get AI response
            logger.info("Sending prompt to AI model...")
            start_time = time.time()
            
            response = self.model.prompt(prompt)
            
            inference_time = time.time() - start_time
            logger.info(f"AI model response received in {inference_time:.2f}s")
            
            # Parse response to get track number
            try:
                # Extract number from response
                import re
                numbers = re.findall(r'\d+', str(response))
                if numbers:
                    track_index = int(numbers[0]) - 1  # Convert to 0-based index
                    if 0 <= track_index < len(available_tracks):
                        selected_track = available_tracks[track_index]
                        logger.info(f"AI selected track: {selected_track.artist} - {selected_track.title}")
                        return selected_track
                    else:
                        logger.warning(f"AI returned invalid track index: {track_index}")
                else:
                    logger.warning("AI response did not contain a valid track number")
                    
            except (ValueError, IndexError) as e:
                logger.error(f"Failed to parse AI response: {str(e)}")
                logger.debug(f"AI response: {response}")
            
        except Exception as e:
            logger.error(f"AI recommendation failed: {str(e)}")
            raise
        
        return None
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get the current status of the AI system.
        
        Returns:
            Dictionary containing status information
        """
        return {
            "is_initialized": self.is_initialized,
            "model_name": self.model_name,
            "ai_library_available": AI_MODEL_AVAILABLE,
            "initialization_error": self.initialization_error,
            "available_transitions": [t.value for t in TransitionType]
        }

# Global instance for the application
automix_ai = AutoMixAI(model_name="gpt-4o-mini")

def get_automix_ai() -> AutoMixAI:
    """Get the global Auto Mix AI instance."""
    return automix_ai
