require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const JDProcessingService = require('./src/services/jd-processing-service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class BulkJobProfileUpdater {
  constructor() {
    this.jdProcessingService = JDProcessingService; // Already instantiated
    this.stats = {
      total: 0,
      processed: 0,
      updated: 0,
      failed: 0,
      skipped: 0
    };
  }

  async updateAllJobProfiles(options = {}) {
    const { 
      dryRun = false, 
      includeCompleted = true,
      batchSize = 5,
      delayBetweenBatches = 2000 
    } = options;

    console.log('🚀 Starting bulk job profile update...');
    console.log(`📊 Settings: ${dryRun ? 'DRY RUN' : 'LIVE'}, Batch Size: ${batchSize}`);
    
    try {
      // Get all job profiles
      const { data: profiles, error } = await supabase
        .from('job_profiles')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch job profiles: ${error.message}`);
      }

      this.stats.total = profiles.length;
      console.log(`📋 Found ${this.stats.total} job profiles to process`);

      if (this.stats.total === 0) {
        console.log('✅ No job profiles found');
        return this.stats;
      }

      // Filter profiles based on options
      let profilesToProcess = profiles;
      
      if (!includeCompleted) {
        profilesToProcess = profiles.filter(p => p.processing_status !== 'completed');
        console.log(`🔍 Filtering to ${profilesToProcess.length} incomplete profiles`);
      }

      // Process in batches
      const batches = this.createBatches(profilesToProcess, batchSize);
      console.log(`📦 Processing ${batches.length} batches`);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`\n🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} profiles)`);

        const batchPromises = batch.map(profile => 
          this.processJobProfile(profile, dryRun)
        );

        await Promise.allSettled(batchPromises);

        // Delay between batches to avoid overwhelming the AI API
        if (i < batches.length - 1) {
          console.log(`⏳ Waiting ${delayBetweenBatches}ms before next batch...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      this.printSummary(dryRun);
      return this.stats;

    } catch (error) {
      console.error('❌ Bulk update failed:', error);
      throw error;
    }
  }

  async processJobProfile(profile, dryRun = false) {
    try {
      console.log(`\n📋 Processing: ${profile.title} (${profile.id})`);
      console.log(`📅 Created: ${new Date(profile.created_at).toLocaleDateString()}`);
      console.log(`📊 Status: ${profile.processing_status}`);

      // Check if profile has sufficient content
      if (!profile.description || profile.description.length < 50) {
        console.log('⚠️  Skipping: Insufficient content');
        this.stats.skipped++;
        return;
      }

      // Check if already processing
      if (profile.processing_status === 'processing') {
        console.log('⚠️  Skipping: Already processing');
        this.stats.skipped++;
        return;
      }

      this.stats.processed++;

      if (dryRun) {
        console.log('🔍 DRY RUN: Would reprocess this profile');
        return;
      }

      // Update processing status
      await supabase
        .from('job_profiles')
        .update({
          processing_status: 'processing',
          processing_error: null,
          processing_started_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      console.log('🤖 Starting AI analysis...');

      // Reprocess AI analysis and parameters
      const aiAnalysisResult = await this.jdProcessingService.performAIAnalysis(profile.description);

      if (!aiAnalysisResult.success) {
        throw new Error(aiAnalysisResult.error);
      }

      console.log('✅ AI analysis complete');
      console.log('🎯 Generating V2 parameters...');

      const parameterResult = await this.jdProcessingService.generate3ParameterAssessment(aiAnalysisResult, profile.description);

      if (!parameterResult.success) {
        throw new Error(parameterResult.error);
      }

      console.log('✅ V2 parameters generated:', parameterResult.parameters.map(p => p.name));

      // Finalize the job profile
      const updatedProfile = await this.jdProcessingService.finalizeJobProfile(
        profile.id, 
        aiAnalysisResult, 
        parameterResult
      );

      console.log('✅ Profile updated successfully');
      console.log(`📈 AI Confidence: ${Math.round((updatedProfile.ai_confidence_score || 0) * 100)}%`);
      
      this.stats.updated++;

    } catch (error) {
      console.error(`❌ Failed to process ${profile.title}:`, error.message);
      
      // Update status to failed
      if (!dryRun) {
        await this.jdProcessingService.updateJobProfileStatus(profile.id, 'failed', error.message);
      }
      
      this.stats.failed++;
    }
  }

  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  printSummary(dryRun) {
    console.log('\n' + '='.repeat(50));
    console.log(`📊 BULK UPDATE SUMMARY ${dryRun ? '(DRY RUN)' : ''}`);
    console.log('='.repeat(50));
    console.log(`📋 Total Profiles: ${this.stats.total}`);
    console.log(`🔄 Processed: ${this.stats.processed}`);
    console.log(`✅ Updated: ${this.stats.updated}`);
    console.log(`❌ Failed: ${this.stats.failed}`);
    console.log(`⚠️  Skipped: ${this.stats.skipped}`);
    console.log(`📈 Success Rate: ${this.stats.processed > 0 ? Math.round((this.stats.updated / this.stats.processed) * 100) : 0}%`);
    console.log('='.repeat(50));
  }

  async updateSpecificProfile(profileId) {
    console.log(`🎯 Updating specific profile: ${profileId}`);
    
    const { data: profile, error } = await supabase
      .from('job_profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (error || !profile) {
      throw new Error('Profile not found');
    }

    await this.processJobProfile(profile, false);
    this.printSummary(false);
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const updater = new BulkJobProfileUpdater();

  try {
    if (args[0] === '--profile' && args[1]) {
      // Update specific profile
      await updater.updateSpecificProfile(args[1]);
    } else if (args[0] === '--dry-run') {
      // Dry run
      await updater.updateAllJobProfiles({ dryRun: true });
    } else if (args[0] === '--help') {
      console.log(`
🔧 Bulk Job Profile Updater

Usage:
  node bulk-update-job-profiles.js [options]

Options:
  --dry-run              Show what would be updated without making changes
  --profile <id>         Update specific profile by ID
  --help                 Show this help message

Examples:
  node bulk-update-job-profiles.js --dry-run
  node bulk-update-job-profiles.js --profile abc123-def456
  node bulk-update-job-profiles.js
      `);
    } else {
      // Full update
      console.log('⚠️  WARNING: This will update ALL job profiles with V2 parameters');
      console.log('⚠️  This operation cannot be undone easily');
      console.log('💡 Use --dry-run first to see what would be changed');
      
      if (process.env.NODE_ENV === 'production') {
        console.log('\n🛑 Production environment detected!');
        console.log('Please confirm by setting CONFIRM_BULK_UPDATE=true');
        
        if (process.env.CONFIRM_BULK_UPDATE !== 'true') {
          console.log('❌ Bulk update cancelled for safety');
          process.exit(1);
        }
      }

      console.log('\n🚀 Starting bulk update in 5 seconds...');
      console.log('Press Ctrl+C to cancel');
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      await updater.updateAllJobProfiles({
        batchSize: 3, // Conservative batch size
        delayBetweenBatches: 3000 // 3 second delay between batches
      });
    }

  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Export for use as module
module.exports = BulkJobProfileUpdater;

// Run as script if called directly
if (require.main === module) {
  main();
} 