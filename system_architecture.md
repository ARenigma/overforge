graph TB
    subgraph "Frontend (Next.js 14)"
        direction TB
        HomePage[Homepage<br/>Role Selection]
        Auth[Authentication<br/>Supabase Auth]
        Dashboard[Dashboard<br/>Candidate/Interviewer]
        ParamSelect[Parameter Selection<br/>3-Parameter System]
        Room[Room Interface<br/>Coding + Chat + Assessment]
    end

    subgraph "Backend (Node.js/Express + Socket.IO)"
        direction TB
        App[Express App<br/>Port 5001]
        Routes[API Routes]
        Socket[Socket.IO Handlers]
        LHIS[Living AI Interviewer<br/>Service]
        Container[Production Container<br/>Service]
        Services[Various Services]
    end

    subgraph "AI Module (FastAPI)"
        direction TB
        AIApp[FastAPI App<br/>Port 8000]
        Providers[AI Providers<br/>OpenRouter/Mistral/Ollama]
        JDExtractor[JD Parameter<br/>Extractor]
        ProblemGen[Problem Generator]
        AssessEngine[Assessment Engine]
        ParamAnalysis[Parameter Analysis]
    end

    subgraph "Docker Runtime"
        direction TB
        Core[Core Containers<br/>Java/Python/JS]
        Framework[Framework Containers<br/>Spring/Django/Express]
        Execution[Code Execution<br/>Environment]
    end

    subgraph "Database (Supabase/PostgreSQL)"
        direction TB
        JobProfiles[job_profiles]
        MasterProblems[master_problems]
        AssessmentSessions[assessment_sessions]
        ProblemSolutions[problem_solutions]
        SessionContainers[session_containers]
    end

    %% Frontend to Backend
    HomePage --> Auth
    Auth --> Dashboard
    Dashboard --> ParamSelect
    ParamSelect --> Room
    Room --> Socket
    Room --> Routes

    %% Backend Internal
    App --> Routes
    App --> Socket
    Routes --> Services
    Socket --> LHIS
    LHIS --> Container
    Services --> Container

    %% Backend to AI Module
    LHIS --> AIApp
    Services --> AIApp
    Routes --> AIApp

    %% Backend to Database
    Routes --> JobProfiles
    LHIS --> AssessmentSessions
    Container --> SessionContainers
    Routes --> MasterProblems

    %% Backend to Docker
    Container --> Core
    Container --> Framework
    Core --> Execution
    Framework --> Execution

    %% AI Module to Database
    AIApp --> ProblemSolutions
    JDExtractor --> JobProfiles

    %% Key Connections
    Room -.->|WebSocket| Socket
    Socket -.->|Real-time| LHIS
    LHIS -.->|AI Analysis| AIApp
    Container -.->|Execute Code| Execution

    classDef frontend fill:#e1f5fe
    classDef backend fill:#f3e5f5
    classDef ai fill:#e8f5e8
    classDef docker fill:#fff3e0
    classDef database fill:#fce4ec

    class HomePage,Auth,Dashboard,ParamSelect,Room frontend
    class App,Routes,Socket,LHIS,Container,Services backend
    class AIApp,Providers,JDExtractor,ProblemGen,AssessEngine,ParamAnalysis ai
    class Core,Framework,Execution docker
    class JobProfiles,MasterProblems,AssessmentSessions,ProblemSolutions,SessionContainers database

OverForge is a **multi-service AI-powered technical interview platform** with the following architecture:

### **Core Components:**
1. **Frontend** - Next.js 14 with TypeScript
2. **Backend** - Node.js/Express + Socket.IO (Port 5001) 
3. **AI Module** - FastAPI (Port 8000)
4. **Docker Runtime** - Container execution environment
5. **Database** - Supabase (PostgreSQL + RLS)

---

## 🔄 **End-to-End Flow**

### **1. User Journey Flow**

```
Homepage → Authentication → Dashboard → Parameter Selection → Room Interface
```

- **Homepage**: Role selection (Candidate/Interviewer)
- **Authentication**: Supabase auth with role-based routing
- **Dashboard**: Different interfaces for candidates vs interviewers
- **Parameter Selection**: 3-parameter system for customized interviews
- **Room Interface**: Real-time coding, chat, and assessment environment

### **2. Interview Session Flow**

```
Parameter Selection → Session Creation → Container Pre-warming → 
Real-time Coding → LHIS Assessment → Timer Management → Completion
```

**Key Features:**
- **3-Parameter Assessment System**: Core language + Framework + Tech stack
- **Per-parameter timers**: 10 minutes each, extends +1 minute on depth questions
- **Auto-advance logic**: Moves to next parameter when timer expires
- **Completion conditions**: All attempted OR all answered (depth 3)

---

## 📡 **API Structure & Routes**

### **Backend APIs (Port 5001)**

#### **Core Routes:**
- `/api/auth/*` - Supabase authentication
- `/api/execute` - Code execution in containers
- `/api/parameter-selection/*` - 3-parameter system endpoints
- `/api/session-containers/*` - Container management
- `/api/living-assessment/*` - LHIS assessment endpoints

