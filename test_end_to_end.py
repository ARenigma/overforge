#!/usr/bin/env python3
"""
End-to-End Test for OverForge LHIS System
Testing Python Core Language, Mid Level, Timing Decorator Question
"""

import requests
import json
import time
import sys

# Test configuration
BACKEND_URL = "http://localhost:5001"
AI_MODULE_URL = "http://localhost:8000"
FRONTEND_URL = "http://localhost:3000"

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

def test_service_health():
    """Test that all services are running"""
    print("🧪 Testing service health...")
    
    # Test backend
    try:
        response = requests.get(f"{BACKEND_URL}/health", timeout=5)
        if response.status_code == 200:
            print("✅ Backend is running")
            health_data = response.json()
            if health_data.get('services', {}).get('ai') == 'available':
                print("✅ Backend can reach AI module")
            else:
                print("❌ Backend cannot reach AI module")
        else:
            print(f"❌ Backend health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Backend not accessible: {e}")
        return False
    
    # Test AI module
    try:
        response = requests.get(f"{AI_MODULE_URL}/health", timeout=5)
        if response.status_code == 200:
            print("✅ AI module is running")
        else:
            print(f"⚠️ AI module health check failed: {response.status_code}")
    except Exception as e:
        print(f"⚠️ AI module not accessible: {e} - continuing with backend tests")
    
    return True

def test_parameter_session_creation():
    """Test creating a parameter-based session for Python Core Mid level"""
    print("\n🧪 Testing parameter session creation...")
    
    try:
        payload = {
            "userId": "test-user-123",
            "assessmentMode": "core_language",
            "coreLanguage": "Python",
            "framework": None,
            "techStack": None,
            "seniorityLevel": "mid",
            "subcategory": None
        }
        
        response = requests.post(
            f"{BACKEND_URL}/api/parameter-selection/create-session",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            session_id = data.get('roomId')
            print(f"✅ Parameter session created: {session_id}")
            return session_id
        else:
            print(f"❌ Session creation failed: {response.status_code}")
            print(f"Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Session creation error: {e}")
        return None

def test_session_problems(session_id):
    """Test loading problems for the session"""
    print(f"\n🧪 Testing problem loading for session {session_id}...")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/api/sessions/{session_id}/problems",
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('data', {}).get('problems'):
                problems = data['data']['problems']
                print(f"✅ Loaded {len(problems)} problems")
                for problem in problems:
                    print(f"   - {problem.get('title', 'Unknown')} (ID: {problem.get('id')})")
                return problems
            else:
                print("❌ No problems found in response")
                return None
        else:
            print(f"❌ Problem loading failed: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Problem loading error: {e}")
        return None

def test_ai_direct_analysis():
    """Test AI module directly with the timing decorator code"""
    print("\n🧪 Testing AI module direct analysis...")
    
    try:
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
            if question and len(question) > 20:  # Reasonable question length
                print("✅ AI generated a question:")
                print(f"   📝 {question[:200]}{'...' if len(question) > 200 else ''}")
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

def test_backend_parameter_analysis():
    """Test backend parameter analysis with timing decorator code"""
    print("\n🧪 Testing backend parameter analysis...")
    
    try:
        payload = {
            "code": TIMING_DECORATOR_CODE,
            "language": "python",
            "userId": 123,
            "roomName": "test-param-session"
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
            
            # Check if any meaningful analysis was done
            if data.get('question') or data.get('insight'):
                print("✅ Backend generated analysis content")
                return True
            else:
                print("❌ Backend analysis empty")
                return False
        else:
            print(f"❌ Backend analysis failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Backend analysis error: {e}")
        return False

def test_problem_solutions_query():
    """Test if we can query existing solutions for comparison"""
    print("\n🧪 Testing solution comparison capability...")
    
    try:
        # Try to get problem solutions for comparison
        response = requests.get(
            f"{BACKEND_URL}/api/problems/core-8/solutions",  # core-8 is Function Decorator
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data and len(data) > 0:
                print(f"✅ Found {len(data)} existing solutions for comparison")
                return True
            else:
                print("⚠️ No existing solutions found for comparison")
                return False
        else:
            print(f"❌ Solution query failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Solution query error: {e}")
        return False

def run_full_test():
    """Run the complete end-to-end test"""
    print("🚀 Starting End-to-End Test for OverForge LHIS System")
    print("=" * 60)
    
    # Test 1: Service Health
    if not test_service_health():
        print("❌ Service health test failed - stopping")
        return False
    
    # Test 2: Parameter Session Creation  
    session_id = test_parameter_session_creation()
    if not session_id:
        print("❌ Session creation failed - stopping")
        return False
    
    # Test 3: Problem Loading
    problems = test_session_problems(session_id)
    if not problems:
        print("❌ Problem loading failed - stopping")
        return False
    
    # Test 4: AI Direct Analysis
    if not test_ai_direct_analysis():
        print("❌ AI direct analysis failed")
    
    # Test 5: Backend Parameter Analysis
    if not test_backend_parameter_analysis():
        print("❌ Backend parameter analysis failed")
    
    # Test 6: Solution Comparison
    if not test_problem_solutions_query():
        print("⚠️ Solution comparison not available")
    
    print("\n" + "=" * 60)
    print("🎉 End-to-End Test Completed!")
    print("\nNext step: Test in frontend manually with the timing decorator code")
    print("Expected: Depth questions should be generated when you type 200+ chars")
    
    return True

if __name__ == "__main__":
    success = run_full_test()
    sys.exit(0 if success else 1)
