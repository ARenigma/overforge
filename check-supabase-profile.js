require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkJobProfile() {
  try {
    console.log('🔍 Checking AWS Backend job profile in Supabase...');
    
    const { data: profile, error } = await supabase
      .from('job_profiles')
      .select('*')
      .eq('id', '23d1e0fe-78d6-4e52-8d3c-847bbc21c299')
      .single();
    
    if (error) {
      console.error('❌ Error fetching profile:', error);
      return;
    }
    
    console.log('\n📋 Profile Details:');
    console.log('===================');
    console.log(`Title: ${profile.title}`);
    console.log(`Status: ${profile.processing_status}`);
    console.log(`Created: ${new Date(profile.created_at).toLocaleDateString()}`);
    console.log(`Description Length: ${profile.description ? profile.description.length : 0} chars`);
    
    console.log('\n📄 Full Description:');
    console.log('====================');
    console.log(profile.description || 'No description found');
    
    console.log('\n🎯 Current Parameters:');
    console.log('======================');
    if (profile.parameters && profile.parameters.length > 0) {
      profile.parameters.forEach((param, index) => {
        console.log(`${index + 1}. ${param.name}`);
        console.log(`   Description: ${param.description}`);
      });
    } else {
      console.log('No parameters found');
    }
    
    // Compare with expected AWS JD
    const expectedJD = `AWS Backend Developer - Senior Level

We are seeking a Senior AWS Backend Developer to build scalable cloud-native applications.

Key Responsibilities:
- Design and implement AWS Lambda functions for serverless microservices
- Develop APIs using AWS API Gateway and integrate with DynamoDB
- Build event-driven architectures using SQS, SNS, and EventBridge
- Implement infrastructure as code using AWS CloudFormation
- Design and optimize DynamoDB table structures and GSI patterns
- Configure AWS Cognito for authentication and authorization
- Implement caching strategies using AWS ElastiCache
- Monitor applications using CloudWatch and X-Ray distributed tracing
- Deploy applications using AWS CodePipeline and CodeDeploy

Technical Requirements:
- 4+ years experience with AWS services (Lambda, DynamoDB, API Gateway)
- Strong knowledge of serverless architecture patterns
- Experience with AWS SDK (Python/Node.js) and boto3
- Proficiency in DynamoDB data modeling and query optimization
- Understanding of AWS IAM roles and security best practices
- Experience with Infrastructure as Code (CloudFormation, CDK)
- Knowledge of event-driven architectures and messaging patterns
- Familiarity with AWS monitoring and logging services

This is a senior backend role focused entirely on AWS cloud services.`;

    console.log('\n🔍 Comparison:');
    console.log('==============');
    console.log(`Expected JD Length: ${expectedJD.length} chars`);
    console.log(`Actual Description: ${profile.description ? profile.description.length : 0} chars`);
    console.log(`Match: ${profile.description === expectedJD ? '✅ EXACT' : '❌ DIFFERENT'}`);
    
    if (profile.description !== expectedJD) {
      console.log('\n⚠️  The description in Supabase does not match the expected AWS JD!');
      console.log('This explains why V2 parameters are wrong.');
      
      // Show first 200 chars of each for comparison
      console.log('\n📄 First 200 chars of stored description:');
      console.log('"' + (profile.description || '').substring(0, 200) + '"...');
      
      console.log('\n📄 First 200 chars of expected JD:');
      console.log('"' + expectedJD.substring(0, 200) + '"...');
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error);
  }
}

checkJobProfile(); 