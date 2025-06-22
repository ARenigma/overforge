import os
from typing import Optional, Dict, Any
from mistralai.client import MistralClient
from mistralai.models.chat_completion import ChatMessage
from config import AIConfig

class MistralProvider:
    """Provider for Mistral AI and Codestral APIs."""
    
    def __init__(self):
        self.mistral_client = None
        self.codestral_client = None
        
        # Initialize Mistral client if API key is available
        if AIConfig.MISTRAL_API_KEY:
            self.mistral_client = MistralClient(api_key=AIConfig.MISTRAL_API_KEY)
            
        # Initialize Codestral client if API key is available
        # Codestral uses a different endpoint: https://codestral.mistral.ai
        if AIConfig.CODESTRAL_API_KEY:
            self.codestral_client = MistralClient(
                api_key=AIConfig.CODESTRAL_API_KEY,
                endpoint="https://codestral.mistral.ai"
            )
    
    def is_available(self, provider_type: str = "mistral") -> bool:
        """Check if the specified provider is available."""
        if provider_type == "mistral":
            return self.mistral_client is not None
        elif provider_type == "codestral":
            return self.codestral_client is not None
        return False
    
    async def generate_response(self, prompt: str, provider_type: str = "mistral") -> Dict[str, Any]:
        """Generate a response using the specified Mistral provider."""
        try:
            if provider_type == "mistral" and self.mistral_client:
                client = self.mistral_client
                model = AIConfig.MISTRAL_MODEL
            elif provider_type == "codestral" and self.codestral_client:
                client = self.codestral_client
                # Codestral model name is codestral-2501 (the latest version)
                model = "codestral-2501"
            else:
                raise ValueError(f"Provider {provider_type} is not available")
            
            # Create chat messages using ChatMessage class
            messages = [ChatMessage(role="user", content=prompt)]
            
            if AIConfig.DEBUG_MODE:
                print(f"Sending request to {provider_type} with model {model}")
                if provider_type == "codestral":
                    print(f"Using Codestral endpoint: https://codestral.mistral.ai")
            
            # Make API call using the chat method
            response = client.chat(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=2000
            )
            
            content = response.choices[0].message.content
            
            return {
                "success": True,
                "content": content,
                "provider": provider_type,
                "model": model,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                    "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                    "total_tokens": response.usage.total_tokens if response.usage else 0
                }
            }
            
        except Exception as e:
            if AIConfig.DEBUG_MODE:
                print(f"Error with {provider_type}: {e}")
            
            return {
                "success": False,
                "error": str(e),
                "provider": provider_type,
                "content": None
            }
    
    async def test_connection(self, provider_type: str = "mistral") -> Dict[str, Any]:
        """Test connection to the specified provider."""
        test_prompt = "Hello! Please respond with 'Connection successful' if you can read this."
        
        result = await self.generate_response(test_prompt, provider_type)
        
        return {
            "provider": provider_type,
            "connected": result["success"],
            "response": result.get("content", ""),
            "error": result.get("error"),
            "model": AIConfig.MISTRAL_MODEL if provider_type == "mistral" else "codestral-2501"
        } 