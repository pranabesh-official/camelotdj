#!/usr/bin/env python3
"""
Test script to simulate USB storage device detection
"""

import sys
import os
import tempfile
import shutil

# Add the current directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from api import get_usb_devices, get_mounted_usb_devices
    print("✅ Successfully imported USB detection functions")
    
    print("\n🔍 Testing USB device detection...")
    devices = get_usb_devices()
    print(f"Found {len(devices)} total devices")
    
    # Count by type
    storage_devices = [d for d in devices if d.get('type') == 'usb_storage']
    other_devices = [d for d in devices if d.get('type') != 'usb_storage']
    
    print(f"  - USB Storage devices: {len(storage_devices)}")
    print(f"  - Other USB devices: {len(other_devices)}")
    
    print("\n📱 Other USB devices found:")
    for i, device in enumerate(other_devices):
        print(f"  {i + 1}. {device.get('manufacturer', 'Unknown')} - {device.get('product_id', 'Unknown')}")
    
    print("\n💾 Testing mounted USB device detection...")
    mounted_devices = get_mounted_usb_devices()
    print(f"Found {len(mounted_devices)} mounted USB storage devices")
    
    if mounted_devices:
        for i, device in enumerate(mounted_devices):
            print(f"\nMounted Device {i + 1}:")
            for key, value in device.items():
                print(f"  {key}: {value}")
    else:
        print("  No USB storage devices are currently mounted")
        print("  To test with a real device:")
        print("  1. Connect a USB drive or external hard drive")
        print("  2. Make sure it's mounted (appears in /Volumes on macOS)")
        print("  3. Run this test again")
    
    print("\n✅ USB detection test completed successfully!")
    
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Make sure you're running this from the python directory")
except Exception as e:
    print(f"❌ Error during testing: {e}")
    import traceback
    traceback.print_exc()
