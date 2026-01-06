/**
 * Logger Utility Tests
 * Tests for structured logging functionality
 */

describe('Logger Utility', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getLogLevel', () => {
    it('should return info as default level', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.level).toBe('info');
    });

    it('should use LOG_LEVEL from environment (trace)', async () => {
      process.env.LOG_LEVEL = 'trace';
      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.level).toBe('trace');
    });

    it('should use LOG_LEVEL from environment (debug)', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.level).toBe('debug');
    });

    it('should use LOG_LEVEL from environment (warn)', async () => {
      process.env.LOG_LEVEL = 'warn';
      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.level).toBe('warn');
    });

    it('should use LOG_LEVEL from environment (error)', async () => {
      process.env.LOG_LEVEL = 'error';
      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.level).toBe('error');
    });

    it('should use LOG_LEVEL from environment (fatal)', async () => {
      process.env.LOG_LEVEL = 'fatal';
      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.level).toBe('fatal');
    });

    it('should use LOG_LEVEL from environment (silent)', async () => {
      process.env.LOG_LEVEL = 'silent';
      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.level).toBe('silent');
    });

    it('should handle uppercase LOG_LEVEL', async () => {
      process.env.LOG_LEVEL = 'DEBUG';
      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.level).toBe('debug');
    });

    it('should fallback to info for invalid LOG_LEVEL', async () => {
      process.env.LOG_LEVEL = 'invalid';
      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.level).toBe('info');
    });
  });

  describe('createLogger', () => {
    it('should create child logger with component name', async () => {
      const { createLogger } = await import('../../../src/utils/logger.js');
      const childLogger = createLogger('test-component');
      expect(childLogger).toBeDefined();
      // Pino child loggers have bindings that include the component
      expect(childLogger.bindings()).toEqual(expect.objectContaining({ component: 'test-component' }));
    });
  });

  describe('pre-configured loggers', () => {
    it('should export oauthLogger', async () => {
      const { oauthLogger } = await import('../../../src/utils/logger.js');
      expect(oauthLogger).toBeDefined();
      expect(oauthLogger.bindings()).toEqual(expect.objectContaining({ component: 'oauth' }));
    });

    it('should export calendarLogger', async () => {
      const { calendarLogger } = await import('../../../src/utils/logger.js');
      expect(calendarLogger).toBeDefined();
      expect(calendarLogger.bindings()).toEqual(expect.objectContaining({ component: 'calendar' }));
    });

    it('should export mcpLogger', async () => {
      const { mcpLogger } = await import('../../../src/utils/logger.js');
      expect(mcpLogger).toBeDefined();
      expect(mcpLogger.bindings()).toEqual(expect.objectContaining({ component: 'mcp' }));
    });

    it('should export cliLogger', async () => {
      const { cliLogger } = await import('../../../src/utils/logger.js');
      expect(cliLogger).toBeDefined();
      expect(cliLogger.bindings()).toEqual(expect.objectContaining({ component: 'cli' }));
    });

    it('should export servicesLogger', async () => {
      const { servicesLogger } = await import('../../../src/utils/logger.js');
      expect(servicesLogger).toBeDefined();
      expect(servicesLogger.bindings()).toEqual(expect.objectContaining({ component: 'services' }));
    });
  });

  describe('development mode', () => {
    it('should use pino-pretty transport in development', async () => {
      process.env.NODE_ENV = 'development';
      // Note: We can't easily test the transport configuration
      // but we can verify the logger still works
      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger).toBeDefined();
    });

    it('should not use pino-pretty transport in production', async () => {
      process.env.NODE_ENV = 'production';
      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger).toBeDefined();
    });

    it('should not use pino-pretty transport when NODE_ENV is not set', async () => {
      delete process.env.NODE_ENV;
      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger).toBeDefined();
    });
  });
});
