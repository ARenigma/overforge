#!/usr/bin/env python3
"""
OpenRouter API Test Script
Tests the OpenRouter API connection and model availability for Overforge
"""

import os
import asyncio
import httpx
import json
from config import AIConfig
from providers.openrouter_provider import OpenRouterProvider

async def test_openrouter_connection():
    """Test basic OpenRouter API connection"""
    print("🧪 Testing OpenRouter API Connection...")
    print("=" * 50)
    
    api_key = os.getenv('OPENROUTER_API_KEY')
    if not api_key:
        print("❌ OPENROUTER_API_KEY not found in environment")
        return False
    
    print(f"✅ API Key found: {api_key[:15]}...")
    
    # Test basic API connection
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
            
            if response.status_code == 200:
                models_data = response.json()
                total_models = len(models_data.get('data', []))
                print(f"✅ API Connection successful: {total_models} models available")
                return True
            else:
                print(f"❌ API Connection failed: HTTP {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
        return False

async def test_configured_models():
    """Test the specific models configured in our environment"""
    print("\n🧪 Testing Configured Models...")
    print("=" * 50)
    
    # Get configured models from config
    validation_models = AIConfig.get_validation_models()
    print(f"📋 Configured validation models: {len(validation_models)}")
    
    for i, model in enumerate(validation_models, 1):
        print(f"   {i}. {model['name']} ({model['id']}) - Priority {model['priority']}")
    
    # Test each model with a simple prompt
    api_key = os.getenv('OPENROUTER_API_KEY')
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://overforge.dev",
        "X-Title": "Overforge Code Platform"
    }
    
    test_results = []
    
    for model in validation_models:
        model_id = model['id']
        model_name = model['name']
        
        print(f"\n🧪 Testing {model_name}...")
        
        payload = {
            "model": model_id,
            "messages": [{"role": "user", "content": "Hello, can you help with code analysis?"}],
            "max_tokens": 50,
            "temperature": 0.1
        }
        
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers,
                    json=payload
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("choices") and len(data["choices"]) > 0:
                        content = data["choices"][0]["message"]["content"]
                        usage = data.get("usage", {})
                        print(f"✅ {model_name}: Working")
                        print(f"   Response: {content[:100]}...")
                        print(f"   Tokens used: {usage.get('total_tokens', 'unknown')}")
                        test_results.append({"model": model_name, "status": "working", "error": None})
                    else:
                        print(f"❌ {model_name}: No response content")
                        test_results.append({"model": model_name, "status": "failed", "error": "No response content"})
                else:
                    error_msg = f"HTTP {response.status_code}"
                    try:
                        error_data = response.json()
                        error_msg += f": {error_data.get('error', {}).get('message', response.text)}"
                    except:
                        error_msg += f": {response.text}"
                    
                    print(f"❌ {model_name}: {error_msg}")
                    test_results.append({"model": model_name, "status": "failed", "error": error_msg})
                    
        except Exception as e:
            print(f"❌ {model_name}: {str(e)}")
            test_results.append({"model": model_name, "status": "failed", "error": str(e)})
    
    return test_results

async def test_validation_flow():
    """Test the full validation flow using OpenRouter provider"""
    print("\n🧪 Testing Validation Flow...")
    print("=" * 50)
    
    try:
        # Initialize OpenRouter provider for validation
        provider = OpenRouterProvider(use_case="validation")
        
        # Test content validation
        test_code = """
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

print(fibonacci(10))
"""
        
        test_context = {
            "content_type": "code",
            "language": "python",
            "context": "Testing fibonacci implementation"
        }
        
        print("🧪 Testing validation with sample code...")
        result = await provider.validate_content(test_code, test_context)
        
        if result.get("success"):
            print("✅ Validation successful!")
            print(f"   Model used: {result.get('model_name', 'unknown')}")
            print(f"   Response time: {result.get('response_time', 0):.2f}s")
            
            validation_data = result.get("validation_data", {})
            if validation_data:
                overall = validation_data.get("overall_assessment", {})
                print(f"   Recommendation: {overall.get('final_recommendation', 'unknown')}")
                print(f"   Risk level: {overall.get('risk_level', 'unknown')}")
                print(f"   Confidence: {overall.get('confidence_score', 0)}%")
            
            return True
        else:
            print(f"❌ Validation failed: {result.get('error', 'Unknown error')}")
            return False
            
    except Exception as e:
        print(f"❌ Validation flow error: {str(e)}")
        return False

async def test_health_check():
    """Test the health check endpoint"""
    print("\n🧪 Testing Health Check...")
    print("=" * 50)
    
    try:
        provider = OpenRouterProvider(use_case="validation")
        health_result = await provider.health_check()
        
        if health_result.get("champion_models_healthy"):
            print("✅ Health check passed!")
            print(f"   Primary model: {health_result.get('primary_model', 'unknown')}")
            print(f"   Secondary model: {health_result.get('secondary_model', 'unknown')}")
        else:
            print("❌ Health check failed!")
        
        return health_result.get("champion_models_healthy", False)
        
    except Exception as e:
        print(f"❌ Health check error: {str(e)}")
        return False

async def main():
    """Run all OpenRouter tests"""
    print("🚀 OpenRouter API Test Suite")
    print("=" * 50)
    print(f"Testing API Key: {os.getenv('OPENROUTER_API_KEY', 'NOT_SET')[:15]}...")
    print()
    
    # Test results
    results = {
        "api_connection": False,
        "model_tests": [],
        "validation_flow": False,
        "health_check": False
    }
    
    # Run tests
    results["api_connection"] = await test_openrouter_connection()
    results["model_tests"] = await test_configured_models()
    results["validation_flow"] = await test_validation_flow()
    results["health_check"] = await test_health_check()
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)
    
    print(f"API Connection: {'✅ PASS' if results['api_connection'] else '❌ FAIL'}")
    
    working_models = len([m for m in results['model_tests'] if m['status'] == 'working'])
    total_models = len(results['model_tests'])
    print(f"Model Tests: {working_models}/{total_models} working")
    
    print(f"Validation Flow: {'✅ PASS' if results['validation_flow'] else '❌ FAIL'}")
    print(f"Health Check: {'✅ PASS' if results['health_check'] else '❌ FAIL'}")
    
    # Recommendations
    print("\n📋 RECOMMENDATIONS:")
    if not results["api_connection"]:
        print("❌ Fix API connection - check API key and network")
    
    if working_models == 0:
        print("❌ No models working - check model IDs and API access")
    elif working_models < total_models:
        print("⚠️ Some models failing - check specific model access")
    
    if not results["validation_flow"]:
        print("❌ Validation flow broken - check provider implementation")
    
    if all([results["api_connection"], working_models > 0, results["validation_flow"], results["health_check"]]):
        print("✅ All systems operational! OpenRouter is ready for production.")
    else:
        print("⚠️ Some issues detected - review failed tests above.")

if __name__ == "__main__":
    asyncio.run(main()) 