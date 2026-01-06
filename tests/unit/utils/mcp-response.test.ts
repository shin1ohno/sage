/**
 * MCP Response Utilities Tests
 */

import {
  createResponse,
  createErrorResponse,
  createSuccessResponse,
  getErrorMessage,
  createErrorFromCatch,
} from '../../../src/utils/mcp-response.js';

describe('MCP Response Utilities', () => {
  describe('createResponse', () => {
    it('should create response with JSON formatted text', () => {
      const data = { status: 'ok', count: 5 };
      const response = createResponse(data);

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(JSON.parse(response.content[0].text)).toEqual(data);
    });

    it('should handle nested objects', () => {
      const data = { items: [{ id: 1 }, { id: 2 }] };
      const response = createResponse(data);

      expect(JSON.parse(response.content[0].text)).toEqual(data);
    });

    it('should handle null value', () => {
      const response = createResponse(null);
      expect(JSON.parse(response.content[0].text)).toBeNull();
    });

    it('should handle arrays', () => {
      const data = [1, 2, 3];
      const response = createResponse(data);
      expect(JSON.parse(response.content[0].text)).toEqual(data);
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response with message', () => {
      const response = createErrorResponse('Something failed');
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed.error).toBe(true);
      expect(parsed.message).toBe('Something failed');
    });

    it('should include additional data', () => {
      const response = createErrorResponse('Validation failed', {
        field: 'email',
        code: 'INVALID',
      });
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed.error).toBe(true);
      expect(parsed.message).toBe('Validation failed');
      expect(parsed.field).toBe('email');
      expect(parsed.code).toBe('INVALID');
    });

    it('should work without additional data', () => {
      const response = createErrorResponse('Error');
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed.error).toBe(true);
      expect(parsed.message).toBe('Error');
    });
  });

  describe('createSuccessResponse', () => {
    it('should create success response with data', () => {
      const response = createSuccessResponse({ tasks: [], count: 0 });
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed.tasks).toEqual([]);
      expect(parsed.count).toBe(0);
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('Test error message');
      expect(getErrorMessage(error)).toBe('Test error message');
    });

    it('should return string directly if error is a string', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should return "Unknown error" for other types', () => {
      expect(getErrorMessage(123)).toBe('Unknown error');
      expect(getErrorMessage(null)).toBe('Unknown error');
      expect(getErrorMessage(undefined)).toBe('Unknown error');
      expect(getErrorMessage({ custom: 'object' })).toBe('Unknown error');
    });
  });

  describe('createErrorFromCatch', () => {
    it('should create error response from Error instance', () => {
      const error = new Error('Database connection failed');
      const response = createErrorFromCatch('Failed to save', error);
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed.error).toBe(true);
      expect(parsed.message).toBe('Failed to save: Database connection failed');
    });

    it('should create error response from string error', () => {
      const response = createErrorFromCatch('Operation failed', 'timeout');
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed.message).toBe('Operation failed: timeout');
    });

    it('should create error response from unknown error type', () => {
      const response = createErrorFromCatch('Request failed', 500);
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed.message).toBe('Request failed: Unknown error');
    });

    it('should include additional data', () => {
      const response = createErrorFromCatch('API error', new Error('500'), {
        endpoint: '/api/tasks',
        method: 'POST',
      });
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed.error).toBe(true);
      expect(parsed.message).toBe('API error: 500');
      expect(parsed.endpoint).toBe('/api/tasks');
      expect(parsed.method).toBe('POST');
    });
  });
});
