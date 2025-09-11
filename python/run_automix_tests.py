#!/usr/bin/env python3
"""
Auto Mix Test Runner
===================

This script runs the comprehensive test suite for the automix feature.
It can be run independently or as part of the main application testing.

Usage:
    python run_automix_tests.py [--verbose] [--coverage]

Author: AI Assistant
Date: 2024
"""

import sys
import os
import argparse
import time
from pathlib import Path

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def main():
    """Main test runner function."""
    parser = argparse.ArgumentParser(description="Run Auto Mix test suite")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--coverage", "-c", action="store_true", help="Run with coverage analysis")
    parser.add_argument("--specific", "-s", help="Run specific test class (e.g., TestAutoMixAI)")
    
    args = parser.parse_args()
    
    print("🧪 Auto Mix Test Suite Runner")
    print("=" * 50)
    print(f"Python version: {sys.version}")
    print(f"Working directory: {os.getcwd()}")
    print(f"Test file: {__file__}")
    print("=" * 50)
    
    # Import test modules
    try:
        from test_automix import run_automix_tests, unittest
        print("✅ Test modules imported successfully")
    except ImportError as e:
        print(f"❌ Failed to import test modules: {e}")
        return 1
    
    # Check if we can import the main modules
    try:
        from automix_ai import AutoMixAI, TrackAnalysis, TransitionType
        from automix_api import AutoMixAPI
        print("✅ Auto Mix modules imported successfully")
    except ImportError as e:
        print(f"❌ Failed to import Auto Mix modules: {e}")
        print("Make sure all dependencies are installed:")
        print("  pip install -r requirements.txt")
        return 1
    
    # Run specific test if requested
    if args.specific:
        print(f"🎯 Running specific test: {args.specific}")
        try:
            # Import the specific test class
            from test_automix import *
            test_class = globals()[args.specific]
            
            # Create test suite for specific class
            suite = unittest.TestLoader().loadTestsFromTestCase(test_class)
            runner = unittest.TextTestRunner(verbosity=2 if args.verbose else 1)
            result = runner.run(suite)
            
            return 0 if result.wasSuccessful() else 1
            
        except KeyError:
            print(f"❌ Test class '{args.specific}' not found")
            return 1
        except Exception as e:
            print(f"❌ Error running specific test: {e}")
            return 1
    
    # Run all tests
    print("🚀 Starting test execution...")
    start_time = time.time()
    
    try:
        success = run_automix_tests()
        end_time = time.time()
        
        print(f"\n⏱️  Test execution time: {end_time - start_time:.2f} seconds")
        
        if success:
            print("\n✅ All tests passed successfully!")
            return 0
        else:
            print("\n❌ Some tests failed!")
            return 1
            
    except Exception as e:
        print(f"\n💥 Test execution failed with error: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
