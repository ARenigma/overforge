# OverForge Backend

Clean and organized backend for the OverForge AI Interview Platform.

## 📁 Directory Structure

```
backend/
├── src/                    # Main application source code
├── config/                 # Configuration files
├── models/                 # Database models
├── migrations/             # Database migrations
├── setup/                  # Setup and initialization scripts
│   ├── create-supabase-admin.js
│   ├── create-job-profiles-table.sql
│   ├── supabase-schema.sql
│   ├── initialize-aws-profile.js
│   └── setup-database.js
├── docs/                   # Documentation
│   ├── 3-PARAMETER-ASSESSMENT-SYSTEM.md
│   ├── HUMAN_CENTRIC_IMPLEMENTATION_SUMMARY.md
│   ├── JD_DEDUPLICATION_SYSTEM.md
│   ├── JD_UPLOAD_SYSTEM_IMPLEMENTATION.md
│   ├── PRODUCTION_DEPLOYMENT_CHECKLIST.md
│   ├── SUPABASE_INTEGRATION_STEPS.md
│   ├── SUPABASE_MIGRATION_GUIDE.md
│   └── backend-architecture.mermaid
├── package.json            # Dependencies and scripts
├── .env.example            # Environment variables template
├── .sequelizerc            # Sequelize configuration
├── upload-aws-jd.js        # Job description upload utility
└── README.md               # This file
```

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Setup Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Initialize Database**
   ```bash
   node setup/setup-database.js
   ```

4. **Create Admin User**
   ```bash
   node setup/create-supabase-admin.js
   ```

5. **Initialize Job Profiles**
   ```bash
   node setup/initialize-aws-profile.js
   ```

6. **Start Development Server**
   ```bash
   npm run dev
   ```

## 📖 Key Features

- **Human-Centric AI Interview Engine**
- **3-Parameter Progressive Assessment System**
- **Real-time Semantic Code Analysis**
- **Job-Specific Interview Profiles**
- **Live Interviewer Collaboration Tools**

## 📚 Documentation

All comprehensive documentation is available in the `/docs` directory:

- **System Architecture**: `docs/backend-architecture.mermaid`
- **Assessment System**: `docs/3-PARAMETER-ASSESSMENT-SYSTEM.md`
- **Implementation Summary**: `docs/HUMAN_CENTRIC_IMPLEMENTATION_SUMMARY.md`
- **Production Deployment**: `docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md`

## 🛠️ Utilities

- `upload-aws-jd.js` - Upload and process job descriptions
- `setup/` - Database and system initialization scripts

## 🔧 Configuration

Configure the application using environment variables in `.env`:
- Database connections (Supabase)
- AI service providers
- Authentication settings
- External API keys

Refer to `.env.example` for all available configuration options. 