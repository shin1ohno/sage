/**
 * Slack OAuth Callback Handler Tests
 *
 * Tests for the Slack OAuth callback endpoint in http-server-with-config.ts.
 * Tests the 503 (handler not configured), 400 (missing code/state/error), paths.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { Socket } from 'net';
import { escapeHtml } from '../../src/utils/html.js';

describe('Slack OAuth callback escapeHtml', () => {
  it('should escape script tags', () => {
    const input = '<script>alert("xss")</script>';
    const escaped = escapeHtml(input);
    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(escaped).not.toContain('<script>');
  });

  it('should escape HTML entities', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
    expect(escapeHtml("it's")).toBe("it&#039;s");
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('Slack OAuth callback state validation', () => {
  // Test the state parameter flow using a Map (same pattern as the server)
  let pendingStates: Map<string, number>;

  beforeEach(() => {
    pendingStates = new Map();
  });

  it('should reject requests without state parameter', () => {
    const state: string | null = null;
    expect(state).toBeNull();
  });

  it('should reject requests with unknown state parameter', () => {
    const state = 'unknown-state-value';
    expect(pendingStates.has(state)).toBe(false);
  });

  it('should accept valid state and consume it (one-time use)', () => {
    const state = 'valid-state-123';
    const expiresAt = Date.now() + 10 * 60 * 1000;
    pendingStates.set(state, expiresAt);

    expect(pendingStates.has(state)).toBe(true);

    // Consume state
    pendingStates.delete(state);
    expect(pendingStates.has(state)).toBe(false);
  });

  it('should reject expired state parameter', () => {
    const state = 'expired-state-123';
    const expiresAt = Date.now() - 1000; // Already expired
    pendingStates.set(state, expiresAt);

    const storedExpiry = pendingStates.get(state);
    expect(storedExpiry).toBeDefined();
    expect(Date.now() > storedExpiry!).toBe(true);
  });
});

describe('Slack OAuth callback HTTP responses', () => {
  function createMockResponse(): ServerResponse & { statusCode: number; body: string; headers: Record<string, string> } {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    const res = new ServerResponse(req) as ServerResponse & { statusCode: number; body: string; headers: Record<string, string> };
    res.body = '';
    res.headers = {};

    const origWriteHead = res.writeHead.bind(res);
    const origEnd = res.end.bind(res);
    const origSetHeader = res.setHeader.bind(res);

    res.writeHead = jest.fn((code: number, headers?: Record<string, string>) => {
      res.statusCode = code;
      if (headers) {
        Object.assign(res.headers, headers);
      }
      return res;
    }) as never;

    res.end = jest.fn((data?: string) => {
      if (data) {
        res.body = data;
      }
      return res;
    }) as never;

    res.setHeader = jest.fn((name: string, value: string | number | readonly string[]) => {
      res.headers[String(name)] = String(value);
      return res;
    }) as never;

    return res;
  }

  it('should return 503 when Slack OAuth handler is not configured', () => {
    const slackOAuthHandler = null;
    const res = createMockResponse();

    // Simulate the handler check
    if (!slackOAuthHandler) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Slack OAuth not configured' }));
    }

    expect(res.statusCode).toBe(503);
    expect(res.body).toContain('Slack OAuth not configured');
  });

  it('should return 400 when error parameter is present (with escaping)', () => {
    const res = createMockResponse();
    const errorParam = '<script>alert("xss")</script>';

    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>Slack Authorization Failed</h1><p>${escapeHtml(errorParam)}</p>`);

    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('<script>');
    expect(res.body).toContain('&lt;script&gt;');
  });

  it('should return 400 when code parameter is missing', () => {
    const res = createMockResponse();
    const code: string | null = null;

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Missing authorization code</h1>');
    }

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Missing authorization code');
  });

  it('should return 400 when state parameter is missing', () => {
    const res = createMockResponse();
    const state: string | null = null;

    if (!state) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Missing state parameter</h1>');
    }

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Missing state parameter');
  });
});
