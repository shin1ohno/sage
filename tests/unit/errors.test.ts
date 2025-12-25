/**
 * Error Handling Unit Tests
 * Requirements: Error handling across all components
 */

import { ErrorType, SageErrorImpl, ErrorHandler } from '../../src/types/errors.js';

describe('SageErrorImpl', () => {
  describe('constructor', () => {
    it('should create error with required fields', () => {
      const error = new SageErrorImpl(
        ErrorType.CONFIG_ERROR,
        'CONFIG_INVALID',
        'Configuration is invalid'
      );

      expect(error.type).toBe(ErrorType.CONFIG_ERROR);
      expect(error.code).toBe('CONFIG_INVALID');
      expect(error.message).toBe('Configuration is invalid');
      expect(error.name).toBe('SageError');
    });

    it('should set default recoverable to true', () => {
      const error = new SageErrorImpl(
        ErrorType.NETWORK_ERROR,
        'NET_FAIL',
        'Network failed'
      );

      expect(error.recoverable).toBe(true);
    });

    it('should accept optional fields', () => {
      const error = new SageErrorImpl(
        ErrorType.AUTH_ERROR,
        'AUTH_FAIL',
        'Authentication failed',
        {
          details: { userId: '123' },
          recoverable: false,
          suggestions: ['Check API key', 'Retry login'],
        }
      );

      expect(error.details).toEqual({ userId: '123' });
      expect(error.recoverable).toBe(false);
      expect(error.suggestions).toEqual(['Check API key', 'Retry login']);
    });
  });

  describe('toJSON', () => {
    it('should serialize error to JSON format', () => {
      const error = new SageErrorImpl(
        ErrorType.VALIDATION_ERROR,
        'VAL_FAIL',
        'Validation failed',
        {
          details: { field: 'email' },
          suggestions: ['Check email format'],
        }
      );

      const json = error.toJSON();

      expect(json.type).toBe(ErrorType.VALIDATION_ERROR);
      expect(json.code).toBe('VAL_FAIL');
      expect(json.message).toBe('Validation failed');
      expect(json.details).toEqual({ field: 'email' });
      expect(json.suggestions).toEqual(['Check email format']);
      expect(json.recoverable).toBe(true);
    });
  });
});

describe('ErrorHandler', () => {
  describe('handle', () => {
    it('should return SageError as-is for SageErrorImpl instances', () => {
      const original = new SageErrorImpl(
        ErrorType.CONFIG_ERROR,
        'CONFIG_ERR',
        'Config error'
      );

      const handled = ErrorHandler.handle(original, 'test context');

      expect(handled.type).toBe(ErrorType.CONFIG_ERROR);
      expect(handled.code).toBe('CONFIG_ERR');
    });

    it('should classify network errors', () => {
      const error = new Error('Network connection failed');

      const handled = ErrorHandler.handle(error, 'API call');

      expect(handled.type).toBe(ErrorType.NETWORK_ERROR);
      expect(handled.code).toBe('NETWORK_FAILURE');
      expect(handled.recoverable).toBe(true);
      expect(handled.suggestions?.length).toBeGreaterThan(0);
    });

    it('should classify fetch errors as network errors', () => {
      const error = new Error('fetch failed: connection refused');

      const handled = ErrorHandler.handle(error, 'fetching data');

      expect(handled.type).toBe(ErrorType.NETWORK_ERROR);
    });

    it('should classify auth errors', () => {
      const error = new Error('Unauthorized access denied');

      const handled = ErrorHandler.handle(error, 'login');

      expect(handled.type).toBe(ErrorType.AUTH_ERROR);
      expect(handled.code).toBe('AUTH_FAILURE');
      expect(handled.recoverable).toBe(true);
    });

    it('should classify authentication errors', () => {
      const error = new Error('Authentication token expired');

      const handled = ErrorHandler.handle(error, 'API request');

      expect(handled.type).toBe(ErrorType.AUTH_ERROR);
    });

    it('should handle unknown errors as integration errors', () => {
      const error = new Error('Something unexpected happened');

      const handled = ErrorHandler.handle(error, 'some operation');

      expect(handled.type).toBe(ErrorType.INTEGRATION_ERROR);
      expect(handled.code).toBe('UNKNOWN_ERROR');
      expect(handled.recoverable).toBe(false);
    });

    it('should include context in error message', () => {
      const error = new Error('Failed');

      const handled = ErrorHandler.handle(error, 'saving file');

      expect(handled.message).toContain('saving file');
    });

    it('should preserve original error message in details', () => {
      const error = new Error('Original error message');

      const handled = ErrorHandler.handle(error, 'context');

      expect(handled.details).toBe('Original error message');
    });
  });

  describe('shouldRetry', () => {
    it('should return true for recoverable network errors', () => {
      const error = {
        type: ErrorType.NETWORK_ERROR,
        code: 'NET_FAIL',
        message: 'Network failed',
        recoverable: true,
      };

      expect(ErrorHandler.shouldRetry(error)).toBe(true);
    });

    it('should return false for non-recoverable errors', () => {
      const error = {
        type: ErrorType.NETWORK_ERROR,
        code: 'NET_FAIL',
        message: 'Network failed',
        recoverable: false,
      };

      expect(ErrorHandler.shouldRetry(error)).toBe(false);
    });

    it('should return false for non-network errors even if recoverable', () => {
      const error = {
        type: ErrorType.CONFIG_ERROR,
        code: 'CONFIG_ERR',
        message: 'Config error',
        recoverable: true,
      };

      expect(ErrorHandler.shouldRetry(error)).toBe(false);
    });
  });

  describe('getSuggestions', () => {
    it('should return suggestions from error', () => {
      const error = {
        type: ErrorType.AUTH_ERROR,
        code: 'AUTH_FAIL',
        message: 'Auth failed',
        recoverable: true,
        suggestions: ['Check credentials', 'Reset password'],
      };

      const suggestions = ErrorHandler.getSuggestions(error);

      expect(suggestions).toEqual(['Check credentials', 'Reset password']);
    });

    it('should return empty array when no suggestions', () => {
      const error = {
        type: ErrorType.CONFIG_ERROR,
        code: 'CONFIG_ERR',
        message: 'Config error',
        recoverable: true,
      };

      const suggestions = ErrorHandler.getSuggestions(error);

      expect(suggestions).toEqual([]);
    });
  });
});

describe('ErrorType', () => {
  it('should have all expected error types', () => {
    expect(ErrorType.SETUP_ERROR).toBe('SETUP_ERROR');
    expect(ErrorType.CONFIG_ERROR).toBe('CONFIG_ERROR');
    expect(ErrorType.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ErrorType.INTEGRATION_ERROR).toBe('INTEGRATION_ERROR');
    expect(ErrorType.ANALYSIS_ERROR).toBe('ANALYSIS_ERROR');
    expect(ErrorType.NETWORK_ERROR).toBe('NETWORK_ERROR');
    expect(ErrorType.AUTH_ERROR).toBe('AUTH_ERROR');
  });
});
