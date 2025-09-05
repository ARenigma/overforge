import httpx
import json
import asyncio
from typing import Dict, Any, Optional, List
import os
from datetime import datetime
from config import AIConfig

class OpenRouterProvider:
    """OpenRouter AI Provider with configurable model priorities for different use cases"""
    
    def __init__(self, use_case: str = "validation"):
        """
        Initialize OpenRouter provider for specific use case
        
        Args:
            use_case: One of 'validation', 'question_generation', 'counter_questions'
        """
        self.api_key = os.getenv('OPENROUTER_API_KEY')
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY environment variable is required")
            
        self.base_url = "https://openrouter.ai/api/v1"
        self.site_url = "https://overforge.dev"
        self.app_name = "Overforge Code Platform"
        self.use_case = use_case
        
        # Get models based on use case from configuration
        if use_case == "validation":
            self.models = self._build_models_config(AIConfig.get_validation_models())
            self.description = "Code Validation"
        elif use_case == "question_generation":
            self.models = self._build_models_config(AIConfig.get_question_generation_models())
            self.description = "Question Generation"
        elif use_case == "counter_questions":
            self.models = self._build_models_config(AIConfig.get_counter_question_models())
            self.description = "Counter Questions"
        else:
            raise ValueError(f"Invalid use_case: {use_case}. Must be one of: validation, question_generation, counter_questions")
        
        if not self.models:
            raise ValueError(f"No models configured for use case: {use_case}")
        
        # Performance tracking for models
        self.model_stats = {model_id: {
            "requests": 0,
            "successes": 0,
            "failures": 0,
            "avg_response_time": 0,
            "last_used": None,
            "error_rate": 0,
            "validation_accuracy": 0
        } for model_id in self.models.keys()}
        
        # Simplified initialization logging
        model_count = len(self.models)
        print(f"🏆 OpenRouter Provider initialized: {model_count} models for {self.description}")
    
    def _build_models_config(self, model_list: List[Dict]) -> Dict[str, Dict]:
        """Build models configuration from config list"""
        models = {}
        for model_info in model_list:
            model_id = model_info['id']
            models[model_id] = {
                "name": model_info['name'],
                "priority": model_info['priority'],
                "max_tokens": model_info['max_tokens'],
                "timeout": model_info['timeout'],
                "description": model_info['description']
            }
        return models
    
    def get_headers(self) -> Dict[str, str]:
        """Get headers for OpenRouter API requests"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": self.site_url,
            "X-Title": self.app_name
        }
    
    async def validate_content(self, content: str, context: dict) -> Dict[str, Any]:
        """Comprehensive content validation using champion models"""
        print(f"🔍 OpenRouter: Starting validation with champion models ({len(content)} chars)")
        
        # Enhanced validation prompt optimized for champion models
        validation_prompt = f"""
You are an advanced code validation system designed to encourage learning and genuine effort. Analyze this {context.get('content_type', 'code')} content comprehensively.

CONTENT ({context.get('language', 'unknown')}):
{content[:2000]}

CONTEXT: {context.get('context', 'No context provided')[:500]}

Perform deep analysis across these 5 critical parameters:

1. SECURITY ANALYSIS: Detect malicious code, system exploits, data theft attempts
2. CONTENT ANALYSIS: Check for inappropriate language, offensive content
3. RELEVANCE ANALYSIS: Assess if content shows GENUINE LEARNING EFFORT toward the problem
   - PRIORITIZE LEARNING: Be generous with marking attempts as RELEVANT
   - Mark as RELEVANT if the code shows ANY reasonable effort toward the problem domain:
     * Any attempt at problem-solving structure or logic
     * Demonstrates understanding of programming concepts relevant to the problem type
     * Shows learning progression, even if incomplete or imperfect
     * Uses appropriate data types, variables, or functions for the general domain
     * Partial solutions or work-in-progress attempts
     * Creative approaches that show problem-solving thinking
   - Only mark as IRRELEVANT if:
     * Simple "Hello World" with absolutely NO connection to the problem
     * Copy-pasted unrelated code with zero modification
     * Completely random gibberish or nonsensical content
     * Obvious spam or malicious content
   - LEARNING FIRST: When in doubt between RELEVANT and IRRELEVANT, choose RELEVANT to encourage learning
   - Remember: Students learn by experimenting - different approaches can still be valid
