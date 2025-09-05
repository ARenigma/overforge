require('dotenv').config();

// Alternative configuration using full connection string
module.exports = {
  development: {
    // Option 1: Use individual components (current approach)
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    dialect: "postgres",
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  },
  
  // Option 2: Use full connection string
  development_with_url: {
    use_env_variable: 'DATABASE_URL',
    dialect: "postgres",
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  },
  
  test: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    dialect: "postgres",
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  },
  
  production: {
    // Use connection string in production
    use_env_variable: 'DATABASE_URL',
    dialect: "postgres",
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  }
};

// Helper function to parse connection string if needed
function parseConnectionString(connectionString) {
  const url = new URL(connectionString);
  return {
    username: url.username,
    password: url.password,
    database: url.pathname.slice(1), // Remove leading slash
    host: url.hostname,
    port: parseInt(url.port, 10),
    dialect: "postgres"
  };
} 