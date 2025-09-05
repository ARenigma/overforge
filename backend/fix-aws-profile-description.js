require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FULL_AWS_JD = `AWS Backend Developer - Senior Level

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

async function fixAWSProfileDescription() {
  try {
    console.log('🔧 Fixing AWS Backend job profile description...');
    console.log(`📄 Updating with full JD (${FULL_AWS_JD.length} characters)`);
    
    const { data, error } = await supabase
      .from('job_profiles')
      .update({
        description: FULL_AWS_JD,
        title: 'AWS Backend Developer - Senior Level'
      })
      .eq('id', '23d1e0fe-78d6-4e52-8d3c-847bbc21c299')
      .select();
    
    if (error) {
      console.error('❌ Error updating profile:', error);
      return;
    }
    
    console.log('✅ Successfully updated AWS profile description!');
    console.log('📋 Updated profile:');
    console.log(`   Title: ${data[0].title}`);
    console.log(`   Description length: ${data[0].description.length} chars`);
    
    console.log('\n🎯 Now you can run the bulk update script again to get correct V2 parameters!');
    console.log('   Command: node bulk-update-job-profiles.js --profile 23d1e0fe-78d6-4e52-8d3c-847bbc21c299');
    
  } catch (error) {
    console.error('❌ Script failed:', error);
  }
}

fixAWSProfileDescription(); 