4. INTENT ANALYSIS: Determine if this represents meaningful learning effort vs random/test code
5. SPAM ANALYSIS: Identify gibberish, keyboard mashing, meaningless content

LEARNING-FRIENDLY EXAMPLES:
- Any class or function structure attempting to solve the problem = RELEVANT (encourage structure)
- Algorithm attempts even if logic is incomplete = RELEVANT (encourage thinking)
- Variable names showing understanding of problem domain = RELEVANT (shows comprehension)
- Partial implementations showing problem breakdown = RELEVANT (good problem-solving approach)
- Different data structure choices (arrays vs objects) = RELEVANT (different valid approaches)
- Comments showing understanding of requirements = RELEVANT (shows analysis)
- Code that addresses part of the problem requirements = RELEVANT (progressive learning)

ONLY IRRELEVANT:
- "Hello World" with zero problem connection
- Copy-pasted random code
- Gibberish or spam content

CRITICAL: Err on the side of RELEVANT to support learning. Students need encouragement, not discouragement.

Respond with ONLY valid JSON (no markdown formatting):
{{
  "security_analysis": {{
    "is_malicious": false,
    "threats": [],
    "severity": "low",
    "confidence": 95,
    "details": "Analysis details"
  }},
  "content_analysis": {{
    "is_appropriate": true,
    "issues": [],
    "severity": "low", 
    "confidence": 95,
    "details": "Analysis details"
  }},
  "relevance_analysis": {{
    "is_relevant": true,
    "is_coding_related": true,
    "context_match": true,
    "detected_content_type": "solution_attempt",
    "confidence": 95,
    "details": "Code shows genuine attempt to solve the problem"
  }},
  "intent_analysis": {{
    "is_meaningful": true,
    "purpose": "problem_solving",
    "coding_quality": "learning_attempt",
    "confidence": 95,
    "details": "Meaningful coding effort detected"
  }},
  "spam_analysis": {{
    "is_spam": false,
    "spam_indicators": [],
    "confidence": 95,
    "details": "No spam patterns detected"
  }},
  "overall_assessment": {{
    "should_block": false,
    "risk_level": "low",
    "final_recommendation": "allow",
    "reason": "Code shows genuine learning effort and is safe",
    "confidence_score": 95
  }}
}}
"""
        
        # Try champion models in priority order
        sorted_models = sorted(self.models.keys(), key=lambda x: self.models[x]["priority"])
        
        for model_id in sorted_models:
            try:
                start_time = datetime.now()
                model_name = self.models[model_id]['name']
                print(f"🤖 Trying champion model: {model_name}")
                
                result = await self._call_model(model_id, validation_prompt)
                
                if result and result.get("success"):
                    response_time = (datetime.now() - start_time).total_seconds()
                    self._update_model_stats(model_id, True, response_time)
                    
                    print(f"✅ Validation successful with {model_name} ({response_time:.1f}s)")
                    return {
                        "success": True,
                        "provider": "openrouter_champion",
                        "model": model_id,
                        "model_name": model_name,
                        "content": result["content"],
                        "response_time": response_time,
                        "validation_data": self._parse_validation_response(result["content"])
                    }
                    
            except Exception as e:
                self._update_model_stats(model_id, False, 0)
                print(f"❌ Champion model {self.models[model_id]['name']} failed: {str(e)}")
                continue
        
        print("🚨 All champion models failed - this is unusual")
        return {
            "success": False, 
            "error": "All champion models failed validation",
            "provider": "openrouter_champion"
        }
    
    async def _call_model(self, model_id: str, prompt: str) -> Optional[Dict[str, Any]]:
        """Call specific champion model with optimized settings"""
        model_config = self.models[model_id]
        
        payload = {
            "model": model_id,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": min(model_config["max_tokens"], 2048),
            "temperature": 0.1,  # Low temperature for consistent validation
            "top_p": 0.9,
            "frequency_penalty": 0.0,
            "presence_penalty": 0.0
        }
        
        async with httpx.AsyncClient(timeout=model_config["timeout"]) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self.get_headers(),
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("choices") and len(data["choices"]) > 0:
                    return {
                        "success": True,
                        "content": data["choices"][0]["message"]["content"],
                        "usage": data.get("usage", {}),
                        "model": model_id
                    }
            elif response.status_code == 429:
                print(f"⏰ Rate limit hit for {model_config['name']}")
            else:
                print(f"❌ HTTP {response.status_code} for {model_config['name']}")
            
            return None
    
    def _parse_validation_response(self, response_content: str) -> Dict[str, Any]:
        """Parse and validate the JSON response from champion models"""
        try:
            # Clean the response content
            clean_content = response_content.strip()
            
            # Remove any markdown formatting
            if clean_content.startswith('```json'):
                clean_content = clean_content.replace('```json', '').replace('```', '').strip()
            elif clean_content.startswith('```'):
                clean_content = clean_content.replace('```', '').strip()
            
            # Find JSON boundaries
            start_idx = clean_content.find('{')
            end_idx = clean_content.rfind('}') + 1
            if start_idx >= 0 and end_idx > start_idx:
                clean_content = clean_content[start_idx:end_idx]
            
            # Parse the JSON
            validation_data = json.loads(clean_content)
            
            # Validate required structure
            required_keys = ['security_analysis', 'content_analysis', 'relevance_analysis', 
                           'intent_analysis', 'spam_analysis', 'overall_assessment']
            
            for key in required_keys:
                if key not in validation_data:
                    print(f"⚠️ Missing required key: {key}")
                    validation_data[key] = self._get_default_analysis()
            
            return validation_data
            
        except json.JSONDecodeError as e:
            print(f"❌ JSON parse error: {str(e)}")
            return self._get_fallback_response()
        except Exception as e:
            print(f"❌ Response parsing error: {str(e)}")
            return self._get_fallback_response()
    
    def _get_default_analysis(self) -> Dict[str, Any]:
        """Get default analysis structure"""
        return {
            "is_safe": True,
            "confidence": 0,
            "details": "Default response due to parsing error"
        }
    
    def _get_fallback_response(self) -> Dict[str, Any]:
        """Get fallback response when parsing fails"""
        return {
            "security_analysis": {
                "is_malicious": False,
                "threats": [],
                "severity": "unknown",
                "confidence": 0,
                "details": "Parse error - defaulting to safe"
            },
            "content_analysis": {
                "is_appropriate": True,
                "issues": [],
                "severity": "unknown",
                "confidence": 0,
                "details": "Parse error - defaulting to appropriate"
            },
            "relevance_analysis": {
                "is_relevant": True,
                "is_coding_related": True,
                "context_match": True,
                "confidence": 0,
                "details": "Parse error - defaulting to relevant"
            },
            "intent_analysis": {
                "is_meaningful": True,
                "purpose": "unknown",
                "confidence": 0,
                "details": "Parse error - defaulting to meaningful"
            },
            "spam_analysis": {
                "is_spam": False,
                "spam_indicators": [],
                "confidence": 0,
                "details": "Parse error - defaulting to not spam"
            },
            "overall_assessment": {
                "should_block": False,
                "risk_level": "unknown",
                "final_recommendation": "allow",
                "reason": "Parse error - defaulting to allow with caution",
                "confidence_score": 0
            }
        }
    
    def _update_model_stats(self, model_id: str, success: bool, response_time: float):
        """Update performance statistics for champion models"""
        stats = self.model_stats[model_id]
        stats["requests"] += 1
        stats["last_used"] = datetime.now().isoformat()
        
        if success:
            stats["successes"] += 1
            # Update rolling average response time
            if stats["avg_response_time"] == 0:
                stats["avg_response_time"] = response_time
            else:
                stats["avg_response_time"] = (stats["avg_response_time"] + response_time) / 2
        else:
            stats["failures"] += 1
        
        # Calculate error rate
        if stats["requests"] > 0:
            stats["error_rate"] = (stats["failures"] / stats["requests"]) * 100
    
    def get_model_performance(self) -> Dict[str, Any]:
        """Get performance statistics for champion models"""
        return {
            "champion_models": self.models,
            "performance_stats": self.model_stats,
            "provider": "openrouter_champion"
        }
    
    async def health_check(self) -> Dict[str, Any]:
        """Health check for champion models"""
        print("🔍 Running champion models health check...")
        
        test_content = "print('Hello World')"
        test_context = {
            "content_type": "code",
            "language": "python", 
            "context": "Simple test function"
        }
        
        result = await self.validate_content(test_content, test_context)
        
        return {
            "champion_models_healthy": result.get("success", False),
            "primary_model": "mistralai/codestral-2501",
            "secondary_model": "qwen/qwen-2.5-coder-32b-instruct",
            "last_check": datetime.now().isoformat()
        }

# Global instance
openrouter_provider = OpenRouterProvider()
