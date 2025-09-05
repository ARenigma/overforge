"""
Provider Factory for AI Services
Manages different AI providers for different use cases with configurable priorities
"""

from typing import Dict, Any, Optional
from config import AIConfig
from .openrouter_provider import OpenRouterProvider

class AIProviderFactory:
    """Factory for creating AI providers based on use case and configuration"""
    
    _instances = {}  # Cache for provider instances
    
    @classmethod
    def get_provider(cls, use_case: str = "validation", provider_type: str = None) -> Any:
        """
        Get AI provider for specific use case
        
        Args:
            use_case: One of 'validation', 'question_generation', 'counter_questions'
            provider_type: Override provider type (defaults to PRIMARY_AI_PROVIDER)
        
        Returns:
            Configured AI provider instance
        """
        # Use primary provider if not specified
        if provider_type is None:
            provider_type = AIConfig.PRIMARY_AI_PROVIDER
        
        # Create cache key
        cache_key = f"{provider_type}_{use_case}"
        
        # Return cached instance if available
        if cache_key in cls._instances:
            return cls._instances[cache_key]
        
        # Create new provider instance
        provider = cls._create_provider(provider_type, use_case)
        
        # Cache the instance
        cls._instances[cache_key] = provider
        
        return provider
    
    @classmethod
    def _create_provider(cls, provider_type: str, use_case: str) -> Any:
        """Create provider instance based on type and use case"""
        
        if provider_type == "openrouter":
            return OpenRouterProvider(use_case=use_case)
        
        elif provider_type == "codestral":
            # Import and create Codestral provider
            from .codestral_provider import CodestralProvider
            return CodestralProvider()
        
        elif provider_type == "mistral":
            # Import and create Mistral provider  
            from .mistral_provider import MistralProvider
            return MistralProvider()
        
        elif provider_type == "ollama":
            # Import and create Ollama provider
            from .ollama_provider import OllamaProvider
            return OllamaProvider()
        
        else:
            raise ValueError(f"Unknown provider type: {provider_type}")
    
    @classmethod
    def get_validation_provider(cls) -> Any:
        """Get provider optimized for code validation"""
        return cls.get_provider("validation", "openrouter")
    
    @classmethod
    def get_question_generation_provider(cls) -> Any:
        """Get provider optimized for question generation"""
        return cls.get_provider("question_generation", "openrouter")
    
    @classmethod
    def get_counter_question_provider(cls) -> Any:
        """Get provider optimized for counter questions"""
        return cls.get_provider("counter_questions", "openrouter")
    
    @classmethod
    def clear_cache(cls):
        """Clear provider instance cache"""
        cls._instances.clear()
    
    @classmethod
    def get_provider_status(cls) -> Dict[str, Any]:
        """Get status of all configured providers"""
        config_status = AIConfig.validate_config()
        
        status = {
            "configuration": config_status,
            "cached_instances": list(cls._instances.keys()),
            "available_use_cases": ["validation", "question_generation", "counter_questions"],
            "model_summary": AIConfig.get_model_config_summary()
        }
        
        return status 