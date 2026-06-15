from typing import Any

import requests

from config import AIConfig


class OllamaProvider:
    """Provider for local Ollama API."""

    def __init__(self):
        self.url = AIConfig.OLLAMA_URL
        self.model = AIConfig.OLLAMA_MODEL

    def is_available(self) -> bool:
        """Check if Ollama is available."""
        try:
            response = requests.get(self.url.replace("/api/generate", "/api/tags"), timeout=5)
            return response.status_code == 200
        except requests.RequestException:
            return False

    async def generate_response(self, prompt: str) -> dict[str, Any]:
        """Generate a response using Ollama."""
        try:
            if AIConfig.DEBUG_MODE:
                print(f"Sending request to Ollama with model {self.model}")

            response = requests.post(
                self.url, json={"model": self.model, "prompt": prompt, "stream": False}, timeout=30
            )

            response.raise_for_status()
            data = response.json()
            content = data.get("response", "").strip()

            return {
                "success": True,
                "content": content,
                "provider": "ollama",
                "model": self.model,
                "usage": {
                    "prompt_tokens": 0,  # Ollama doesn't provide token counts
                    "completion_tokens": 0,
                    "total_tokens": 0,
                },
            }

        except Exception as e:
            if AIConfig.DEBUG_MODE:
                print(f"Error with Ollama: {e}")

            return {"success": False, "error": str(e), "provider": "ollama", "content": None}

    async def test_connection(self) -> dict[str, Any]:
        """Test connection to Ollama."""
        test_prompt = "Hello! Please respond with 'Connection successful' if you can read this."

        result = await self.generate_response(test_prompt)

        return {
            "provider": "ollama",
            "connected": result["success"],
            "response": result.get("content", ""),
            "error": result.get("error"),
            "model": self.model,
            "url": self.url,
        }
