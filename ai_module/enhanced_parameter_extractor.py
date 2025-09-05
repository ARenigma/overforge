"""
Enhanced Parameter Extraction System
Generates mutually exclusive, specific, AI-detectable parameters from job descriptions
"""

import json
import re
from typing import List, Dict, Any
from dataclasses import dataclass

@dataclass
class TechDomain:
    """Represents a technical domain with its key characteristics"""
    name: str
    keywords: List[str]
    focus_areas: List[str]
    exclusions: List[str]

class EnhancedParameterExtractor:
    def __init__(self, ai_manager):
        self.ai_manager = ai_manager
        self.tech_domains = self._initialize_tech_domains()
    
    def _initialize_tech_domains(self) -> Dict[str, TechDomain]:
        """Define technical domains for intelligent parameter extraction"""
        return {
            "cloud_services": TechDomain(
                name="Cloud Services & Infrastructure",
                keywords=["aws", "azure", "gcp", "cloud", "lambda", "s3", "dynamodb", "ec2", "kubernetes", "docker"],
                focus_areas=["service integration", "serverless architecture", "cloud deployment", "infrastructure as code"],
                exclusions=["framework patterns", "database modeling", "web development"]
            ),
            "web_frameworks": TechDomain(
                name="Web Frameworks & API Development", 
                keywords=["spring", "django", "flask", "express", "fastapi", "rest", "api", "mvc", "microservices"],
                focus_areas=["framework usage", "api design", "web architecture", "request handling"],
                exclusions=["cloud services", "database design", "frontend technologies"]
            ),
            "data_persistence": TechDomain(
                name="Data Modeling & Persistence",
                keywords=["database", "sql", "nosql", "orm", "jpa", "hibernate", "mongodb", "postgresql", "entity", "migration"],
                focus_areas=["schema design", "data modeling", "persistence patterns", "database operations"],
                exclusions=["web apis", "cloud services", "business logic"]
            )
        }
    
    async def extract_mutually_exclusive_parameters(self, job_description: str) -> List[Dict[str, Any]]:
        """Extract 3 mutually exclusive parameters using intelligent domain analysis"""
        
        try:
            print(f"🔍 Enhanced extractor: Starting parameter extraction...")
            
            # Step 1: Analyze job description to identify primary technical domains
            print(f"🔍 Enhanced extractor: Step 1 - Domain analysis...")
            domain_analysis = await self._analyze_technical_domains(job_description)
            print(f"🔍 Enhanced extractor: Domain analysis completed: {len(domain_analysis.get('primary_domains', []))} domains")
            
            # Step 2: Generate parameters with strict mutual exclusivity
            print(f"🔍 Enhanced extractor: Step 2 - Parameter generation...")
            parameters = await self._generate_exclusive_parameters(job_description, domain_analysis)
            print(f"🔍 Enhanced extractor: Generated {len(parameters)} parameters")
            
            # Step 3: Validate and enhance parameters for AI detectability
            print(f"🔍 Enhanced extractor: Step 3 - Validation...")
            validated_parameters = await self._validate_ai_detectability(parameters, job_description)
            print(f"🔍 Enhanced extractor: Validation completed - {len(validated_parameters)} parameters")
            
            return validated_parameters
            
        except Exception as e:
            print(f"❌ Enhanced extractor failed: {e}")
            print(f"❌ Error details: {type(e).__name__}: {str(e)}")
            raise e
    
    async def _analyze_technical_domains(self, job_description: str) -> Dict[str, Any]:
        """Analyze which technical domains are most relevant to this JD"""
        
        analysis_prompt = f"""
        Analyze this job description and identify the 3 most important technical domains.
        
        Job Description:
        {job_description}
        
        Technical Domains to Consider:
        1. Cloud Services & Infrastructure (AWS, Azure, serverless, containers)
        2. Web Frameworks & API Development (Spring, Django, REST APIs, microservices)  
        3. Data Modeling & Persistence (databases, ORMs, data design, migrations)
        4. Frontend Development (React, Angular, UI/UX, client-side)
        5. DevOps & Infrastructure (CI/CD, monitoring, deployment automation)
        6. Core Programming Concepts (algorithms, design patterns, problem solving)
        
        Respond with JSON:
        {{
            "primary_domains": [
                {{
                    "domain": "domain name",
                    "relevance_score": 0-100,
                    "evidence": ["specific mentions in JD"],
                    "focus_areas": ["specific skills mentioned"]
                }}
            ],
            "tech_stack_analysis": {{
                "languages": ["detected languages"],
                "frameworks": ["detected frameworks"], 
                "tools": ["detected tools"],
                "experience_level": "entry/mid/senior"
            }}
        }}
        
        Select the 3 domains with highest relevance that are MUTUALLY EXCLUSIVE.
        """
        
        try:
            response = await self.ai_manager.generate_response(
                prompt=analysis_prompt,
                preferred_provider="codestral"
            )
            
            if response.get('success'):
                content = response.get('content', '')
                json_match = re.search(r'\{.*\}', content, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group())
        except Exception as e:
            print(f"Domain analysis failed: {e}")
        
        # Fallback to basic domain detection
        return self._fallback_domain_analysis(job_description)
    
    async def _generate_exclusive_parameters(self, job_description: str, domain_analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generate 3 mutually exclusive parameters based on domain analysis"""
        
        primary_domains = domain_analysis.get('primary_domains', [])[:3]
        tech_stack = domain_analysis.get('tech_stack_analysis', {})
        
        generation_prompt = f"""
        Generate exactly 3 mutually exclusive technical assessment parameters for this job description.
        
        Job Description:
        {job_description}
        
        Identified Primary Domains:
        {json.dumps(primary_domains, indent=2)}
        
        CRITICAL REQUIREMENTS:
        1. Each parameter must be COMPLETELY SEPARATE from the others
        2. No overlapping concepts or technologies
        3. Each parameter should be easily distinguishable by AI from code
        4. Focus on the most hands-on, implementable skills
        5. Avoid generic terms - be technology-specific
        
        FORBIDDEN GENERIC TERMS (DO NOT USE):
        - "Backend Development" → Use "Node.js API Architecture" instead
        - "Frontend Development" → Use "React Component Architecture" instead  
        - "System Integration" → Use "Service Integration Patterns" instead
        - "Database Design" → Use "MongoDB Schema Modeling" instead
        - "Software Development" → Use specific technology names
        - "Programming" → Use specific language/framework names
        
        PARAMETER DESIGN RULES:
        - If AWS/Cloud is primary → Make it ONLY about cloud service integration (DynamoDB, S3, Lambda)
        - If Spring/Framework is primary → Make it ONLY about framework-specific patterns (@annotations, dependency injection)
        - If Database is primary → Make it ONLY about data modeling (entities, repositories, schema design)
        - If Node.js/Express is primary → Make it "Node.js API Architecture" or "Express.js Framework Patterns"
        - If React is primary → Make it "React Component Architecture" or "React State Management"
        
        For each parameter, provide:
        {{
            "name": "Specific, technology-focused parameter name (3-5 words)",
            "description": "PRECISE description of what code patterns this detects",
            "core_technologies": ["specific tech stack items this parameter covers"],
            "detection_patterns": ["specific code patterns AI should look for"],
            "depth_progression": [
                "Basic implementation level",
                "Intermediate integration level", 
                "Advanced optimization level"
            ]
        }}
        
        Respond ONLY with a JSON array of exactly 3 parameters:
        [{{parameter1}}, {{parameter2}}, {{parameter3}}]
        """
        
        try:
            response = await self.ai_manager.generate_response(
                prompt=generation_prompt,
                preferred_provider="codestral"
            )
            
            if response.get('success'):
                content = response.get('content', '')
                json_match = re.search(r'\[.*\]', content, re.DOTALL)
                if json_match:
                    parameters = json.loads(json_match.group())
                    return parameters[:3]  # Ensure exactly 3
        except Exception as e:
            print(f"Parameter generation failed: {e}")
        
        return self._fallback_parameters()
    
    async def _validate_ai_detectability(self, parameters: List[Dict[str, Any]], job_description: str) -> List[Dict[str, Any]]:
        """Validate that parameters are AI-detectable and refine if necessary"""
        
        validation_prompt = f"""
        Review these 3 assessment parameters for AI code detection quality.
        
        Parameters:
        {json.dumps(parameters, indent=2)}
        
        VALIDATION CRITERIA:
        1. Can AI easily distinguish between these 3 parameters from code?
        2. Are the detection patterns specific enough?
        3. Are the descriptions non-overlapping?
        4. Do ANY parameter names use FORBIDDEN generic terms?
        
        FORBIDDEN GENERIC TERMS TO ELIMINATE:
        - "Backend Development" → Change to "Node.js API Architecture"
        - "Frontend Development" → Change to "React Component Architecture"
        - "System Integration" → Change to "Service Integration Patterns"
        - "Database Design" → Change to "MongoDB Schema Modeling" (or specific DB tech)
        - "Software Development" → Change to specific technology
        - "Programming" → Change to specific language/framework
        - "Web Development" → Change to specific framework
        - "API Development" → Change to "REST API Implementation" or framework-specific
        
        ENHANCEMENT RULES:
        1. Replace ALL generic terms with technology-specific names
        2. Make parameter names laser-focused on specific technologies
        3. Ensure each parameter targets different technology stacks
        4. Use exact technology names (React, Node.js, MongoDB, AWS, etc.)
        
        Return the IMPROVED parameters with technology-specific names.
        If parameters are already excellent, return them unchanged.
        
        Respond ONLY with JSON array:
        [{{enhanced_parameter1}}, {{enhanced_parameter2}}, {{enhanced_parameter3}}]
        """
        
        try:
            response = await self.ai_manager.generate_response(
                prompt=validation_prompt,
                preferred_provider="codestral"
            )
            
            if response.get('success'):
                content = response.get('content', '')
                json_match = re.search(r'\[.*\]', content, re.DOTALL)
                if json_match:
                    enhanced_parameters = json.loads(json_match.group())
                    return self._format_for_system(enhanced_parameters)
        except Exception as e:
            print(f"Parameter validation failed: {e}")
        
        # Return original parameters if validation fails
        return self._format_for_system(parameters)
    
    def _format_for_system(self, parameters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Format parameters for the existing system structure"""
        formatted = []
        
        for i, param in enumerate(parameters[:3]):
            formatted.append({
                "name": param.get("name", f"Parameter {i+1}"),
                "description": param.get("description", "Technical assessment parameter"),
                "depth_levels": param.get("depth_progression", [
                    "Basic implementation",
                    "Intermediate integration", 
                    "Advanced optimization"
                ])
            })
        
        return formatted
    
    def _fallback_domain_analysis(self, job_description: str) -> Dict[str, Any]:
        """Fallback domain analysis when AI fails"""
        jd_lower = job_description.lower()
        
        # Simple keyword-based domain detection
        domains = []
        
        if any(kw in jd_lower for kw in ["aws", "cloud", "lambda", "s3", "azure"]):
            domains.append({
                "domain": "Cloud Services & Infrastructure",
                "relevance_score": 90,
                "evidence": ["cloud technologies mentioned"],
                "focus_areas": ["cloud integration"]
            })
        
        if any(kw in jd_lower for kw in ["spring", "django", "rest", "api", "microservices"]):
            domains.append({
                "domain": "Web Frameworks & API Development", 
                "relevance_score": 85,
                "evidence": ["framework technologies mentioned"],
                "focus_areas": ["api development"]
            })
        
        if any(kw in jd_lower for kw in ["database", "sql", "jpa", "entity", "hibernate"]):
            domains.append({
                "domain": "Data Modeling & Persistence",
                "relevance_score": 80,
                "evidence": ["database technologies mentioned"],
                "focus_areas": ["data management"]
            })
        
        return {
            "primary_domains": domains[:3],
            "tech_stack_analysis": {
                "languages": ["java"],
                "frameworks": ["spring"],
                "tools": ["database"],
                "experience_level": "mid"
            }
        }
    
    def _fallback_parameters(self) -> List[Dict[str, Any]]:
        """Fallback parameters when AI generation fails - technology-specific"""
        return [
            {
                "name": "Algorithm Implementation",
                "description": "Data structures and algorithmic problem-solving patterns",
                "depth_progression": [
                    "Basic data structure implementation",
                    "Efficient algorithm design", 
                    "Performance optimization techniques"
                ]
            },
            {
                "name": "Framework Architecture Patterns",
                "description": "Technology-specific framework implementation and patterns",
                "depth_progression": [
                    "Framework initialization and setup",
                    "Advanced framework patterns and middleware",
                    "Custom framework extensions and optimization"
                ]
            },
            {
                "name": "Service Integration Architecture",
                "description": "Microservice and external service integration patterns",
                "depth_progression": [
                    "Basic service communication patterns",
                    "Scalable integration design",
                    "Distributed system optimization"
                ]
            }
        ] 