/**
 * Tests for GoogleOAuthCallbackHandler
 * Requirements: FR-1 (OAuth Callback Endpoint), FR-4 (Token Exchange)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { IncomingMessage, ServerResponse } from 'http';
import { EventEmitter } from 'events';

// Mock the dependencies
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        getToken: jest.fn().mockImplementation(() => Promise.resolve({
          tokens: {
            access_token: 'mock_access_token',
            refresh_token: 'mock_refresh_token',
            expiry_date: Date.now() + 3600000,
            scope: 'https://www.googleapis.com/auth/calendar',
          },
        })),
      })),
    },
  },
}));

jest.mock('../../src/utils/logger.js', () => ({
  oauthLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock environment variables
process.env.GOOGLE_CLIENT_ID = 'mock_client_id';
process.env.GOOGLE_CLIENT_SECRET = 'mock_client_secret';

import { GoogleOAuthCallbackHandler } from '../../src/oauth/google-oauth-callback-handler.js';
import { PendingGoogleAuthStore } from '../../src/oauth/pending-google-auth-store.js';
import type { PendingGoogleAuth } from '../../src/oauth/pending-google-auth-store.js';
import { GoogleOAuthHandler } from '../../src/oauth/google-oauth-handler.js';

describe('GoogleOAuthCallbackHandler', () => {
  let handler: GoogleOAuthCallbackHandler;
  let mockFindByState: jest.Mock;
  let mockRemove: jest.Mock;
  let mockStoreTokens: jest.Mock;

  beforeEach(() => {
    mockFindByState = jest.fn();
    mockRemove = jest.fn();
    mockStoreTokens = jest.fn().mockImplementation(() => Promise.resolve());

    const mockPendingAuthStore = {
      findByState: mockFindByState,
      remove: mockRemove,
    } as unknown as PendingGoogleAuthStore;

    const mockGoogleOAuthHandler = {
      storeTokens: mockStoreTokens,
    } as unknown as GoogleOAuthHandler;

    handler = new GoogleOAuthCallbackHandler({
      pendingAuthStore: mockPendingAuthStore,
      googleOAuthHandler: mockGoogleOAuthHandler,
    });
  });

  function createMockRequest(url: string): IncomingMessage {
    const req = new EventEmitter() as IncomingMessage;
    req.url = url;
    return req;
  }

  function createMockResponse(): { res: ServerResponse; chunks: string[]; statusCode: number; headers: Record<string, string> } {
    const chunks: string[] = [];
    let statusCode = 200;
    const headers: Record<string, string> = {};

    const res = {
      writeHead: jest.fn((code: number, hdrs?: Record<string, string>) => {
        statusCode = code;
        if (hdrs) {
          Object.assign(headers, hdrs);
        }
      }),
      end: jest.fn((data?: string) => {
        if (data) chunks.push(data);
      }),
    } as unknown as ServerResponse;

    return { res, chunks, statusCode, headers };
  }

  describe('handleCallback()', () => {
    it('should handle successful OAuth callback', async () => {
      const mockSession: PendingGoogleAuth = {
        state: 'test-state',
        codeVerifier: 'test-verifier',
        redirectUri: 'https://example.com/callback',
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
      };

      mockFindByState.mockReturnValue(mockSession);

      const req = createMockRequest('/oauth/google/callback?code=auth_code&state=test-state');
      const { res, chunks } = createMockResponse();

      await handler.handleCallback(req, res);

      expect(mockFindByState).toHaveBeenCalledWith('test-state');
      expect(mockRemove).toHaveBeenCalledWith('test-state');
      expect(mockStoreTokens).toHaveBeenCalled();
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
      expect(chunks[0]).toContain('認証が完了しました');
    });

    it('should handle missing state parameter', async () => {
      const req = createMockRequest('/oauth/google/callback?code=auth_code');
      const { res, chunks } = createMockResponse();

      await handler.handleCallback(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
      expect(chunks[0]).toContain('認証セッションが見つかりません');
    });

    it('should handle missing code parameter', async () => {
      const req = createMockRequest('/oauth/google/callback?state=test-state');
      const { res, chunks } = createMockResponse();

      await handler.handleCallback(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
      expect(chunks[0]).toContain('認証コードが見つかりません');
    });

    it('should handle unknown state (session not found)', async () => {
      mockFindByState.mockReturnValue(null);

      const req = createMockRequest('/oauth/google/callback?code=auth_code&state=unknown-state');
      const { res, chunks } = createMockResponse();

      await handler.handleCallback(req, res);

      expect(mockFindByState).toHaveBeenCalledWith('unknown-state');
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
      expect(chunks[0]).toContain('認証セッションが見つかりません');
    });

    it('should handle OAuth error from Google', async () => {
      const req = createMockRequest('/oauth/google/callback?error=access_denied&state=test-state');
      const { res, chunks } = createMockResponse();

      await handler.handleCallback(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
      expect(chunks[0]).toContain('認証が拒否されました');
    });

    it('should remove session after successful exchange', async () => {
      const mockSession: PendingGoogleAuth = {
        state: 'test-state',
        codeVerifier: 'test-verifier',
        redirectUri: 'https://example.com/callback',
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
      };

      mockFindByState.mockReturnValue(mockSession);

      const req = createMockRequest('/oauth/google/callback?code=auth_code&state=test-state');
      const { res } = createMockResponse();

      await handler.handleCallback(req, res);

      expect(mockRemove).toHaveBeenCalledWith('test-state');
    });
  });

  describe('parseCallbackParams()', () => {
    it('should parse URL parameters correctly', () => {
      // Access private method through type assertion for testing
      const parseParams = (handler as any).parseCallbackParams.bind(handler);

      const result = parseParams('/oauth/google/callback?code=test_code&state=test_state');

      expect(result.code).toBe('test_code');
      expect(result.state).toBe('test_state');
      expect(result.error).toBeUndefined();
    });

    it('should handle error parameters', () => {
      const parseParams = (handler as any).parseCallbackParams.bind(handler);

      const result = parseParams('/oauth/google/callback?error=access_denied&error_description=User%20denied');

      expect(result.error).toBe('access_denied');
      expect(result.errorDescription).toBe('User denied');
    });
  });
});
