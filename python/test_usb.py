#!/usr/bin/env python3
"""
Simple test script for USB detection
"""

import sys
import os

# Add the current directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from api import get_usb_devices, get_mounted_usb_devices
    print("✅ Successfully imported USB detection functions")
    
    print("\n🔍 Testing USB device detection...")
    devices = get_usb_devices()
    print(f"Found {len(devices)} total devices")
    
    for i, device in enumerate(devices):
        print(f"\nDevice {i + 1}:")
        for key, value in device.items():
            print(f"  {key}: {value}")
    
    print("\n💾 Testing mounted USB device detection...")
    mounted_devices = get_mounted_usb_devices()
    print(f"Found {len(mounted_devices)} mounted USB storage devices")
    
    for i, device in enumerate(mounted_devices):
        print(f"\nMounted Device {i + 1}:")
        for key, value in device.items():
            print(f"  {key}: {value}")
    
    print("\n✅ USB detection test completed successfully!")
    
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Make sure you're running this from the python directory")
except Exception as e:
    print(f"❌ Error during testing: {e}")
    import traceback
    traceback.print_exc()
