#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script for Mistral Devstral-2512 model
Tests the API connection and model response
"""

import os
import sys
import io
from dotenv import load_dotenv
from mistralai.client import MistralClient

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Load environment variables
load_dotenv()

def test_mistral_devstral():
    """Test Mistral Devstral-2512 model connection and response."""
    
    # Get configuration
    api_key = os.getenv("MISTRAL_API_KEY")
    model = os.getenv("MISTRAL_MODEL", "devstral-2512")
    
    if not api_key:
        print("❌ MISTRAL_API_KEY not found in .env file")
        return False
    
    print(f"🔑 API Key: {api_key[:10]}...")
    print(f"🤖 Model: {model}")
    print(f"🌐 Endpoint: https://api.mistral.ai (default)")
    print()
    
    try:
        # Initialize Mistral client
        print("🔌 Initializing Mistral client...")
        client = MistralClient(api_key=api_key)
        print("✅ Client initialized successfully")
        print()
        
        # Test with a simple prompt
        test_prompt = "Hello! Can you tell me what model you are and respond with a brief greeting?"
        print(f"📤 Sending test prompt: {test_prompt}")
        print()
        
        response = client.chat(
            model=model,
            messages=[{"role": "user", "content": test_prompt}],
            temperature=0.7,
            max_tokens=200
        )
        
        # Extract response
        content = response.choices[0].message.content
        usage = response.usage
        
        print("✅ Response received successfully!")
        print()
        print("📥 Model Response:")
        print("-" * 60)
        print(content)
        print("-" * 60)
        print()
        
        if usage:
            print("📊 Token Usage:")
            print(f"   Prompt tokens: {usage.prompt_tokens}")
            print(f"   Completion tokens: {usage.completion_tokens}")
            print(f"   Total tokens: {usage.total_tokens}")
            print()
        
        print("🎉 Mistral Devstral-2512 is working correctly!")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        print()
        print("Error details:")
        print(f"   Type: {type(e).__name__}")
        print(f"   Message: {str(e)}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("🧪 Testing Mistral Devstral-2512 Model")
    print("=" * 60)
    print()
    
    success = test_mistral_devstral()
    
    print()
    print("=" * 60)
    if success:
        print("✅ Test completed successfully!")
        sys.exit(0)
    else:
        print("❌ Test failed!")
        sys.exit(1)

