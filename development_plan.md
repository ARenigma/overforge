Sequelize is fine# Development Plan: Real-Time Coding Interview Platform

This document outlines the recommended phases, milestones, and tasks for building the platform described in `techstack.md`.

---

## Phase 1: Core Platform Foundation

### 1. Project Setup
- Initialize Git repository and workspaces
- Set up folder structure (frontend, backend, ai_module, judge0, database)
- Add basic documentation and .gitignore

### 2. Database & Backend API
- Design database schema (users, rooms, sessions, etc.)
- Set up PostgreSQL/MySQL and ORM (e.g., Sequelize, TypeORM, or Knex)
- Implement user authentication (signup/login endpoints)
- Implement room management (create/join/list rooms)
- Set up API endpoints for frontend integration

### 3. Real-Time Collaboration Backend
- Integrate Socket.io for real-time communication
- Implement code sync and broadcast logic for rooms
- Add support for chat/messages in rooms (optional)

### 4. Frontend Core
- Bootstrap React app
- Implement authentication UI (login/signup forms)
- Build room lobby (create/join/list rooms)
- Integrate CodeMirror editor (basic setup)
- Connect to backend via REST and WebSocket
- Display real-time code updates

### 5. Code Execution Integration
- Set up Judge0 CE (Docker)
- Implement backend API to forward code to Judge0 and return results
- Add "Run" button and output display in frontend

### 6. Video Conferencing
- Integrate WebRTC for peer-to-peer video
- Implement signalling via backend (Socket.io)
- Add video UI components in frontend

---

## Phase 2: AI Analysis & Questioning

### 1. AI Module Setup
- Bootstrap Python service (Flask or FastAPI)
- Research/select open-source LLM for code analysis
- Implement endpoint to receive code snippets/deltas

### 2. Backend-AI Integration
- Forward code changes from backend to AI module (HTTP or message queue)
- Receive and store AI-generated questions
- Broadcast questions to relevant frontend clients

### 3. Frontend AI Integration
- Display AI-generated questions in the UI (chat, panel, or tooltip)
- Allow user to respond or dismiss questions (optional)

---

## Phase 3: Testing, Polish, and Deployment

### 1. Testing
- Unit and integration tests for backend, frontend, and AI module
- Manual and automated end-to-end tests

### 2. UX/UI Polish
- Improve styling (e.g., Tailwind CSS)
- Add helpful error messages and loading states
- Responsive/mobile-friendly design

### 3. Documentation
- Update and expand setup guides
- Add API documentation (Swagger/OpenAPI)

### 4. Deployment
- Dockerize all services
- Prepare docker-compose for local/dev deployment
- Plan for cloud deployment (optional)

---

## Team Roles (Recommended)
- **Frontend Developer(s):** React, CodeMirror, WebRTC
- **Backend Developer(s):** Node.js, Express, Socket.io, DB
- **AI/ML Engineer:** Python, LLM integration, code analysis
- **DevOps/Infra:** Docker, deployment, CI/CD

---

## Milestones & Deliverables
- [ ] Core backend API and DB ready
- [ ] Real-time code collaboration working
- [ ] Frontend MVP (auth, rooms, editor)
- [ ] Code execution integrated
- [ ] Video conferencing functional
- [ ] AI module MVP (basic question generation)
- [ ] End-to-end demo (all features connected)
- [ ] Documentation and deployment scripts

---

_Refer to `techstack.md` and `execution_guide.md` for further details and upgrade paths._ 