import requests
from fastapi import FastAPI, Body, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Tuple
import re
import asyncio
import datetime
import json
from dataclasses import dataclass
from enum import Enum

from config import AIConfig
from providers import AIManager

# Import OpenRouter provider after checking if it exists
try:
    from providers.openrouter_provider import openrouter_provider
    OPENROUTER_AVAILABLE = True
    print("✅ OpenRouter provider loaded successfully")
except ImportError as e:
    print(f"⚠️ OpenRouter provider not available: {e}")
    OPENROUTER_AVAILABLE = False
    openrouter_provider = None

app = FastAPI(title="Overforge AI Module", version="2.0.0")

# Initialize AI Manager
ai_manager = AIManager()

class AnalyzeRequest(BaseModel):
    code: str
    language: Optional[str] = None
    userId: Optional[int] = None
    roomName: Optional[str] = None
    preferredProvider: Optional[str] = None

class RoomQuestionRequest(BaseModel):
    language: str
    experienceLevel: str
    promptDirective: Optional[str] = None
    preferredProvider: Optional[str] = None

# New: Approaches generation request
class ApproachGenRequest(BaseModel):
    title: str
    description: str
    category: Optional[str] = None
    technology: Optional[str] = None
    preferredProvider: Optional[str] = None

class ProviderSwitchRequest(BaseModel):
    provider: str

class ContentValidationRequest(BaseModel):
    content: str
    content_type: str = "code"  # "code", "chat", "comment"
    language: Optional[str] = None
    context: Optional[str] = None
    user_id: Optional[int] = None
    room_name: Optional[str] = None
    preferred_provider: Optional[str] = None

# New data structures for 3-parameter assessment system
class AssessmentPhase(Enum):
    FOUNDATION = "foundation"
    PARAMETER_1 = "parameter_1"
    PARAMETER_2 = "parameter_2" 
    PARAMETER_3 = "parameter_3"
    COMPLETE = "complete"

@dataclass
class Parameter:
    name: str
    description: str
    depth_levels: List[str]
    current_depth: int = 0
    completed: bool = False
    hints_used: int = 0
    max_hints: int = 1

@dataclass
class AssessmentState:
    phase: AssessmentPhase
    parameters: List[Parameter]
    main_problem: str
    main_problem_hints_used: int = 0
    max_main_hints: int = 3
    current_parameter_index: int = 0
    total_score: int = 0
    max_score: int = 9  # 3 parameters × 3 depths each

# Import enhanced parameter extractors
try:
    from enhanced_parameter_extractor_v2 import EnhancedParameterExtractorV2
    V2_EXTRACTOR_AVAILABLE = True
    print("✅ V2 Enhanced Parameter Extractor loaded successfully")
except ImportError as e:
    print(f"⚠️ V2 Enhanced Parameter Extractor not available: {e}")
    V2_EXTRACTOR_AVAILABLE = False
    # Fallback to V1
    from enhanced_parameter_extractor import EnhancedParameterExtractor

