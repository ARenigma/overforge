/**
 * Jest configuration for the Overforge backend.
 *
 * - `modulePathIgnorePatterns` keeps Jest's haste map out of docker-environments/,
 *   which contains template package.json files that collide by name.
 * - `@supabase/supabase-js` is auto-mocked via __mocks__/ so importing services
 *   that create a Supabase client at module load does not spin up the realtime
 *   websocket client (which has no WebSocket global under Node in CI).
 */
module.exports = {
  testEnvironment: 'node',
  // ts-jest transpiles the TypeScript interview core; plain .js tests still run natively.
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  modulePathIgnorePatterns: ['<rootDir>/docker-environments/'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/docker-environments/'],
  clearMocks: true,
  // Imported service modules open sockets/timers at load that aren't torn down,
  // so Jest lingers after tests pass. Force exit keeps the hook + CI prompt.
  // TODO(test-hardening): close these handles and drop forceExit.
  forceExit: true,
};
