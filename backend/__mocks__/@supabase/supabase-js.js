/**
 * Manual mock for @supabase/supabase-js used by Jest.
 *
 * The real createClient() eagerly constructs a RealtimeClient, which throws under
 * Node in CI ("getWebSocketConstructor: no WebSocket"). Many backend services call
 * createClient() at module load, so every test that requires them would crash on
 * import. This mock returns a chainable, awaitable query-builder stub so tests can
 * import those services and exercise logic without a live Supabase connection.
 *
 * Auto-applied: manual mocks placed in <rootDir>/__mocks__ for node_modules are used
 * automatically by Jest without an explicit jest.mock() call.
 */

// A Proxy that returns itself for any chained method (.from().select().eq()...)
// and resolves to { data: null, error: null } when awaited.
function makeQueryBuilder(result = { data: null, error: null }) {
  const builder = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve) => resolve(result);
        }
        // Any builder method returns the same builder for chaining.
        return () => builder;
      },
    }
  );
  return builder;
}

const createClient = jest.fn(() => ({
  from: jest.fn(() => makeQueryBuilder()),
  rpc: jest.fn(() => makeQueryBuilder()),
  auth: {
    getUser: jest.fn(async () => ({ data: { user: null }, error: null })),
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    signInWithPassword: jest.fn(async () => ({ data: {}, error: null })),
    signOut: jest.fn(async () => ({ error: null })),
    admin: {
      listUsers: jest.fn(async () => ({ data: { users: [] }, error: null })),
      createUser: jest.fn(async () => ({ data: { user: null }, error: null })),
    },
  },
  channel: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  })),
  removeChannel: jest.fn(),
  storage: { from: jest.fn(() => makeQueryBuilder()) },
}));

module.exports = { createClient };
