/**
 * Safe default env for unit tests.
 *
 * src/db/supabase.ts requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY at import time
 * and throws if they are missing. This setup file runs before any test module is imported,
 * so tests can import data-layer modules without a real Supabase environment.
 * Real CI jobs may override these values via their own environment.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
