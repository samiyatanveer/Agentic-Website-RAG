/**
 * jest.config.js
 * Jest configuration for ESM (type: "module") Node.js project.
 * Uses --experimental-vm-modules for native ESM support.
 */

export default {
  // Use Node environment (not jsdom)
  testEnvironment: 'node',

  // Pick up test files from tests/
  testMatch: ['**/tests/**/*.test.js'],

  // Load env vars before any test module is imported
  setupFiles: ['./jest.setup.js'],

  // No transform needed — Jest runs Node ESM natively
  transform: {},

  // Clear mock state between tests
  clearMocks: true,

  // Show each test name individually
  verbose: true,

  // Timeout for each test (DB operations can be slow on first run)
  testTimeout: 15000,
};
