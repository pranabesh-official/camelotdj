#!/usr/bin/env python3
"""
Test script to reproduce the Auto Mix API error
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from automix_ai import AutoMixAI, TrackAnalysis, TransitionType

def test_error_reproduction():
    """Test to reproduce the exact error"""
    print("Testing error reproduction...")
    
    try:
        # Create AI instance
        ai = AutoMixAI()
        
        # Create test data
        current_track = TrackAnalysis(
            id="test",
            filename="test.mp3",
            camelot_key="11B",
            bpm=87.0,
            energy_level=7,
            duration=180.0
        )
        
        available_tracks = [
            TrackAnalysis(
                id="test2",
                filename="test2.mp3",
                camelot_key="11A",
                bpm=90.0,
                energy_level=8,
                duration=200.0
            )
        ]
        
        transition_type = TransitionType("random")
        
        print(f"Transition type: {transition_type}")
        print(f"Transition type type: {type(transition_type)}")
        
        # Test the exact call that's failing
        recommended_track = ai.get_next_track(
            current_track, 
            available_tracks, 
            transition_type
        )
        
        print(f"Got recommendation: {recommended_track}")
        
    except Exception as e:
        print(f"Error: {e}")
        print(f"Error type: {type(e)}")
        print(f"Error str: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return False
    
    return True

if __name__ == "__main__":
    print("Auto Mix Error Reproduction Test")
    print("================================")
    
    success = test_error_reproduction()
    
    if success:
        print("\n✅ Test passed!")
    else:
        print("\n❌ Test failed!")
        sys.exit(1)

