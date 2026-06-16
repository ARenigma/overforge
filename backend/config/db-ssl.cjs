const fs = require('fs');

/**
 * Build Sequelize `dialectOptions.ssl` from the environment — secure by default.
 *
 *   (unset)                          -> verify the server certificate (rejectUnauthorized: true)
 *   DB_SSL=false                     -> disable SSL entirely (e.g. local plaintext Postgres)
 *   DB_SSL_CA=/path/to/ca.pem        -> verify against a provider CA bundle (preferred for RDS/Supabase)
 *   DB_SSL_REJECT_UNAUTHORIZED=false -> skip cert validation (DISCOURAGED — MITM risk; last resort)
 *
 * Returns `false` to disable SSL, or an ssl options object.
 */
function buildSslConfig() {
  if (String(process.env.DB_SSL || '').toLowerCase() === 'false') {
    return false;
  }
  const ssl = {
    require: true,
    rejectUnauthorized:
      String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false',
  };
  if (process.env.DB_SSL_CA) {
    ssl.ca = fs.readFileSync(process.env.DB_SSL_CA, 'utf8');
  }
  return ssl;
}

module.exports = { buildSslConfig };
