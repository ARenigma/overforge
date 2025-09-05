const http = require('http');

const API_BASE = 'http://localhost:5000';

// Test configurations for each framework
const tests = {
  'express': {
    code: `const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.json({ message: 'Hello from Express!', timestamp: new Date() });
});

console.log('Express app configured successfully');
console.log('Available endpoints: GET /');`,
    expected: 'Express app configured successfully'
  },
  
  'nodejs': {
    code: `console.log('Testing Node.js execution');
console.log('Current time:', new Date().toISOString());

const testArray = [1, 2, 3, 4, 5];
const sum = testArray.reduce((a, b) => a + b, 0);
console.log('Array sum:', sum);

const testObject = { name: 'Test', value: 42 };
console.log('Test object:', JSON.stringify(testObject));`,
    expected: 'Testing Node.js execution'
  },
  
  'django': {
    code: `from django.db import models

class TestModel(models.Model):
    name = models.CharField(max_length=100)
    value = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.name}: {self.value}"

# Test the model
print("Django model defined successfully")
print("Model fields:")
for field in TestModel._meta.fields:
    print(f"  {field.name}: {field.__class__.__name__}")`,
    expected: 'Django model defined successfully'
  },
  
  'springboot': {
    code: `System.out.println("Testing Spring Boot execution");
System.out.println("Java version: " + System.getProperty("java.version"));

// Test basic Java functionality
java.util.List<String> items = new java.util.ArrayList<>();
items.add("Item 1");
items.add("Item 2");
items.add("Item 3");

System.out.println("List created with " + items.size() + " items");
for (String item : items) {
    System.out.println("  " + item);
}

// Test object creation
class TestClass {
    private String name;
    public TestClass(String name) { this.name = name; }
    public String toString() { return "TestClass: " + name; }
}

TestClass test = new TestClass("Spring Boot Test");
System.out.println("Object created: " + test);`,
    expected: 'Testing Spring Boot execution'
  }
};

function makeRequest(path, method, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

async function testFramework(framework, testConfig) {
  console.log(`\n🧪 Testing ${framework.toUpperCase()} framework...`);
  console.log('Code to execute:');
  console.log('---');
  console.log(testConfig.code);
  console.log('---');
  
  try {
    const response = await makeRequest('/api/execute/test', 'POST', {
      code: testConfig.code,
      language: framework
    });
    
    if (response.status !== 200) {
      console.log(`❌ ${framework.toUpperCase()} FAILED with status ${response.status}:`);
      console.log(response.data);
      return false;
    }
    
    const { output, error } = response.data;
    
    if (error && error.trim()) {
      console.log(`❌ ${framework.toUpperCase()} FAILED with error:`);
      console.log(error);
      return false;
    }
    
    if (output && output.includes(testConfig.expected)) {
      console.log(`✅ ${framework.toUpperCase()} SUCCESS`);
      console.log('Output:');
      console.log(output);
      return true;
    } else {
      console.log(`⚠️  ${framework.toUpperCase()} UNEXPECTED OUTPUT:`);
      console.log('Expected to contain:', testConfig.expected);
      console.log('Actual output:');
      console.log(output || 'No output');
      return false;
    }
    
  } catch (error) {
    console.log(`❌ ${framework.toUpperCase()} FAILED with exception:`);
    console.log(error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting comprehensive framework testing...');
  console.log(`API Base: ${API_BASE}`);
  
  // Wait a moment for the server to be ready
  console.log('Waiting for server to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const results = {};
  
  for (const [framework, testConfig] of Object.entries(tests)) {
    results[framework] = await testFramework(framework, testConfig);
    
    // Wait a bit between tests to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Summary
  console.log('\n📊 TEST SUMMARY:');
  console.log('================');
  
  const successful = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  for (const [framework, success] of Object.entries(results)) {
    console.log(`${success ? '✅' : '❌'} ${framework.toUpperCase()}: ${success ? 'PASSED' : 'FAILED'}`);
  }
  
  console.log(`\nOverall: ${successful}/${total} frameworks working`);
  
  if (successful === total) {
    console.log('🎉 ALL FRAMEWORKS ARE WORKING! Complete solution implemented.');
  } else {
    console.log('⚠️  Some frameworks need attention.');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted by user');
  process.exit(0);
});

// Run the tests
runAllTests().catch(error => {
  console.error('Fatal error during testing:', error);
  process.exit(1);
}); 