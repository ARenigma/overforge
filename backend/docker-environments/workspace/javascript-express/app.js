const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Enhanced middleware setup
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: { action: 'sameorigin' }
}));
app.use(compression());
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined'));

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'public')));

// Dynamic model detection and in-memory storage
let detectedModel = null;
let modelData = [];
let modelSchema = {};

// Function to dynamically load and analyze user's model file
function loadUserModel() {
  try {
    // Look for user's model file
    const modelPath = path.join(__dirname, 'models.js');
    
    if (fs.existsSync(modelPath)) {
      delete require.cache[require.resolve('./models.js')];
      const userModels = require('./models.js');
      
      // Detect the main model from exports
      const modelNames = Object.keys(userModels);
      if (modelNames.length > 0) {
        const modelName = modelNames[0];
        detectedModel = {
          name: modelName,
          constructor: userModels[modelName],
          schema: extractModelSchema(userModels[modelName])
        };
        
        console.log(`📦 Detected model: ${modelName}`);
        console.log(`📊 Schema fields: ${Object.keys(detectedModel.schema).join(', ')}`);
        
        // Generate sample data if none exists
        if (modelData.length === 0) {
          generateSampleData();
        }
        
        return true;
      }
    }
  } catch (error) {
    console.warn('⚠️ Could not load user model:', error.message);
  }
  
  return false;
}

// Extract schema from model constructor or class
function extractModelSchema(ModelClass) {
  const schema = {};
  
  try {
    // Try to create instance to analyze properties
    const instance = new ModelClass({});
    
    // Get all enumerable properties
    for (const key in instance) {
      schema[key] = typeof instance[key];
    }
    
    // Also check prototype properties
    const prototype = ModelClass.prototype;
    const descriptors = Object.getOwnPropertyDescriptors(prototype);
    
    for (const key in descriptors) {
      if (key !== 'constructor' && typeof descriptors[key].value === 'function') {
        schema[key] = 'method';
      }
    }
    
  } catch (error) {
    // Fallback: analyze constructor function
    const constructorStr = ModelClass.toString();
    const propertyMatches = constructorStr.match(/this\.(\w+)/g) || [];
    
    propertyMatches.forEach(match => {
      const prop = match.replace('this.', '');
      schema[prop] = 'unknown';
    });
  }
  
  return schema;
}

// Generate sample data based on detected model
function generateSampleData() {
  if (!detectedModel) return;
  
  const sampleCount = 5;
  modelData = [];
  
  for (let i = 1; i <= sampleCount; i++) {
    const sampleItem = generateSampleItem(i);
    modelData.push(sampleItem);
  }
  
  console.log(`🎯 Generated ${sampleCount} sample ${detectedModel.name} records`);
}

