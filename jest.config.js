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
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
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
  ];
}

export default config;
