"""
Enhanced Parameter Extraction System V2
Significantly expanded keyword detection with comprehensive technology taxonomy
"""

import json
import re
from typing import List, Dict, Any, Set, Tuple
from dataclasses import dataclass
from collections import defaultdict

@dataclass
class TechPattern:
    """Represents a technology pattern with context-aware detection"""
    name: str
    primary_keywords: List[str]
    synonyms: List[str]
    context_keywords: List[str]
    version_patterns: List[str]
    skill_indicators: List[str]
    exclusion_patterns: List[str]
    weight: float

@dataclass
class TechDomain:
    """Enhanced technical domain with comprehensive patterns"""
    name: str
    patterns: List[TechPattern]
    focus_areas: List[str]
    exclusions: List[str]
    industry_context: List[str]

class EnhancedParameterExtractorV2:
    def __init__(self, ai_manager):
        self.ai_manager = ai_manager
        self.tech_domains = self._initialize_comprehensive_tech_domains()
        self.technology_taxonomy = self._build_technology_taxonomy()
        print("Initializing Enhanced Parameter Extractor V2...")
        
    def _initialize_comprehensive_tech_domains(self) -> Dict[str, TechDomain]:
        """Comprehensive technical domains with extensive keyword detection"""
        
        # Cloud & Infrastructure Technologies
        cloud_patterns = [
            TechPattern(
                name="AWS Services",
                primary_keywords=["aws", "amazon web services", "ec2", "s3", "lambda", "dynamodb", "rds", "cloudformation", "cloudwatch"],
                synonyms=["amazon cloud", "aws stack", "aws platform"],
                context_keywords=["deploy", "hosting", "serverless", "microservices", "infrastructure", "scalable"],
                version_patterns=["boto3", "aws-sdk", "aws cli", "sam", "cdk"],
                skill_indicators=["provisioning", "auto-scaling", "load balancing", "vpc", "iam", "security groups"],
                exclusion_patterns=["azure", "gcp", "google cloud"],
                weight=1.0
            ),
            TechPattern(
                name="Azure Cloud",
                primary_keywords=["azure", "microsoft azure", "azure functions", "cosmos db", "app service", "azure sql"],
                synonyms=["ms azure", "azure cloud", "microsoft cloud"],
                context_keywords=["cloud deployment", "azure devops", "resource groups"],
                version_patterns=["azure cli", "azure-sdk", "arm templates"],
                skill_indicators=["azure active directory", "azure kubernetes service", "application insights"],
                exclusion_patterns=["aws", "google cloud", "gcp"],
                weight=1.0
            ),
            TechPattern(
                name="Google Cloud Platform",
                primary_keywords=["gcp", "google cloud", "app engine", "cloud functions", "firestore", "bigquery"],
                synonyms=["google cloud platform", "gcp stack"],
                context_keywords=["cloud deployment", "serverless", "machine learning"],
                version_patterns=["gcloud cli", "google-cloud-sdk"],
                skill_indicators=["cloud storage", "kubernetes engine", "cloud sql"],
                exclusion_patterns=["aws", "azure", "microsoft"],
                weight=1.0
            ),
            TechPattern(
                name="Container Technologies",
                primary_keywords=["docker", "kubernetes", "k8s", "containerization", "pods", "helm"],
                synonyms=["containers", "orchestration", "microservices"],
                context_keywords=["deployment", "scaling", "devops", "infrastructure"],
                version_patterns=["docker-compose", "dockerfile", "k8s manifests"],
                skill_indicators=["container registry", "service mesh", "ingress", "persistent volumes"],
                exclusion_patterns=["monolith", "single instance"],
                weight=0.9
            )
        ]
        
        # Backend Framework Technologies
        backend_patterns = [
            TechPattern(
                name="Spring Framework",
                primary_keywords=["spring", "spring boot", "spring mvc", "spring data", "spring security"],
                synonyms=["spring framework", "spring stack"],
                context_keywords=["java", "rest api", "microservices", "dependency injection"],
                version_patterns=["@controller", "@service", "@repository", "@autowired", "@component"],
                skill_indicators=["annotation-based", "mvc pattern", "jpa integration", "security configuration"],
                exclusion_patterns=["django", "flask", "express", "laravel"],
                weight=1.0
            ),
            TechPattern(
                name="Django Framework",
                primary_keywords=["django", "django rest framework", "drf", "django orm", "django models"],
                synonyms=["django framework", "python django"],
                context_keywords=["python", "web framework", "rest api", "backend"],
                version_patterns=["manage.py", "settings.py", "urls.py", "views.py"],
                skill_indicators=["model-view-template", "admin interface", "middleware", "signals"],
                exclusion_patterns=["flask", "spring", "express", "laravel"],
                weight=1.0
            ),
            TechPattern(
                name="Node.js & Express",
                primary_keywords=["node.js", "nodejs", "express", "express.js", "npm", "nestjs"],
                synonyms=["node", "express framework", "javascript backend"],
                context_keywords=["javascript", "backend", "api", "server-side", "asynchronous"],
                version_patterns=["package.json", "app.use", "middleware", "async/await"],
                skill_indicators=["event-driven", "non-blocking", "middleware patterns", "route handling"],
                exclusion_patterns=["python", "java", "php", "ruby"],
                weight=1.0
            ),
            TechPattern(
                name="FastAPI",
                primary_keywords=["fastapi", "pydantic", "uvicorn", "async python", "type hints"],
                synonyms=["fast api", "modern python api"],
                context_keywords=["python", "async", "api documentation", "performance"],
                version_patterns=["from fastapi import", "@app.get", "@app.post"],
                skill_indicators=["automatic documentation", "type validation", "async support"],
                exclusion_patterns=["django", "flask", "spring"],
                weight=0.9
            ),
            TechPattern(
                name="Ruby on Rails",
                primary_keywords=["ruby on rails", "rails", "ruby", "activerecord", "action controller"],
                synonyms=["ror", "rails framework", "ruby framework"],
                context_keywords=["web framework", "mvc", "convention over configuration"],
                version_patterns=["gemfile", "rails generate", "config/routes.rb"],
                skill_indicators=["activerecord patterns", "rails conventions", "gem management"],
                exclusion_patterns=["python", "java", "javascript", "php"],
                weight=0.8
            )
        ]
        
        # Frontend Technologies
        frontend_patterns = [
            TechPattern(
                name="React Ecosystem",
                primary_keywords=["react", "react.js", "jsx", "react hooks", "react router", "redux", "next.js"],
                synonyms=["reactjs", "react framework", "react library"],
                context_keywords=["frontend", "component-based", "virtual dom", "spa"],
                version_patterns=["usestate", "useeffect", "createcontext", "react-dom"],
                skill_indicators=["component lifecycle", "state management", "prop drilling", "context api"],
                exclusion_patterns=["angular", "vue", "svelte"],
                weight=1.0
            ),
            TechPattern(
                name="Angular Framework",
                primary_keywords=["angular", "angularjs", "typescript", "angular cli", "rxjs", "angular material"],
                synonyms=["angular framework", "ng"],
                context_keywords=["frontend", "typescript", "component-based", "dependency injection"],
                version_patterns=["@component", "@injectable", "@ngmodule", "ng-"],
                skill_indicators=["services and dependency injection", "observables", "template binding"],
                exclusion_patterns=["react", "vue", "svelte"],
                weight=0.9
            ),
            TechPattern(
                name="Vue.js Ecosystem",
                primary_keywords=["vue", "vue.js", "vuejs", "nuxt", "vue router", "vuex", "pinia"],
                synonyms=["vue framework", "vue library"],
                context_keywords=["frontend", "progressive framework", "component-based"],
                version_patterns=["v-model", "v-if", "v-for", "vue-cli"],
                skill_indicators=["reactive data binding", "single file components", "vue directives"],
                exclusion_patterns=["react", "angular", "svelte"],
                weight=0.8
            )
        ]
        
        # Database Technologies
        database_patterns = [
            TechPattern(
                name="Relational Databases",
                primary_keywords=["postgresql", "mysql", "sql server", "oracle", "sqlite", "mariadb"],
                synonyms=["sql databases", "relational db", "rdbms"],
                context_keywords=["database", "relational", "sql", "acid", "transactions"],
                version_patterns=["select", "join", "foreign key", "index", "trigger"],
                skill_indicators=["normalization", "indexing", "query optimization", "stored procedures"],
                exclusion_patterns=["nosql", "mongodb", "cassandra"],
                weight=1.0
            ),
            TechPattern(
                name="NoSQL Databases",
                primary_keywords=["mongodb", "cassandra", "redis", "elasticsearch", "dynamodb", "couchdb"],
                synonyms=["nosql", "document database", "key-value store"],
                context_keywords=["nosql", "document", "scalable", "distributed"],
                version_patterns=["find()", "aggregate()", "collection", "document"],
                skill_indicators=["schema flexibility", "horizontal scaling", "eventual consistency"],
                exclusion_patterns=["sql", "relational", "join"],
                weight=0.9
            ),
            TechPattern(
                name="ORM Technologies",
                primary_keywords=["hibernate", "jpa", "sequelize", "sqlalchemy", "prisma", "typeorm"],
                synonyms=["object-relational mapping", "orm"],
                context_keywords=["database", "mapping", "entities", "relationships"],
                version_patterns=["@entity", "@table", "models.py", "schema.prisma"],
                skill_indicators=["entity relationships", "lazy loading", "query builders"],
                exclusion_patterns=["raw sql only", "no orm"],
                weight=0.8
            )
        ]
        
        # DevOps & Infrastructure
        devops_patterns = [
            TechPattern(
                name="CI/CD Pipeline Technologies",
                primary_keywords=["jenkins", "github actions", "gitlab ci", "azure devops", "circle ci", "travis ci"],
                synonyms=["continuous integration", "continuous deployment", "ci/cd"],
                context_keywords=["automation", "pipeline", "deployment", "testing"],
                version_patterns=["jenkinsfile", ".github/workflows", ".gitlab-ci.yml"],
                skill_indicators=["build automation", "test automation", "deployment strategies"],
                exclusion_patterns=["manual deployment", "no automation"],
                weight=0.9
            ),
            TechPattern(
                name="Infrastructure as Code",
                primary_keywords=["terraform", "cloudformation", "ansible", "puppet", "chef", "arm templates"],
                synonyms=["iac", "infrastructure automation"],
                context_keywords=["infrastructure", "provisioning", "configuration management"],
                version_patterns=["main.tf", "terraform.tfvars", "playbook.yml"],
                skill_indicators=["infrastructure provisioning", "configuration management", "state management"],
                exclusion_patterns=["manual configuration", "gui setup"],
                weight=0.8
            ),
            TechPattern(
                name="Monitoring & Logging",
                primary_keywords=["prometheus", "grafana", "elk stack", "splunk", "datadog", "new relic"],
                synonyms=["monitoring", "observability", "logging"],
                context_keywords=["metrics", "alerts", "dashboards", "logs"],
                version_patterns=["prometheus.yml", "logstash", "elasticsearch"],
                skill_indicators=["metrics collection", "alert configuration", "log aggregation"],
                exclusion_patterns=["no monitoring", "basic logging only"],
                weight=0.7
            )
        ]
        
        # Programming Languages & Core Concepts
        language_patterns = [
            TechPattern(
                name="Java Ecosystem",
                primary_keywords=["java", "jvm", "maven", "gradle", "junit", "mockito", "java 8", "java 11"],
                synonyms=["java programming", "java development"],
                context_keywords=["object-oriented", "enterprise", "backend", "spring"],
                version_patterns=["public class", "public static void main", "@test"],
                skill_indicators=["object-oriented programming", "exception handling", "multithreading"],
                exclusion_patterns=["javascript", "python", "c#"],
                weight=1.0
            ),
            TechPattern(
                name="Python Ecosystem",
                primary_keywords=["python", "pip", "virtualenv", "pytest", "pandas", "numpy", "python 3"],
                synonyms=["python programming", "python development"],
                context_keywords=["data science", "machine learning", "backend", "automation"],
                version_patterns=["def ", "import ", "requirements.txt", "__init__.py"],
                skill_indicators=["pythonic code", "data structures", "exception handling"],
                exclusion_patterns=["java", "javascript", "c#"],
                weight=1.0
            ),
            TechPattern(
                name="JavaScript Ecosystem",
                primary_keywords=["javascript", "js", "es6", "typescript", "webpack", "babel", "eslint"],
                synonyms=["js programming", "javascript development"],
                context_keywords=["frontend", "backend", "web development", "node.js"],
                version_patterns=["function", "const", "let", "arrow functions", "async/await"],
                skill_indicators=["asynchronous programming", "closures", "prototypal inheritance"],
                exclusion_patterns=["java", "python", "c#"],
                weight=1.0
            )
        ]
        
        return {
            "cloud_infrastructure": TechDomain(
                name="Cloud & Infrastructure Technologies",
                patterns=cloud_patterns,
                focus_areas=["cloud services", "infrastructure", "scalability", "deployment"],
                exclusions=["frontend development", "data modeling"],
                industry_context=["enterprise", "saas", "startups", "e-commerce"]
            ),
            "backend_frameworks": TechDomain(
                name="Backend Framework & API Development",
                patterns=backend_patterns,
                focus_areas=["api development", "backend logic", "framework patterns"],
                exclusions=["frontend", "database design", "devops"],
                industry_context=["web development", "microservices", "enterprise applications"]
            ),
            "frontend_technologies": TechDomain(
                name="Frontend & User Interface Development", 
                patterns=frontend_patterns,
                focus_areas=["user interfaces", "component architecture", "state management"],
                exclusions=["backend apis", "database", "infrastructure"],
                industry_context=["web applications", "mobile apps", "user experience"]
            ),
            "data_technologies": TechDomain(
                name="Data Management & Database Technologies",
                patterns=database_patterns,
                focus_areas=["data modeling", "database design", "data persistence"],
                exclusions=["frontend", "api development", "cloud services"],
                industry_context=["data-driven applications", "analytics", "enterprise systems"]
            ),
            "devops_infrastructure": TechDomain(
                name="DevOps & Infrastructure Automation",
                patterns=devops_patterns,
                focus_areas=["automation", "deployment", "monitoring", "infrastructure"],
                exclusions=["application development", "frontend", "business logic"],
                industry_context=["operations", "platform engineering", "site reliability"]
            ),
            "programming_core": TechDomain(
                name="Core Programming & Language Expertise",
                patterns=language_patterns,
                focus_areas=["programming fundamentals", "language-specific patterns", "algorithms"],
                exclusions=["specific frameworks", "infrastructure", "databases"],
                industry_context=["software engineering", "algorithm development", "system programming"]
            )
        }
    
    def _build_technology_taxonomy(self) -> Dict[str, Any]:
        """Build comprehensive technology taxonomy for enhanced detection"""
        taxonomy = {
            "technology_categories": {},
            "skill_levels": {
                "junior": ["basic", "beginner", "entry", "trainee", "1-2 years"],
                "mid": ["intermediate", "mid-level", "2-5 years", "experienced"],
                "senior": ["senior", "expert", "lead", "principal", "5+ years", "architect"]
            },
            "industry_contexts": {
                "fintech": ["financial", "banking", "payments", "trading", "blockchain"],
                "healthcare": ["medical", "healthcare", "hipaa", "clinical", "patient"],
                "e-commerce": ["retail", "shopping", "payments", "inventory", "marketplace"],
                "enterprise": ["enterprise", "b2b", "saas", "corporate", "business"],
                "startup": ["startup", "mvp", "agile", "fast-paced", "scaling"]
            },
            "architecture_patterns": {
                "microservices": ["microservices", "service-oriented", "distributed", "api gateway"],
                "monolith": ["monolithic", "single application", "traditional architecture"],
                "serverless": ["serverless", "functions", "event-driven", "lambda"],
                "event_driven": ["event-driven", "messaging", "queues", "pub/sub"]
            }
        }
        
        # Build technology categories from domains
        for domain_name, domain in self.tech_domains.items():
            taxonomy["technology_categories"][domain_name] = {
                "patterns": [pattern.name for pattern in domain.patterns],
                "keywords": []
            }
            
            for pattern in domain.patterns:
                taxonomy["technology_categories"][domain_name]["keywords"].extend(
                    pattern.primary_keywords + pattern.synonyms
                )
        
        return taxonomy
    
    async def analyze_job_description_comprehensive(self, job_description: str) -> Dict[str, Any]:
        """Comprehensive analysis with expanded keyword detection"""
        
        print(f"🔍 V2 Extractor: Starting comprehensive analysis...")
        
        # Step 1: Technology detection with scoring
        tech_scores = self._detect_technologies_with_scoring(job_description)
        print(f"🔍 V2 Extractor: Detected {len(tech_scores)} technologies")
        
        # Step 2: Context analysis
        context_analysis = self._analyze_context_patterns(job_description)
        print(f"🔍 V2 Extractor: Context analysis completed")
        
        # Step 3: Industry and role analysis
        industry_context = self._detect_industry_context(job_description)
        print(f"🔍 V2 Extractor: Industry context: {industry_context.get('primary_industry', 'general')}")
        
        # Step 4: Skill level assessment
        skill_level = self._assess_skill_level(job_description)
        print(f"🔍 V2 Extractor: Skill level: {skill_level}")
        
        # Step 5: Architecture pattern detection
        architecture_patterns = self._detect_architecture_patterns(job_description)
        print(f"🔍 V2 Extractor: Architecture patterns: {len(architecture_patterns)}")
        
        return {
            "technology_scores": tech_scores,
            "context_analysis": context_analysis,
            "industry_context": industry_context,
            "skill_level": skill_level,
            "architecture_patterns": architecture_patterns,
            "dominant_domains": self._identify_dominant_domains(tech_scores)
        }
    
    def _detect_technologies_with_scoring(self, job_description: str) -> Dict[str, float]:
        """Advanced technology detection with context-aware scoring"""
        jd_lower = job_description.lower()
        tech_scores = defaultdict(float)
        
        for domain_name, domain in self.tech_domains.items():
            for pattern in domain.patterns:
                score = 0.0
                
                # Primary keyword matches (high weight)
                for keyword in pattern.primary_keywords:
                    if keyword.lower() in jd_lower:
                        score += pattern.weight * 1.0
                        
                        # Context boost if surrounded by relevant terms
                        for context_kw in pattern.context_keywords:
                            if context_kw.lower() in jd_lower:
                                score += 0.2
                
                # Synonym matches (medium weight)
                for synonym in pattern.synonyms:
                    if synonym.lower() in jd_lower:
                        score += pattern.weight * 0.7
                
                # Version pattern matches (high confidence boost)
                for version_pattern in pattern.version_patterns:
                    if version_pattern.lower() in jd_lower:
                        score += pattern.weight * 0.8
                
                # Skill indicator matches (medium weight)
                for skill_indicator in pattern.skill_indicators:
                    if skill_indicator.lower() in jd_lower:
                        score += pattern.weight * 0.5
                
                # Exclusion penalty
                for exclusion in pattern.exclusion_patterns:
                    if exclusion.lower() in jd_lower:
                        score -= 0.3
                
                if score > 0:
                    tech_scores[f"{domain_name}::{pattern.name}"] = score
        
        return dict(tech_scores)
    
    def _analyze_context_patterns(self, job_description: str) -> Dict[str, Any]:
        """Analyze context patterns for better parameter generation"""
        jd_lower = job_description.lower()
        
        context_indicators = {
            "api_heavy": ["api", "rest", "graphql", "endpoint", "service"],
            "data_heavy": ["data", "analytics", "reporting", "etl", "pipeline"],
            "ui_heavy": ["ui", "user interface", "frontend", "user experience", "design"],
            "infrastructure_heavy": ["infrastructure", "devops", "deployment", "scaling", "monitoring"],
            "integration_heavy": ["integration", "third-party", "external", "connector", "webhook"]
        }
        
        context_scores = {}
        for context, keywords in context_indicators.items():
            score = sum(1 for kw in keywords if kw in jd_lower)
            context_scores[context] = score / len(keywords)  # Normalize
        
        return {
            "context_scores": context_scores,
            "primary_context": max(context_scores, key=context_scores.get) if context_scores else "general"
        }
    
    def _detect_industry_context(self, job_description: str) -> Dict[str, Any]:
        """Detect industry context for specialized parameter generation"""
        jd_lower = job_description.lower()
        
        industry_scores = {}
        for industry, keywords in self.technology_taxonomy["industry_contexts"].items():
            score = sum(1 for kw in keywords if kw in jd_lower)
            if score > 0:
                industry_scores[industry] = score
        
        return {
            "industry_scores": industry_scores,
            "primary_industry": max(industry_scores, key=industry_scores.get) if industry_scores else "general"
        }
    
    def _assess_skill_level(self, job_description: str) -> str:
        """Assess the target skill level from job description"""
        jd_lower = job_description.lower()
        
        level_scores = {"junior": 0, "mid": 0, "senior": 0}
        
        for level, indicators in self.technology_taxonomy["skill_levels"].items():
            for indicator in indicators:
                if indicator in jd_lower:
                    level_scores[level] += 1
        
        return max(level_scores, key=level_scores.get) if any(level_scores.values()) else "mid"
    
    def _detect_architecture_patterns(self, job_description: str) -> List[str]:
        """Detect architectural patterns mentioned in the job description"""
        jd_lower = job_description.lower()
        detected_patterns = []
        
        for pattern, keywords in self.technology_taxonomy["architecture_patterns"].items():
            if any(kw in jd_lower for kw in keywords):
                detected_patterns.append(pattern)
        
        return detected_patterns
    
    def _identify_dominant_domains(self, tech_scores: Dict[str, float]) -> List[Tuple[str, float]]:
        """Identify the top 3 most relevant technical domains"""
        domain_scores = defaultdict(float)
        
        for tech_key, score in tech_scores.items():
            domain = tech_key.split("::")[0]
            domain_scores[domain] += score
        
        # Sort by score and return top 3
        sorted_domains = sorted(domain_scores.items(), key=lambda x: x[1], reverse=True)
        return sorted_domains[:3]
    
    async def extract_mutually_exclusive_parameters(self, job_description: str) -> List[Dict[str, Any]]:
        """Extract parameters using comprehensive analysis"""
        
        try:
            print(f"🔍 V2 Enhanced extractor: Starting parameter extraction...")
            
            # Comprehensive analysis
            analysis = await self.analyze_job_description_comprehensive(job_description)
            
            # Generate parameters based on analysis
            parameters = await self._generate_parameters_from_analysis(job_description, analysis)
            
            # Validate and enhance
            validated_parameters = await self._validate_with_comprehensive_analysis(parameters, job_description, analysis)
            
            return validated_parameters
            
        except Exception as e:
            print(f"❌ V2 Enhanced extractor failed: {e}")
            return self._fallback_parameters_v2()
    
    async def _generate_parameters_from_analysis(self, job_description: str, analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generate parameters using comprehensive analysis data"""
        
        dominant_domains = analysis.get("dominant_domains", [])
        tech_scores = analysis.get("technology_scores", {})
        context = analysis.get("context_analysis", {})
        industry = analysis.get("industry_context", {})
        skill_level = analysis.get("skill_level", "mid")
        
        generation_prompt = f"""
        Generate exactly 3 mutually exclusive technical assessment parameters using this comprehensive analysis.
        
        Job Description:
        {job_description}
        
        COMPREHENSIVE ANALYSIS RESULTS:
        
        Dominant Technical Domains (Top 3):
        {json.dumps(dominant_domains, indent=2)}
        
        Technology Detection Scores:
        {json.dumps(dict(list(tech_scores.items())[:10]), indent=2)}
        
        Context Analysis:
        {json.dumps(context, indent=2)}
        
        Industry Context: {industry.get('primary_industry', 'general')}
        Target Skill Level: {skill_level}
        
        PARAMETER GENERATION RULES:
        1. Use the TOP 3 dominant domains as the basis for parameters
        2. Make each parameter laser-focused on specific technologies detected
        3. Include detected version patterns and skill indicators
        4. Tailor complexity to the detected skill level
        5. Consider industry context for specialized requirements
        
        TECHNOLOGY-SPECIFIC NAMING (Use detected technologies):
        - If AWS detected → "AWS Cloud Services Integration" 
        - If Spring detected → "Spring Framework Architecture Patterns"
        - If React detected → "React Component Development"
        - If Node.js detected → "Node.js API Architecture"
        - If MongoDB detected → "MongoDB Data Modeling"
        - If Docker/K8s detected → "Container Orchestration Patterns"
        
        FORBIDDEN GENERIC TERMS:
        - "Backend Development" → Use specific framework name
        - "Frontend Development" → Use specific framework name  
        - "Database Design" → Use specific database technology
        - "System Integration" → Use specific integration pattern
        - "Software Development" → Use specific technology/language
        
        For each parameter, provide:
        {{
            "name": "Technology-specific parameter name (use detected tech)",
            "description": "Precise description targeting detected technologies",
            "core_technologies": ["specific technologies from analysis"],
            "detection_patterns": ["specific code patterns for this tech"],
            "depth_progression": [
                "{skill_level} level implementation",
                "Intermediate {skill_level} integration", 
                "Advanced {skill_level} optimization"
            ],
            "confidence_score": "0.0-1.0 based on detection strength"
        }}
        
        Respond ONLY with JSON array of exactly 3 parameters:
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
                    return parameters[:3]
        except Exception as e:
            print(f"Parameter generation failed: {e}")
        
        return self._fallback_parameters_v2()
    
    async def _validate_with_comprehensive_analysis(self, parameters: List[Dict[str, Any]], job_description: str, analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Enhanced validation using comprehensive analysis"""
        
        tech_scores = analysis.get("technology_scores", {})
        dominant_domains = analysis.get("dominant_domains", [])
        
        validation_prompt = f"""
        Validate and enhance these parameters using comprehensive technology analysis.
        
        Generated Parameters:
        {json.dumps(parameters, indent=2)}
        
        Technology Detection Results:
        {json.dumps(dict(list(tech_scores.items())[:15]), indent=2)}
        
        Dominant Domains:
        {json.dumps(dominant_domains, indent=2)}
        
        VALIDATION CHECKLIST:
        1. ✅ Do parameter names use SPECIFIC detected technologies?
        2. ✅ Are parameters based on the highest-scoring domains?
        3. ✅ Do detection patterns match actual detected tech patterns?
        4. ✅ Are generic terms completely eliminated?
        5. ✅ Is mutual exclusivity maintained?
        
        ENHANCEMENT RULES:
        - Replace ANY generic terms with specific technology names from analysis
        - Ensure parameter names directly reflect detected technologies
        - Use technology scores to prioritize most relevant skills
        - Make detection patterns technology-specific
        
        SPECIFIC TECHNOLOGY REPLACEMENTS:
        - "API Development" → "Express.js API Architecture" (if Node.js detected)
        - "Database Design" → "MongoDB Schema Design" (if MongoDB detected)  
        - "Cloud Services" → "AWS Lambda Functions" (if AWS detected)
        - "Framework Patterns" → "Spring Boot Microservices" (if Spring detected)
        
        Return enhanced parameters that precisely match detected technologies.
        
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
    
    def _fallback_parameters_v2(self) -> List[Dict[str, Any]]:
        """Enhanced fallback parameters with technology focus"""
        return [
            {
                "name": "Algorithm & Data Structure Implementation",
                "description": "Core programming problem-solving with efficient algorithms and data structures",
                "depth_progression": [
                    "Basic data structure usage and simple algorithms",
                    "Complex algorithmic solutions and optimization",
                    "Advanced algorithm design and performance analysis"
                ]
            },
            {
                "name": "Framework Architecture & Design Patterns",
                "description": "Technology-specific framework implementation and architectural patterns",
                "depth_progression": [
                    "Framework fundamentals and basic patterns",
                    "Advanced framework features and custom patterns",
                    "Framework optimization and architectural design"
                ]
            },
            {
                "name": "Service Integration & API Architecture",
                "description": "Microservice communication and external service integration patterns",
                "depth_progression": [
                    "Basic API consumption and service communication",
                    "Complex integration patterns and error handling",
                    "Distributed system design and integration optimization"
                ]
            }
        ] 