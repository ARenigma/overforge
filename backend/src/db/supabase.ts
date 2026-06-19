// Singleton service-role Supabase client for the backend.
// WebSocket polyfill must be set before createClient() is called because
// @supabase/supabase-js uses globalThis.WebSocket internally for realtime,
// and Node 20 does not expose a WebSocket global.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Polyfill WebSocket for Node 20 before the client is constructed.
if (!globalThis.WebSocket) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  globalThis.WebSocket = require('ws') as typeof WebSocket;
}

let _client: SupabaseClient | null = null;

/** Returns the singleton service-role Supabase client. */
export function createServiceClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  }

  _client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}
