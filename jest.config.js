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

// In CI environment, skip tests that require external services or have timing issues
if (process.env.CI === 'true') {
  config.testPathIgnorePatterns = [
    '/node_modules/',
    // Skip Google Calendar integration tests (require OAuth authentication)
    'tests/integration/google-calendar-integration.test.ts',
    'tests/e2e/google-calendar-setup.test.ts',
    'tests/e2e/multi-source-calendar.test.ts',
    'tests/e2e/calendar-fallback.test.ts',
    // Skip CLI modes E2E test (timeout issues in CI environment)
    'tests/e2e/cli-modes.test.ts',
    // Skip remote auth E2E test (network issues in CI environment)
    'tests/e2e/remote-auth.test.ts',
    // OAuth persistent store tests now have extended timeouts (30s)
  ];
}

export default config;