# Enhanced JD Parameter Extraction System
class JDParameterExtractor:
    def __init__(self, ai_manager):
        self.ai_manager = ai_manager
        # Use V2 enhanced extractor if available, otherwise fallback to V1
        if V2_EXTRACTOR_AVAILABLE:
            self.enhanced_extractor = EnhancedParameterExtractorV2(ai_manager)
            self.extractor_version = "V2"
            print("🚀 Initialized with V2 Enhanced Parameter Extractor")
        else:
            self.enhanced_extractor = EnhancedParameterExtractor(ai_manager)
            self.extractor_version = "V1"
            print("📄 Initialized with V1 Enhanced Parameter Extractor")
        
    async def extract_parameters_from_jd(self, job_description: str) -> List[Parameter]:
        """Extract 3 mutually exclusive, AI-detectable parameters from job description"""
        
        if self.extractor_version == "V2":
            print(f"🔍 Using V2 Enhanced Keyword Detection System...")
            return await self._v2_extraction(job_description)
        else:
            print(f"🔍 Using V1 legacy extraction with technology-specific prompting...")
            return await self._legacy_extraction(job_description)
    
    async def _v2_extraction(self, job_description: str) -> List[Parameter]:
        """Use V2 enhanced parameter extractor with either-or flexibility"""
        try:
            print("🔍 V2 Extraction: Analyzing job description for either-or patterns...")
            
            # Enhanced prompt that detects either-or situations and creates flexible parameters
            flexible_extraction_prompt = f"""
            Analyze this job description and extract 3 core technical parameters that are FLEXIBLE for either-or technologies while being SPECIFIC about services and tools.

            Job Description:
            {job_description}

            CRITICAL RULES FOR EITHER-OR SITUATIONS:
            1. When JD mentions "Python/Node.js" or "Java/Python" → Create LANGUAGE-AGNOSTIC parameters
            2. When JD mentions "React/Angular" → Create FRAMEWORK-AGNOSTIC parameters  
            3. When JD mentions "AWS/Azure" → Create CLOUD-AGNOSTIC parameters
            4. When JD mentions "SQL/NoSQL" → Create DATABASE-AGNOSTIC parameters

            SERVICE-SPECIFIC PARAMETER NAMING (INCLUDE SPECIFIC SERVICES):
            ✅ EXCELLENT: "AWS Serverless Architecture (Lambda, API Gateway, DynamoDB)" (specific services, language-agnostic)
            ✅ EXCELLENT: "Event-Driven Systems (SQS, SNS, EventBridge)" (specific messaging services)
            ✅ EXCELLENT: "Infrastructure as Code (CloudFormation, CDK)" (specific IaC tools)
            ✅ GOOD: "Backend API Development" (works for Node.js OR Python)
            ✅ GOOD: "Database Design & Integration" (works for SQL OR NoSQL)

            ❌ AVOID: "Python Ecosystem for AWS" (too rigid)
            ❌ AVOID: "AWS Cloud Services Integration" (too generic, missing specific services)
            ❌ AVOID: "Data Management & Architecture" (too vague, missing specific tools)

            ENHANCED EXAMPLES FOR AWS BACKEND JD:
            If JD mentions "Lambda, API Gateway, DynamoDB, SQS, SNS, EventBridge, CloudFormation":
            - Parameter 1: "AWS Serverless Architecture (Lambda, API Gateway, DynamoDB)"
            - Parameter 2: "Event-Driven Systems (SQS, SNS, EventBridge)" 
            - Parameter 3: "Infrastructure as Code (CloudFormation, CDK)"

            SPECIFIC SERVICE DETECTION RULES:
            - Always include specific service names in parentheses
            - Group related services together logically
            - Maintain language flexibility while being service-specific
            - Include monitoring tools (CloudWatch, X-Ray) when mentioned
            - Include deployment tools (CodePipeline, CodeDeploy) when mentioned

            Generate exactly 3 parameters in this JSON format:
            [
              {{
                "name": "Service-specific parameter name with tools in parentheses",
                "description": "Assessment description that includes specific services and accommodates multiple implementations",
                "either_or_detected": ["technology1", "technology2"] or null,
                "specific_services": ["service1", "service2", "service3"],
                "depth_levels": [
                  "Basic service implementation and configuration",
                  "Intermediate service integration patterns", 
                  "Advanced service architecture optimization"
                ]
              }},
              {{
                "name": "Second service-specific parameter name with tools",
                "description": "Another service-focused assessment description",
                "either_or_detected": ["option1", "option2"] or null,
                "specific_services": ["service4", "service5", "service6"],
                "depth_levels": [
                  "Core service concepts and setup",
                  "Advanced service patterns and integration",
                  "Expert-level service implementation"
                ]
              }},
              {{
                "name": "Third service-specific parameter name with tools", 
                "description": "Third service-focused assessment description",
                "either_or_detected": null,
                "specific_services": ["service7", "service8", "service9"],
                "depth_levels": [
                  "Foundation service knowledge",
                  "Practical service application",
                  "Mastery of service optimization"
                ]
              }}
            ]

            Focus on creating parameters that include SPECIFIC services while allowing candidates to choose their preferred technology within the either-or options.
            """

            response = await self.ai_manager.generate_response(
                prompt=flexible_extraction_prompt,
                preferred_provider="codestral"
            )
            
            if not response.get('success'):
                raise ValueError(f"AI response failed: {response.get('error')}")
            
            # Extract JSON from response
            content = response.get('content', '')
            json_match = re.search(r'\[.*\]', content, re.DOTALL)
            if json_match:
                parameters_data = json.loads(json_match.group())
                
                parameters = []
                for param_data in parameters_data[:3]:  # Ensure exactly 3 parameters
                    # Enhanced parameter with either-or info and specific services
                    param = Parameter(
                        name=param_data.get('name', 'Technical Assessment Parameter'),
                        description=param_data.get('description', 'Flexible technical assessment parameter'),
                        depth_levels=param_data.get('depth_levels', [
                            "Basic implementation",
                            "Intermediate integration", 
                            "Advanced optimization"
                        ])
                    )
                    
                    # Store either-or information for later use
                    if 'either_or_detected' in param_data and param_data['either_or_detected']:
                        print(f"🔄 Either-or detected for {param.name}: {param_data['either_or_detected']}")
                    
                    # Store specific services information
                    if 'specific_services' in param_data and param_data['specific_services']:
                        print(f"🛠️ Specific services for {param.name}: {param_data['specific_services']}")
                    
                    parameters.append(param)
                
                print(f"✅ V2 flexible extraction successful: {[p.name for p in parameters]}")
                return parameters
            else:
                raise ValueError("No valid JSON found in V2 response")
                
        except Exception as e:
            print(f"❌ V2 flexible extraction failed: {e}")
            print(f"🔄 Falling back to legacy extraction...")
            return await self._legacy_extraction(job_description)
    
    async def _legacy_extraction(self, job_description: str) -> List[Parameter]:
        """Legacy extraction method as fallback"""
        
        # Determine which technologies are mentioned in the JD
        jd_lower = job_description.lower()
        detected_techs = []
        
        tech_mapping = {
            # Frontend Technologies
            'react': 'React Component Architecture',
            'angular': 'Angular Framework Patterns',
            'vue': 'Vue.js Component System',
            'typescript': 'TypeScript Implementation',
            'javascript': 'JavaScript ES6+ Features',
            
            # Backend Frameworks
            'node.js': 'Node.js Framework Patterns', 
            'nodejs': 'Node.js Framework Patterns',
            'express': 'Express.js Middleware',
            'spring': 'Spring Boot Configuration',
            'django': 'Django Framework Architecture',
            'flask': 'Flask Application Patterns',
            'fastapi': 'FastAPI Framework Design',
            'laravel': 'Laravel Framework Patterns',
            
            # Databases
            'mongodb': 'MongoDB Schema Modeling',
            'postgresql': 'PostgreSQL Query Design',
            'mysql': 'MySQL Database Operations',
            'redis': 'Redis Caching Strategies',
            'elasticsearch': 'Elasticsearch Index Management',
            
            # Cloud & DevOps
            'aws': 'AWS Service Integration',
            'azure': 'Azure Cloud Architecture',
            'docker': 'Docker Containerization',
            'kubernetes': 'Kubernetes Orchestration',
            'terraform': 'Terraform Infrastructure',
            
            # Languages
            'python': 'Python Programming Patterns',
            'java': 'Java Application Architecture',
            'golang': 'Go Concurrency Patterns',
            'rust': 'Rust Memory Management',
            'php': 'PHP Framework Implementation'
        }
        
        for tech, param_name in tech_mapping.items():
            if tech in jd_lower:
                detected_techs.append(param_name)
        
        # If we detected specific technologies, use them as examples
        if len(detected_techs) >= 3:
            example_params = detected_techs[:3]
        elif len(detected_techs) >= 2:
            example_params = detected_techs + ['Framework Architecture Patterns']
        else:
            example_params = ['Technology Integration Patterns', 'Framework Implementation', 'Service Architecture']
        
        extraction_prompt = f"""
        You MUST generate parameter names that start with specific technology names. 

        Job Description:
        {job_description}

        I detected these technologies in the JD: {', '.join(detected_techs) if detected_techs else 'None detected'}

        MANDATORY NAMING PATTERN - NO EXCEPTIONS:
        Parameter names must use this EXACT format: "[TECHNOLOGY_NAME] [CONCEPT]"

        EXAMPLES FOR THIS JD:
        ✅ REQUIRED: {example_params[0]}
        ✅ REQUIRED: {example_params[1]}  
        ✅ REQUIRED: {example_params[2]}

        ABSOLUTELY FORBIDDEN WORDS IN PARAMETER NAMES:
        - "Backend" (use "Node.js" or "Express.js" instead)
        - "Frontend" (use "React" or "Angular" instead)
        - "Development" (use specific framework names)
        - "Programming" (use language names)
        - "Database" (use "MongoDB", "PostgreSQL", etc.)
        - "API" (use "REST API" or framework-specific)

        Return this exact JSON structure with technology-specific names:
        [
          {{
            "name": "{example_params[0]}",
            "description": "Technology-specific implementation assessment",
            "depth_levels": [
              "Basic implementation patterns",
              "Intermediate integration techniques", 
              "Advanced optimization strategies"
            ]
          }},
          {{
            "name": "{example_params[1]}", 
            "description": "Framework-specific pattern evaluation",
            "depth_levels": [
              "Fundamental setup and configuration",
              "Advanced framework features",
              "Performance optimization techniques"
            ]
          }},
          {{
            "name": "{example_params[2]}",
            "description": "Specialized technology skills assessment",
            "depth_levels": [
              "Core technology understanding",
              "Integration and design patterns",
              "Expert-level implementation"
            ]
          }}
        ]

        CRITICAL: Use the EXACT parameter names I provided above. Do not change them.
        """

        try:
            response = await self.ai_manager.generate_response(
                prompt=extraction_prompt,
                preferred_provider="codestral"
            )
            
            if not response.get('success'):
                raise ValueError(f"AI response failed: {response.get('error')}")
            
            # Extract JSON from response
            content = response.get('content', '')
            json_match = re.search(r'\[.*\]', content, re.DOTALL)
            if json_match:
                parameters_data = json.loads(json_match.group())
                
                # POST-PROCESS: Force technology-specific names
                processed_params = self._force_technology_specific_names(parameters_data, detected_techs)
                
                parameters = []
                for param_data in processed_params[:3]:  # Ensure exactly 3 parameters
                    parameters.append(Parameter(
                        name=param_data['name'],
                        description=param_data['description'],
                        depth_levels=param_data['depth_levels']
                    ))
                
                return parameters
            else:
                raise ValueError("No valid JSON found in response")
                
        except Exception as e:
            print(f"Error extracting parameters from JD: {e}")
            # Fallback to generic parameters
            return self._get_fallback_parameters()
    
    def _force_technology_specific_names(self, parameters_data: List[Dict], detected_techs: List[str]) -> List[Dict]:
        """Post-process parameters to ensure technology-specific names"""
        
        # Create forced names based on detected technologies
        if len(detected_techs) >= 3:
            forced_names = detected_techs[:3]
        else:
            # Default technology-specific names
            base_names = [
                "Python Programming Patterns",
                "Django Framework Architecture", 
                "PostgreSQL Query Design",
                "React Component Architecture",
                "Node.js Framework Patterns",
                "MongoDB Schema Modeling",
                "AWS Service Integration",
                "Docker Containerization",
                "TypeScript Implementation",
                "Spring Boot Configuration"
            ]
            forced_names = detected_techs + base_names
            forced_names = forced_names[:3]
        
        # Apply forced names to parameters
        for i, param in enumerate(parameters_data[:3]):
            if i < len(forced_names):
                print(f"🔧 Forcing parameter {i+1} name: '{param['name']}' → '{forced_names[i]}'")
                param['name'] = forced_names[i]
                
                # Update description to match the forced name
                tech_word = forced_names[i].split()[0]  # Get first word (technology)
                param['description'] = f"Assesses {tech_word.lower()}-specific implementation patterns and technical proficiency"
        
        return parameters_data
    
    def _get_fallback_parameters(self) -> List[Parameter]:
        """Fallback parameters when all extraction fails - technology-specific"""
        return [
            Parameter(
                name="Algorithm Implementation",
                description="Data structures and algorithmic problem-solving patterns",
                depth_levels=[
                    "Basic data structure implementation",
                    "Efficient algorithm design",
                    "Performance optimization techniques"
                ]
            ),
            Parameter(
                name="Framework Architecture Patterns",
                description="Technology-specific framework implementation and patterns",
                depth_levels=[
                    "Framework initialization and setup",
                    "Advanced framework patterns and middleware",
                    "Custom framework extensions and optimization"
                ]
            ),
            Parameter(
                name="Service Integration Architecture",
                description="Microservice and external service integration patterns",
                depth_levels=[
                    "Basic service communication patterns",
                    "Scalable integration design",
                    "Distributed system optimization"
                ]
            )
        ]

