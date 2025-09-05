const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// General middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: 'Express.js Interview Environment'
  });
});

// Sample routes for interview problems
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Express.js Interview Environment',
    endpoints: [
      'GET /health - Health check',
      'GET /api/users - Get all users',
      'POST /api/users - Create user',
      'GET /api/tasks - Get all tasks',
      'POST /api/tasks - Create task'
    ]
  });
});

// Sample API routes
app.get('/api/users', (req, res) => {
  const users = [
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
  ];
  res.json({ users, total: users.length });
});

app.post('/api/users', (req, res) => {
  const { name, email } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  
  const newUser = {
    id: Date.now(),
    name,
    email,
    createdAt: new Date().toISOString()
  };
  
  res.status(201).json({ user: newUser, message: 'User created successfully' });
});

app.get('/api/tasks', (req, res) => {
  const tasks = [
    { id: 1, title: 'Complete project', completed: false },
    { id: 2, title: 'Review code', completed: true },
    { id: 3, title: 'Deploy application', completed: false }
  ];
  res.json({ tasks, total: tasks.length });
});

app.post('/api/tasks', (req, res) => {
  const { title, completed = false } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  
  const newTask = {
    id: Date.now(),
    title,
    completed,
    createdAt: new Date().toISOString()
  };
  
  res.status(201).json({ task: newTask, message: 'Task created successfully' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Express.js Interview Environment running on port ${PORT}`);
  console.log(`🌐 Available at: http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
}); 