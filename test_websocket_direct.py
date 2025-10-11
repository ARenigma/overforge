#!/usr/bin/env python3
"""
Test WebSocket Message Sending Directly
"""

import requests
import json

def test_direct_message():
    """Send a test message directly to the session"""
    
    session_id = "param-1757083263197-w01zcaphg"
    
    print(f"🔍 Testing direct WebSocket message to: {session_id}")
    
    # Create a test message similar to what LHIS sends
    test_message = {
        "id": f"test-{int(__import__('time').time() * 1000)}",
        "userId": "lhis",
        "username": "LHIS",
        "message": "🧪 TEST: This is a test message to verify WebSocket connectivity",
        "timestamp": __import__('datetime').datetime.now().isoformat(),
        "sender": {
            "id": "lhis",
            "name": "LHIS",
            "type": "test_message"
        },
        "questionLabel": "Test Message",
        "questionContext": {
            "type": "test_message"
        }
    }
    
    print(f"📤 Sending test message...")
    print(f"   Message: {test_message['message']}")
    print()
    
    # Try to send via the backend's chat endpoint
    try:
        response = requests.post(
            "http://localhost:5001/api/chat/send-message",
            json={
                "sessionId": session_id,
                "message": test_message,
                "eventType": "both"  # Send both chatMessage and newMessage
            },
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 200:
            print("✅ Test message sent successfully")
            print("   Check your frontend chat panel for the test message")
        else:
            print(f"❌ Failed to send test message: {response.status_code}")
            print(f"   Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Error sending test message: {e}")
        
    # Alternative: Try to trigger via assessment endpoint
    print(f"\n🔄 Alternative: Triggering via assessment analysis...")
    try:
        response = requests.post(
            "http://localhost:5001/api/assessment/trigger-question",
            json={
                "sessionId": session_id,
                "questionText": "🧪 MANUAL TEST: Can you see this test question from the assessment system?",
                "parameterId": 0,
                "depthLevel": 1
            },
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 200:
            print("✅ Assessment test question triggered")
        else:
            print(f"❌ Assessment test failed: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Assessment test error: {e}")

if __name__ == "__main__":
    test_direct_message()
