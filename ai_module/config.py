import os
from typing import ClassVar

from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class AIConfig:
    """Configuration for AI providers and API keys."""

    # Primary AI provider
    PRIMARY_AI_PROVIDER = os.getenv("PRIMARY_AI_PROVIDER", "codestral")

    # Mistral API Configuration
    MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
    MISTRAL_MODEL = os.getenv("MISTRAL_MODEL", "mistral-large-latest")

    # Codestral API Configuration
    CODESTRAL_API_KEY = os.getenv("CODESTRAL_API_KEY")
    CODESTRAL_MODEL = os.getenv("CODESTRAL_MODEL", "codestral-latest")

    # OpenRouter API Configuration
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

    # OpenRouter Model Priority Configuration
    # Format: MODEL_ID:PRIORITY (1=highest priority)
    OPENROUTER_VALIDATION_MODELS = os.getenv(
        "OPENROUTER_VALIDATION_MODELS",
        "mistralai/codestral-2501:1,qwen/qwen-2.5-coder-32b-instruct:2",
    )

    OPENROUTER_QUESTION_GENERATION_MODELS = os.getenv(
        "OPENROUTER_QUESTION_GENERATION_MODELS",
        "mistralai/codestral-2501:1,qwen/qwen-2.5-coder-32b-instruct:2",
    )

    OPENROUTER_COUNTER_QUESTION_MODELS = os.getenv(
        "OPENROUTER_COUNTER_QUESTION_MODELS",
        "mistralai/codestral-2501:1,qwen/qwen-2.5-coder-32b-instruct:2",
    )

    # Ollama Configuration (fallback)
    OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "codellama:7b")

    # Server Configuration
    AI_MODULE_PORT = int(os.getenv("AI_MODULE_PORT", "9001"))  # Windows-safe port
    AI_MODULE_HOST = os.getenv("AI_MODULE_HOST", "0.0.0.0")

    # Feature flags
    ENABLE_OLLAMA_FALLBACK = os.getenv("ENABLE_OLLAMA_FALLBACK", "true").lower() == "true"
    DEBUG_MODE = os.getenv("DEBUG_MODE", "false").lower() == "true"

    # Model definitions with capabilities
    AVAILABLE_MODELS: ClassVar[dict] = {
        "mistralai/codestral-2501": {
            "name": "Codestral 2501",
            "max_tokens": 8192,
            "timeout": 15,
            "description": "Specialized code analysis model",
            "capabilities": ["validation", "generation", "counter_questions"],
            "cost_tier": "premium",
        },
        "qwen/qwen-2.5-coder-32b-instruct": {
            "name": "Qwen 2.5 Coder 32B",
            "max_tokens": 8192,
            "timeout": 12,
            "description": "Excellent code understanding",
            "capabilities": ["validation", "generation", "counter_questions"],
            "cost_tier": "premium",
        },
        "anthropic/claude-3.5-sonnet": {
            "name": "Claude 3.5 Sonnet",
            "max_tokens": 4096,
            "timeout": 20,
            "description": "Advanced reasoning and code analysis",
            "capabilities": ["validation", "generation", "counter_questions"],
            "cost_tier": "premium",
        },
        "openai/gpt-4o": {
            "name": "GPT-4o",
            "max_tokens": 4096,
            "timeout": 18,
            "description": "General purpose with strong coding",
            "capabilities": ["validation", "generation", "counter_questions"],
            "cost_tier": "premium",
        },
    }

    @classmethod
    def parse_model_priorities(cls, config_string: str) -> list[dict]:
        """Parse model priority configuration string into ordered list."""
        if not config_string:
            return []

        models = []
        for model_config in config_string.split(","):
            if ":" in model_config:
                model_id, priority = model_config.strip().split(":")
                if model_id in cls.AVAILABLE_MODELS:
                    model_info = cls.AVAILABLE_MODELS[model_id].copy()
                    model_info["id"] = model_id
                    model_info["priority"] = int(priority)
                    models.append(model_info)

        # Sort by priority (1 = highest)
        return sorted(models, key=lambda x: x["priority"])

    @classmethod
    def get_validation_models(cls) -> list[dict]:
        """Get ordered list of models for code validation."""
        return cls.parse_model_priorities(cls.OPENROUTER_VALIDATION_MODELS)

    @classmethod
    def get_question_generation_models(cls) -> list[dict]:
        """Get ordered list of models for question generation."""
        return cls.parse_model_priorities(cls.OPENROUTER_QUESTION_GENERATION_MODELS)

    @classmethod
    def get_counter_question_models(cls) -> list[dict]:
        """Get ordered list of models for counter questions."""
        return cls.parse_model_priorities(cls.OPENROUTER_COUNTER_QUESTION_MODELS)

    @classmethod
    def get_available_providers(cls) -> list:
        """Get list of available AI providers based on configured API keys."""
        providers = []

        if cls.MISTRAL_API_KEY:
            providers.append("mistral")
        if cls.CODESTRAL_API_KEY:
            providers.append("codestral")
        if cls.OPENROUTER_API_KEY:
            providers.append("openrouter")
        if cls.ENABLE_OLLAMA_FALLBACK:
            providers.append("ollama")

        return providers

    @classmethod
    def is_provider_available(cls, provider: str) -> bool:
        """Check if a specific provider is available."""
        if provider == "mistral":
            return bool(cls.MISTRAL_API_KEY)
        elif provider == "codestral":
            return bool(cls.CODESTRAL_API_KEY)
        elif provider == "openrouter":
            return bool(cls.OPENROUTER_API_KEY)
        elif provider == "ollama":
            return cls.ENABLE_OLLAMA_FALLBACK
        return False

    @classmethod
    def validate_config(cls) -> dict:
        """Validate the current configuration and return status."""
        status = {
            "primary_provider": cls.PRIMARY_AI_PROVIDER,
            "available_providers": cls.get_available_providers(),
            "mistral_configured": bool(cls.MISTRAL_API_KEY),
            "codestral_configured": bool(cls.CODESTRAL_API_KEY),
            "openrouter_configured": bool(cls.OPENROUTER_API_KEY),
            "ollama_fallback_enabled": cls.ENABLE_OLLAMA_FALLBACK,
            "debug_mode": cls.DEBUG_MODE,
            "validation_models": cls.get_validation_models(),
            "question_generation_models": cls.get_question_generation_models(),
            "counter_question_models": cls.get_counter_question_models(),
        }

        # Check if primary provider is available
        status["primary_provider_available"] = cls.is_provider_available(cls.PRIMARY_AI_PROVIDER)

        return status

    @classmethod
    def get_model_config_summary(cls) -> str:
        """Get a human-readable summary of model configurations."""
        summary = []
        summary.append("🔧 AI Model Configuration Summary:")
        summary.append(f"   Primary Provider: {cls.PRIMARY_AI_PROVIDER}")
        summary.append("")

        validation_models = cls.get_validation_models()
        if validation_models:
            summary.append("🛡️  Code Validation Models (in priority order):")
            for i, model in enumerate(validation_models, 1):
                summary.append(f"   {i}. {model['name']} - {model['description']}")

        question_models = cls.get_question_generation_models()
        if question_models:
            summary.append("")
            summary.append("❓ Question Generation Models (in priority order):")
            for i, model in enumerate(question_models, 1):
                summary.append(f"   {i}. {model['name']} - {model['description']}")

        counter_models = cls.get_counter_question_models()
        if counter_models:
            summary.append("")
            summary.append("🔄 Counter Question Models (in priority order):")
            for i, model in enumerate(counter_models, 1):
                summary.append(f"   {i}. {model['name']} - {model['description']}")

        return "\n".join(summary)
