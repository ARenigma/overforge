require('dotenv').config();
const { buildSslConfig } = require('./db-ssl.cjs');

module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    dialect: "postgres"
  },
  test: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    dialect: "postgres"
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    dialect: "postgres",
    dialectOptions: {
      // Secure by default (verifies the server cert). Provide DB_SSL_CA for a
      // managed-DB CA bundle, or set DB_SSL_REJECT_UNAUTHORIZED=false to opt out.
      ssl: buildSslConfig()
    }
  }
};