#!/usr/bin/env python3
"""
Test Frontend-Backend Connection for LHIS
Debug why questions aren't appearing in frontend
"""

import requests
import json

def test_lhis_session_flow():
    """Test the exact flow that happens when frontend sends code"""
    print("🔍 Testing Frontend-Backend LHIS Connection")
    print("=" * 60)
    
    # The exact code from your frontend
    timing_code = """import time
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

print(slow_function())"""

    session_id = "param-1757079471919-6626vtp8x"  # From your logs
    
    print(f"Session ID: {session_id}")
    print(f"Code length: {len(timing_code)} chars")
    print()
    
    # Test 1: Check if backend can analyze the code directly
    print("1. Testing backend AI analysis...")
    try:
        response = requests.post(
            "http://localhost:5001/api/analyze-code",
            json={
                "code": timing_code,
                "language": "python", 
                "userId": "96309db6-fcc6-49f1-9738-9fe2dd6b9640",
                "roomName": session_id
            },
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Backend analysis successful")
            print(f"   Type: {data.get('type')}")
            print(f"   Provider: {data.get('provider_used')}")
            question = data.get('question', '').strip()
            if question:
                print(f"   Question generated: {len(question)} chars")
                print(f"   Preview: {question[:100]}...")
            else:
                print(f"   ❌ No question generated")
        else:
            print(f"❌ Backend analysis failed: {response.status_code}")
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"❌ Backend analysis error: {e}")
    
    # Test 2: Check LHIS session status  
    print(f"\n2. Testing LHIS session status...")
    try:
        # This endpoint might not exist, but let's try
        response = requests.get(f"http://localhost:5001/api/sessions/{session_id}")
        if response.status_code == 200:
            print("✅ Session found in backend")
        else:
            print(f"⚠️ Session endpoint: {response.status_code}")
    except Exception as e:
        print(f"⚠️ Session check error: {e}")
    
    # Test 3: Check if problem solutions are accessible for this session
    print(f"\n3. Testing problem solutions access...")
    try:
        # The session should be using problem ID 8 (Function Decorator)
        response = requests.get("http://localhost:5001/api/problems/8/solutions")
        if response.status_code == 200:
            data = response.json()
            solutions = data.get('solutions', [])
            print(f"✅ Found {len(solutions)} solutions for comparison")
            for solution in solutions[:2]:  # Show first 2
                print(f"   - {solution['approach_key']}: {solution['title']}")
        else:
            print(f"❌ Solutions not accessible: {response.status_code}")
    except Exception as e:
        print(f"❌ Solutions error: {e}")
    
    # Test 4: Test AI with LHIS-style prompt
    print(f"\n4. Testing AI with LHIS prompt format...")
    
    lhis_prompt = f"""You are a technical interviewer. Generate a high-quality assessment question.

INTERVIEW CONTEXT:
- Parameter: Problem Solving
- Assessment Depth: Foundation (Level 1/3)

CANDIDATE'S CURRENT CODE:
```python
{timing_code}
```

COMPARATIVE APPROACH CONTEXT:
Based on stored solutions in our database for this timing problem:

1. **time-decorator** (your approach): A decorator that wraps around a function to measure and print its execution time using the time module.
2. **time-decorator-with-return**: An enhanced version that returns the execution time along with the function result.
3. **context-manager**: Using a context manager to measure and print the execution time of a block of code.

Ask a casual, conversational question that:
1. References their actual code approach
2. Explores WHY they chose this approach vs alternatives
3. Discusses trade-offs and different solutions
4. Sounds natural, like a human would ask

Just respond with the question directly - no JSON formatting needed."""

    try:
        response = requests.post(
            "http://localhost:8000/analyze",
            json={"code": lhis_prompt, "language": "python"},
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            question = data.get('question', '').strip()
            print(f"✅ AI generated LHIS question:")
            print(f"📝 {question}")
        else:
            print(f"❌ AI LHIS test failed: {response.status_code}")
    except Exception as e:
        print(f"❌ AI LHIS test error: {e}")
    
    print("\n" + "=" * 60)
    print("🔍 DIAGNOSIS:")
    print("If backend analysis works but frontend doesn't get questions,")
    print("the issue is likely in the WebSocket/LHIS flow.")
    print("\nNext steps:")
    print("1. Check if LHIS is properly detecting the session")
    print("2. Verify WebSocket question emission")
    print("3. Check frontend chat panel WebSocket listeners")

if __name__ == "__main__":
    test_lhis_session_flow()
