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
  modulePathIgnorePatterns: ['<rootDir>/docker-environments/'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/docker-environments/'],
  clearMocks: true,
};
