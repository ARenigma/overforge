const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// Configuration
const BACKEND_URL = 'http://localhost:5000';
const AWS_JD_PATH = path.join(__dirname, '..', 'AWS_JD.txt');

class AWSJDUploader {
  constructor() {
    this.authToken = null;
  }

  async authenticate() {
    try {
      console.log('🔐 Authenticating with backend...');
      
      // Create a test user or use existing admin credentials
      const loginResponse = await axios.post(`${BACKEND_URL}/api/auth/login`, {
        usernameOrEmail: 'admin@overforge.com',
        password: 'admin123'
      });

      if (loginResponse.data.success) {
        this.authToken = loginResponse.data.data.token;
        console.log('✅ Authentication successful');
        return true;
      } else {
        console.log('❌ Authentication failed, trying to create admin user...');
        
        // Try to create admin user
        const registerResponse = await axios.post(`${BACKEND_URL}/api/auth/register`, {
          firstName: 'Admin',
          lastName: 'User',
          email: 'admin@overforge.com',
          username: 'admin',
          password: 'admin123',
          role: 'interviewer'
        });

        if (registerResponse.data.success) {
          this.authToken = registerResponse.data.data.token;
          console.log('✅ Admin user created and authenticated');
          return true;
        }
      }
    } catch (error) {
      console.error('❌ Authentication error:', error.response?.data || error.message);
      return false;
    }
  }

  async checkAWSJDFile() {
    if (!fs.existsSync(AWS_JD_PATH)) {
      console.error(`❌ AWS_JD.txt file not found at: ${AWS_JD_PATH}`);
      return false;
    }

    const stats = fs.statSync(AWS_JD_PATH);
    console.log(`📄 Found AWS_JD.txt (${stats.size} bytes)`);
    return true;
  }

  async uploadAWSJD() {
    try {
      console.log('📤 Uploading AWS_JD.txt to backend...');

      const formData = new FormData();
      formData.append('jdFile', fs.createReadStream(AWS_JD_PATH));

      const response = await axios.post(`${BACKEND_URL}/api/jd-upload`, formData, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          ...formData.getHeaders()
        },
        timeout: 60000 // 60 second timeout
      });

      if (response.data.success) {
        console.log('✅ AWS JD uploaded successfully!');
        console.log('📋 Job Profile ID:', response.data.data.jobProfileId);
        
        // Poll for processing completion
        await this.pollProcessingStatus(response.data.data.jobProfileId);
        
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Upload failed');
      }

    } catch (error) {
      console.error('❌ Upload failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async pollProcessingStatus(jobProfileId) {
    console.log('⏳ Polling processing status...');
    
    const maxAttempts = 30; // 30 attempts = 1 minute
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await axios.get(`${BACKEND_URL}/api/jd-upload/status/${jobProfileId}`, {
          headers: { 'Authorization': `Bearer ${this.authToken}` }
        });

        if (response.data.success) {
          const status = response.data.data;
          
          if (status.isComplete) {
            console.log('✅ Processing completed successfully!');
            await this.displayJobProfile(jobProfileId);
            return;
          } else if (status.isFailed) {
            console.error('❌ Processing failed:', status.jobProfile.processing_error);
            return;
          } else {
            // Still processing
            const progress = Math.min(((attempts + 1) / maxAttempts) * 100, 90);
            console.log(`⏳ Processing... ${progress.toFixed(0)}%`);
          }
        }

        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

      } catch (error) {
        console.error('❌ Error checking status:', error.message);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('⚠️  Processing timeout - checking final status...');
    await this.displayJobProfile(jobProfileId);
  }

  async displayJobProfile(jobProfileId) {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/jd-upload/profile/${jobProfileId}`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      if (response.data.success) {
        const profile = response.data.data;
        
        console.log('\n📊 JOB PROFILE DETAILS:');
        console.log('========================');
        console.log(`🏷️  Title: ${profile.title}`);
        console.log(`🏢 Company: ${profile.company || 'N/A'}`);
        console.log(`📍 Location: ${profile.location || 'N/A'}`);
        console.log(`📈 Experience Level: ${profile.experience_level}`);
        console.log(`📊 Processing Status: ${profile.processing_status}`);
        
        if (profile.ai_confidence_score) {
          console.log(`🎯 AI Confidence: ${(profile.ai_confidence_score * 100).toFixed(1)}%`);
        }

        if (profile.parameters && profile.parameters.length > 0) {
          console.log('\n🎯 ASSESSMENT PARAMETERS:');
          profile.parameters.forEach((param, index) => {
            console.log(`${index + 1}. ${param.name}`);
            console.log(`   Description: ${param.description}`);
          });
        }

        if (profile.master_problem) {
          console.log('\n🎯 MASTER PROBLEM:');
          console.log(`Title: ${profile.master_problem.title}`);
          console.log(`Description: ${profile.master_problem.description?.substring(0, 200)}...`);
        }

        return profile;
      }
    } catch (error) {
      console.error('❌ Failed to retrieve job profile:', error.response?.data || error.message);
    }
  }

  async run() {
    console.log('🚀 AWS JD Upload Process Starting...\n');

    try {
      // Step 1: Check if AWS_JD.txt exists
      if (!await this.checkAWSJDFile()) {
        return;
      }

      // Step 2: Authenticate
      if (!await this.authenticate()) {
        return;
      }

      // Step 3: Upload AWS JD
      const result = await this.uploadAWSJD();

      console.log('\n🎉 AWS JD Upload Process Complete!');
      console.log('✅ Job profile created and ready for interviews');
      
    } catch (error) {
      console.error('\n❌ Upload process failed:', error.message);
      process.exit(1);
    }
  }
}

// Run the uploader
const uploader = new AWSJDUploader();
uploader.run();

module.exports = AWSJDUploader;