# Problem Generation System
class ProblemGenerator:
    def __init__(self, ai_manager):
        self.ai_manager = ai_manager
        
    async def generate_problem_for_parameters(self, parameters: List[Parameter], language: str, experience_level: str) -> str:
        """Generate a main problem that naturally tests all 3 parameters with parameter-driven tech stack"""
        
        param_descriptions = "\n".join([
            f"- {param.name}: {param.description}"
            for param in parameters
        ])
        
        # Check if parameters are language-agnostic (either-or situations)
        language_agnostic_keywords = [
            "backend development", "api development", "backend api", "web framework",
            "cloud services integration", "database design", "data management",
            "serverless architecture", "event-driven systems", "infrastructure as code"
        ]
        
        is_language_agnostic = any(
            any(keyword in param.name.lower() for keyword in language_agnostic_keywords)
            for param in parameters
        )
        
        # Enhanced generation prompt that strictly follows parameters
        generation_prompt = f"""
        Create a well-balanced coding problem that is STRICTLY BASED on these extracted parameters:

        {param_descriptions}

        CRITICAL REQUIREMENTS:
        1. The problem MUST test ALL 3 parameters listed above
        2. The tech stack MUST align with the parameter names and descriptions
        3. If parameters are language-agnostic, allow multiple language options
        4. Problem should be solvable using technologies mentioned in the parameters

        LANGUAGE FLEXIBILITY RULES:
        {"- Parameters appear to be LANGUAGE-AGNOSTIC - MANDATORY: Use 'Candidate's choice (Python, Node.js, Java, etc.)' in tech stack" if is_language_agnostic else f"- Use specified language: {language}"}
        - Experience Level: {experience_level}
        {"- IMPORTANT: Mention in the description that candidates can choose their preferred programming language" if is_language_agnostic else ""}

        CONTENT REQUIREMENTS:
        - 2-3 sentences for description (use available space efficiently)
        {"- Description MUST mention language choice flexibility" if is_language_agnostic else ""}
        - Two sections: "Core Features" and "Expected Deliverables" 
        - 3-4 features that directly test the 3 parameters
        - 3 deliverables to guide implementation
        - Tech stack that matches the parameter capabilities

        Use this EXACT format:
        
        <h2>[System Name]</h2>
        <p>{"[2-3 sentences describing the system. MUST include: 'using your preferred programming language (Python, Node.js, Java, etc.)']" if is_language_agnostic else "[2-3 sentences describing the system and main goals that align with the parameters]"}</p>
        
        <h3>Core Features:</h3>
        <ul>
          <li><strong>[Feature Name]:</strong> [Brief description that tests Parameter 1]</li>
          <li><strong>[Feature Name]:</strong> [Brief description that tests Parameter 2]</li>
          <li><strong>[Feature Name]:</strong> [Brief description that tests Parameter 3]</li>
          <li><strong>[Feature Name]:</strong> [Additional feature that combines parameters]</li>
        </ul>
        
        <h3>Expected Deliverables:</h3>
        <ul>
          <li>[Deliverable 1 - based on parameter requirements]</li>
          <li>[Deliverable 2 - based on parameter requirements]</li>
          <li>[Deliverable 3 - based on parameter requirements]</li>
        </ul>
        
        <p><strong>Tech Stack:</strong> {f"Candidate's choice (Python, Node.js, Java, etc.)" if is_language_agnostic else language}, [technologies that align with parameters], [services mentioned in parameters]</p>

        MANDATORY TECH STACK FORMAT:
        {"- MUST start with 'Candidate's choice (Python, Node.js, Java, etc.)'" if is_language_agnostic else f"- MUST start with '{language}'"}
        - Then list AWS services mentioned in parameters
        - DO NOT hard-code any specific programming language

        PARAMETER ALIGNMENT CHECK:
        - Ensure each Core Feature tests one of the 3 parameters
        - Tech stack must include technologies mentioned in parameter names
        - Problem complexity should match the parameter descriptions

        DO NOT suggest technologies that contradict the parameters.
        """

        try:
            response = await self.ai_manager.generate_response(
                prompt=generation_prompt,
                preferred_provider="codestral"
            )
            
            if response.get('success'):
                generated_problem = response.get('content', '').strip()
                print(f"✅ Parameter-aligned problem generated (Language agnostic: {is_language_agnostic})")
                return generated_problem
            else:
                raise ValueError(f"AI response failed: {response.get('error')}")
            
        except Exception as e:
            print(f"Error generating parameter-aligned problem: {e}")
            return self._get_parameter_aligned_fallback(parameters, language, experience_level, is_language_agnostic)
    
    def _get_parameter_aligned_fallback(self, parameters: List[Parameter], language: str, experience_level: str, is_language_agnostic: bool) -> str:
        """Parameter-aligned fallback when AI generation fails"""
        
        # Extract specific services from parameter names (enhanced service detection)
        param_names = [param.name.lower() for param in parameters]
        tech_stack_items = []
        
        # Enhanced service detection from parameter names
        for param_name in param_names:
            # AWS Serverless services
            if "lambda" in param_name or "serverless" in param_name:
                tech_stack_items.extend(["AWS Lambda", "API Gateway", "DynamoDB"])
            # Event-driven services
            elif "event" in param_name or "sqs" in param_name or "sns" in param_name:
                tech_stack_items.extend(["SQS", "SNS", "EventBridge"])
            # Infrastructure services
            elif "infrastructure" in param_name or "cloudformation" in param_name:
                tech_stack_items.extend(["CloudFormation", "CDK", "IAM"])
            # Monitoring services
            elif "monitoring" in param_name or "cloudwatch" in param_name:
                tech_stack_items.extend(["CloudWatch", "X-Ray"])
            # General AWS services
            elif "aws" in param_name or "cloud" in param_name:
                tech_stack_items.extend(["AWS Lambda", "DynamoDB", "API Gateway"])
            # Backend services
            elif "backend" in param_name or "api" in param_name:
                tech_stack_items.extend(["REST APIs", "Authentication", "Microservices"])
            # Database services
            elif "database" in param_name or "data" in param_name:
                tech_stack_items.extend(["Database Integration", "Data Modeling"])
        
        # Remove duplicates while preserving order
        seen = set()
        tech_stack_items = [x for x in tech_stack_items if not (x in seen or seen.add(x))]
        
        # Default tech stack if nothing detected
        if not tech_stack_items:
            tech_stack_items = ["Core Programming", "Data Structures", "Algorithms"]
        
        # Language specification
        language_spec = "Candidate's choice (Python, Node.js, Java, etc.)" if is_language_agnostic else language
        
        # Parameter-aligned fallback problem with enhanced service focus
        return f"""
        <h2>Cloud-Native Assessment System</h2>
        <p>Build a scalable system that demonstrates the technical competencies outlined in the assessment parameters. The solution should showcase your understanding of the specific services and implementation patterns required for this role.</p>
        
        <h3>Core Features:</h3>
        <ul>
          <li><strong>{parameters[0].name}:</strong> Implement functionality that demonstrates {parameters[0].description.lower()}</li>
          <li><strong>{parameters[1].name}:</strong> Create components that showcase {parameters[1].description.lower()}</li>
          <li><strong>{parameters[2].name}:</strong> Design elements that exhibit {parameters[2].description.lower()}</li>
          <li><strong>Service Integration:</strong> Connect all components using the specified services and patterns</li>
        </ul>
        
        <h3>Expected Deliverables:</h3>
        <ul>
          <li>Working implementation demonstrating parameter 1 competency with specific services</li>
          <li>Functional code showcasing parameter 2 skills using appropriate tools</li>
          <li>Architecture that validates parameter 3 understanding with service integration</li>
        </ul>
        
        <p><strong>Tech Stack:</strong> {language_spec}, {', '.join(tech_stack_items[:6])}</p>
        """

# 3-Parameter Assessment Engine
class ParameterAssessmentEngine:
    def __init__(self, ai_manager):
        self.ai_manager = ai_manager
        
    async def assess_parameter_depth(self, 
                                   parameter: Parameter, 
                                   candidate_code: str, 
                                   problem_context: str,
                                   language: str) -> Tuple[bool, str, int]:
        """
        Assess if candidate demonstrates understanding at current parameter depth
        Returns: (passed, feedback, score)
        """
        
        current_depth = parameter.depth_levels[parameter.current_depth]
        
        assessment_prompt = f"""
        Assess if the candidate's code demonstrates competency at this specific depth level:

        **Parameter:** {parameter.name}
        **Current Depth Level:** {current_depth}
        **Problem Context:** {problem_context}
        **Language:** {language}

        **Candidate's Code:**
        ```{language}
        {candidate_code}
        ```

        Evaluate ONLY whether the code demonstrates understanding of: {current_depth}

        Respond with this exact JSON format:
        {{
          "passed": true/false,
          "score": 0-1,
          "feedback": "Specific feedback about this depth level",
          "reasoning": "Why this assessment was given"
        }}

        Be strict but fair. The code must clearly demonstrate the specific concept being tested at this depth.
        """

        try:
            response = await self.ai_manager.generate_response(
                prompt=assessment_prompt,
                preferred_provider="codestral"
            )
            
            if not response.get('success'):
                raise ValueError(f"AI response failed: {response.get('error')}")
            
            content = response.get('content', '')
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                return (
                    result.get('passed', False),
                    result.get('feedback', 'Assessment completed'),
                    result.get('score', 0)
                )
            else:
                return False, "Assessment failed - invalid response format", 0
                
        except Exception as e:
            print(f"Error in parameter assessment: {e}")
            return False, f"Assessment error: {str(e)}", 0
    
    async def generate_hint_for_depth(self, 
                                    parameter: Parameter, 
                                    candidate_code: str,
                                    problem_context: str,
                                    language: str) -> str:
        """Generate a helpful hint for the current parameter depth"""
        
        current_depth = parameter.depth_levels[parameter.current_depth]
        
        hint_prompt = f"""
        The candidate is struggling with this parameter depth level. Provide a helpful hint.

        **Parameter:** {parameter.name}
        **Depth Level:** {current_depth}
        **Problem Context:** {problem_context}
        **Current Code:**
        ```{language}
        {candidate_code}
        ```

        Provide a constructive hint that guides them toward demonstrating: {current_depth}

        Keep the hint:
        - Specific to the depth level concept
        - Encouraging and educational
        - Not giving away the complete solution
        - Actionable and clear

        Return only the hint text, no additional formatting.
        """

        try:
            response = await self.ai_manager.generate_response(
                prompt=hint_prompt,
                preferred_provider="codestral"
            )
            
            if response.get('success'):
                return response.get('content', '').strip()
            else:
                raise ValueError(f"AI response failed: {response.get('error')}")
            
        except Exception as e:
            print(f"Error generating hint: {e}")
            return f"Consider focusing on: {current_depth}"

    async def generate_main_problem_hint(self, 
                                       problem_context: str,
                                       candidate_code: str,
                                       language: str,
                                       hint_number: int) -> str:
        """Generate hints for the main problem implementation"""
        
        hint_prompt = f"""
        The candidate needs help with the main problem implementation.

        **Problem:** {problem_context}
        **Current Code:**
        ```{language}
        {candidate_code}
        ```
        **Hint Number:** {hint_number}/3

        Provide hint #{hint_number} that helps them progress on the main problem.
        
        Hint progression:
        - Hint 1: High-level approach guidance
        - Hint 2: Specific implementation direction
        - Hint 3: Detailed step-by-step guidance

        Keep the hint encouraging and educational. Return only the hint text.
        """

        try:
            response = await self.ai_manager.generate_response(
                prompt=hint_prompt,
                preferred_provider="codestral"
            )
            
            if response.get('success'):
                return response.get('content', '').strip()
            else:
                raise ValueError(f"AI response failed: {response.get('error')}")
            
        except Exception as e:
            print(f"Error generating main problem hint: {e}")
            return "Try breaking down the problem into smaller, manageable steps."

