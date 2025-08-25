"""
Simple calculator module for the electron-python boilerplate.
This is required by the original boilerplate design.
Based on https://en.wikipedia.org/wiki/Reverse_Polish_notation
"""

def calc(text):
    """
    Calculate mathematical expressions from text input.
    
    Args:
        text (str): Mathematical expression to evaluate
        
    Returns:
        float: Result of the calculation
    """
    try:
        # Use eval for simple mathematical expressions
        # Note: In production, consider using a safer math parser
        result = eval(text)
        return float(result)
    except Exception as e:
        print(f"Calculation error: {e}")
        return 0.0

# Example usage
if __name__ == "__main__":
    print(calc("1 + 1"))  # Should output 2.0
    print(calc("2 * 3"))  # Should output 6.0
    print(calc("10 / 2")) # Should output 5.0
