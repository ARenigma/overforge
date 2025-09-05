import os
import requests
import json

def test_openrouter_simple():
    """Simple test of OpenRouter API"""
    api_key = "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"
    if not api_key:
        print("❌ OPENROUTER_API_KEY not found")
        return False
    
    print(f"🧪 Testing OpenRouter API with key: {api_key[:15]}...")
    
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://overforge.dev",
        "X-Title": "Overforge Code Platform"
    }
    
    # Test with cheaper model first
    payload = {
        "model": "mistralai/codestral-2501",
        "messages": [{"role": "user", "content": "Write a simple hello world function in Python"}],
        "max_tokens": 100,
        "temperature": 0.1
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            print("✅ OpenRouter API is working!")
            print(f"✅ Model: mistralai/codestral-2501")
            print(f"✅ Response: {content[:100]}...")
            return True
        else:
            print(f"❌ API Error: {response.status_code}")
            print(f"❌ Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
        return False

if __name__ == "__main__":
    test_openrouter_simple() 