# Initialize the new assessment system
jd_extractor = JDParameterExtractor(ai_manager)
problem_generator = ProblemGenerator(ai_manager)
assessment_engine = ParameterAssessmentEngine(ai_manager)

# Startup logic moved to a regular function
def initialize_ai_module():
    """Initialize and validate configuration."""
    print("🚀 Starting Overforge AI Module...")
    config_status = AIConfig.validate_config()
    
    # Only show essential config info
    provider_count = len(config_status.get('available_providers', []))
    models_count = len(config_status.get('validation_models', []))
    print(f"📋 Configuration: {provider_count} providers, {models_count} models")
    
    # Show champion validation status instead of misleading primary provider
    openrouter_available = config_status.get('openrouter_configured', False)
    validation_models = config_status.get('validation_models', [])
    if openrouter_available and validation_models:
        champion_count = len(validation_models)
        status_icon = "✅"
        print(f"🏆 Champion Validation: {champion_count} models via OpenRouter {status_icon}")
    else:
        print("❌ Champion Validation: Not configured")

# Call initialization immediately
initialize_ai_module()

@app.post("/analyze")
async def analyze(request: AnalyzeRequest):
    """Analyze code and generate questions or insights using AI."""
    prompt = request.code
    
    try:
        # Use AI manager to generate response with fallback
        ai_response = await ai_manager.generate_response(
            prompt=prompt,
            preferred_provider=request.preferredProvider
        )
        
        if not ai_response["success"]:
            return {
                "question": "",
                "insight": "",
                "type": "error",
                "context": request.code,
                "error": ai_response["error"],
                "attempted_providers": ai_response.get("attempted_providers", [])
            }
        
        raw = ai_response["content"].strip()
        print(f"🔍 Raw AI response content: '{raw[:200]}{'...' if len(raw) > 200 else ''}'")
        
        # Debug: Print first 300 chars of prompt for LHIS detection debugging
        print(f"🔍 Prompt preview: '{prompt[:300]}{'...' if len(prompt) > 300 else ''}'")
        
        # Check if this is a semantic analysis prompt (contains parameter analysis instructions)
        is_semantic_analysis = False
        
        # Direct check for semantic analysis in the code field
        if "Perform advanced semantic analysis for parameter:" in request.code:
            is_semantic_analysis = True
            print(f"🔍 Detected semantic analysis by direct match")
        
        # Additional checks for semantic markers
        if not is_semantic_analysis:
            semantic_markers = [
                "Perform advanced semantic analysis",
                "implementationDetected",
                "conceptualUnderstanding",
                "milestone",
                "confidence"
            ]
            
            # Check for semantic analysis markers
            for marker in semantic_markers:
                if marker in prompt:
                    is_semantic_analysis = True
                    print(f"🔍 Detected semantic analysis marker: {marker}")
                    break
                    
            # Additional check for parameter analysis format
            if "parameter" in prompt.lower() and "Respond in JSON" in prompt:
                is_semantic_analysis = True
                print(f"🔍 Detected parameter analysis format")
        
        print(f"🔍 Is semantic analysis: {is_semantic_analysis}")
        
        if is_semantic_analysis:
            # For semantic analysis, let AI process it properly instead of using mock
            print(f"🔍 Processing semantic analysis request with AI")
            
            # Try to extract JSON from the AI response
            try:
                # Look for JSON in the response
                json_match = re.search(r'\{.*\}', raw, re.DOTALL)
                if json_match:
                    analysis_json = json.loads(json_match.group())
                    print(f"✅ Successfully parsed semantic analysis JSON from AI response")
                    return {
                        "question": "",
                        "insight": "",
                        "type": "semantic_analysis",
                        "context": request.code,
                        "provider_used": ai_response["provider"],
                        "model_used": ai_response.get("model", "unknown"),
                        "usage": ai_response.get("usage", {}),
                        "analysis": analysis_json
                    }
                else:
                    # No JSON found, return raw response
                    print(f"⚠️ No JSON found in semantic analysis response, returning raw")
                    return {
                        "question": raw,
                        "insight": "Semantic analysis response (no JSON)",
                        "type": "semantic_analysis_raw",
                        "context": request.code,
                        "provider_used": ai_response["provider"],
                        "model_used": ai_response.get("model", "unknown"),
                        "usage": ai_response.get("usage", {})
                    }
            except json.JSONDecodeError as e:
                print(f"⚠️ Failed to parse JSON from semantic analysis: {e}")
                return {
                    "question": raw,
                    "insight": "Semantic analysis response (invalid JSON)",
                    "type": "semantic_analysis_raw",
                    "context": request.code,
                    "provider_used": ai_response["provider"],
                    "model_used": ai_response.get("model", "unknown"),
                    "usage": ai_response.get("usage", {})
                }
        
        # SIMPLIFIED: Check if this is a LHIS depth question prompt
        # Look for key LHIS indicators - be more flexible
        is_lhis_prompt = (
            ("technical interviewer" in prompt.lower() and "assessment" in prompt.lower()) or
            ("INTERVIEW CONTEXT:" in prompt and "Parameter:" in prompt) or
            ("Generate a high-quality assessment question" in prompt) or
            ("depth question" in prompt.lower()) or
            ("candidate's current code" in prompt.lower())
        )
        
        print(f"🔍 SIMPLIFIED LHIS Detection: {is_lhis_prompt}")
        if is_lhis_prompt:
            print(f"✅ LHIS prompt detected - proceeding with question generation")
        
        if is_lhis_prompt:
            # For LHIS prompts, return the entire response as the question
            cleaned_response = raw.strip()
            
            # Remove common AI response prefixes
            prefixes_to_remove = [
                "here's a contextual check-in:",
                "here's a check-in message:",
                "i would say:",
                "a natural response would be:",
                "as an interviewer, i would ask:",
            ]
            
            for prefix in prefixes_to_remove:
                if cleaned_response.lower().startswith(prefix):
                    cleaned_response = cleaned_response[len(prefix):].strip()
            
            print(f"✅ LHIS contextual response generated: {cleaned_response[:100]}...")
            
            return {
                "question": cleaned_response,
                "insight": "LHIS contextual response",
                "type": "llm-generated",
                "context": request.code,
                "provider_used": ai_response["provider"],
                "model_used": ai_response.get("model", "unknown"),
                "usage": ai_response.get("usage", {})
            }
        
        # Check if this is a counter question prompt (contains interviewer instructions)
        is_counter_question = ("interviewer" in prompt.lower() and 
                              "follow-up question" in prompt.lower() and
                              "counter question set" in prompt.lower())
        
        if is_counter_question:
            # For counter questions, return the entire response as the question
            cleaned_response = raw.strip()
            
            # Remove common AI response prefixes that aren't part of the actual question
            prefixes_to_remove = [
                "here's a thoughtful follow-up question:",
                "here's a follow-up question:",
                "a good follow-up question would be:",
                "here's a question:",
                "question:",
                "follow-up:",
                "i would ask:",
                "a natural follow-up would be:",
            ]
            
            for prefix in prefixes_to_remove:
                if cleaned_response.lower().startswith(prefix):
                    cleaned_response = cleaned_response[len(prefix):].strip()
            
            # Ensure it ends with a question mark if it doesn't already
            if cleaned_response and not cleaned_response.endswith('?'):
                cleaned_response += '?'
            
            return {
                "question": cleaned_response,
                "insight": "Counter question generated",
                "type": "llm-generated",
                "context": request.code,
                "provider_used": ai_response["provider"],
                "model_used": ai_response.get("model", "unknown")
            }
        
        # Check if this is specifically a room question generation request (legacy Q1/Q2 format)
        is_room_questions = ("Generate two distinct programming interview questions" in prompt and 
                           ("Q1:" in prompt or "Q2:" in prompt))
        
        if is_room_questions:
            print(f"🔍 Detected room question generation request - using Q1/Q2 parsing")
            # Use legacy Q1:/Q2: format parsing ONLY for room question generation
            q1_match = re.search(r'Q1:.*', raw)
            q2_match = re.search(r'Q2:.*', raw)
            q1 = q1_match.group(0) if q1_match else ''
            q2 = q2_match.group(0) if q2_match else ''
            insight = re.sub(r'Q1:.*', '', raw, count=1)
            insight = re.sub(r'Q2:.*', '', insight, count=1).strip()
            
            if insight and (q1 or q2):
                insight = insight.strip()
            else:
                insight = ''
            questions = '\n'.join(filter(None, [q1, q2]))
                    
            return {
                "question": questions,
                "insight": insight,
                "type": "llm-generated",
                "context": request.code,
                "provider_used": ai_response["provider"],
                "model_used": ai_response.get("model", "unknown"),
                "usage": ai_response.get("usage", {})
            }
        
        # DEFAULT: For all other requests, return the raw response as conversational
        # This is now the default behavior instead of trying to parse Q1/Q2
        print(f"🔄 Using default conversational response format")
        cleaned_response = raw.strip()
        
        return {
            "question": cleaned_response,
            "insight": "AI conversational response",
            "type": "llm-generated",
                "context": request.code,
                "provider_used": ai_response["provider"],
                "model_used": ai_response.get("model", "unknown"),
                "usage": ai_response.get("usage", {})
        }
            
    except Exception as e:
        return {
            "question": "",
            "insight": "",
            "type": "error",
            "context": request.code,
            "error": str(e)
        }

