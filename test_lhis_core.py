#!/usr/bin/env python3
"""
Core LHIS Test - Testing AI Question Generation with Timing Decorator
Focuses on the core question generation without full authentication flow
"""

import requests
import json
import time

# Test configuration
BACKEND_URL = "http://localhost:5001"
AI_MODULE_URL = "http://localhost:8000"

# Test data - using the timing_decorator.py code
TIMING_DECORATOR_CODE = '''import time
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

def test_ai_lhis_detection():
    """Test the simplified LHIS detection in AI module"""
    print("🧪 Testing AI LHIS Detection with simplified prompt...")
    
    # Create a LHIS-style prompt that should trigger the new simplified detection
    prompt = f"""You are a technical interviewer. Generate a high-quality assessment question.

INTERVIEW CONTEXT:
- Parameter: Problem Solving
- Assessment Depth: Foundation (Level 1/3)

CANDIDATE'S CURRENT CODE:
```python
{TIMING_DECORATOR_CODE}
```

Ask a casual, conversational question that:
1. References their actual code approach
2. Explores WHY they chose this approach vs alternatives
3. Discusses trade-offs and different solutions
4. Sounds natural, like a human would ask

Just respond with the question directly - no JSON formatting needed. Make it sound conversational and curious about their technical choices."""

    try:
        payload = {
            "code": prompt,
            "language": "python"
        }
        
        response = requests.post(
            f"{AI_MODULE_URL}/analyze",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            question = data.get('question', '').strip()
            print(f"✅ AI Response received (type: {data.get('type', 'unknown')})")
            
            if question and len(question) > 50:  # Reasonable question length
                print("✅ AI generated a substantial question:")
                print(f"📝 Question: {question}")
                print(f"📏 Length: {len(question)} characters")
                
                # Check if it references the code
                if any(keyword in question.lower() for keyword in ['decorator', 'timing', 'perf_counter', 'wraps', 'functools']):
                    print("✅ Question references the candidate's code approach")
                else:
                    print("⚠️ Question may not reference specific code approach")
                
                return True
            else:
                print("❌ AI response too short or empty")
                print(f"Full response: {data}")
                return False
        else:
            print(f"❌ AI analysis failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ AI analysis error: {e}")
        return False

def test_backend_ai_call():
    """Test backend calling AI module for analysis"""
    print("\n🧪 Testing backend AI analysis call...")
    
    try:
        payload = {
            "code": TIMING_DECORATOR_CODE,
            "language": "python",
            "userId": 123,
            "roomName": "test-session"
        }
        
        response = requests.post(
            f"{BACKEND_URL}/api/analyze-code",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Backend analysis completed")
            print(f"   Response type: {data.get('type', 'unknown')}")
            print(f"   Provider used: {data.get('provider_used', 'unknown')}")
            
            question = data.get('question', '').strip()
            if question and len(question) > 20:
                print("✅ Backend received question from AI")
                print(f"📝 Question: {question[:150]}{'...' if len(question) > 150 else ''}")
                return True
            else:
                print("❌ No meaningful question returned")
                print(f"Full response: {data}")
                return False
        else:
            print(f"❌ Backend analysis failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Backend analysis error: {e}")
        return False

def test_problem_comparison():
    """Test if system can access stored problem solutions"""
    print("\n🧪 Testing access to stored problem solutions...")
    
    # Test multiple endpoints that might contain solutions
    endpoints_to_try = [
        "/api/problems/core-8/solutions",
        "/api/problems/function-decorator/solutions", 
        "/api/problems/solutions",
        "/api/problems/core-8"
    ]
    
    for endpoint in endpoints_to_try:
        try:
            response = requests.get(
                f"{BACKEND_URL}{endpoint}",
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data and (isinstance(data, list) and len(data) > 0 or isinstance(data, dict)):
                    print(f"✅ Found solutions at {endpoint}")
                    print(f"   Data structure: {type(data)}")
                    if isinstance(data, list):
                        print(f"   Number of items: {len(data)}")
                    elif isinstance(data, dict):
                        print(f"   Keys: {list(data.keys())[:5]}")  # Show first 5 keys
                    return True
                else:
                    print(f"⚠️ Empty response from {endpoint}")
            else:
                print(f"⚠️ {endpoint} returned {response.status_code}")
                
        except Exception as e:
            print(f"⚠️ Error testing {endpoint}: {e}")
    
    print("❌ No accessible solution endpoints found")
    return False

def test_service_health():
    """Quick health check"""
    print("🧪 Testing service health...")
    
    try:
        backend_response = requests.get(f"{BACKEND_URL}/health", timeout=5)
        ai_response = requests.get(f"{AI_MODULE_URL}/health", timeout=5)
        
        backend_ok = backend_response.status_code == 200
        ai_ok = ai_response.status_code == 200
        
        print(f"Backend: {'✅' if backend_ok else '❌'}")
        print(f"AI Module: {'✅' if ai_ok else '❌'}")
        
        return backend_ok and ai_ok
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False

def run_core_test():
    """Run the core LHIS functionality test"""
    print("🚀 Core LHIS Test - Timing Decorator Question Generation")
    print("=" * 60)
    
    # Test 1: Service Health
    if not test_service_health():
        print("❌ Services not healthy - stopping")
        return False
    
    # Test 2: AI LHIS Detection
    ai_working = test_ai_lhis_detection()
    
    # Test 3: Backend AI Integration
    backend_working = test_backend_ai_call()
    
    # Test 4: Solution Comparison Access
    solutions_working = test_problem_comparison()
    
    print("\n" + "=" * 60)
    print("📊 Test Results Summary:")
    print(f"   AI LHIS Detection: {'✅' if ai_working else '❌'}")
    print(f"   Backend AI Integration: {'✅' if backend_working else '❌'}")
    print(f"   Solution Comparison: {'✅' if solutions_working else '❌'}")
    
    if ai_working and backend_working:
        print("\n🎉 Core LHIS functionality is working!")
        print("✅ The system should generate depth questions for timing decorator code")
        print("\n📋 Next Steps:")
        print("1. Open frontend at http://localhost:3000")
        print("2. Create a Python Mid-level parameter session") 
        print("3. Paste the timing decorator code (200+ chars)")
        print("4. Wait 2-3 seconds for question generation")
        print("5. Check chat panel for depth questions")
        
        return True
    else:
        print("\n❌ Core functionality issues detected")
        return False

if __name__ == "__main__":
    success = run_core_test()