#### **Key Endpoints:**
```javascript
// Parameter Selection
GET /api/parameter-selection/core-languages
GET /api/parameter-selection/tech-stacks  
POST /api/parameter-selection/available-problems
POST /api/parameter-selection/create-session

// Code Execution
POST /api/execute
{
  sessionId, code, language, framework, questionId
  → { success, session, output, error, executionTime }
}

// Container Management
GET /api/session-containers/:problemId
POST /api/session-containers/dev/create
```

### **AI Module APIs (Port 8000)**

#### **Core Endpoints:**
```python
# Analysis & Generation
POST /analyze - Code analysis and question generation
POST /generate-approaches - Solution approach generation
POST /parameter-analysis - Parameter-specific code analysis

# 3-Parameter Assessment System
POST /extract-jd-parameters - Extract parameters from job description
POST /generate-assessment-problem - Generate problems for parameters
POST /assess-parameter-depth - Assess candidate competency
POST /generate-parameter-hint - Generate hints for parameters

# Content Validation
POST /validate-content - Champion model validation
POST /validate-content-multi-provider - Multi-provider comparison
```

---

## 🧠 **LHIS (Living AI Interviewer System)**

### **Core Functionality:**
- **Parameter Detection**: Analyzes code for implementation patterns
- **Dynamic Questioning**: Generates 1-3 depth questions per parameter
- **Comparative Context**: Uses stored approaches for better questions
- **Progress Management**: Handles transitions between parameters
- **Real-time Feedback**: Provides contextual responses

### **Key Logic Flow:**
```javascript
Code Change → analyzeCodeProgress() → generateAIDepthQuestion() → 
processAnswer() → next_depth/next_parameter/complete/retry
```

### **Socket Events:**
```javascript
// Assessment Management
'initializeAssessment'
'joinAssessmentRoom'
'assessmentCodeChange'
'submitParameterAnswer'

// Real-time Communication
'chatMessage' (with questionContext for parameter questions)
'assessmentInitialized'
'assessmentError'
```

---

## 🐳 **Container System**

### **Container Types:**
- **Core Containers**: `interview-java-core`, `interview-python-core`, `interview-javascript-core`
- **Framework Containers**: `interview-python-django`, `interview-java-springboot`, `interview-javascript-express`

### **Execution Flow:**
```
Session Creation → Container Pre-warming → Code Execution → 
Output Capture → Preview Generation (if web app)
```

### **Key Features:**
- Persistent containers with `tail -f /dev/null`
- Correct file mapping and path resolution
- Framework-specific execution (Django migrations, Spring Boot compilation)
- Console vs web app detection

---

## 🗄️ **Database Schema**

### **Key Tables:**
```sql
-- Core System
job_profiles (title, parameters, master_problem)
assessment_sessions (session_id, assessment_state, code_progress)
problem_solutions (approaches with RLS - admin write, auth read)

-- 3-Parameter System  
extracted_parameters (technology_name, category, subcategory)
master_problems (title, description, technology, framework)
interview_sessions_v2 (core_language, tech_stack, seniority_level)
assessment_results_v2 (depth questions and scores)

-- Tech Infrastructure
session_containers (container mappings)
technology_combinations (popular tech stacks)
```

### **RLS (Row Level Security):**
- `problem_solutions`: Admin-only write, authenticated read
- Authentication handled via Supabase auth

---

## ⚡ **Real-time Communication**

### **Socket.IO Integration:**
- **Main Room**: `sessionId` for general communication  
- **Assessment Room**: `assessment-${sessionId}` for LHIS
- **Real-time Events**: Code changes, chat messages, parameter questions
- **Timer Extensions**: +1 minute on parameter questions

### **Message Types:**
- **Parameter Questions**: Include `questionContext` with `parameterId` and `depthLevel`
- **Feedback Messages**: Dynamic responses based on answer quality
- **Transition Messages**: Smooth flow between parameters
- **Completion Messages**: Assessment completion handling

---

## 🤖 **AI Provider System**

### **Provider Hierarchy:**
1. **OpenRouter** (Champion models - Codestral 2501, Qwen 2.5 Coder 32B)
2. **Mistral/Codestral** (Primary)
3. **Ollama** (Local fallback)

### **AI Module Features:**
- **Enhanced Parameter Extraction**: V2 system with either-or flexibility
- **Service-specific Detection**: AWS Lambda, DynamoDB, etc.
- **Champion Validation**: High-accuracy content validation
- **Multi-provider Fallback**: Robust error handling

---

## 🔧 **Production Considerations**

### **Port Configuration:**
- Backend: `5001` (consolidated API + Socket.IO)
- Frontend: Direct absolute URLs (no Next.js proxy)
- AI Module: `8000`

### **Container Management:**
- Docker Compose with explicit `-f` flag
- Proper environment variable alignment
- Graceful startup/shutdown handling

### **Testing Coverage:**
- Unit tests for LHIS flows
- E2E tests for depth progression
- Concurrency and lock testing
- Route-socket integration tests

---

This system provides a **comprehensive AI-powered technical interview platform** with sophisticated parameter detection, real-time assessment, and robust container-based code execution, all coordinated through a multi-service architecture designed for scalability and reliability.