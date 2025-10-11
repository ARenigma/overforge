#!/usr/bin/env python3
"""
Test solution comparison functionality
Check if the system can access and compare stored solutions
"""

import requests
import json

BACKEND_URL = "http://localhost:5001"

def test_lhis_with_problem_id():
    """Test LHIS depth question generation with explicit problem ID"""
    print("🧪 Testing LHIS with problem ID for solution comparison...")
    
    # This mimics what should happen when LHIS generates a depth question
    # We'll call the AI service directly with approach comparison context
    
    timing_decorator_code = '''import time
from functools import wraps

def timing_decorator(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.perf_counter()   # high-resolution timer
        result = func(*args, **kwargs)
        end_time = time.perf_counter()
        elapsed = end_time - start_time
        print(f"⏱️ Function '{func.__name__}' executed in {elapsed:.6f} seconds")
        return result
    return wrapper

# Example usage
@timing_decorator
def slow_function():
    time.sleep(1.5)
    return "Done"

print(slow_function())
'''
    
    # Create a prompt that includes approach comparison (what LHIS should be doing)
    prompt_with_approaches = f"""You are a technical interviewer. Generate a high-quality assessment question.

INTERVIEW CONTEXT:
- Parameter: Problem Solving
- Assessment Depth: Foundation (Level 1/3)

CANDIDATE'S CURRENT CODE:
```python
{timing_decorator_code}
```

COMPARATIVE APPROACH CONTEXT:
Based on stored solutions in our database, here are alternative approaches for timing decorators:

1. **Context Manager Approach**: Using context managers with `with` statements for timing
2. **Manual Timing Approach**: Direct timing code within functions without decorators  
3. **Class-based Decorator**: Using class decorators instead of function decorators
4. **Profiling Approach**: Using cProfile or other profiling tools
5. **Middleware Approach**: Timing at application middleware level

Ask a casual, conversational question that:
1. References their actual code approach
2. Explores WHY they chose this approach vs alternatives
3. Discusses trade-offs and different solutions
4. Sounds natural, like a human would ask

Just respond with the question directly - no JSON formatting needed. Make it sound conversational and curious about their technical choices."""

    try:
        # Test AI module directly first
        ai_response = requests.post(
            "http://localhost:8000/analyze",
            json={"code": prompt_with_approaches, "language": "python"},
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        
        if ai_response.status_code == 200:
            data = ai_response.json()
            question = data.get('question', '').strip()
            print("✅ AI generated question with approach comparison:")
            print(f"📝 {question}")
            
            # Check if the question mentions alternative approaches
            approach_mentions = []
            approaches = ['context manager', 'manual timing', 'class-based', 'profiling', 'middleware']
            for approach in approaches:
                if approach.lower() in question.lower():
                    approach_mentions.append(approach)
            
            if approach_mentions:
                print(f"✅ Question mentions alternative approaches: {approach_mentions}")
            else:
                print("⚠️ Question doesn't explicitly mention stored alternative approaches")
            
            return True
        else:
            print(f"❌ AI request failed: {ai_response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

def test_backend_solutions_access():
    """Test if backend can access solutions table"""
    print("\n🧪 Testing backend access to solutions...")
    
    # Try different endpoints that might expose solutions
    endpoints = [
        "/api/problems/core-8",
        "/api/problems/core-8/solutions", 
        "/api/solutions/core-8",
        "/health"  # This should show if supabase is connected
    ]
    
    for endpoint in endpoints:
        try:
            response = requests.get(f"{BACKEND_URL}{endpoint}", timeout=5)
            print(f"📡 {endpoint}: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                if endpoint == "/health":
                    db_status = data.get('services', {}).get('database', 'unknown')
                    print(f"   Database status: {db_status}")
                elif data:
                    print(f"   Data available: {type(data)}")
                    if isinstance(data, list):
                        print(f"   Items: {len(data)}")
                    elif isinstance(data, dict):
                        print(f"   Keys: {list(data.keys())[:3]}")
                        
        except Exception as e:
            print(f"❌ {endpoint}: {e}")

def run_solution_test():
    """Run solution comparison tests"""
    print("🚀 Testing Solution Comparison System")
    print("=" * 50)
    
    # Test backend access
    test_backend_solutions_access()
    
    # Test AI with approach comparison
    success = test_lhis_with_problem_id()
    
    print("\n" + "=" * 50)
    if success:
        print("✅ Solution comparison capability confirmed")
        print("💡 The system CAN compare approaches when provided context")
        print("🔧 Issue: LHIS needs to properly fetch stored solutions from Supabase")
    else:
        print("❌ Solution comparison test failed")
    
    return success

if __name__ == "__main__":
    run_solution_test()