// Smart sample data generation based on field names
function generateSampleItem(index) {
  const item = { id: index };
  
  Object.keys(detectedModel.schema).forEach(field => {
    if (field === 'id') return;
    
    // Smart field detection based on name patterns
    if (field.includes('name') || field.includes('title')) {
      item[field] = `Sample ${detectedModel.name} ${index}`;
    } else if (field.includes('email')) {
      item[field] = `user${index}@example.com`;
    } else if (field.includes('price') || field.includes('cost')) {
      item[field] = (Math.random() * 1000 + 10).toFixed(2);
    } else if (field.includes('description') || field.includes('content') || field.includes('body')) {
      item[field] = `This is a sample description for ${detectedModel.name} #${index}. It contains relevant information and details.`;
    } else if (field.includes('date') || field.includes('created') || field.includes('updated')) {
      item[field] = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (field.includes('status') || field.includes('state')) {
      const statuses = ['active', 'pending', 'completed', 'draft'];
      item[field] = statuses[Math.floor(Math.random() * statuses.length)];
    } else if (field.includes('count') || field.includes('quantity') || field.includes('number')) {
      item[field] = Math.floor(Math.random() * 100) + 1;
    } else if (field.includes('url') || field.includes('link')) {
      item[field] = `https://example.com/${detectedModel.name.toLowerCase()}/${index}`;
    } else if (field.includes('phone')) {
      item[field] = `+1-555-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    } else if (field.includes('bool') || field.includes('is_') || field.includes('has_')) {
      item[field] = Math.random() > 0.5;
    } else {
      // Generic fallback
      item[field] = `Sample ${field} ${index}`;
    }
  });
  
  return item;
}

// Load model on startup
loadUserModel();

// API Routes

// Root endpoint with model information
app.get('/', (req, res) => {
  res.json({
    message: '🚀 OverForge Express.js API Template',
    status: 'active',
    model: detectedModel ? detectedModel.name : 'No model detected',
    endpoints: detectedModel ? [
      `GET /${detectedModel.name.toLowerCase()}s - List all records`,
      `GET /${detectedModel.name.toLowerCase()}s/:id - Get specific record`,
      `POST /${detectedModel.name.toLowerCase()}s - Create new record`,
      `PUT /${detectedModel.name.toLowerCase()}s/:id - Update record`,
      `DELETE /${detectedModel.name.toLowerCase()}s/:id - Delete record`
    ] : ['No model detected - please define a model in models.js'],
    schema: detectedModel ? detectedModel.schema : {},
    totalRecords: modelData.length,
    timestamp: new Date().toISOString()
  });
});

// Dynamic CRUD endpoints
if (detectedModel) {
  const modelRoute = `/${detectedModel.name.toLowerCase()}s`;
  
  // GET all records
  app.get(modelRoute, (req, res) => {
    const { page = 1, limit = 10, search } = req.query;
    let filteredData = [...modelData];
    
    // Simple search functionality
    if (search) {
      filteredData = modelData.filter(item => 
        JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedData = filteredData.slice(startIndex, endIndex);
    
    res.json({
      data: paginatedData,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(filteredData.length / limit),
        totalRecords: filteredData.length,
        recordsPerPage: parseInt(limit)
      },
      model: detectedModel.name,
      schema: detectedModel.schema
    });
  });
  
  // GET single record
  app.get(`${modelRoute}/:id`, (req, res) => {
    const id = parseInt(req.params.id);
    const item = modelData.find(record => record.id === id);
    
    if (!item) {
      return res.status(404).json({ 
        error: `${detectedModel.name} with ID ${id} not found`,
        availableIds: modelData.map(r => r.id)
      });
    }
    
    res.json({
      data: item,
      model: detectedModel.name,
      schema: detectedModel.schema
    });
  });
  
  // POST new record
  app.post(modelRoute, (req, res) => {
    const newId = Math.max(...modelData.map(r => r.id), 0) + 1;
    const newRecord = { id: newId, ...req.body };
    
    modelData.push(newRecord);
    
    res.status(201).json({
      message: `${detectedModel.name} created successfully`,
      data: newRecord,
      totalRecords: modelData.length
    });
  });
  
  // PUT update record
  app.put(`${modelRoute}/:id`, (req, res) => {
    const id = parseInt(req.params.id);
    const index = modelData.findIndex(record => record.id === id);
    
    if (index === -1) {
      return res.status(404).json({ 
        error: `${detectedModel.name} with ID ${id} not found` 
      });
    }
    
    modelData[index] = { ...modelData[index], ...req.body, id };
    
    res.json({
      message: `${detectedModel.name} updated successfully`,
      data: modelData[index]
    });
  });
  
  // DELETE record
  app.delete(`${modelRoute}/:id`, (req, res) => {
    const id = parseInt(req.params.id);
    const index = modelData.findIndex(record => record.id === id);
    
    if (index === -1) {
      return res.status(404).json({ 
        error: `${detectedModel.name} with ID ${id} not found` 
      });
    }
    
    const deletedRecord = modelData.splice(index, 1)[0];
    
    res.json({
      message: `${detectedModel.name} deleted successfully`,
      deletedRecord,
      remainingRecords: modelData.length
    });
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    model: detectedModel ? detectedModel.name : 'No model',
    records: modelData.length,
    timestamp: new Date().toISOString()
  });
});

// Reload model endpoint for development
app.post('/reload-model', (req, res) => {
  const success = loadUserModel();
  res.json({
    message: success ? 'Model reloaded successfully' : 'Failed to reload model',
    model: detectedModel ? detectedModel.name : 'No model detected',
    records: modelData.length
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: detectedModel ? [
      '/',
      `/${detectedModel.name.toLowerCase()}s`,
      '/health',
      '/reload-model'
    ] : ['/', '/health', '/reload-model'],
    tip: 'Create a model in models.js to enable dynamic endpoints'
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('❌ API Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Express.js API server running on port ${PORT}`);
  console.log(`📊 Model detected: ${detectedModel ? detectedModel.name : 'None'}`);
  console.log(`📈 Sample data: ${modelData.length} records`);
  console.log(`🌐 API Base URL: http://localhost:${PORT}`);
  
  if (detectedModel) {
    console.log(`🔗 Model endpoint: http://localhost:${PORT}/${detectedModel.name.toLowerCase()}s`);
  }
});

module.exports = app; 