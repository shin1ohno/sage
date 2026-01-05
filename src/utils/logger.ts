/**
 * Logger Utility
 * Provides structured logging with pino
 */

import pino from 'pino';

/**
 * Log level type
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

/**
 * Get log level from environment variable
 */
function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  if (level && ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'].includes(level)) {
    return level as LogLevel;
  }
  return 'info';
}

/**
 * Check if running in development mode
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Create pino transport options for pretty printing in development
 */
function getTransport(): pino.TransportSingleOptions | undefined {
  if (isDevelopment()) {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }
  return undefined;
}

/**
 * Default logger instance
 * Uses pino-pretty in development, JSON in production
 */
export const logger = pino({
  level: getLogLevel(),
  transport: getTransport(),
});

/**
 * Create a child logger with a specific component name
 * @param component - Component name for log context
 */
export function createLogger(component: string): pino.Logger {
  return logger.child({ component });
}

/**
 * Pre-configured loggers for common components
 */
export const oauthLogger = createLogger('oauth');
export const calendarLogger = createLogger('calendar');
export const mcpLogger = createLogger('mcp');
export const cliLogger = createLogger('cli');
export const servicesLogger = createLogger('services');
