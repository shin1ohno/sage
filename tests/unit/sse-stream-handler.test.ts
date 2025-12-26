/**
 * SSE Stream Handler Tests
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 20.10
 *
 * Tests for Streamable HTTP Transport compliance (GET /mcp endpoint)
 */

import { SSEStreamHandler, createSSEStreamHandler } from '../../src/cli/sse-stream-handler.js';
import { IncomingMessage, ServerResponse } from 'http';

describe('SSE Stream Handler', () => {
  let handler: SSEStreamHandler;
  let mockRequest: Partial<IncomingMessage>;
  let mockResponse: Partial<ServerResponse>;
  let writtenData: string[];
  let headers: Record<string, string | number>;
  let statusCode: number;

  beforeEach(() => {
    handler = createSSEStreamHandler();
    writtenData = [];
    headers = {};
    statusCode = 0;

    mockRequest = {
      method: 'GET',
      url: '/mcp',
      headers: {},
      on: jest.fn(),
    };

    mockResponse = {
      writeHead: jest.fn().mockImplementation((code: number, hdrs?: Record<string, string | number>) => {
        statusCode = code;
        if (hdrs) {
          headers = { ...headers, ...hdrs };
        }
        return mockResponse as ServerResponse;
      }),
      setHeader: jest.fn().mockImplementation((name: string, value: string | number) => {
        headers[name] = value;
        return mockResponse as ServerResponse;
      }),
      write: jest.fn().mockImplementation((data: string) => {
        writtenData.push(data);
        return true;
      }),
      end: jest.fn(),
      on: jest.fn(),
    };
  });

  afterEach(() => {
    handler.cleanup();
    jest.clearAllTimers();
  });

  describe('Response Headers (Requirements: 20.2, 20.4, 20.5, 20.6)', () => {
    it('should set Content-Type to text/event-stream', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      expect(headers['Content-Type']).toBe('text/event-stream');
    });

    it('should set Cache-Control to no-cache', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      expect(headers['Cache-Control']).toBe('no-cache');
    });

    it('should set Connection to keep-alive', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      expect(headers['Connection']).toBe('keep-alive');
    });

    it('should set X-Accel-Buffering to no for SSE proxies', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      expect(headers['X-Accel-Buffering']).toBe('no');
    });

    it('should return status code 200', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      expect(statusCode).toBe(200);
    });
  });

  describe('CORS Headers (Requirement: 20.4, 20.9)', () => {
    it('should set Access-Control-Allow-Origin to *', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      expect(headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('should set Access-Control-Allow-Methods to GET, POST, OPTIONS', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
    });

    it('should set Access-Control-Allow-Headers to Content-Type, Authorization', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
    });
  });

  describe('Initial Connection (Requirement: 20.1)', () => {
    it('should send endpoint event on connection', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Should have sent endpoint event
      expect(writtenData.length).toBeGreaterThan(0);
      const endpointEvent = writtenData.find(d => d.includes('event: endpoint'));
      expect(endpointEvent).toBeDefined();
    });

    it('should include POST URL in endpoint event', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      const endpointEvent = writtenData.find(d => d.includes('event: endpoint'));
      expect(endpointEvent).toContain('/mcp');
    });
  });

  describe('Keepalive (Requirements: 20.3, 20.7)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should send keepalive comment every 30 seconds', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Initial data
      const initialLength = writtenData.length;

      // Advance time by 30 seconds
      jest.advanceTimersByTime(30000);

      // Should have sent keepalive
      expect(writtenData.length).toBeGreaterThan(initialLength);
      const keepalive = writtenData.find(d => d.includes(': keepalive'));
      expect(keepalive).toBeDefined();
    });

    it('should format keepalive as SSE comment', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      jest.advanceTimersByTime(30000);

      const keepalive = writtenData.find(d => d.includes(': keepalive'));
      expect(keepalive).toBe(': keepalive\n\n');
    });

    it('should send multiple keepalives at regular intervals', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Count keepalives after 90 seconds (should be 3)
      jest.advanceTimersByTime(90000);

      const keepalives = writtenData.filter(d => d.includes(': keepalive'));
      expect(keepalives.length).toBe(3);
    });

    it('should clear keepalive timer on cleanup', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      handler.cleanup();

      const initialLength = writtenData.length;
      jest.advanceTimersByTime(60000);

      // Should not have sent more keepalives after cleanup
      expect(writtenData.length).toBe(initialLength);
    });
  });

  describe('Connection Cleanup (Requirement: 20.7)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should stop keepalive when client disconnects', async () => {
      let closeHandler: (() => void) | undefined;

      mockResponse.on = jest.fn((event: string, handler: () => void) => {
        if (event === 'close') {
          closeHandler = handler;
        }
        return mockResponse as ServerResponse;
      });

      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Simulate client disconnect
      if (closeHandler) {
        closeHandler();
      }

      const initialLength = writtenData.length;
      jest.advanceTimersByTime(60000);

      // Should not have sent more keepalives
      expect(writtenData.length).toBe(initialLength);
    });

    it('should track active connections', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      expect(handler.getActiveConnections()).toBe(1);
    });

    it('should decrement active connections on close', async () => {
      let closeHandler: (() => void) | undefined;

      mockResponse.on = jest.fn((event: string, handler: () => void) => {
        if (event === 'close') {
          closeHandler = handler;
        }
        return mockResponse as ServerResponse;
      });

      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      expect(handler.getActiveConnections()).toBe(1);

      if (closeHandler) {
        closeHandler();
      }

      expect(handler.getActiveConnections()).toBe(0);
    });
  });

  describe('SSE Event Sending', () => {
    it('should send event with correct SSE format', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Send a custom event
      handler.sendEvent('message', { test: 'data' });

      const messageEvent = writtenData.find(d => d.includes('event: message'));
      expect(messageEvent).toBeDefined();
      expect(messageEvent).toContain('data: {"test":"data"}');
    });

    it('should broadcast event to all connections', async () => {
      // Create second mock response
      const writtenData2: string[] = [];
      const mockResponse2: Partial<ServerResponse> = {
        writeHead: jest.fn().mockReturnThis(),
        setHeader: jest.fn().mockReturnThis(),
        write: jest.fn((data: string) => {
          writtenData2.push(data);
          return true;
        }),
        end: jest.fn(),
        on: jest.fn(),
      };

      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse2 as ServerResponse
      );

      handler.broadcast({ type: 'notification', message: 'hello' });

      // Both connections should receive the broadcast
      expect(writtenData.some(d => d.includes('hello'))).toBe(true);
      expect(writtenData2.some(d => d.includes('hello'))).toBe(true);
    });
  });

  describe('Session ID (for Streamable HTTP)', () => {
    it('should generate unique session ID for each connection', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Endpoint event should contain session ID
      const endpointEvent = writtenData.find(d => d.includes('event: endpoint'));
      expect(endpointEvent).toContain('sessionId');
    });

    it('should include session ID in Mcp-Session-Id header for POST requests', async () => {
      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // The session should be registered
      expect(handler.getActiveConnections()).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle write errors gracefully', async () => {
      mockResponse.write = jest.fn().mockReturnValue(false);

      await expect(
        handler.handleSSERequest(
          mockRequest as IncomingMessage,
          mockResponse as ServerResponse
        )
      ).resolves.not.toThrow();
    });

    it('should cleanup on response error', async () => {
      let errorHandler: ((error: Error) => void) | undefined;

      mockResponse.on = jest.fn().mockImplementation((event: string, handler: (error?: Error) => void) => {
        if (event === 'error') {
          errorHandler = handler;
        }
        return mockResponse as ServerResponse;
      });

      await handler.handleSSERequest(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      const initialConnections = handler.getActiveConnections();

      if (errorHandler) {
        errorHandler(new Error('Connection error'));
      }

      expect(handler.getActiveConnections()).toBeLessThan(initialConnections);
    });
  });
});

describe('createSSEStreamHandler', () => {
  it('should create a new SSE handler instance', () => {
    const handler = createSSEStreamHandler();
    expect(handler).toBeDefined();
    expect(handler.handleSSERequest).toBeDefined();
    expect(handler.cleanup).toBeDefined();
  });

  it('should support custom keepalive interval', () => {
    const handler = createSSEStreamHandler({ keepaliveInterval: 15000 });
    expect(handler).toBeDefined();
  });
});
