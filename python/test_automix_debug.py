#!/usr/bin/env python3
"""
Debug script for Auto Mix API issues
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from automix_ai import AutoMixAI, TrackAnalysis, TransitionType

def test_transition_type():
    """Test transition type handling"""
    print("Testing transition type handling...")
    
    # Test enum creation
    try:
        transition_type = TransitionType("random")
        print(f"✓ Created transition type: {transition_type}")
        print(f"✓ Transition type value: {transition_type.value}")
        print(f"✓ Transition type type: {type(transition_type)}")
    except Exception as e:
        print(f"✗ Failed to create transition type: {e}")
        return False
    
    # Test scenario access
    try:
        ai = AutoMixAI()
        scenario = ai.TRANSITION_SCENARIOS[transition_type]
        print(f"✓ Got scenario: {scenario.name}")
        print(f"✓ BPM range: {scenario.bpm_range}")
        print(f"✓ Energy change: {scenario.energy_change}")
    except Exception as e:
        print(f"✗ Failed to get scenario: {e}")
        return False
    
    # Test track analysis creation
    try:
        current_track = TrackAnalysis(
            id="test",
            filename="test.mp3",
            camelot_key="11B",
            bpm=87.0,
            energy_level=7,
            duration=180.0
        )
        print(f"✓ Created current track: {current_track.filename}")
    except Exception as e:
        print(f"✗ Failed to create current track: {e}")
        return False
    
    # Test available tracks
    try:
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
        print(f"✓ Created available tracks: {len(available_tracks)} tracks")
    except Exception as e:
        print(f"✗ Failed to create available tracks: {e}")
        return False
    
    # Test get_next_track
    try:
        recommended_track = ai.get_next_track(current_track, available_tracks, transition_type)
        if recommended_track:
            print(f"✓ Got recommendation: {recommended_track.filename}")
        else:
            print("⚠ No recommendation returned")
    except Exception as e:
        print(f"✗ Failed to get next track: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    print("Auto Mix Debug Test")
    print("==================")
    
    success = test_transition_type()
    
    if success:
        print("\n✅ All tests passed!")
    else:
        print("\n❌ Some tests failed!")
        sys.exit(1)

