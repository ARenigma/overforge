const { Sequelize } = require('sequelize');
require('dotenv').config();

// Method 1: Using connection string directly
const sequelizeWithConnectionString = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false
});

// Method 2: Using individual components (current approach)
const sequelizeWithComponents = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false
  }
);

// Test connection function
async function testConnection(sequelize, method) {
  try {
    await sequelize.authenticate();
    console.log(`✅ Database connection successful using ${method}`);
    return true;
  } catch (error) {
    console.error(`❌ Database connection failed using ${method}:`, error.message);
    return false;
  }
}

// Export the preferred method
const sequelize = process.env.DATABASE_URL 
  ? sequelizeWithConnectionString 
  : sequelizeWithComponents;

module.exports = {
  sequelize,
  sequelizeWithConnectionString,
  sequelizeWithComponents,
  testConnection
}; 