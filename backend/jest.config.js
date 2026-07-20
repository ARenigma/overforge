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
  // Imported service modules (notably the Supabase realtime WebSocket client) open handles
  // that are not torn down after tests complete, causing Jest to linger indefinitely.
  // forceExit is the current working mitigation; the proper fix is a global afterAll() hook
  // that explicitly closes each open handle (WS connection, setInterval timers, etc.).
  forceExit: true,
};