@app.post("/generate-approaches")
async def generate_approaches(request: ApproachGenRequest):
    """Generate 2-3 approaches for a given problem and return strict JSON."""
    base_prompt = f"""
You are generating solution approaches for a coding interview problem.

PROBLEM:
Title: {request.title}
Category: {request.category or 'unknown'}
Technology: {request.technology or 'generic'}
Description: {request.description}

TASK:
Propose 2-3 distinct solution approaches. Each must include the following fields:
- approach_key (kebab-case short key, e.g., "two-pointer", "hashmap", "recursive")
- title (concise approach name)
- summary (1-2 sentences)
- pros (array of strings)
- cons (array of strings)
- time_complexity (e.g., "O(n log n)")
- space_complexity (e.g., "O(n)" or "O(1)")

Respond EXACTLY with JSON and NOTHING ELSE:
{{
  "approaches": [
    {{
      "approach_key": "two-pointer",
      "title": "Two Pointer",
      "summary": "...",
      "pros": ["..."],
      "cons": ["..."],
      "time_complexity": "O(n)",
      "space_complexity": "O(1)"
    }}
  ]
}}
""".strip()

    try:
        ai_response = await ai_manager.generate_response(
            prompt=base_prompt,
            preferred_provider=request.preferredProvider
        )

        if not ai_response.get("success"):
            return {
                "success": False,
                "error": ai_response.get("error"),
                "attempted_providers": ai_response.get("attempted_providers", [])
            }

        raw = (ai_response.get("content") or "").strip()

        # Try to parse JSON
        try:
            # Prefer a full object containing approaches
            obj = None
            start = raw.find('{')
            end = raw.rfind('}') + 1
            if start >= 0 and end > start:
                obj = json.loads(raw[start:end])
            if isinstance(obj, dict) and isinstance(obj.get('approaches'), list):
                arr = obj['approaches']
            else:
                # Maybe the model returned a raw array
                arr = json.loads(raw)
        except Exception:
            # Attempt to extract any object with approaches: [...]
            m = re.search(r"\{[\s\S]*?\"approaches\"\s*:\s*\[[\s\S]*?\][\s\S]*?\}", raw, re.IGNORECASE)
            if not m:
                return { "success": True, "approaches": [] }
            obj = json.loads(m.group(0))
            arr = obj.get('approaches', [])

        def coerce_list(v):
            if isinstance(v, list):
                return v
            if isinstance(v, str):
                return [v]
            return []

        norm = []
        for a in arr[:3]:
            key = a.get('approach_key') or a.get('key') or a.get('title') or 'approach'
            key = re.sub(r"[^a-z0-9]+", '-', str(key).lower()).strip('-')
            norm.append({
                'approach_key': key,
                'title': a.get('title') or a.get('approach') or a.get('approach_key') or 'Approach',
                'summary': a.get('summary') or a.get('description') or '',
                'pros': coerce_list(a.get('pros')),
                'cons': coerce_list(a.get('cons')),
                'time_complexity': a.get('time_complexity') or a.get('time') or '',
                'space_complexity': a.get('space_complexity') or a.get('space') or ''
            })

        return {
            "success": True,
            "approaches": norm,
            "provider_used": ai_response.get("provider"),
            "model_used": ai_response.get("model")
        }
    except Exception as e:
        return { "success": False, "error": str(e) }

@app.post("/generate-room-questions")
async def generate_room_questions(request: RoomQuestionRequest):
    """Generate interview questions for a room with specified language and experience level."""
    print(f"🎯 Generating questions: language={request.language}, experience={request.experienceLevel}")
    
    # Base prompt
    base_prompt = f"""
Generate two distinct programming interview questions suitable for a candidate with {request.experienceLevel} experience in {request.language}.
"""
    
    # Add real-world context directive if provided
    if request.promptDirective:
        print("📝 Using custom prompt directive")
        base_prompt += f"\n{request.promptDirective}\n"
    else:
        # Default real-world context directive
        print("📝 Using default real-world context directive")
        base_prompt += """
Generate thought-provoking coding questions that:
1. MUST include a real-world scenario or business context
2. Should explain WHY this problem matters in real software development
3. Are calibrated to the specified experience level
4. Should connect to practical applications developers face daily
5. Feel engaging and relevant to modern software development

FORMAT EACH QUESTION EXACTLY AS FOLLOWS:

Q1: [REAL-WORLD SCENARIO] A brief paragraph explaining the business context.
[PROBLEM] A clear problem statement with specific requirements.

Q2: [REAL-WORLD SCENARIO] A brief paragraph explaining the business context.
[PROBLEM] A clear problem statement with specific requirements.
"""
    
    # Add formatting instructions
    base_prompt += """
Format the output strictly as follows:
Q1: [REAL-WORLD SCENARIO] followed by [PROBLEM]
Q2: [REAL-WORLD SCENARIO] followed by [PROBLEM]

Do not include any other text, greetings, or explanations.
"""
    
    try:
        print("🤖 Sending prompt to AI...")
        ai_response = await ai_manager.generate_response(
            prompt=base_prompt,
            preferred_provider=request.preferredProvider
        )
        
        if not ai_response["success"]:
            print(f"❌ AI request failed: {ai_response['error']}")
            return {
                "error": "Failed to generate questions", 
                "details": ai_response["error"],
                "attempted_providers": ai_response.get("attempted_providers", [])
            }
        
        raw_response_text = ai_response["content"].strip()
        print(f"✅ Received response from {ai_response['provider']}")

        # Extract questions using regex, looking for "Q1:" and "Q2:"
        q1_match = re.search(r"Q1:(.*?)(?=Q2:|$)", raw_response_text, re.DOTALL | re.IGNORECASE)
        q2_match = re.search(r"Q2:(.*)", raw_response_text, re.DOTALL | re.IGNORECASE)

        question1_text = q1_match.group(1).strip() if q1_match else "Could not generate question 1."
        question2_text = q2_match.group(1).strip() if q2_match else "Could not generate question 2."
        
        # No starter code - will be handled by hybrid system later
        result = [
            { 
                "id": "q1", 
                "title": "Question 1", 
                "problem": question1_text, 
                "language": request.language 
            },
            { 
                "id": "q2", 
                "title": "Question 2", 
                "problem": question2_text, 
                "language": request.language 
            }
        ]
        
        print(f"🎉 Successfully generated {len(result)} questions using {ai_response['provider']}")
        return {
            "questions": result,
            "provider_used": ai_response["provider"],
            "model_used": ai_response.get("model", "unknown"),
            "usage": ai_response.get("usage", {})
        }
        
    except Exception as e:
        print(f"💥 Error processing request: {e}")
        return {"error": "Failed to generate questions", "details": str(e)}

@app.post("/generate-room-questions-json")
async def generate_room_questions_json(data: dict = Body(...)):
    """Generate room questions with JSON input (legacy endpoint)."""
    try:
        language = data.get("language")
        experience_level = data.get("experienceLevel")
        prompt_directive = data.get("promptDirective")
        preferred_provider = data.get("preferredProvider")
        
        if not language or not experience_level:
            raise HTTPException(status_code=400, detail="Both 'language' and 'experienceLevel' are required")
        
        request = RoomQuestionRequest(
            language=language, 
            experienceLevel=experience_level,
            promptDirective=prompt_directive,
            preferredProvider=preferred_provider
        )
        return await generate_room_questions(request)
    except Exception as e:
        return {"error": "Failed to process request", "details": str(e)}

# ========== TESTING AND VALIDATION ENDPOINTS ==========

@app.get("/test")
async def test_endpoint():
    """Simple test endpoint to verify API is working."""
    print("🧪 Test endpoint called")
    return {
        "status": "ok", 
        "message": "Overforge AI Module v2.0.0 is running",
        "config": AIConfig.validate_config(),
        "endpoints": [
            "/analyze", 
            "/generate-room-questions", 
            "/generate-room-questions-json",
            "/validate-content",
            "/test-providers",
            "/provider-status",
            "/switch-provider",
            "/test-pipeline"
        ]
    }

@app.get("/test-providers")
async def test_all_providers():
    """Test all configured AI providers."""
    print("🔬 Testing all providers...")
    results = await ai_manager.test_all_providers()
    return results

class ChatRequest(BaseModel):
    message: str
    provider: Optional[str] = None  # "mistral" or "codestral"

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """Simple chat endpoint to test Mistral/Codestral API."""
    try:
        print(f"💬 Chat request received: {request.message[:100]}...")
        print(f"   Provider: {request.provider or 'default (from config)'}")
        
        # Use the specified provider or default from config
        provider = request.provider or AIConfig.PRIMARY_AI_PROVIDER
        
        if provider not in ["mistral", "codestral"]:
            provider = "mistral"  # Default to mistral if invalid
        
        # Generate response using AI manager
        result = await ai_manager.generate_response(
            prompt=request.message,
            preferred_provider=provider
        )
        
        if result["success"]:
            return {
                "success": True,
                "response": result["content"],
                "provider": result.get("provider", provider),
                "model": result.get("model", AIConfig.MISTRAL_MODEL if provider == "mistral" else "codestral-2501"),
                "usage": result.get("usage", {})
            }
        else:
            return {
                "success": False,
                "error": result.get("error", "Unknown error"),
                "provider": provider,
                "attempted_providers": result.get("attempted_providers", [])
            }
            
    except Exception as e:
        print(f"❌ Chat endpoint error: {e}")
        return {
            "success": False,
            "error": str(e),
            "provider": request.provider or "unknown"
        }

@app.get("/provider-status")
async def get_provider_status():
    """Get current status of all providers."""
    return ai_manager.get_provider_status()

