from typing import Dict, Any, List, Optional
from .mistral_provider import MistralProvider
from .ollama_provider import OllamaProvider
from config import AIConfig

class AIManager:
    """Central manager for AI providers with fallback logic."""
    
    def __init__(self):
        self.mistral_provider = MistralProvider()
        self.ollama_provider = OllamaProvider()
        self.provider_order = self._determine_provider_order()
    
    def _determine_provider_order(self) -> List[str]:
        """Determine the order of providers to try based on configuration."""
        order = []
        
        # Add primary provider first
        primary = AIConfig.PRIMARY_AI_PROVIDER
        if primary == "mistral" and self.mistral_provider.is_available("mistral"):
            order.append("mistral")
        elif primary == "codestral" and self.mistral_provider.is_available("codestral"):
            order.append("codestral")
        elif primary == "ollama" and AIConfig.ENABLE_OLLAMA_FALLBACK:
            order.append("ollama")
        
        # Add other available providers as fallbacks
        available_providers = AIConfig.get_available_providers()
        for provider in available_providers:
            if provider not in order:
                order.append(provider)
        
        if AIConfig.DEBUG_MODE:
            print(f"Provider order: {order}")
        
        return order
    
    async def generate_response(self, prompt: str, preferred_provider: Optional[str] = None) -> Dict[str, Any]:
        """Generate response with automatic fallback to other providers."""
        providers_to_try = [preferred_provider] if preferred_provider else self.provider_order
        
        # Remove None values and ensure we have valid providers
        providers_to_try = [p for p in providers_to_try if p]
        if not providers_to_try:
            providers_to_try = self.provider_order
        
        last_error = None
        
        for provider in providers_to_try:
            try:
                if AIConfig.DEBUG_MODE:
                    print(f"Trying provider: {provider}")
                
                if provider in ["mistral", "codestral"]:
                    if self.mistral_provider.is_available(provider):
                        result = await self.mistral_provider.generate_response(prompt, provider)
                        if result["success"]:
                            return result
                        last_error = result.get("error")
                
                elif provider == "ollama" and AIConfig.ENABLE_OLLAMA_FALLBACK:
                    if self.ollama_provider.is_available():
                        result = await self.ollama_provider.generate_response(prompt)
                        if result["success"]:
                            return result
                        last_error = result.get("error")
                
            except Exception as e:
                last_error = str(e)
                if AIConfig.DEBUG_MODE:
                    print(f"Provider {provider} failed: {e}")
                continue
        
        # All providers failed
        return {
            "success": False,
            "error": f"All providers failed. Last error: {last_error}",
            "provider": "none",
            "content": None,
            "attempted_providers": providers_to_try
        }
    
    async def test_all_providers(self) -> Dict[str, Any]:
        """Test all available providers and return their status."""
        results = {}
        
        # Test Mistral
        if AIConfig.MISTRAL_API_KEY:
            results["mistral"] = await self.mistral_provider.test_connection("mistral")
        
        # Test Codestral
        if AIConfig.CODESTRAL_API_KEY:
            results["codestral"] = await self.mistral_provider.test_connection("codestral")
        
        # Test Ollama
        if AIConfig.ENABLE_OLLAMA_FALLBACK:
            results["ollama"] = await self.ollama_provider.test_connection()
        
        return {
            "config": AIConfig.validate_config(),
            "provider_tests": results,
            "provider_order": self.provider_order
        }
    
    def get_provider_status(self) -> Dict[str, Any]:
        """Get current status of all providers."""
        return {
            "primary_provider": AIConfig.PRIMARY_AI_PROVIDER,
            "provider_order": self.provider_order,
            "mistral_available": self.mistral_provider.is_available("mistral"),
            "codestral_available": self.mistral_provider.is_available("codestral"),
            "ollama_available": self.ollama_provider.is_available() if AIConfig.ENABLE_OLLAMA_FALLBACK else False,
            "ollama_fallback_enabled": AIConfig.ENABLE_OLLAMA_FALLBACK,
            "config": AIConfig.validate_config()
        }
    
    async def switch_provider(self, new_provider: str) -> Dict[str, Any]:
        """Switch to a different provider and test it."""
        if new_provider not in ["mistral", "codestral", "ollama"]:
            return {"success": False, "error": f"Invalid provider: {new_provider}"}
        
        # Test the new provider
        test_result = None
        if new_provider in ["mistral", "codestral"]:
            if self.mistral_provider.is_available(new_provider):
                test_result = await self.mistral_provider.test_connection(new_provider)
            else:
                return {"success": False, "error": f"Provider {new_provider} is not configured"}
        
        elif new_provider == "ollama":
            if AIConfig.ENABLE_OLLAMA_FALLBACK and self.ollama_provider.is_available():
                test_result = await self.ollama_provider.test_connection()
            else:
                return {"success": False, "error": "Ollama is not available or fallback is disabled"}
        
        if test_result and test_result.get("connected"):
            # Update provider order to prioritize the new provider
            self.provider_order = [new_provider] + [p for p in self.provider_order if p != new_provider]
            return {
                "success": True,
                "new_provider": new_provider,
                "provider_order": self.provider_order,
                "test_result": test_result
            }
        else:
            return {
                "success": False,
                "error": f"Failed to connect to {new_provider}",
                "test_result": test_result
            } 