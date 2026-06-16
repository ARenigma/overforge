/**
 * Safe default env for unit tests.
 *
 * Several modules (e.g. src/config/supabase.js) require SUPABASE_* and JWT_SECRET
 * at import time and throw if they're missing. This setup runs before any test
 * module is imported, so tests can require services without a real environment.
 * Real CI jobs may override these with their own values.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ci-test-secret';
process.env.AI_MODULE_URL = process.env.AI_MODULE_URL || 'http://localhost:9001';