@app.post("/switch-provider")
async def switch_provider(request: ProviderSwitchRequest):
    """Switch to a different AI provider."""
    print(f"🔄 Switching to provider: {request.provider}")
    result = await ai_manager.switch_provider(request.provider)
    return result

@app.get("/test-pipeline")
async def test_full_pipeline():
    """Test the complete AI pipeline with all providers."""
    print("🧪 Testing full AI pipeline...")
    
    test_prompts = [
        {
            "name": "Code Analysis",
            "prompt": "Analyze this Python function and suggest improvements:\n\ndef factorial(n):\n    if n == 0:\n        return 1\n    else:\n        return n * factorial(n-1)"
        },
        {
            "name": "Question Generation",
            "prompt": """Generate two distinct programming interview questions suitable for a candidate with 2-4 years experience in Python.

Generate thought-provoking coding questions that:
1. MUST include a real-world scenario or business context
2. Should explain WHY this problem matters in real software development
3. Are calibrated to the specified experience level

FORMAT EACH QUESTION EXACTLY AS FOLLOWS:

Q1: [REAL-WORLD SCENARIO] followed by [PROBLEM]
Q2: [REAL-WORLD SCENARIO] followed by [PROBLEM]

Do not include any other text, greetings, or explanations."""
        }
    ]
    
    results = {}
    
    for test in test_prompts:
        print(f"Testing: {test['name']}")
        result = await ai_manager.generate_response(test["prompt"])
        results[test["name"]] = {
            "success": result["success"],
            "provider": result.get("provider", "unknown"),
            "content_length": len(result.get("content", "")) if result.get("content") else 0,
            "error": result.get("error"),
            "usage": result.get("usage", {})
        }
    
    # Test room questions endpoint
    try:
        room_questions_result = await generate_room_questions(
            RoomQuestionRequest(language="python", experienceLevel="2-4")
        )
        results["Room Questions Endpoint"] = {
            "success": "questions" in room_questions_result,
            "provider": room_questions_result.get("provider_used", "unknown"),
            "questions_generated": len(room_questions_result.get("questions", [])),
            "error": room_questions_result.get("error")
        }
    except Exception as e:
        results["Room Questions Endpoint"] = {
            "success": False,
            "error": str(e)
        }
    
    return {
        "pipeline_test_results": results,
        "provider_status": ai_manager.get_provider_status(),
        "timestamp": "completed"
    }

@app.get("/test-questions")
async def test_generate_questions():
    """Generate test questions for Python with 0-2 years experience."""
    print("🎯 Test questions endpoint called")
    request = RoomQuestionRequest(language="python", experienceLevel="0-2")
    return await generate_room_questions(request) 

# ========== VALIDATION ENDPOINTS ==========

@app.post("/validate-config")
async def validate_configuration():
    """Validate the current AI configuration and test connections."""
    print("🔍 Validating configuration...")
    
    config_status = AIConfig.validate_config()
    provider_tests = await ai_manager.test_all_providers()
    
    # Determine overall health
    working_providers = []
    for provider, test_result in provider_tests.get("provider_tests", {}).items():
        if test_result.get("connected", False):
            working_providers.append(provider)
    
    overall_health = "healthy" if working_providers else "unhealthy"
    
    return {
        "overall_health": overall_health,
        "working_providers": working_providers,
        "config_status": config_status,
        "provider_tests": provider_tests,
        "recommendations": _get_config_recommendations(config_status, working_providers)
    }

def _get_config_recommendations(config_status: dict, working_providers: list) -> list:
    """Generate configuration recommendations based on current status."""
    recommendations = []
    
    if not working_providers:
        recommendations.append("⚠️  No AI providers are working. Please check your API keys and network connection.")
    
    if not config_status.get("mistral_configured") and not config_status.get("codestral_configured"):
        recommendations.append("💡 Consider adding Mistral or Codestral API keys for better performance.")
    
    if config_status.get("codestral_configured") and "codestral" not in working_providers:
        recommendations.append("🔧 Codestral is configured but not working. Check your API key.")
    
    if config_status.get("mistral_configured") and "mistral" not in working_providers:
        recommendations.append("🔧 Mistral is configured but not working. Check your API key.")
    
    if not config_status.get("ollama_fallback_enabled"):
        recommendations.append("🛡️  Consider enabling Ollama fallback for better reliability.")
    
    if len(working_providers) == 1:
        recommendations.append(f"⚡ Only {working_providers[0]} is working. Consider setting up additional providers for redundancy.")
    
    return recommendations 

def _get_safe_fallback_response(content_length: int, reason: str, details: str = "") -> dict:
    """Generate a safe fallback response when validation fails"""
    return {
        "security_analysis": {
            "is_malicious": False,
            "threats": [],
            "severity": "unknown",
            "confidence": 0,
            "details": f"Fallback response - {reason}"
        },
        "content_analysis": {
            "is_appropriate": True,
            "issues": [],
            "severity": "unknown",
            "confidence": 0,
            "details": f"Fallback response - {reason}"
        },
        "relevance_analysis": {
            "is_relevant": True,
            "is_coding_related": True,
            "context_match": True,
            "confidence": 0,
            "details": f"Fallback response - {reason}"
        },
        "intent_analysis": {
            "is_meaningful": True,
            "purpose": "unknown",
            "confidence": 0,
            "details": f"Fallback response - {reason}"
        },
        "spam_analysis": {
            "is_spam": False,
            "spam_indicators": [],
            "confidence": 0,
            "details": f"Fallback response - {reason}"
        },
        "overall_assessment": {
            "should_block": False,
            "risk_level": "unknown",
            "final_recommendation": "allow_with_caution",
            "reason": f"Validation failed ({reason}) - defaulting to allow with manual review recommended",
            "confidence_score": 0
        },
        "metadata": {
            "provider_used": "fallback",
            "content_length": content_length,
            "validation_timestamp": datetime.datetime.now().isoformat(),
            "fallback_reason": reason,
            "champion_model": False,
            "details": details[:200] if details else ""
        }
    }

@app.post("/validate-content")
async def validate_content(request: ContentValidationRequest):
    """
    Champion model content validation using Codestral 2501 and Qwen 2.5 Coder 32B.
    Optimized for production with fast response times and high accuracy.
    """
    print(f"🏆 Champion validation: type={request.content_type}, length={len(request.content)}")
    
    # Try OpenRouter champion models first
    if OPENROUTER_AVAILABLE and openrouter_provider:
        try:
            print("🤖 Using champion models for validation...")
            
            champion_result = await openrouter_provider.validate_content(
                request.content,
                {
                    "content_type": request.content_type,
                    "language": request.language,
                    "context": request.context or "No context provided",
                    "user_id": request.user_id,
                    "room_name": request.room_name
                }
            )
            
            if champion_result.get("success"):
                print(f"✅ Champion validation successful with {champion_result['model_name']}")
                
                # Extract validation data and add metadata
                validation_data = champion_result["validation_data"]
                validation_data["metadata"] = {
                    "provider_used": "openrouter_champion",
                    "model_used": champion_result.get("model_name", "champion"),
                    "model_id": champion_result.get("model", "unknown"),
                    "content_length": len(request.content),
                    "response_time": champion_result.get("response_time", 0),
                    "validation_timestamp": datetime.datetime.now().isoformat(),
                    "champion_model": True
                }
                
                return validation_data
            else:
                print(f"❌ Champion models failed: {champion_result.get('error', 'Unknown error')}")
                
        except Exception as e:
            print(f"💥 Champion models error: {str(e)}")
    
    # Fallback to current system if champions fail
    print("🔄 Falling back to current system...")
    
    validation_prompt = f"""
Analyze this {request.content_type} content for comprehensive validation with a focus on encouraging learning.

CONTENT ({request.language or 'unknown'}):
{request.content[:2000]}

CONTEXT: {request.context[:500] if request.context else 'No context provided'}

Perform deep analysis for:
1. SECURITY: Malicious code, system exploits, data theft attempts
2. CONTENT: Inappropriate language, offensive content
3. RELEVANCE: Shows genuine attempt to solve the problem
   - ENCOURAGE LEARNING: Mark as RELEVANT if code shows ANY effort toward the problem domain
   - Only mark IRRELEVANT if code shows zero effort or connection to the problem
   - Partial solutions, incomplete attempts, and learning efforts should be RELEVANT
   - When in doubt, favor RELEVANT to support learning
4. INTENT: Meaningful coding work vs random/test content
5. SPAM: Gibberish, keyboard mashing, meaningless patterns

Examples of RELEVANT content (encourage these):
- Partial solutions showing effort toward the problem
- Code structure attempts (classes, functions for the problem domain)
- Algorithm attempts even if incomplete
- Work-in-progress problem-solving code

Examples of IRRELEVANT content (only these):
- "Hello World" with NO connection to problem domain
- Copy-pasted unrelated code
- Completely random code with zero effort

RESPOND WITH ONLY VALID JSON:
{{
  "security_analysis": {{"is_malicious": false, "threats": [], "severity": "low", "confidence": 95}},
  "content_analysis": {{"is_appropriate": true, "issues": [], "severity": "low", "confidence": 95}},
  "relevance_analysis": {{"is_relevant": true, "is_coding_related": true, "context_match": true, "confidence": 95}},
  "intent_analysis": {{"is_meaningful": true, "purpose": "problem_solving", "confidence": 95}},
  "spam_analysis": {{"is_spam": false, "spam_indicators": [], "confidence": 95}},
  "overall_assessment": {{"should_block": false, "risk_level": "low", "final_recommendation": "allow", "reason": "Code shows genuine learning effort and is safe"}}
}}
"""

    try:
        ai_response = await ai_manager.generate_response(
            prompt=validation_prompt,
            preferred_provider=request.preferred_provider
        )
        
        if not ai_response["success"]:
            print(f"❌ Fallback validation failed: {ai_response['error']}")
            return _get_safe_fallback_response(len(request.content), "fallback_failed")
        
        # Parse response
        raw_response = ai_response["content"].strip()
        print(f"✅ Fallback validation from {ai_response['provider']}")
        
        try:
            json_content = raw_response
            if json_content.startswith('```'):
                json_content = json_content.replace('```json', '').replace('```', '').strip()
            
            start_idx = json_content.find('{')
            end_idx = json_content.rfind('}') + 1
            if start_idx >= 0 and end_idx > start_idx:
                json_content = json_content[start_idx:end_idx]
            
            validation_result = json.loads(json_content)
            
            # Add fallback metadata
            validation_result["metadata"] = {
                "provider_used": ai_response["provider"],
                "model_used": ai_response.get("model", "fallback"),
                "content_length": len(request.content),
                "validation_timestamp": datetime.datetime.now().isoformat(),
                "champion_model": False,
                "fallback_reason": "champions_unavailable"
            }
            
            return validation_result
            
        except json.JSONDecodeError as e:
            print(f"❌ Fallback JSON parse failed: {e}")
            return _get_safe_fallback_response(len(request.content), "parse_failed", raw_response[:200])
            
    except Exception as e:
        print(f"💥 Complete validation failure: {e}")
        return _get_safe_fallback_response(len(request.content), "service_error", str(e))

