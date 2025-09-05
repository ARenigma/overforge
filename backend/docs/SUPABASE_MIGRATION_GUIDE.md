# Supabase Migration Guide

## Overview
This guide will help you migrate from your local PostgreSQL setup to Supabase, a cloud-hosted PostgreSQL database with built-in authentication, real-time features, and APIs.

## Step 1: Create Supabase Project

1. **Sign up at [supabase.com](https://supabase.com)**
2. **Create a new project:**
   - Project name: `overforge-interview-platform`
   - Database password: Generate a strong password (save it!)
   - Region: Choose closest to your users

3. **Get your project credentials:**
   - Go to Settings → API
   - Copy these values:
     - `Project URL`
     - `anon public key`
     - `service_role key` (keep this secret!)
   - Go to Settings → Database
     - Copy `Connection string` (for direct database access)

## Step 2: Install Supabase Dependencies

```bash
cd backend
npm install @supabase/supabase-js
npm install --save-dev supabase
```

## Step 3: Update Environment Variables

Update your `.env` file with Supabase credentials:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database Configuration (for Sequelize)
DB_HOST=db.your-project-ref.supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your-database-password

# Keep existing variables
JWT_SECRET=your-jwt-secret
AI_API_KEY=your-ai-api-key
# ... other existing variables
```

## Step 4: Database Schema Migration

### Option A: Using Supabase SQL Editor (Recommended)

1. **Go to Supabase Dashboard → SQL Editor**
2. **Run the migration SQL** (see `supabase-schema.sql` file)

### Option B: Using Sequelize Migrations

1. **Update database config to point to Supabase**
2. **Run existing migrations:**
   ```bash
   npm run migrate
   ```

## Step 5: Enable Row Level Security (RLS)

Supabase uses RLS for security. Run these SQL commands in Supabase SQL Editor:

```sql
-- Enable RLS on tables
ALTER TABLE "Users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interview_sessions" ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can view own profile" ON "Users"
  FOR SELECT USING (auth.uid()::text = id::text);

-- Users can update their own data
CREATE POLICY "Users can update own profile" ON "Users"
  FOR UPDATE USING (auth.uid()::text = id::text);

-- Interview sessions policies
CREATE POLICY "Interviewers can manage their sessions" ON "interview_sessions"
  FOR ALL USING (auth.uid()::text = "interviewerId"::text);

CREATE POLICY "Candidates can view assigned sessions" ON "interview_sessions"
  FOR SELECT USING (
    auth.uid()::text = "candidateId"::text OR 
    "isPublic" = true
  );
```

## Step 6: Update Application Code

### A. Create Supabase Client

Create `backend/src/config/supabase.js`:

```javascript
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Service role client for backend operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

module.exports = supabase
```

### B. Update Authentication (Optional - Use Supabase Auth)

You can optionally replace your JWT auth with Supabase Auth:

```javascript
// backend/src/middleware/supabase-auth.js
const supabase = require('../config/supabase')

const authenticateSupabase = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '')
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    req.user = user
    next()
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' })
  }
}

module.exports = authenticateSupabase
```

## Step 7: Real-time Features (Bonus)

Enable real-time subscriptions for live updates:

```javascript
// backend/src/services/realtime.js
const supabase = require('../config/supabase')

const subscribeToSessionUpdates = (sessionId, callback) => {
  return supabase
    .channel(`session-${sessionId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'interview_sessions',
      filter: `id=eq.${sessionId}`
    }, callback)
    .subscribe()
}

module.exports = { subscribeToSessionUpdates }
```

## Step 8: Frontend Integration

Update your frontend to use Supabase:

```bash
cd frontend
npm install @supabase/supabase-js
```

Create `frontend/lib/supabase.js`:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

## Step 9: Testing the Migration

1. **Test database connection:**
   ```bash
   node -e "
   require('dotenv').config();
   const { Sequelize } = require('sequelize');
   const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
     host: process.env.DB_HOST,
     port: process.env.DB_PORT,
     dialect: 'postgres',
     dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
   });
   sequelize.authenticate().then(() => console.log('✅ Connected to Supabase!')).catch(console.error);
   "
   ```

2. **Run your existing tests:**
   ```bash
   npm test
   ```

3. **Test API endpoints:**
   ```bash
   node test-auth-endpoints.js
   ```

## Step 10: Deployment Considerations

### Environment Variables for Production:
```env
NODE_ENV=production
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DB_HOST=db.your-project-ref.supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your-database-password
```

### Benefits of Supabase:
- ✅ **No server maintenance** - Fully managed PostgreSQL
- ✅ **Built-in authentication** - OAuth, magic links, etc.
- ✅ **Real-time subscriptions** - Live updates without Socket.IO
- ✅ **Automatic backups** - Point-in-time recovery
- ✅ **Global CDN** - Fast worldwide access
- ✅ **Auto-scaling** - Handles traffic spikes
- ✅ **Dashboard** - Visual database management
- ✅ **APIs** - Auto-generated REST and GraphQL APIs

### Migration Checklist:
- [ ] Create Supabase project
- [ ] Update environment variables
- [ ] Run database migrations
- [ ] Enable Row Level Security
- [ ] Update application code
- [ ] Test all endpoints
- [ ] Update frontend configuration
- [ ] Deploy to production
- [ ] Monitor performance

## Troubleshooting

### Common Issues:

1. **SSL Connection Error:**
   ```javascript
   dialectOptions: {
     ssl: {
       require: true,
       rejectUnauthorized: false
     }
   }
   ```

2. **RLS Blocking Queries:**
   - Use service role key for backend operations
   - Check RLS policies are correctly configured

3. **Migration Failures:**
   - Check Supabase logs in Dashboard → Logs
   - Ensure proper column types and constraints

### Support:
- Supabase Documentation: https://supabase.com/docs
- Community Discord: https://discord.supabase.com
- GitHub Issues: https://github.com/supabase/supabase 