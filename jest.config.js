/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          target: 'ES2022',
          esModuleInterop: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(run-applescript|execa|strip-final-newline|npm-run-path|path-key|onetime|mimic-fn|human-signals|is-stream|get-stream|signal-exit|merge-stream)/)',
  ],
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    // Process lifecycle - hard to test without mocking process signals
    '!src/cli/signal-handler.ts',
    // SSE streaming - requires complex HTTP stream mocking
    '!src/cli/sse-stream-handler.ts',
    // DI container - infrastructure code
    '!src/services/container.ts',
    // Remote adapter - requires network mocking
    '!src/services/remote-mcp-adapter.ts',
    '!src/platform/adapters/remote-mcp-adapter.ts',
    // Hot reload infrastructure - requires file system watching
    '!src/tools/config/reload-handler.ts',
    '!src/config/config-watcher.ts',
    '!src/config/config-reload-service.ts',
    '!src/config/hot-reload-config.ts',
    '!src/config/update-validation.ts',
    // Reloadable service adapters - infrastructure wrapper code
    '!src/services/reloadable/**/*.ts',
    // OAuth session management - complex state management
    '!src/oauth/session-store.ts',
    '!src/oauth/client-store.ts',
    // Calendar tool handlers - large HTTP handler file, requires integration testing
    '!src/tools/calendar/handlers.ts',
    // CLI OAuth handler - HTTP server handling, requires integration testing
    '!src/cli/oauth-handler.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
  verbose: true,
};

// Note: Previously skipped tests in CI environment are now included.
// Tests use mocks and should work in CI. If specific tests fail,
// consider using jest.skip or checking process.env.CI within the test.

export default config;