@app.post("/validate-content-multi-provider")
async def validate_content_multi_provider(request: ContentValidationRequest):
    """
    Multi-provider content validation for testing and comparison
    Tests OpenRouter models against current system
    """
    print(f"🔍 Multi-provider validation: type={request.content_type}, length={len(request.content)}")
    
    results = {
        "timestamp": datetime.datetime.now().isoformat(),
        "content_length": len(request.content),
        "language": request.language,
        "providers": {},
        "comparison": {},
        "recommendation": {}
    }
    
    # Test with OpenRouter first
    if OPENROUTER_AVAILABLE and openrouter_provider:
        try:
            openrouter_result = await openrouter_provider.validate_content(
                request.content,
                {
                    "content_type": request.content_type,
                    "language": request.language,
                    "context": request.context,
                    "user_id": request.user_id,
                    "room_name": request.room_name
                }
            )
            results["providers"]["openrouter"] = openrouter_result
        except Exception as e:
            results["providers"]["openrouter"] = {"success": False, "error": str(e)}
    else:
        results["providers"]["openrouter"] = {"success": False, "error": "OpenRouter provider not available"}
    
    # Test with current system (Codestral)
    try:
        current_result = await generate_ai_content_with_fallback(
            f"""Analyze this {request.content_type} for security, appropriateness, and relevance:

CONTENT: {request.content[:1500]}
LANGUAGE: {request.language or 'unknown'}
CONTEXT: {request.context[:400] if request.context else 'No context'}

Provide structured analysis with confidence scores.""",
            request.user_id or "validator"
        )
        
        results["providers"]["current_system"] = {
            "success": True,
            "content": current_result,
            "provider": "codestral"
        }
    except Exception as e:
        results["providers"]["current_system"] = {"success": False, "error": str(e)}
    
    # Compare results
    openrouter_success = results["providers"]["openrouter"].get("success", False)
    current_success = results["providers"]["current_system"].get("success", False)
    
    if openrouter_success and current_success:
        # Extract validation data for comparison
        or_data = results["providers"]["openrouter"].get("validation_data", {})
        
        results["comparison"] = {
            "both_successful": True,
            "openrouter_model": results["providers"]["openrouter"].get("model_name", "Unknown"),
            "openrouter_response_time": results["providers"]["openrouter"].get("response_time", 0),
            "openrouter_should_block": or_data.get("overall_assessment", {}).get("should_block", False),
            "openrouter_relevance": or_data.get("relevance_analysis", {}).get("is_relevant", True),
            "openrouter_security": or_data.get("security_analysis", {}).get("is_malicious", False),
            "performance_winner": "openrouter" if results["providers"]["openrouter"].get("response_time", 999) < 5 else "current_system"
        }
        
        # Recommendation based on comparison
        if or_data.get("overall_assessment", {}).get("should_block", False):
            results["recommendation"] = {
                "action": "block",
                "reason": "OpenRouter detected blocking issues",
                "confidence": "high"
            }
        elif not or_data.get("relevance_analysis", {}).get("is_relevant", True):
            results["recommendation"] = {
                "action": "warn_irrelevant", 
                "reason": "Content not relevant to context",
                "confidence": "medium"
            }
        else:
            results["recommendation"] = {
                "action": "allow",
                "reason": "Content appears safe and relevant",
                "confidence": "high"
            }
    
    return results 

# Add health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for testing"""
    return {"status": "healthy", "timestamp": datetime.datetime.now().isoformat()}

async def generate_ai_content_with_fallback(prompt: str, user_id: str = "default"):
    """Generate AI content with fallback logic"""
    try:
        ai_response = await ai_manager.generate_response(prompt=prompt)
        if ai_response["success"]:
            return ai_response["content"]
        else:
            return f"Analysis failed: {ai_response['error']}"
    except Exception as e:
        return f"Error during analysis: {str(e)}"

# New API endpoints for 3-parameter assessment system

class JDParametersRequest(BaseModel):
    job_description: str

class AssessmentProblemRequest(BaseModel):
    parameters: List[Dict[str, Any]]
    language: str = "python"
    experience_level: str = "intermediate"

class ParameterDepthRequest(BaseModel):
    parameter: Dict[str, Any]
    candidate_code: str
    problem_context: str
    language: str = "python"

class ParameterHintRequest(BaseModel):
    parameter: Dict[str, Any]
    candidate_code: str
    problem_context: str
    language: str = "python"

class MainProblemHintRequest(BaseModel):
    problem_context: str
    candidate_code: str
    language: str = "python"
    hint_number: int = 1

@app.post('/extract-jd-parameters')
async def extract_jd_parameters(request: JDParametersRequest):
    """Extract 3 core parameters from job description"""
    try:
        job_description = request.job_description
        
        if not job_description.strip():
            return {
                'success': False,
                'error': 'Job description is required'
            }
        
        parameters = await jd_extractor.extract_parameters_from_jd(job_description)
        
        return {
            'success': True,
            'parameters': [
                {
                    'name': param.name,
                    'description': param.description,
                    'depth_levels': param.depth_levels
                }
                for param in parameters
            ]
        }
        
    except Exception as e:
        print(f"Error in extract-jd-parameters: {e}")
        return {
            'success': False,
            'error': str(e)
        }

@app.post('/generate-assessment-problem')
async def generate_assessment_problem(request: AssessmentProblemRequest):
    """Generate a problem for 3-parameter assessment"""
    try:
        parameters = request.parameters
        language = request.language
        experience_level = request.experience_level
        
        if not parameters:
            return {
                'success': False,
                'error': 'Parameters are required'
            }
        
        # Convert parameters back to Parameter objects
        param_objects = [
            Parameter(
                name=p['name'],
                description=p['description'],
                depth_levels=p['depth_levels']
            )
            for p in parameters
        ]
        
        problem = await problem_generator.generate_problem_for_parameters(
            param_objects, language, experience_level
        )
        
        return {
            'success': True,
            'problem': problem
        }
        
    except Exception as e:
        print(f"Error in generate-assessment-problem: {e}")
        return {
            'success': False,
            'error': str(e)
        }

@app.post('/assess-parameter-depth')
async def assess_parameter_depth(request: ParameterDepthRequest):
    """Assess candidate's competency at specific parameter depth"""
    try:
        parameter_data = request.parameter
        candidate_code = request.candidate_code
        problem_context = request.problem_context
        language = request.language
        
        if not all([parameter_data, candidate_code, problem_context]):
            return {
                'success': False,
                'error': 'Parameter, candidate_code, and problem_context are required'
            }
        
        # Convert to Parameter object
        parameter = Parameter(
            name=parameter_data['name'],
            description=parameter_data['description'],
            depth_levels=parameter_data['depth_levels'],
            current_depth=parameter_data.get('current_depth', 0)
        )
        
        passed, feedback, score = await assessment_engine.assess_parameter_depth(
            parameter, candidate_code, problem_context, language
        )
        
        return {
            'success': True,
            'passed': passed,
            'feedback': feedback,
            'score': score
        }
        
    except Exception as e:
        print(f"Error in assess-parameter-depth: {e}")
        return {
            'success': False,
            'error': str(e)
        }

@app.post('/generate-parameter-hint')
async def generate_parameter_hint(request: ParameterHintRequest):
    """Generate hint for parameter depth level"""
    try:
        parameter_data = request.parameter
        candidate_code = request.candidate_code
        problem_context = request.problem_context
        language = request.language
        
        if not all([parameter_data, candidate_code, problem_context]):
            return {
                'success': False,
                'error': 'Parameter, candidate_code, and problem_context are required'
            }
        
        # Convert to Parameter object
        parameter = Parameter(
            name=parameter_data['name'],
            description=parameter_data['description'],
            depth_levels=parameter_data['depth_levels'],
            current_depth=parameter_data.get('current_depth', 0)
        )
        
        hint = await assessment_engine.generate_hint_for_depth(
            parameter, candidate_code, problem_context, language
        )
        
        return {
            'success': True,
            'hint': hint
        }
        
    except Exception as e:
        print(f"Error in generate-parameter-hint: {e}")
        return {
            'success': False,
            'error': str(e)
        }

