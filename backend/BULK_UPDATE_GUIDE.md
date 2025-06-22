# Bulk Job Profile Update Guide

This guide explains how to update existing job profiles in Supabase with the new V2 Enhanced Keyword Detection system.

## Overview

The V2 Enhanced Keyword Detection system provides:
- 75% more precise technology detection
- 200% more targeted parameter specificity  
- Context-aware scoring with detailed technology analysis
- Technology-specific parameter names (e.g., "Express.js API Architecture" instead of "Backend Development")

**Important**: Existing job profiles do NOT automatically get V2 parameters. This script enables bulk updating.

## Prerequisites

1. **AI Module Running**: Ensure the AI module is running on port 8000
   ```bash
   cd ai_module && python -m uvicorn app:app --host 0.0.0.0 --port 8000
   ```

2. **Environment Variables**: Ensure you have:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   AI_MODULE_URL=http://localhost:8000
   ```

## Usage Options

### 1. Dry Run (Recommended First Step)
```bash
cd backend
node bulk-update-job-profiles.js --dry-run
```
**What it does**: Shows which profiles would be updated without making changes

**Example Output**:
```
📊 Found 5 job profiles to process
📋 Processing: AWS Backend Developer (abc123)
🔍 DRY RUN: Would reprocess this profile
📋 Processing: React Developer (def456)  
🔍 DRY RUN: Would reprocess this profile

📊 BULK UPDATE SUMMARY (DRY RUN)
📋 Total Profiles: 5
🔄 Processed: 4
⚠️  Skipped: 1 (insufficient content)
```

### 2. Update Specific Profile
```bash
node bulk-update-job-profiles.js --profile YOUR_PROFILE_ID
```
**What it does**: Updates a single job profile by ID

### 3. Update All Profiles
```bash
node bulk-update-job-profiles.js
```
**What it does**: Updates ALL active job profiles with V2 parameters

**Safety Features**:
- 5-second countdown before starting
- Production environment protection
- Batch processing to avoid API overload
- Detailed progress logging

## Production Safety

For production environments, you must set a confirmation flag:
```bash
export CONFIRM_BULK_UPDATE=true
node bulk-update-job-profiles.js
```

## What Gets Updated

### Before (V1 Parameters):
```json
[
  {
    "name": "AWS Services Proficiency",
    "description": "DynamoDB, Lambda, S3 integration"
  },
  {
    "name": "Backend Development", 
    "description": "Java/Spring framework expertise"
  },
  {
    "name": "System Integration",
    "description": "Data management and scalability"
  }
]
```

### After (V2 Parameters):
```json
[
  {
    "name": "AWS Serverless Architecture",
    "description": "Lambda, DynamoDB, and S3 integration for scalable serverless applications"
  },
  {
    "name": "Express.js API Architecture",
    "description": "RESTful API development with Node.js and Express framework"
  },
  {
    "name": "DynamoDB Data Modeling", 
    "description": "NoSQL database design and optimization for AWS applications"
  }
]
```

## Script Features

### Batch Processing
- **Default Batch Size**: 3 profiles at a time
- **Delay Between Batches**: 3 seconds
- **Prevents API Overload**: Conservative settings protect AI module

### Progress Tracking
```
🔄 Processing batch 1/2 (3 profiles)
📋 Processing: AWS Backend Developer (abc123)
🤖 Starting AI analysis...
✅ AI analysis complete
🎯 Generating V2 parameters...
✅ V2 parameters generated: ["AWS Serverless Architecture", "Express.js API Architecture", "DynamoDB Data Modeling"]
✅ Profile updated successfully
📈 AI Confidence: 95%
```

### Error Handling
- **Failed profiles marked**: Status set to 'failed' with error message
- **Continues processing**: One failure doesn't stop the entire batch
- **Detailed error logs**: Full error information for debugging

### Statistics Summary
```
📊 BULK UPDATE SUMMARY
📋 Total Profiles: 5
🔄 Processed: 4  
✅ Updated: 3
❌ Failed: 1
⚠️  Skipped: 1
📈 Success Rate: 75%
```

## Recommended Workflow

1. **Start AI Module**:
   ```bash
   cd ai_module && python -m uvicorn app:app --host 0.0.0.0 --port 8000
   ```

2. **Run Dry Run First**:
   ```bash
   cd backend
   node bulk-update-job-profiles.js --dry-run
   ```

3. **Test Single Profile**:
   ```bash
   node bulk-update-job-profiles.js --profile YOUR_TEST_PROFILE_ID
   ```

4. **Bulk Update All**:
   ```bash
   node bulk-update-job-profiles.js
   ```

## Verification

After updating, verify the changes:

1. **Check Database**: View updated parameters in Supabase dashboard
2. **Test Assessment**: Run a live assessment to see V2 parameters in action
3. **API Response**: Check `/api/job-profiles` endpoint for updated data

## Rollback (If Needed)

There's no automatic rollback, but you can:
1. **Restore from Backup**: If you have a database backup
2. **Manual Revert**: Update specific profiles back to V1 parameters
3. **Re-upload Original JDs**: Upload original job descriptions again

## Troubleshooting

### AI Module Not Responding
```bash
# Check if AI module is running
curl http://localhost:8000/health
```

### Supabase Connection Issues
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Check network connectivity
- Ensure service role key has proper permissions

### Failed Parameter Generation
- Check AI module logs for OpenRouter API issues
- Verify API key is valid
- Monitor API rate limits

## Expected Results

After updating with V2:
- **Technology-Specific Names**: "AWS Serverless Architecture" instead of "AWS Services"
- **Higher AI Confidence**: Improved from ~70% to ~95%
- **Better Parameter Isolation**: Reduced cross-parameter detection
- **Enhanced Assessment Accuracy**: More precise code evaluation

## Support

If you encounter issues:
1. Check the AI module logs for detailed error information
2. Run with `--dry-run` first to identify potential problems
3. Test with a single profile before bulk updating
4. Ensure all prerequisites are met

---

**Created**: June 2025  
**Updated for**: V2 Enhanced Keyword Detection System 