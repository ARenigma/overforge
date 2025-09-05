const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const routes = require('./routes');
const { setupSockets } = require('./sockets');
const { sequelize } = require('../models');
const appConfig = require('../config/app-config');

dotenv.config();

// Get merged configuration based on environment
const config = appConfig.getMergedConfig();

// Streamlined startup logging - only show essential info
console.log('🚀 Overforge Backend Starting...');
console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`   Port: ${process.env.PORT || 5000}`);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', routes);

setupSockets(io);

const PORT = process.env.PORT || 5000;

// Database connection and server startup
async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connected');
    
    // Sync database (create tables if they don't exist)
    await sequelize.sync({ logging: false }); // Disable Sequelize SQL logging
    console.log('✅ Database synced');
    
    // Start server
    server.listen(PORT, () => {
      console.log(`✅ Backend running on port ${PORT}`);
    });
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('🔧 Check database configuration and ensure PostgreSQL is running');
    process.exit(1);
  }
}

startServer(); 