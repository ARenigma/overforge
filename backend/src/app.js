const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

// Import Docker service for automatic container management
const dockerService = require('./services/dockerService');
const templateGeneratorService = require('./services/templateGeneratorService');

// Import routes
const authRoutes = require('./routes/auth-native-supabase');
const executeRoutes = require('./routes/execute');
const jdUploadRoutes = require('./routes/jd-upload');
const adminRoutes = require('./routes/admin');

// Import existing services
const aiService = require('./services/aiService');
const { getLanguages } = require('./services/judge0Service');

// Import socket handlers
const { initializeSocket } = require('./sockets');

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Socket.IO with Living AI Interviewer system
const io = initializeSocket(server);

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      services: {
        ai: typeof aiService.isHealthy === 'function' ? aiService.isHealthy() : 'available',
        livingInterviewer: 'active',
        database: 'supabase-connected',
        authentication: 'supabase-active',
        sessions: 'active',
        docker: dockerService.getHealthStatus(),
        containers: dockerService.getAvailableEnvironments()
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed'
    });
  }
});

// Test endpoint to manually send chat message
app.post('/test-chat/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { message } = req.body;
  
  const testMessage = {
    id: `test-${Date.now()}`,
    message: message || 'Test message from backend',
    timestamp: new Date().toISOString(),
    sender: { id: 'test', name: 'Test Bot', type: 'system' }
  };
  
  console.log(`🧪 Test: Sending message to main room: ${sessionId}`);
  console.log(`🧪 Test: Active rooms: ${Array.from(io.sockets.adapter.rooms.keys()).join(', ')}`);
  
  // Send to main room only
  io.to(sessionId).emit('chatMessage', testMessage);
  io.to(sessionId).emit('newMessage', testMessage);
  io.emit('debugMessage', { ...testMessage, debugInfo: 'Test message sent globally' });
  
  res.json({ success: true, message: 'Test message sent', testMessage });
});

// API Routes - Using Native Supabase Auth
app.use('/api/auth', authRoutes);
app.use('/api/sessions', require('./routes/sessions-supabase'));
app.use('/api/session-containers', require('./routes/session-containers'));
app.use('/api/job-profiles', require('./routes/job-profiles'));
app.use('/api/parameter-selection', require('./routes/parameter-selection'));
app.use('/api/living-assessment', require('./routes/living-assessment'));
app.use('/api/admin', adminRoutes);
app.use('/api/jd-upload', jdUploadRoutes);
app.use('/api/execute', executeRoutes);
app.use('/api', require('./routes/solutions'));

// Languages endpoint
app.get('/api/languages', async (req, res) => {
  try {
    const active = req.query.active === 'true';
    const langs = await getLanguages(active);
    res.json({ languages: langs });
  } catch (err) {
    console.error('Languages fetch error:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch languages' });
  }
});

// AI service endpoints
app.post('/api/validate-code', async (req, res) => {
  try {
    const { code, language, question } = req.body;
    
    if (!code || !language || !question) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: code, language, question'
      });
    }

    const result = await aiService.validateCode(code, language, question);
    res.json(result);
  } catch (error) {
    console.error('Code validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Code validation failed'
    });
  }
});

app.post('/api/analyze-code', async (req, res) => {
  try {
    const { code, language } = req.body;
    
    if (!code || !language) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: code, language'
      });
    }

    const result = await aiService.analyzeCode(code, language);
    res.json(result);
  } catch (error) {
    console.error('Code analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Code analysis failed'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

const PORT = process.env.PORT || 5000;

// Start server and Docker containers
async function startServer() {
  // Start the HTTP server
  server.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🎯 Living AI Interviewer system active`);
    console.log(`📡 WebSocket server ready for real-time communication`);
    
    // Initialize template system
    try {
      console.log('🎨 Initializing template generation system...');
      await templateGeneratorService.initializeTemplates();
      console.log('✅ Template system ready');
    } catch (error) {
      console.log('⚠️  Template initialization error (non-fatal):', error.message);
    }
    
    // Start Docker containers automatically
    try {
      await dockerService.startContainers();
    } catch (error) {
      console.log('⚠️  Docker startup error (non-fatal):', error.message);
    }
    
    console.log(`✅ OverForge backend initialization complete`);
  });

  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    await dockerService.stopContainers();
    server.close(() => {
      console.log('✅ Server shut down complete');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    await dockerService.stopContainers();
    server.close(() => {
      console.log('✅ Server shut down complete');
      process.exit(0);
    });
  });
}

// Start the server
startServer().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

module.exports = app; 