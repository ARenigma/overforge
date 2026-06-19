/**
 * Jest configuration for the Overforge backend.
 *
 * - ts-jest transpiles the TypeScript sources/tests.
 * - `@supabase/supabase-js` is auto-mocked via __mocks__/ so importing the data
 *   layer doesn't spin up the realtime websocket client under Node in CI.
 */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  clearMocks: true,
  // Imported service modules open sockets/timers at load that aren't torn down,
  // so Jest lingers after tests pass. Force exit keeps the hook + CI prompt.
  // TODO(test-hardening): close these handles and drop forceExit.
  forceExit: true,
};