@app.post('/generate-main-problem-hint')
async def generate_main_problem_hint(request: MainProblemHintRequest):
    """Generate hint for main problem implementation"""
    try:
        problem_context = request.problem_context
        candidate_code = request.candidate_code
        language = request.language
        hint_number = request.hint_number
        
        if not all([problem_context, candidate_code]):
            return {
                'success': False,
                'error': 'problem_context and candidate_code are required'
            }
        
        hint = await assessment_engine.generate_main_problem_hint(
            problem_context, candidate_code, language, hint_number
        )
        
        return {
            'success': True,
            'hint': hint
        }
        
    except Exception as e:
        print(f"Error in generate-main-problem-hint: {e}")
        return {
            'success': False,
            'error': str(e)
        }

@app.post("/analyze-job-description")
async def analyze_job_description(request: Request):
    """Analyze job description text to extract key information."""
    try:
        data = await request.json()
        job_description = data.get("job_description", "").strip()
        
        if not job_description:
            raise HTTPException(status_code=400, detail="Job description text is required")
        
        if len(job_description) < 50:
            raise HTTPException(status_code=400, detail="Job description too short (minimum 50 characters)")
        
        print(f"🔍 Analyzing job description: {len(job_description)} characters")
        
        # Enhanced prompt for job description analysis
        analysis_prompt = f"""
Analyze this job description and extract the following information in JSON format:

Job Description:
{job_description}

Extract:
1. Job Title - The main position title
2. Company - Company name if mentioned
3. Location - Job location if specified
4. Employment Type - (full-time, part-time, contract, etc.)
5. Experience Level - Years of experience required
6. Tech Stack - Array of specific technologies, frameworks, languages mentioned
7. Required Skills - Array of must-have skills
8. Preferred Skills - Array of nice-to-have skills

Return ONLY a JSON object with these exact keys:
{{
    "job_title": "extracted job title",
    "company": "company name or null",
    "location": "location or null", 
    "employment_type": "employment type or null",
    "experience_level": "experience level description",
    "tech_stack": ["technology1", "technology2", ...],
    "required_skills": ["skill1", "skill2", ...],
    "preferred_skills": ["skill1", "skill2", ...],
    "confidence": 85
}}

Focus on accuracy and be conservative with confidence scoring.
"""
        
        # Get AI response  
        response_result = await ai_manager.generate_response(
            prompt=analysis_prompt,
            preferred_provider="codestral"
        )
        
        if not response_result["success"]:
            raise Exception(f"AI analysis failed: {response_result['error']}")
            
        ai_response = response_result["content"]
        
        print(f"🤖 AI Analysis Response: {ai_response[:200]}...")
        
        # Parse JSON response
        try:
            # Extract JSON from response if it's wrapped in markdown
            json_start = ai_response.find('{')
            json_end = ai_response.rfind('}') + 1
            
            if json_start != -1 and json_end != -1:
                json_str = ai_response[json_start:json_end]
                analysis_result = json.loads(json_str)
            else:
                # Try to parse the entire response
                analysis_result = json.loads(ai_response)
            
            # Validate required fields
            required_fields = ["job_title", "experience_level", "tech_stack", "required_skills"]
            for field in required_fields:
                if field not in analysis_result:
                    analysis_result[field] = "" if field in ["job_title", "experience_level"] else []
            
            # Ensure arrays are actual arrays
            for field in ["tech_stack", "required_skills", "preferred_skills"]:
                if not isinstance(analysis_result.get(field), list):
                    analysis_result[field] = []
            
            # Set defaults for optional fields
            analysis_result.setdefault("company", None)
            analysis_result.setdefault("location", None)
            analysis_result.setdefault("employment_type", None)
            analysis_result.setdefault("preferred_skills", [])
            analysis_result.setdefault("confidence", 75)
            
            print(f"✅ Analysis completed: {analysis_result['job_title']}")
            print(f"📊 Tech Stack: {analysis_result['tech_stack']}")
            print(f"🎯 Confidence: {analysis_result['confidence']}%")
            
            return {
                "success": True,
                **analysis_result
            }
            
        except json.JSONDecodeError as e:
            print(f"❌ JSON parsing error: {e}")
            print(f"📄 Raw response: {ai_response}")
            
            # Fallback: try to extract information manually
            fallback_result = extract_jd_info_fallback(job_description, ai_response)
            return {
                "success": True,
                **fallback_result,
                "confidence": 60  # Lower confidence for fallback
            }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in job description analysis: {str(e)}")
        print(f"📄 Job description preview: {job_description[:200]}...")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

def extract_jd_info_fallback(job_description: str, ai_response: str) -> dict:
    """Fallback method to extract JD information when JSON parsing fails."""
    
    # Basic keyword extraction
    jd_lower = job_description.lower()
    
    # Extract job title (look for common patterns)
    job_title = "Software Engineer"  # Default
    title_patterns = [
        r"job title[:\s]+([^\n\r]+)",
        r"position[:\s]+([^\n\r]+)",
        r"role[:\s]+([^\n\r]+)",
        r"we are hiring a[n]?\s+([^\n\r]+)",
        r"looking for a[n]?\s+([^\n\r]+)"
    ]
    
    for pattern in title_patterns:
        import re
        match = re.search(pattern, jd_lower)
        if match:
            job_title = match.group(1).strip().title()
            break
    
    # Extract tech stack
    tech_keywords = [
        "javascript", "python", "java", "react", "node", "angular", "vue",
        "aws", "docker", "kubernetes", "sql", "mongodb", "postgresql",
        "spring", "django", "flask", "express", "rest", "api", "git"
    ]
    
    tech_stack = []
    for tech in tech_keywords:
        if tech in jd_lower:
            tech_stack.append(tech.title())
    
    # Extract experience level
    experience_level = "3-5 years"
    if any(word in jd_lower for word in ["senior", "lead", "principal"]):
        experience_level = "5+ years"
    elif any(word in jd_lower for word in ["junior", "entry", "graduate"]):
        experience_level = "0-2 years"
    
    return {
        "job_title": job_title,
        "company": None,
        "location": None,
        "employment_type": None,
        "experience_level": experience_level,
        "tech_stack": tech_stack,
        "required_skills": tech_stack.copy(),
        "preferred_skills": []
    }

@app.post("/parameter-analysis")
async def parameter_analysis(request: AnalyzeRequest):
    """Special endpoint for parameter analysis that returns structured analysis of code for parameters."""
    print(f"🔍 Processing parameter analysis request")
    
    # Build a specialized prompt for parameter analysis
    parameter_prompt = f"""
Analyze the following code for implementation of technical parameters.
Respond ONLY with a JSON object containing the following fields:
- implementationDetected: boolean indicating if code shows implementation of the parameter
- confidence: number between 0-100 indicating confidence level
- milestone: one of ["not_started", "basic_implementation", "service_integration", "error_handling_optimization", "advanced_patterns"]
- completeness: number between 0-100 indicating how complete the implementation is
- detectedImplementations: array of strings describing specific implementations found
- understandingLevel: one of ["surface", "functional", "deep", "expert"]
- nextLogicalStep: string describing what should be implemented next
- reasoning: brief explanation of your assessment

CODE TO ANALYZE:
{request.code}

RESPOND ONLY WITH VALID JSON:
"""
    
    try:
        # Use AI manager to generate response with fallback
        ai_response = await ai_manager.generate_response(
            prompt=parameter_prompt,
            preferred_provider=request.preferredProvider
        )
        
        if not ai_response["success"]:
            return {
                "question": "",
                "insight": "",
                "type": "error",
                "context": request.code,
                "error": ai_response["error"],
                "attempted_providers": ai_response.get("attempted_providers", [])
            }
        
        raw = ai_response["content"].strip()
        
        # Try to extract JSON from the response
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            try:
                json_response = json.loads(json_match.group())
                print(f"✅ Successfully parsed parameter analysis JSON")
                return {
                    "question": "",
                    "insight": "",
                    "type": "semantic_analysis",
                    "context": request.code,
                    "provider_used": ai_response["provider"],
                    "model_used": ai_response.get("model", "unknown"),
                    "usage": ai_response.get("usage", {}),
                    "analysis": json_response  # Include the parsed analysis
                }
            except json.JSONDecodeError as e:
                print(f"⚠️ Failed to parse JSON from parameter analysis: {e}")
                # Fallback to returning the raw response
                return {
                    "question": raw,
                    "insight": "Parameter analysis response (unparsed)",
                    "type": "semantic_analysis_raw",
                    "context": request.code,
                    "provider_used": ai_response["provider"],
                    "model_used": ai_response.get("model", "unknown"),
                    "usage": ai_response.get("usage", {})
                }
        else:
            # No JSON found, return raw response
            print(f"⚠️ No JSON found in parameter analysis response")
            return {
                "question": raw,
                "insight": "Parameter analysis response (no JSON)",
                "type": "semantic_analysis_raw",
                "context": request.code,
                "provider_used": ai_response["provider"],
                "model_used": ai_response.get("model", "unknown"),
                "usage": ai_response.get("usage", {})
            }
    except Exception as e:
        print(f"❌ Error in parameter analysis: {str(e)}")
        return {
            "question": "",
            "insight": "",
            "type": "error",
            "context": request.code,
            "error": str(e)
    }

# Server startup
if __name__ == "__main__":
    import uvicorn
    port = AIConfig.AI_MODULE_PORT
    host = AIConfig.AI_MODULE_HOST
    print(f"🚀 Starting AI Module server on http://{host}:{port}")
    uvicorn.run("app:app", host=host, port=port, reload=False) 